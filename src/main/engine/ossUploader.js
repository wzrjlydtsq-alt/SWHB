/**
 * ossUploader.js — 阿里云 OSS 上传服务（主进程）
 *
 * 使用 ali-oss SDK 直接上传文件到 OSS，返回 CDN 公网 URL。
 * 仅在 Electron 主进程中运行，AK/SK 不暴露给渲染进程。
 */
import OSS from 'ali-oss'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

// ── OSS 配置 ──
const DEFAULT_OSS_REGION = 'oss-cn-chengdu'
const DEFAULT_OSS_BUCKET = 'ljxhimage2'
const DEFAULT_OSS_ENDPOINT = 'https://oss-cn-chengdu.aliyuncs.com'
const DEFAULT_CDN_BASE = 'https://image.lingjingxinghe.cn'
export const TEMP_UPLOAD_PREFIX = 'uploads/ai-runtime'
const TEMP_LIFECYCLE_RULE_ID = 'ljxh-ai-runtime-temp-expire'

let client = null
let loadedDotEnv = false
let runtimeOssConfig = {}
const OSS_UPLOAD_RETRY_COUNT = 3
const OSS_MULTIPART_THRESHOLD = 8 * 1024 * 1024
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

function readDotEnvIfPresent() {
  if (loadedDotEnv) return
  loadedDotEnv = true

  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env')
  ]

  for (const envPath of candidates) {
    try {
      if (!fs.existsSync(envPath)) continue
      const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const index = trimmed.indexOf('=')
        if (index <= 0) continue
        const key = trimmed.slice(0, index).trim()
        const rawValue = trimmed.slice(index + 1).trim()
        if (!key || process.env[key] !== undefined) continue
        process.env[key] = rawValue.replace(/^['"]|['"]$/g, '')
      }
      return
    } catch (err) {
      console.warn('[ossUploader] Failed to load .env:', err.message || err)
    }
  }
}

function readEnv(...names) {
  readDotEnvIfPresent()
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  return ''
}

function getOssConfig() {
  return {
    accessKeyId:
      runtimeOssConfig.accessKeyId || readEnv('ALIYUN_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_ID'),
    accessKeySecret:
      runtimeOssConfig.accessKeySecret ||
      readEnv('ALIYUN_ACCESS_KEY_SECRET', 'OSS_ACCESS_KEY_SECRET'),
    region: runtimeOssConfig.region || readEnv('ALIYUN_OSS_REGION', 'OSS_REGION') || DEFAULT_OSS_REGION,
    bucket: runtimeOssConfig.bucket || readEnv('ALIYUN_OSS_BUCKET', 'OSS_BUCKET') || DEFAULT_OSS_BUCKET,
    endpoint:
      runtimeOssConfig.endpoint ||
      readEnv('ALIYUN_OSS_ENDPOINT', 'OSS_ENDPOINT') ||
      DEFAULT_OSS_ENDPOINT,
    authorizationV4: true
  }
}

function getCdnBase() {
  return (
    runtimeOssConfig.publicUrl ||
    readEnv('ALIYUN_OSS_PUBLIC_URL', 'OSS_PUBLIC_URL') ||
    DEFAULT_CDN_BASE
  ).replace(/\/+$/, '')
}

export function setRuntimeOssConfig(config = {}) {
  runtimeOssConfig = {
    accessKeyId: String(config.accessKeyId || '').trim(),
    accessKeySecret: String(config.accessKeySecret || '').trim(),
    region: String(config.region || '').trim(),
    bucket: String(config.bucket || '').trim(),
    endpoint: String(config.endpoint || '').trim(),
    publicUrl: String(config.publicUrl || '').trim()
  }
  resetClient()
}

export function getRuntimeOssStatus() {
  const config = getOssConfig()
  return {
    configured: Boolean(config.accessKeyId && config.accessKeySecret),
    accessKeyIdConfigured: Boolean(config.accessKeyId),
    accessKeySecretConfigured: Boolean(config.accessKeySecret),
    runtimeConfigured: Boolean(runtimeOssConfig.accessKeyId && runtimeOssConfig.accessKeySecret),
    envConfigured: Boolean(
      readEnv('ALIYUN_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_ID') &&
        readEnv('ALIYUN_ACCESS_KEY_SECRET', 'OSS_ACCESS_KEY_SECRET')
    ),
    accessKeyIdMasked: maskSecret(config.accessKeyId),
    region: config.region,
    bucket: config.bucket,
    endpoint: config.endpoint,
    publicUrl: getCdnBase()
  }
}

function maskSecret(value) {
  const text = String(value || '')
  if (!text) return ''
  if (text.length <= 8) return `${text.slice(0, 2)}****`
  return `${text.slice(0, 4)}****${text.slice(-4)}`
}

/** 获取/初始化 OSS Client（懒加载） */
function getClient() {
  if (!client) {
    const config = getOssConfig()
    if (!config.accessKeyId || !config.accessKeySecret) {
      throw new Error('OSS 未配置 AK/SK，请设置 ALIYUN_ACCESS_KEY_ID 和 ALIYUN_ACCESS_KEY_SECRET')
    }
    client = new OSS(config)
  }
  return client
}

function resetClient() {
  client = null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableUploadError(err) {
  const code = String(err?.code || err?.name || '').toUpperCase()
  const message = String(err?.message || err || '').toUpperCase()
  const status = Number(err?.status || err?.statusCode || err?.response?.status)

  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED' ||
    code === 'EPIPE' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    message.includes('ECONNRESET') ||
    message.includes('FETCH FAILED') ||
    message.includes('UND_ERR') ||
    message.includes('SOCKET HANG UP') ||
    message.includes('TIMEOUT') ||
    [408, 429, 500, 502, 503, 504].includes(status)
  )
}

async function withUploadRetry(label, uploadFn, maxRetries = OSS_UPLOAD_RETRY_COUNT) {
  let lastError = null

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await uploadFn(attempt)
    } catch (err) {
      lastError = err
      const retryable = isRetryableUploadError(err)
      if (!retryable || attempt >= maxRetries) {
        throw err
      }

      resetClient()
      const delayMs = Math.min(8000, 800 * 2 ** (attempt - 1))
      console.warn(
        `[ossUploader] ${label} 第 ${attempt} 次失败，${delayMs}ms 后重试:`,
        err?.message || err
      )
      await sleep(delayMs)
    }
  }

  throw lastError
}

/** 根据文件扩展名获取 MIME 类型 */
function getMimeType(ext) {
  const map = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac'
  }
  return map[ext.toLowerCase()] || 'application/octet-stream'
}

function normalizePrefix(prefix) {
  return String(prefix || 'uploads')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function buildObjectKey(ext, prefix = 'uploads') {
  const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  return `${normalizePrefix(prefix)}/${Date.now()}_${hash}${ext}`
}

function normalizeLocalUploadPath(localPath) {
  let filePath = String(localPath || '').trim()
  if (filePath.startsWith('xinghe://local/?path=')) {
    filePath = decodeURIComponent(filePath.replace('xinghe://local/?path=', ''))
  } else if (filePath.startsWith('xinghe://local?path=')) {
    filePath = decodeURIComponent(filePath.replace('xinghe://local?path=', ''))
  } else if (filePath.startsWith('file://')) {
    try {
      filePath = fileURLToPath(filePath)
    } catch {
      filePath = decodeURIComponent(filePath.replace('file://', ''))
    }
  }

  if (process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(filePath)) {
    filePath = filePath.slice(1)
  }

  return path.resolve(filePath)
}

/**
 * 上传本地文件到 OSS
 * @param {string} localPath - 本地文件绝对路径
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadFileToOSS(localPath, options = {}) {
  try {
    // 规范化路径
    const filePath = normalizeLocalUploadPath(localPath)
    // 支持 xinghe://local/?path=... 协议（生成图使用的路径格式）
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `文件不存在: ${filePath}` }
    }

    const stat = fs.statSync(filePath)
    const sizeMB = stat.size / (1024 * 1024)

    // 100MB 限制
    if (stat.size > MAX_UPLOAD_BYTES) {
      return { success: false, error: `文件过大 (${sizeMB.toFixed(1)}MB)，最大支持 100MB` }
    }

    const ext = path.extname(filePath).toLowerCase() || '.mp4'
    const objectKey = buildObjectKey(ext, options.prefix)
    const contentType = getMimeType(ext)

    console.log(
      `[ossUploader] 开始上传: ${path.basename(filePath)} (${sizeMB.toFixed(1)}MB) → ${objectKey}`
    )

    await withUploadRetry(`上传 ${path.basename(filePath)}`, async () => {
      const ossClient = getClient()
      if (stat.size >= OSS_MULTIPART_THRESHOLD) {
        await ossClient.multipartUpload(objectKey, filePath, {
          mime: contentType,
          parallel: 3,
          partSize: 4 * 1024 * 1024,
          headers: { 'Content-Type': contentType }
        })
        return
      }

      const fileBuffer = await fs.promises.readFile(filePath)
      await ossClient.put(objectKey, fileBuffer, {
        mime: contentType,
        headers: { 'Content-Type': contentType }
      })
    })

    const finalUrl = `${getCdnBase()}/${objectKey}`
    console.log(`[ossUploader] 上传成功: ${finalUrl}`)

    return { success: true, url: finalUrl }
  } catch (err) {
    console.error(`[ossUploader] 上传失败:`, err.message || err)
    return { success: false, error: err.message || String(err) }
  }
}

/**
 * 从 Buffer 上传到 OSS
 * @param {Buffer} buffer - 文件内容
 * @param {string} filename - 文件名（用于确定扩展名）
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadBufferToOSS(buffer, filename, options = {}) {
  try {
    const sizeMB = buffer.length / (1024 * 1024)
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return { success: false, error: `文件过大 (${sizeMB.toFixed(1)}MB)，最大支持 100MB` }
    }

    const ext = path.extname(filename).toLowerCase() || '.mp4'
    const objectKey = buildObjectKey(ext, options.prefix)
    const contentType = getMimeType(ext)

    console.log(`[ossUploader] Buffer 上传: ${filename} (${sizeMB.toFixed(1)}MB) → ${objectKey}`)

    await withUploadRetry(`Buffer 上传 ${filename}`, async () => {
      const ossClient = getClient()
      await ossClient.put(objectKey, buffer, {
        mime: contentType,
        headers: { 'Content-Type': contentType }
      })
    })

    const finalUrl = `${getCdnBase()}/${objectKey}`
    console.log(`[ossUploader] 上传成功: ${finalUrl}`)

    return { success: true, url: finalUrl }
  } catch (err) {
    console.error(`[ossUploader] Buffer 上传失败:`, err.message || err)
    return { success: false, error: err.message || String(err) }
  }
}

export async function ensureTempUploadLifecycle(days = 1) {
  const ossClient = getClient()
  const config = getOssConfig()
  const prefix = `${normalizePrefix(TEMP_UPLOAD_PREFIX)}/`
  const tempRule = {
    id: TEMP_LIFECYCLE_RULE_ID,
    prefix,
    status: 'Enabled',
    expiration: { days: String(days) },
    abortMultipartUpload: { days: String(days) }
  }

  let existingRules = []
  try {
    const result = await ossClient.getBucketLifecycle(config.bucket)
    existingRules = Array.isArray(result.rules) ? result.rules : []
  } catch (err) {
    const status = err?.status || err?.statusCode
    const code = err?.code || err?.name
    if (status !== 404 && code !== 'NoSuchLifecycle') {
      throw err
    }
  }

  const nextRules = [
    ...existingRules.filter((rule) => rule.id !== TEMP_LIFECYCLE_RULE_ID),
    tempRule
  ]

  await ossClient.putBucketLifecycle(config.bucket, nextRules)
  return { success: true, bucket: config.bucket, prefix, days }
}

export async function cleanupUploadPrefixOlderThan({
  prefix = 'uploads/',
  olderThanMs = 60 * 60 * 1000,
  maxKeys = 1000
} = {}) {
  const ossClient = getClient()
  const normalizedPrefix = `${normalizePrefix(prefix)}/`
  const cutoff = Date.now() - olderThanMs
  let continuationToken
  let scanned = 0
  let deleted = 0
  let deletedBytes = 0

  do {
    const params = { prefix: normalizedPrefix, 'max-keys': maxKeys }
    if (continuationToken) params['continuation-token'] = continuationToken

    const result = await ossClient.listV2(params)
    const objects = Array.isArray(result.objects) ? result.objects : []
    scanned += objects.length

    const expired = objects.filter((object) => {
      if (!object?.name?.startsWith(normalizedPrefix)) return false
      const modifiedAt = new Date(object.lastModified || object.lastModifiedTime || 0).getTime()
      return Number.isFinite(modifiedAt) && modifiedAt > 0 && modifiedAt <= cutoff
    })

    if (expired.length > 0) {
      await ossClient.deleteMulti(
        expired.map((object) => object.name),
        { quiet: true }
      )
      deleted += expired.length
      deletedBytes += expired.reduce((sum, object) => sum + Number(object.size || 0), 0)
    }

    continuationToken = result.nextContinuationToken
  } while (continuationToken)

  return {
    success: true,
    prefix: normalizedPrefix,
    olderThanMs,
    scanned,
    deleted,
    deletedBytes
  }
}

export function startUploadPrefixCleanupSchedule({
  prefix = 'uploads/',
  olderThanMs = 60 * 60 * 1000,
  intervalMs = 60 * 60 * 1000
} = {}) {
  let running = false

  const runCleanup = async () => {
    if (running) return
    running = true
    try {
      const result = await cleanupUploadPrefixOlderThan({ prefix, olderThanMs })
      console.log(
        `[ossUploader] cleanup ${result.prefix}: deleted=${result.deleted}, scanned=${result.scanned}, bytes=${result.deletedBytes}`
      )
    } catch (err) {
      console.warn('[ossUploader] cleanup failed:', err.message || err)
    } finally {
      running = false
    }
  }

  runCleanup()
  const timer = setInterval(runCleanup, intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}

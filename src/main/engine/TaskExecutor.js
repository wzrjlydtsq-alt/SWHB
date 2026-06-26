import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { TEMP_UPLOAD_PREFIX, uploadBufferToOSS, uploadFileToOSS } from './ossUploader.js'
import {
  extractVideoTaskError,
  extractVideoResultUrl,
  extractVideoTaskStatus,
  isFatalVideoTaskErrorMessage,
  isVideoTaskFailure,
  isVideoTaskSuccess
} from './videoTaskResponse.js'
import { resolveTaskProtocol, TASK_PROTOCOLS } from './taskProtocols.js'

const DEFAULT_API_REQUEST_TIMEOUT_MS = 300000
const MAX_API_REQUEST_TIMEOUT_MS = 30 * 60 * 1000

export class TaskExecutor {
  static getApiRequestTimeoutMs() {
    const configured = Number(process.env.XINGHE_API_REQUEST_TIMEOUT_MS)
    if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_API_REQUEST_TIMEOUT_MS
    return Math.min(Math.max(configured, 1000), MAX_API_REQUEST_TIMEOUT_MS)
  }

  static withRequestTimeoutHeaders(
    headers = {},
    timeoutMs = TaskExecutor.getApiRequestTimeoutMs()
  ) {
    return {
      ...headers,
      'X-Request-Timeout-Ms': String(timeoutMs),
      'X-Response-Timeout-Ms': String(timeoutMs),
      'X-Timeout-Ms': String(timeoutMs)
    }
  }

  static getDashScopeDataInspectionValue() {
    return '{"input":"disable","output":"disable"}'
  }

  static withDashScopeDataInspectionHeader(headers = {}) {
    return {
      ...headers,
      'X-DashScope-DataInspection': TaskExecutor.getDashScopeDataInspectionValue()
    }
  }

  static createTimeoutSignal(parentSignal, timeoutMs, label = 'request') {
    if (!timeoutMs || timeoutMs <= 0) {
      return { signal: parentSignal, cleanup: () => {}, timedOut: () => false }
    }

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort(new Error(`${label} response timeout ${timeoutMs}ms`))
    }, timeoutMs)

    const abortFromParent = () => controller.abort(parentSignal.reason)
    if (parentSignal?.aborted) {
      abortFromParent()
    } else {
      parentSignal?.addEventListener?.('abort', abortFromParent, { once: true })
    }

    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timer)
        parentSignal?.removeEventListener?.('abort', abortFromParent)
      },
      timedOut: () => timedOut
    }
  }

  static async fetchWithApiTimeout(url, init = {}, label = 'API request') {
    const timeout = TaskExecutor.createTimeoutSignal(
      init.signal,
      TaskExecutor.getApiRequestTimeoutMs(),
      label
    )
    try {
      return await fetch(url, {
        ...init,
        signal: timeout.signal
      })
    } catch (error) {
      if (timeout.timedOut()) {
        throw new Error(`${label} response timeout ${TaskExecutor.getApiRequestTimeoutMs()}ms`)
      }
      throw error
    } finally {
      timeout.cleanup()
    }
  }

  static normalizeVideoResolution(resolution, fallback = '720p') {
    const normalized = String(resolution || '').toLowerCase()
    return ['480p', '720p'].includes(normalized) ? normalized : fallback
  }

  static normalizeSeedanceVideoRatio(ratio, fallback = '16:9') {
    const normalized = String(ratio || '').trim()
    if (normalized.toLowerCase() === 'auto' || normalized.toLowerCase() === 'adaptive') {
      return 'adaptive'
    }
    return ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].includes(normalized)
      ? normalized
      : fallback
  }

  static parseVideoDurationSeconds(duration, fallback = 5) {
    if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
      return Math.round(duration)
    }

    const value = String(duration || '').trim()
    if (!value) return fallback

    const timeParts = value.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/)
    if (timeParts) {
      const parts = timeParts
        .slice(1)
        .filter((part) => part !== undefined)
        .map(Number)
      if (parts.every((part) => Number.isFinite(part))) {
        if (parts.length === 2) return Math.max(parts[0] * 60 + parts[1], 1)
        return Math.max(parts[0] * 3600 + parts[1] * 60 + parts[2], 1)
      }
    }

    const numeric = Number.parseFloat(value.replace(/秒|s(ec(ond)?s?)?$/i, '').trim())
    return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback
  }

  static normalizeVideoFps(fps, fallback = 24) {
    const numeric = Number(fps)
    return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback
  }

  static isLegacySeedanceGateway(rootUrl) {
    return (
      String(rootUrl || '')
        .replace(/\/+$/, '')
        .toLowerCase() === 'http://47.108.196.234:10086/prod'
    )
  }

  static shouldUseLegacySeedanceSubmitBody({
    rootUrl,
    sourceImages = [],
    sourceVideos = [],
    sourceAudios = [],
    enableWebSearch = false
  } = {}) {
    const hasReferenceMedia =
      (Array.isArray(sourceImages) && sourceImages.length > 0) ||
      (Array.isArray(sourceVideos) && sourceVideos.length > 0) ||
      (Array.isArray(sourceAudios) && sourceAudios.length > 0)

    return TaskExecutor.isLegacySeedanceGateway(rootUrl) && !hasReferenceMedia && !enableWebSearch
  }

  static buildLegacySeedanceSubmitBody({
    model,
    prompt,
    ratio,
    duration,
    resolution,
    generateAudio,
    framesPerSecond
  }) {
    const body = {
      model,
      prompt: prompt || 'Generate a video from the provided context',
      ratio: TaskExecutor.normalizeSeedanceVideoRatio(ratio || '16:9'),
      duration: TaskExecutor.parseVideoDurationSeconds(duration),
      resolution: TaskExecutor.normalizeVideoResolution(resolution),
      framespersecond: TaskExecutor.normalizeVideoFps(framesPerSecond)
    }

    if (generateAudio !== undefined) {
      body.generate_audio = generateAudio
    }

    return body
  }

  static buildSeedanceMetadata({ ratio, duration, resolution, generateAudio, framesPerSecond }) {
    return {
      duration: TaskExecutor.parseVideoDurationSeconds(duration),
      ratio: TaskExecutor.normalizeSeedanceVideoRatio(ratio || '16:9'),
      resolution: TaskExecutor.normalizeVideoResolution(resolution),
      watermark: false,
      generate_audio: generateAudio !== undefined ? generateAudio : true,
      framespersecond: TaskExecutor.normalizeVideoFps(framesPerSecond)
    }
  }

  static buildSeedanceProxySubmitBody({
    model,
    prompt,
    ratio,
    duration,
    resolution,
    generateAudio,
    framesPerSecond
  }) {
    const metadata = TaskExecutor.buildSeedanceMetadata({
      ratio,
      duration,
      resolution,
      generateAudio,
      framesPerSecond
    })

    return {
      model,
      prompt: prompt || 'Generate a video from the provided context',
      generate_audio: metadata.generate_audio,
      ratio: metadata.ratio,
      duration: metadata.duration,
      resolution: metadata.resolution,
      framespersecond: metadata.framespersecond,
      watermark: metadata.watermark,
      metadata
    }
  }

  static buildArkSeedanceSubmitBody({
    model,
    prompt,
    ratio,
    duration,
    resolution,
    generateAudio,
    framesPerSecond
  }) {
    return {
      model,
      content: [
        {
          type: 'text',
          text: prompt || 'Generate a video from the provided context'
        }
      ],
      generate_audio: generateAudio !== undefined ? generateAudio : true,
      ratio: TaskExecutor.normalizeSeedanceVideoRatio(ratio || '16:9'),
      duration: TaskExecutor.parseVideoDurationSeconds(duration),
      resolution: TaskExecutor.normalizeVideoResolution(resolution),
      framespersecond: TaskExecutor.normalizeVideoFps(framesPerSecond),
      watermark: false
    }
  }

  static getSubmitBodyKind(body) {
    if (Array.isArray(body?.content)) return 'ark-content'
    if (body?.metadata) return 'metadata'
    return 'flat'
  }

  static summarizeSubmitBody(body) {
    const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {}
    const promptText = typeof body?.prompt === 'string' ? body.prompt : ''
    const contentText = Array.isArray(body?.content)
      ? body.content.find((item) => item?.type === 'text')?.text || ''
      : ''

    return {
      kind: TaskExecutor.getSubmitBodyKind(body),
      model: body?.model || null,
      promptLength: promptText.length || String(contentText || '').length || 0,
      ratio: body?.ratio || metadata.ratio || null,
      duration: body?.duration || metadata.duration || null,
      resolution: body?.resolution || metadata.resolution || null,
      framespersecond: body?.framespersecond || metadata.framespersecond || null,
      generate_audio:
        body?.generate_audio !== undefined ? body.generate_audio : metadata.generate_audio,
      hasMetadata: Boolean(body?.metadata),
      contentTypes: Array.isArray(body?.content)
        ? body.content.map((item) => item?.type || 'unknown')
        : Array.isArray(metadata.content)
          ? metadata.content.map((item) => item?.type || 'unknown')
          : []
    }
  }

  static getResponseRequestId(res, data) {
    return (
      data?.request_id ||
      data?.requestId ||
      data?.id ||
      res?.headers?.get?.('x-request-id') ||
      res?.headers?.get?.('x-requestid') ||
      res?.headers?.get?.('request-id') ||
      null
    )
  }

  static getResponseErrorMessage(data) {
    const candidates = [
      data?.error?.message,
      data?.error?.code,
      data?.message,
      data?.msg,
      data?.code
    ]
    const value = candidates.find((item) => item !== undefined && item !== null && item !== '')
    if (typeof value === 'object') return JSON.stringify(value)
    return value ? String(value) : ''
  }

  static buildHttpErrorMessage(res, data, context, details = {}) {
    const status = res?.status || 'unknown'
    const statusText = res?.statusText ? ` ${res.statusText}` : ''
    const requestId = TaskExecutor.getResponseRequestId(res, data)
    const message = TaskExecutor.getResponseErrorMessage(data) || `HTTP ${status}`
    const extra = [
      requestId ? `request_id=${requestId}` : null,
      details.endpoint ? `endpoint=${details.endpoint}` : null,
      details.model ? `model=${details.model}` : null,
      details.submittedModel ? `submittedModel=${details.submittedModel}` : null,
      details.modelId ? `modelId=${details.modelId}` : null,
      details.configName ? `configName=${details.configName}` : null,
      details.submitAttempts ? `submitAttempts=${details.submitAttempts}` : null
    ].filter(Boolean)

    return `${context}: HTTP ${status}${statusText}: ${message}${extra.length ? ` (${extra.join(', ')})` : ''}`
  }

  static getVideoGenerationSubmitEndpoints(rootUrl, { preferPluralVideos = false } = {}) {
    const normalizedRoot = String(rootUrl || '').replace(/\/+$/, '')
    const pluralEndpoint = `${normalizedRoot}/v1/videos/generations`
    const singularEndpoint = `${normalizedRoot}/v1/video/generations`
    return preferPluralVideos
      ? [pluralEndpoint, singularEndpoint]
      : [singularEndpoint, pluralEndpoint]
  }

  static isHtmlResponseText(text) {
    const trimmed = String(text || '')
      .trim()
      .toLowerCase()
    return (
      trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('<html')
    )
  }

  static async readJsonResponse(res, context = 'API 请求') {
    const contentType = res?.headers?.get?.('content-type') || ''
    const text = await res.text()

    if (!text) return {}

    try {
      return JSON.parse(text)
    } catch {
      const statusText = `${res.status || '未知状态'}${res.statusText ? ` ${res.statusText}` : ''}`
      const compactPreview = text.replace(/\s+/g, ' ').slice(0, 120)

      if (contentType.includes('text/html') || TaskExecutor.isHtmlResponseText(text)) {
        throw new Error(
          `${context} 返回了网页错误页，不是 JSON 数据。请检查 API 地址、网关/反向代理配置，或确认服务端是否在线。（HTTP ${statusText}）`
        )
      }

      throw new Error(
        `${context} 返回的数据格式异常，无法解析 JSON。请检查 API 地址和服务端响应。（HTTP ${statusText}${
          compactPreview ? `，响应片段：${compactPreview}` : ''
        }）`
      )
    }
  }

  static isPublicHttpUrl(value) {
    return (
      typeof value === 'string' &&
      (value.startsWith('http://') || value.startsWith('https://')) &&
      !value.includes('localhost') &&
      !value.includes('127.0.0.1')
    )
  }

  static getMp4MovSniffError(bytes) {
    if (!bytes || bytes.length < 12) {
      return 'Video file is empty or too small'
    }

    const buffer = Buffer.from(bytes).subarray(0, 4096)
    const head = buffer.toString('latin1')
    const trimmed = head.trimStart().toLowerCase()

    if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
      return 'URL returned HTML instead of video bytes'
    }

    if (head.includes('ftyp')) {
      return ''
    }

    return 'Missing MP4/MOV ftyp signature'
  }

  static isLikelyMp4OrMov(bytes) {
    return !TaskExecutor.getMp4MovSniffError(bytes)
  }

  static readLocalPrefix(filePath, maxBytes = 4096) {
    const fd = fs.openSync(filePath, 'r')
    try {
      const prefix = Buffer.alloc(maxBytes)
      const bytesRead = fs.readSync(fd, prefix, 0, maxBytes, 0)
      return prefix.subarray(0, bytesRead)
    } finally {
      fs.closeSync(fd)
    }
  }

  static normalizeLocalFilePath(value) {
    let absolutePath = String(value || '')

    if (absolutePath.startsWith('xinghe://')) {
      const match = absolutePath.match(/[?&]path=([^&]+)/)
      if (match) {
        absolutePath = decodeURIComponent(match[1])
      } else {
        absolutePath = absolutePath.replace(/^xinghe:\/\/\/?local\//i, '')
        absolutePath = absolutePath.replace(/^xinghe:\/\/\/?/i, '')
        try {
          absolutePath = decodeURIComponent(absolutePath)
        } catch {
          /* ignore */
        }
      }
    } else if (absolutePath.startsWith('file://')) {
      absolutePath = decodeURIComponent(absolutePath.replace('file://', ''))
    }

    if (process.platform === 'win32') {
      if (absolutePath.startsWith('/')) absolutePath = absolutePath.slice(1)
      if (/^[a-zA-Z][/\\]/.test(absolutePath)) {
        absolutePath = absolutePath[0] + ':' + absolutePath.slice(1)
      }
    }

    return absolutePath
  }

  static async readRemotePrefix(url, signal, maxBytes = 4096) {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: `bytes=0-${maxBytes - 1}` },
      signal
    })

    if (!res.ok && res.status !== 206) {
      throw new Error(`HTTP ${res.status || 'unknown'}`)
    }

    const reader = res.body?.getReader?.()
    if (reader) {
      const chunks = []
      let total = 0
      try {
        while (total < maxBytes) {
          const { value, done } = await reader.read()
          if (done) break
          const chunk = Buffer.from(value)
          chunks.push(chunk)
          total += chunk.length
        }
      } finally {
        try {
          await reader.cancel()
        } catch {
          /* ignore */
        }
      }
      return Buffer.concat(chunks).subarray(0, maxBytes)
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    return buffer.subarray(0, maxBytes)
  }

  static async assertHappyHorseVideoReadable(videoUrl, updateCallback, signal) {
    if (!videoUrl) return
    if (updateCallback) updateCallback(19, 'HappyHorse: 正在校验视频素材格式...')

    let prefix
    try {
      if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
        prefix = await this.readRemotePrefix(videoUrl, signal)
      } else {
        const localPath = TaskExecutor.normalizeLocalFilePath(videoUrl)
        if (fs.existsSync(localPath)) {
          prefix = this.readLocalPrefix(localPath)
        }
      }
    } catch (error) {
      throw new Error(
        `HappyHorse video source cannot be read: ${videoUrl}: ${error.message || error}`
      )
    }

    const sniffError = this.getMp4MovSniffError(prefix)
    if (sniffError) {
      throw new Error(
        `Cannot determine file type for ${videoUrl}. Please re-export the source as a standard MP4/MOV file (H.264 video, AAC audio) and try again. ${sniffError}.`
      )
    }
  }

  static isHttpBaseUrl(value) {
    return /^https?:\/\//i.test(String(value || '').trim())
  }

  static resolveRootUrl(baseUrl, targetModel, type) {
    const rawBaseUrl = String(baseUrl || '').trim()
    if (TaskExecutor.isHttpBaseUrl(rawBaseUrl)) {
      return rawBaseUrl.replace(/\/+$/, '')
    }

    throw new Error(
      `API 地址配置错误：Base URL 必须以 http:// 或 https:// 开头，当前值为 "${rawBaseUrl || '空'}"。请在设置中检查该模型或分组的接口地址。`
    )
  }

  static isSub2ApiOpenAiGateway(rootUrl) {
    return String(rootUrl || '').replace(/\/+$/, '') === 'http://8.209.238.65:8080'
  }

  static dataUrlToBuffer(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
    if (!match) return null
    const mime = match[1] || 'application/octet-stream'
    const isBase64 = Boolean(match[2])
    const raw = match[3] || ''
    const buffer = isBase64
      ? Buffer.from(raw, 'base64')
      : Buffer.from(decodeURIComponent(raw), 'utf8')
    return { buffer, mime }
  }

  static extensionFromMime(mime, fallback = '.bin') {
    const map = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/mp4': '.m4a',
      'audio/aac': '.aac',
      'audio/ogg': '.ogg',
      'audio/flac': '.flac'
    }
    return map[String(mime || '').toLowerCase()] || fallback
  }

  static filenameForReference(source, mediaKind, mime) {
    const fallbackExt =
      mediaKind === 'audio'
        ? '.mp3'
        : mediaKind === 'video'
          ? '.mp4'
          : TaskExecutor.extensionFromMime(mime, '.png')
    if (String(source || '').startsWith('data:')) {
      return `reference${TaskExecutor.extensionFromMime(mime, fallbackExt)}`
    }
    try {
      const clean = String(source || '')
        .split('?')[0]
        .split('#')[0]
      const ext = path.extname(clean)
      if (ext) return `reference${ext}`
    } catch {
      // fall through
    }
    return `reference${TaskExecutor.extensionFromMime(mime, fallbackExt)}`
  }

  static async resolveReferenceToOSS(source, mediaKind, updateCallback, signal) {
    if (!source || typeof source !== 'string') return source
    const value = source.trim()

    if (
      TaskExecutor.isPublicHttpUrl(value) ||
      value.startsWith('asset-') ||
      value.startsWith('asset://')
    ) {
      return value
    }

    updateCallback?.(18, `正在上传${mediaKind === 'audio' ? '音频' : '图片'}参考到 OSS...`)

    if (value.startsWith('data:')) {
      const parsed = TaskExecutor.dataUrlToBuffer(value)
      if (!parsed) return value
      const filename = TaskExecutor.filenameForReference(value, mediaKind, parsed.mime)
      const result = await uploadBufferToOSS(parsed.buffer, filename, {
        prefix: TEMP_UPLOAD_PREFIX
      })
      if (!result?.success || !result.url) {
        throw new Error(`OSS reference upload failed: ${result?.error || 'unknown error'}`)
      }
      return result.url
    }

    if (
      value.startsWith('http://localhost') ||
      value.startsWith('http://127.0.0.1') ||
      value.startsWith('blob:')
    ) {
      const res = await fetch(value, { signal })
      if (!res.ok) throw new Error(`OSS 上传前读取本地媒体失败: HTTP ${res.status}`)
      const mime = res.headers.get('content-type') || 'application/octet-stream'
      const buffer = Buffer.from(await res.arrayBuffer())
      const filename = TaskExecutor.filenameForReference(value, mediaKind, mime)
      const result = await uploadBufferToOSS(buffer, filename, { prefix: TEMP_UPLOAD_PREFIX })
      if (!result?.success || !result.url) {
        throw new Error(`OSS reference upload failed: ${result?.error || 'unknown error'}`)
      }
      return result.url
    }

    const result = await uploadFileToOSS(value, { prefix: TEMP_UPLOAD_PREFIX })
    if (!result?.success || !result.url) {
      throw new Error(`OSS reference upload failed: ${result?.error || 'unknown error'}`)
    }
    return result.url
  }

  static async stageGeneratedDataUrlToOSS(dataUrl, updateCallback) {
    const parsed = TaskExecutor.dataUrlToBuffer(dataUrl)
    if (!parsed) return dataUrl

    try {
      updateCallback?.(92, '正在缓存生成结果到 OSS...')
      const filename = `generated${TaskExecutor.extensionFromMime(parsed.mime, '.png')}`
      const result = await uploadBufferToOSS(parsed.buffer, filename, {
        prefix: TEMP_UPLOAD_PREFIX
      })
      if (result?.success && result.url) return result.url
      console.warn('[TaskExecutor] Generated image OSS staging failed:', result?.error)
    } catch (err) {
      console.warn('[TaskExecutor] Generated image OSS staging failed:', err.message || err)
    }

    return dataUrl
  }

  static async getBase64FromLocalAsync(filePath) {
    if (!filePath) return filePath
    // const fs = require('fs') // Removed as fs is now imported
    // const path = require('path') // Removed as path is now imported

    if (typeof filePath !== 'string') return filePath
    const isLocalHttp =
      filePath.startsWith('http://localhost') || filePath.startsWith('http://127.0.0.1')
    if (isLocalHttp) {
      try {
        const res = await fetch(filePath)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const contentType = res.headers.get('content-type') || 'image/png'
        const buffer = Buffer.from(await res.arrayBuffer())
        return `data:${contentType};base64,${buffer.toString('base64')}`
      } catch (e) {
        console.warn('[TaskExecutor] Failed to fetch local media URL to base64:', e.message)
        return filePath
      }
    }
    if (
      filePath.startsWith('http://') ||
      filePath.startsWith('https://') ||
      filePath.startsWith('data:') ||
      filePath.startsWith('asset-')
    ) {
      return filePath
    }

    try {
      let absolutePath = filePath

      if (absolutePath.startsWith('xinghe://')) {
        const match = absolutePath.match(/[?&]path=([^&]+)/)
        if (match) {
          absolutePath = decodeURIComponent(match[1])
        } else {
          absolutePath = absolutePath.replace(/^xinghe:\/\/\/?local\//i, '')
          absolutePath = absolutePath.replace(/^xinghe:\/\/\/?/i, '')
          try {
            absolutePath = decodeURIComponent(absolutePath)
          } catch (e) {
            /* ignore */
          }
        }
      } else if (absolutePath.startsWith('file://')) {
        absolutePath = decodeURIComponent(absolutePath.replace('file://', ''))
      }

      if (process.platform === 'win32') {
        if (absolutePath.startsWith('/')) {
          absolutePath = absolutePath.slice(1)
        }
        if (/^[a-zA-Z][/\\]/.test(absolutePath)) {
          absolutePath = absolutePath[0] + ':' + absolutePath.slice(1)
        }
      }

      if (!fs.existsSync(absolutePath)) {
        let filename = path.basename(absolutePath)
        try {
          filename = decodeURIComponent(filename)
        } catch (e) {
          /* ignore */
        }
        const isVideo = filename.toLowerCase().match(/\.(mp4|webm|mov)$/)
        const fallbackSubdir = isVideo
          ? path.join('LocalCache', 'videos')
          : path.join('LocalCache', 'images')

        const possibleDirs = [
          path.join(app.getPath('userData'), fallbackSubdir),
          path.join(app.getPath('appData'), 'ljxh.1', fallbackSubdir),
          path.join(app.getPath('appData'), 'xinghe-zhihui', fallbackSubdir),
          path.join(app.getPath('appData'), 'Electron', fallbackSubdir)
        ]

        for (const dir of possibleDirs) {
          const attempt = path.join(dir, filename)
          if (fs.existsSync(attempt)) {
            absolutePath = attempt
            break
          }
          const attemptWithUnder = path.join(dir, filename.replace(/ /g, '_'))
          if (fs.existsSync(attemptWithUnder)) {
            absolutePath = attemptWithUnder
            break
          }
        }
      }

      if (fs.existsSync(absolutePath)) {
        const stat = fs.statSync(absolutePath)
        if (stat.size > 20 * 1024 * 1024) {
          const sizeMB = (stat.size / 1024 / 1024).toFixed(1)
          throw new Error(`参考图片过大（${sizeMB}MB），超过 20MB 上传限制。请压缩图片后重试。`)
        }
        const buffer = await fs.promises.readFile(absolutePath)
        const ext = path.extname(absolutePath).toLowerCase().slice(1) || 'png'
        let mimeType = 'image/png'
        if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg'
        if (ext === 'webp') mimeType = 'image/webp'
        if (ext === 'gif') mimeType = 'image/gif'
        if (ext === 'mp4') mimeType = 'video/mp4'
        if (ext === 'mp3') mimeType = 'audio/mpeg'
        if (ext === 'wav') mimeType = 'audio/wav'

        return `data:${mimeType};base64,${buffer.toString('base64')}`
      } else {
        // If it was a local path that we tried to resolve but couldn't find
        throw new Error(`无法读取本地文件: ${filePath} (解析路径: ${absolutePath})`)
      }
    } catch (e) {
      console.warn('[TaskExecutor] Failed to read local file to base64:', e.message)
      throw e // Re-throw so the task fails gracefully instead of sending garbage payloads
    }
  }
  /**
   * This is where the heavy lifting occurs.
   * Based on the node type (e.g. video generation, image generation), we make the HTTP API requests here from Node.js rather than the Chrome Renderer.
   *
   * @param {Object} task The task definition from TaskQueue
   * @param {Object} apiConfigs Pass in the validated global apis
   * @param {Function} updateCallback Call this to stream progress (e.g. video % done)
   */
  static async execute(task, apiConfigs, updateCallback) {
    const { payload } = task
    const {
      baseUrl,
      apiKey,
      modelId,
      type,
      prompt,
      sizeStr,
      sourceImages,
      sourceVideos,
      sourceAudios,
      imageRoles,
      duration,
      ratio,
      resolution,
      configName,
      enableWebSearch,
      generateAudio,
      framesPerSecond,
      framespersecond,
      retryRemoteTaskId
    } = payload

    const targetModel = configName || modelId
    const taskProtocol = resolveTaskProtocol(payload)
    const seedanceFps = framesPerSecond || framespersecond

    let cleanApiKey = apiKey
    if (typeof cleanApiKey === 'string') {
      cleanApiKey = cleanApiKey.replace(
        /^(?:export\s+)?(?:[A-Za-z0-9_]+=)?["']?([^"'\s]+)["']?$/,
        '$1'
      )
    }

    // Normalize URL
    let rootUrl = TaskExecutor.resolveRootUrl(baseUrl, targetModel, type)

    // URL 重写规则（lingjingxinghe.cn 的 SSL 证书仅覆盖 www 子域名）
    const URL_REWRITES = {
      'https://lingjingxinghe.cn': 'https://www.lingjingxinghe.cn'
    }
    if (URL_REWRITES[rootUrl]) {
      rootUrl = URL_REWRITES[rootUrl]
    }

    // AbortController signal（取消任务时中止 HTTP 请求）
    const signal = task.abortController?.signal

    const headers = TaskExecutor.withRequestTimeoutHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cleanApiKey}`
    })

    // 诊断日志：确认 API Key 是否正确传递
    const keyPreview = cleanApiKey
      ? `${cleanApiKey.slice(0, 4)}...${cleanApiKey.slice(-4)} (len=${cleanApiKey.length})`
      : '⚠️ EMPTY/UNDEFINED'
    console.log(
      `[TaskExecutor] API诊断: modelId=${modelId}, configName=${configName}, targetModel=${targetModel}, key=${keyPreview}, url=${rootUrl}`
    )

    try {
      updateCallback(5, `初始化任务: ${modelId}...`)

      if (taskProtocol === TASK_PROTOCOLS.VIDEO && retryRemoteTaskId) {
        updateCallback(10, '正在重新获取云端任务结果...')
        return await TaskExecutor.refreshVideoTaskResult(
          rootUrl,
          headers,
          retryRemoteTaskId,
          targetModel,
          signal
        )
      }

      // ============================================
      // 1. 图像生成 (同步 或 异步 Banana 轮询)
      // ============================================
      if (
        taskProtocol === TASK_PROTOCOLS.IMAGE &&
        !modelId.includes('mj') &&
        !targetModel.includes('mj')
      ) {
        updateCallback(20, '发送图像生成请求...')

        let submitEndpoint = `${rootUrl}/v1/images/generations`
        let submitMethod = 'POST'
        let submitHeaders = { ...headers }
        let submitBody

        // 注意：modelId 可能是内部配置 ID（如 custom-xxx），需同时检查 targetModel（真实模型名）
        const modelOrTarget = `${modelId}|${targetModel}`.toLowerCase()
        const isGptImage = modelOrTarget.includes('gpt-image')
        const isBananaLike =
          (modelOrTarget.includes('banana') ||
            modelOrTarget.includes('dall-e') ||
            modelOrTarget.includes('gpt')) &&
          !isGptImage
        const isNanoBanana31 =
          modelOrTarget.includes('nano-banana-3.1') ||
          modelOrTarget.includes('gemini-3.1-flash-image')
        const isNanoBananaPro = modelOrTarget.includes('nano-banana') && !isNanoBanana31
        const isGeminiChat =
          modelOrTarget.includes('gemini-3-pro-image-preview') ||
          modelOrTarget.includes('gemini-2.5-flash-image')
        const isJimeng = modelOrTarget.includes('jimeng')
        const isSeedream = modelOrTarget.includes('seedream') && !modelOrTarget.includes('seedance')

        console.log(
          `[TaskExecutor] 路由诊断: modelOrTarget="${modelOrTarget}", isGptImage=${isGptImage}, isBananaLike=${isBananaLike}, isNanoBananaPro=${isNanoBananaPro}, isNanoBanana31=${isNanoBanana31}, isGeminiChat=${isGeminiChat}, hasImages=${sourceImages?.length > 0}`
        )

        // 绑定参考图 (Img2Img)
        if (sourceImages && sourceImages.length > 0) {
          const imgSrc = sourceImages[0]

          if (isGeminiChat) {
            // Gemini APIs use chat completions format with image messages
            submitEndpoint = `${rootUrl}/v1/chat/completions`

            const imgPayload = await this.resolveReferenceToOSS(
              imgSrc.trim(),
              'image',
              updateCallback,
              signal
            )

            submitBody = JSON.stringify({
              model: targetModel,
              stream: false,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt || 'enhance' },
                    { type: 'image_url', image_url: { url: imgPayload } }
                  ]
                }
              ],
              generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                  aspectRatio: ratio || '1:1',
                  imageSize: sizeStr || '1K'
                }
              }
            })
          } else if (isGptImage) {
            // gpt-image-2: 图生图走 /v1/images/edits + multipart/form-data，支持多图
            submitEndpoint = `${rootUrl}/v1/images/edits`
            delete submitHeaders['Content-Type'] // 让 fetch 自动设置 multipart boundary

            const formData = new FormData()
            formData.append('model', targetModel)
            formData.append('prompt', prompt || 'enhance')
            if (sizeStr) formData.append('size', sizeStr)
            formData.append('quality', 'auto')
            formData.append('background', 'auto')

            // 支持多参考图上传
            for (const src of sourceImages) {
              let blob
              const finalImgSrc = await this.resolveReferenceToOSS(
                src,
                'image',
                updateCallback,
                signal
              )
              if (finalImgSrc.startsWith('data:')) {
                const arr = finalImgSrc.split(',')
                const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
                const bstr = atob(arr[1])
                let n = bstr.length
                const u8arr = new Uint8Array(n)
                while (n--) {
                  u8arr[n] = bstr.charCodeAt(n)
                }
                blob = new Blob([u8arr], { type: mime })
              } else {
                const fetchRes = await fetch(finalImgSrc)
                blob = await fetchRes.blob()
              }
              formData.append('image', blob, `input_${Date.now()}.png`)
            }

            submitBody = formData
          } else if (isNanoBanana31) {
            // Nano Banana 3.1 Flash 图生图：支持多参考图
            submitEndpoint = `${rootUrl}/v1/images/generations?async=true`

            const imageArr = []
            for (const src of sourceImages) {
              const finalImg = await this.resolveReferenceToOSS(
                src.trim(),
                'image',
                updateCallback,
                signal
              )
              imageArr.push(finalImg)
            }

            submitBody = JSON.stringify({
              model: targetModel,
              prompt: prompt || 'enhance',
              image: imageArr,
              response_format: 'url',
              image_size: sizeStr || '2K',
              aspect_ratio: ratio || '1:1'
            })
          } else if (isBananaLike) {
            if (isNanoBananaPro) {
              submitEndpoint = `${rootUrl}/v1/images/generations`

              const trimmedImg = imgSrc.trim()
              const finalImg = await this.resolveReferenceToOSS(
                trimmedImg,
                'image',
                updateCallback,
                signal
              )

              submitBody = JSON.stringify({
                model: targetModel,
                prompt: prompt || 'enhance',
                image: [finalImg],
                response_format: 'url',
                image_size: sizeStr || '1K',
                aspect_ratio: ratio || '1:1'
              })
            } else {
              // DALL-E / GPT uses multipart FormData for edits
              submitEndpoint = `${rootUrl}/v1/images/edits`
              delete submitHeaders['Content-Type'] // Let native fetch set boundary

              const formData = new FormData()
              formData.append('model', targetModel)
              formData.append('prompt', prompt || 'enhance')
              formData.append('n', '1')
              formData.append('size', sizeStr || '1024x1024')

              let blob
              const finalImgSrc = await this.resolveReferenceToOSS(
                imgSrc,
                'image',
                updateCallback,
                signal
              )
              if (finalImgSrc.startsWith('data:')) {
                const arr = finalImgSrc.split(',')
                const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
                const bstr = atob(arr[1])
                let n = bstr.length
                const u8arr = new Uint8Array(n)
                while (n--) {
                  u8arr[n] = bstr.charCodeAt(n)
                }
                blob = new Blob([u8arr], { type: mime })
              } else {
                // Try fetching and resolving as a blob if it's an HTTP URL
                const fetchRes = await fetch(finalImgSrc)
                blob = await fetchRes.blob()
              }
              formData.append('image', blob, 'input.png')
              submitBody = formData
            }
          } else if (isJimeng) {
            // Jimeng uses compositions array
            submitEndpoint = `${rootUrl}/v1/images/compositions`
            submitBody = JSON.stringify({
              model: targetModel,
              prompt: prompt || 'enhance',
              images: [await this.resolveReferenceToOSS(imgSrc, 'image', updateCallback, signal)],
              response_format: 'url'
            })
          } else if (isSeedream) {
            // Seedream 5.0: image 字段接受 URL/Base64 字符串或数组
            const imageList = []
            for (const src of sourceImages) {
              imageList.push(await this.resolveReferenceToOSS(src, 'image', updateCallback, signal))
            }
            const reqBody = {
              model: targetModel,
              prompt: prompt || '',
              image: imageList.length === 1 ? imageList[0] : imageList,
              size: sizeStr || '2K',
              output_format: 'png',
              response_format: 'url',
              watermark: false
            }
            submitBody = JSON.stringify(reqBody)
          } else {
            // Default generic image generation block (fallback)
            const reqBody = {
              model: targetModel,
              prompt: prompt || '',
              n: 1,
              size: sizeStr || '1024x1024'
            }
            const finalImgSrc = await this.resolveReferenceToOSS(
              imgSrc,
              'image',
              updateCallback,
              signal
            )
            if (finalImgSrc.startsWith('http') || finalImgSrc.length < 5 * 1024 * 1024) {
              reqBody.image_url = finalImgSrc
            } else {
              const sizeMB = (finalImgSrc.length / 1024 / 1024).toFixed(1)
              throw new Error(
                `参考图片 Base64 数据过大（约${sizeMB}MB），超过 5MB 限制。请使用更小的图片或压缩后重试。`
              )
            }
            submitBody = JSON.stringify(reqBody)
          }
        } else {
          // 文生图 (Text2Img) Default Fallback
          if (isNanoBananaPro) {
            submitEndpoint = `${rootUrl}/v1/images/generations`
          }
          if (isSeedream) {
            // Seedream 文生图
            const reqBody = {
              model: targetModel,
              prompt: prompt || '',
              size: sizeStr || '2K',
              output_format: 'png',
              response_format: 'url',
              watermark: false
            }
            submitBody = JSON.stringify(reqBody)
          } else if (isGptImage) {
            // gpt-image-2 文生图：JSON 格式
            if (TaskExecutor.isSub2ApiOpenAiGateway(rootUrl)) {
              submitEndpoint = `${rootUrl}/v1/images/generations?async=true`
            }
            const reqBody = {
              model: targetModel,
              prompt: prompt || '',
              size: sizeStr || '1024x1024',
              quality: 'auto',
              background: 'auto'
            }
            submitBody = JSON.stringify(reqBody)
          } else if (isNanoBanana31) {
            // Nano Banana 3.1 Flash 文生图
            submitEndpoint = `${rootUrl}/v1/images/generations?async=true`
            const reqBody = {
              model: targetModel,
              prompt: prompt || '',
              response_format: 'url',
              image_size: sizeStr || '2K',
              aspect_ratio: ratio || '1:1'
            }
            submitBody = JSON.stringify(reqBody)
          } else {
            const reqBody = {
              model: targetModel,
              prompt: prompt || '',
              n: 1,
              quality: 'standard',
              response_format: 'url',
              ...(isNanoBananaPro
                ? {
                    image_size: sizeStr || '1K',
                    aspect_ratio: ratio || '1:1',
                    response_format: 'url'
                  }
                : { size: sizeStr || '1024x1024' })
            }
            submitBody = JSON.stringify(reqBody)
          }
        }

        // 发送前诊断：打印最终请求
        console.log(
          `[TaskExecutor] 请求诊断: endpoint=${submitEndpoint}, body=${typeof submitBody === 'string' ? submitBody.substring(0, 500) : '[FormData]'}`
        )

        let res
        try {
          res = await TaskExecutor.fetchWithApiTimeout(
            submitEndpoint,
            {
              method: submitMethod,
              headers: submitHeaders,
              body: submitBody,
              signal
            },
            'Image generation submit'
          )
        } catch (error) {
          console.error('[TaskExecutor] Image fetch failed:', error)
          let errorDetails = error.message || String(error)
          if (error.cause) {
            errorDetails += ` | Cause: ${error.cause.message || error.cause}`
          }
          throw new Error(
            `Image generation submit network failed: ${errorDetails} (endpoint=${submitEndpoint}, model=${targetModel}, modelId=${modelId}, configName=${configName})`
          )
        }

        const data = await this.readJsonResponse(res, '图像生成接口')
        const requestId = this.getResponseRequestId(res, data)

        if (!res.ok) {
          throw new Error(
            this.buildHttpErrorMessage(res, data, 'Image generation submit failed', {
              endpoint: submitEndpoint,
              model: targetModel,
              modelId,
              configName
            })
          )
        }

        // 解析直接响应的图片连接
        let imageUrl =
          data?.data?.[0]?.url || data?.images?.[0] || data?.url || data?.data?.[0]?.image_url

        // gpt-image-2 返回 b64_json 格式
        if (!imageUrl && data?.data?.[0]?.b64_json) {
          imageUrl = await this.stageGeneratedDataUrlToOSS(
            `data:image/png;base64,${data.data[0].b64_json}`,
            updateCallback
          )
        }

        // Nano Bananna API 响应解析
        if (!imageUrl && data?.choices?.[0]?.message?.content) {
          const content = data.choices[0].message.content
          const base64Match =
            content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/) ||
            content.match(/([A-Za-z0-9+/=]{100,})/)
          const markdownImgMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/)
          const rawUrlMatch = content.match(/(https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|gif|webp))/i)

          if (base64Match) {
            const matchedDataUrl = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
            imageUrl = await this.stageGeneratedDataUrlToOSS(
              matchedDataUrl ? matchedDataUrl[0] : `data:image/png;base64,${base64Match[1]}`,
              updateCallback
            )
          } else if (markdownImgMatch) {
            imageUrl = markdownImgMatch[1]
          } else if (rawUrlMatch) {
            imageUrl = rawUrlMatch[1]
          }
        }

        if (imageUrl) {
          updateCallback(100, '生成成功')
          return { success: true, resultUrl: imageUrl, requestId, rawResponse: data }
        } else {
          // 如果返回的是 Async Task ID (例如 Banana API)
          const taskIdForPoll = data?.id || data?.task_id
          if (taskIdForPoll) {
            updateCallback(30, `任务已提交, 排队中 (ID: ${taskIdForPoll})`)
            const pollResult = await this.pollBananaImage(
              rootUrl,
              headers,
              taskIdForPoll,
              updateCallback,
              signal,
              taskIdForPoll
            )
            return { ...pollResult, requestId: requestId || pollResult.requestId }
          }
          throw new Error('云端未返回任何有效图像连接或任务ID')
        }
      }

      // ============================================
      // 2. 视频生成 (Sora / Grok / Veo 等轮询制 API)
      // ============================================
      if (taskProtocol === TASK_PROTOCOLS.VIDEO) {
        updateCallback(10, '提交视频生成任务...')

        let submitEndpoint = `${rootUrl}/v1/video/generations`
        let submitEndpointFallbacks = []
        let reqBody = {}

        // ============================================
        // 2-A. HappyHorse (阿里 DashScope 私有协议)
        // ============================================
        const isHappyHorse = modelId.includes('happyhorse') || targetModel.includes('happyhorse')

        if (isHappyHorse) {
          // HappyHorse 只走 DashScope 私有协议，如果 rootUrl 不是 DashScope 地址则强制纠正
          const DASHSCOPE_DEFAULT = 'https://dashscope.aliyuncs.com'
          const dashScopeBase =
            rootUrl && rootUrl.includes('dashscope')
              ? rootUrl.replace(/\/+$/, '')
              : DASHSCOPE_DEFAULT
          const dashSubmitUrl = `${dashScopeBase}/api/v1/services/aigc/video-generation/video-synthesis`

          // 构造 DashScope 专用请求体
          const dashInput = { prompt: prompt || '' }
          const dashParams = {
            resolution: resolution === '720P' || resolution === '720p' ? '720P' : '1080P',
            duration: duration ? parseInt(String(duration).replace('s', ''), 10) : 5,
            watermark: false
          }

          // T2V: 支持 ratio
          if (targetModel.includes('-t2v')) {
            dashParams.ratio = ratio || sizeStr || '16:9'
          }

          // I2V: 需要 first_frame 图片
          if (targetModel.includes('-i2v')) {
            if (!sourceImages || sourceImages.length === 0) {
              throw new Error('HappyHorse I2V 模式需要提供一张首帧图片')
            }
            let imgUrl = sourceImages[0]
            // 本地图片需要先上传到 OSS
            if (!imgUrl.startsWith('http://') && !imgUrl.startsWith('https://')) {
              const resolved = await this.resolveLocalToOSS(imgUrl, updateCallback, signal)
              imgUrl = resolved
            }
            dashInput.media = [{ type: 'first_frame', url: imgUrl }]
          }

          // R2V: 1-9 张参考图
          if (targetModel.includes('-r2v')) {
            if (!sourceImages || sourceImages.length === 0) {
              throw new Error('HappyHorse R2V 模式需要至少提供一张参考图片')
            }
            dashParams.ratio = ratio || sizeStr || '16:9'
            const mediaList = []
            for (const imgSrc of sourceImages.slice(0, 9)) {
              let imgUrl = imgSrc
              if (!imgUrl.startsWith('http://') && !imgUrl.startsWith('https://')) {
                imgUrl = await this.resolveLocalToOSS(imgUrl, updateCallback, signal)
              }
              mediaList.push({ type: 'reference_image', url: imgUrl })
            }
            dashInput.media = mediaList
          }

          // Video-Edit: 需要视频 + 可选参考图
          if (targetModel.includes('-video-edit')) {
            if (!sourceVideos || sourceVideos.length === 0) {
              throw new Error('HappyHorse 视频编辑模式需要提供一个源视频')
            }
            let videoUrl = sourceVideos[0]
            if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
              videoUrl = await this.resolveLocalToOSS(videoUrl, updateCallback, signal, {
                validateVideo: true
              })
            }
            await this.assertHappyHorseVideoReadable(videoUrl, updateCallback, signal)
            const mediaList = [{ type: 'video', url: videoUrl }]

            // 可选参考图 0-5 张
            if (sourceImages && sourceImages.length > 0) {
              for (const imgSrc of sourceImages.slice(0, 5)) {
                let imgUrl = imgSrc
                if (!imgUrl.startsWith('http://') && !imgUrl.startsWith('https://')) {
                  imgUrl = await this.resolveLocalToOSS(imgUrl, updateCallback, signal)
                }
                mediaList.push({ type: 'reference_image', url: imgUrl })
              }
            }
            dashInput.media = mediaList
            dashParams.audio_setting = generateAudio ? 'origin' : 'auto'
          }

          const dashBody = {
            model: targetModel,
            input: dashInput,
            parameters: dashParams
          }

          const dashHeaders = TaskExecutor.withDashScopeDataInspectionHeader({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cleanApiKey}`,
            'X-DashScope-Async': 'enable'
          })

          console.log(`\n========== [TaskExecutor] 🐴 HappyHorse DashScope ==========`)
          console.log(`[TaskExecutor] Endpoint: ${dashSubmitUrl}`)
          console.log(`[TaskExecutor] Model: ${targetModel}`)
          console.log(`[TaskExecutor] Body:`, JSON.stringify(dashBody, null, 2))
          console.log(`==============================================================\n`)

          updateCallback(15, `HappyHorse: 提交 ${targetModel} 任务...`)

          let dashRes
          try {
            dashRes = await TaskExecutor.fetchWithApiTimeout(
              dashSubmitUrl,
              {
                method: 'POST',
                headers: dashHeaders,
                body: JSON.stringify(dashBody),
                signal
              },
              'HappyHorse submit'
            )
          } catch (error) {
            throw new Error(`HappyHorse 网络请求失败: ${error.message}`)
          }

          const dashData = await this.readJsonResponse(dashRes, 'HappyHorse 任务提交接口')
          if (!dashRes.ok) {
            throw new Error(
              this.buildHttpErrorMessage(dashRes, dashData, 'HappyHorse submit failed', {
                endpoint: dashSubmitUrl,
                model: targetModel,
                modelId,
                configName
              })
            )
          }

          // DashScope 异步返回 output.task_id
          const dashTaskId = dashData?.output?.task_id
          if (!dashTaskId) {
            // 某些场景下直接返回视频
            const directUrl = dashData?.output?.video_url
            if (directUrl) {
              updateCallback(100, '生成成功')
              return { success: true, resultUrl: directUrl }
            }
            throw new Error(
              `HappyHorse 未返回 task_id: ${JSON.stringify(dashData).substring(0, 300)}`
            )
          }

          updateCallback(30, `任务已提交 (Task: ${dashTaskId})`)

          // 轮询 DashScope 任务
          return await this.pollDashScopeTask(
            dashScopeBase,
            dashHeaders,
            dashTaskId,
            updateCallback,
            signal
          )
        }

        if (modelId.includes('grok') || targetModel.includes('grok')) {
          submitEndpoint = `${rootUrl}/v2/videos/generations`
        }

        if (
          modelId.includes('seedance') ||
          targetModel.includes('seedance') ||
          targetModel.includes('doubao')
        ) {
          const seedanceSubmitEndpoints = TaskExecutor.getVideoGenerationSubmitEndpoints(rootUrl, {
            preferPluralVideos: true
          })
          submitEndpoint = seedanceSubmitEndpoints[0]
          submitEndpointFallbacks = seedanceSubmitEndpoints.slice(1)
          const submittedModel = String(targetModel || '').trim()
          const seedanceResolution = this.normalizeVideoResolution(
            resolution,
            this.normalizeVideoResolution(sizeStr)
          )
          const seedanceRatio = this.normalizeSeedanceVideoRatio(ratio || sizeStr || '16:9')
          const useLegacySeedanceBody = TaskExecutor.shouldUseLegacySeedanceSubmitBody({
            rootUrl,
            sourceImages,
            sourceVideos,
            sourceAudios,
            enableWebSearch
          })

          if (useLegacySeedanceBody) {
            reqBody = TaskExecutor.buildLegacySeedanceSubmitBody({
              model: submittedModel,
              prompt,
              ratio: seedanceRatio,
              duration,
              resolution: seedanceResolution,
              generateAudio,
              framesPerSecond: seedanceFps
            })
          } else {
            /*
            reqBody = {
              model: submittedModel,
              prompt: prompt || '请根据提供的参考内容生成视频',
              metadata: TaskExecutor.buildSeedanceMetadata({
                ratio: seedanceRatio,
                duration,
                generateAudio,
              })
            }
            */

            reqBody = TaskExecutor.buildSeedanceProxySubmitBody({
              model: submittedModel,
              prompt,
              ratio: seedanceRatio,
              duration,
              resolution: seedanceResolution,
              generateAudio,
              framesPerSecond: seedanceFps
            })

            if (enableWebSearch) {
              reqBody.metadata.tools = [{ type: 'web_search' }]
            }
          }

          // 收集多模态内容条目，只有存在时才挂载 metadata.content
          const contentItems = []

          if (prompt) {
            contentItems.push({ type: 'text', text: prompt })
          }

          if (sourceImages && sourceImages.length > 0) {
            for (let index = 0; index < sourceImages.length; index++) {
              const imgSrc = sourceImages[index]
              const role = (imageRoles && imageRoles[index]) || 'reference_image'
              // Asset ID 直接使用 asset:// 协议
              if (imgSrc.startsWith('asset-')) {
                contentItems.push({
                  type: 'image_url',
                  image_url: { url: `asset://${imgSrc}` },
                  role: role
                })
              } else {
                const finalImgSrc = await this.resolveReferenceToOSS(
                  imgSrc,
                  'image',
                  updateCallback,
                  signal
                )
                contentItems.push({
                  type: 'image_url',
                  image_url: { url: finalImgSrc },
                  role: role
                })
              }
            }
          }

          if (sourceVideos && sourceVideos.length > 0) {
            for (let i = 0; i < sourceVideos.length; i++) {
              let videoSrc = sourceVideos[i]

              if (
                videoSrc.startsWith('file://') ||
                videoSrc.startsWith('/') ||
                videoSrc.match(/^[a-zA-Z]:\\/) ||
                videoSrc.includes('localhost') ||
                videoSrc.includes('127.0.0.1') ||
                videoSrc.startsWith('blob:') ||
                videoSrc.startsWith('xinghe://')
              ) {
                // === 优先尝试 OSS 上传 ===
                let ossUploaded = false
                try {
                  let absolutePath = videoSrc
                  if (absolutePath.startsWith('file://')) {
                    absolutePath = decodeURIComponent(absolutePath.replace('file://', ''))
                  }
                  if (absolutePath.startsWith('xinghe://local')) {
                    const match = absolutePath.match(/[?&]path=([^&]+)/)
                    if (match) absolutePath = decodeURIComponent(match[1])
                  }

                  if (fs.existsSync(absolutePath)) {
                    console.log(`[TaskExecutor] 尝试 OSS 上传:`, absolutePath)
                    updateCallback(20, `正在上传视频参考到 OSS...`)
                    const ossResult = await uploadFileToOSS(absolutePath, {
                      prefix: TEMP_UPLOAD_PREFIX
                    })
                    if (ossResult.success && ossResult.url) {
                      videoSrc = ossResult.url
                      ossUploaded = true
                      console.log(`[TaskExecutor] OSS 上传成功:`, videoSrc)
                    }
                  }
                } catch (ossErr) {
                  console.warn(`[TaskExecutor] OSS 上传失败，回退火山素材库:`, ossErr.message)
                }

                // === OSS 失败时回退火山素材库 ===
                if (!ossUploaded) {
                  try {
                    console.log(
                      `[TaskExecutor] Intercepted local video reference. Creating Volcano Files API upload task:`,
                      videoSrc
                    )
                    let absolutePath = videoSrc
                    let buffer = null
                    let ext = videoSrc.split('.').pop().toLowerCase()
                    if (!['mp4', 'mov', 'avi'].includes(ext)) ext = 'mp4'

                    if (
                      videoSrc.startsWith('http://localhost') ||
                      videoSrc.startsWith('http://127.0.0.1') ||
                      videoSrc.startsWith('blob:')
                    ) {
                      const res = await fetch(videoSrc)
                      const arrayBuffer = await res.arrayBuffer()
                      buffer = Buffer.from(arrayBuffer)
                      absolutePath = null
                    }

                    if (absolutePath) {
                      if (absolutePath.startsWith('file://')) {
                        absolutePath = decodeURIComponent(absolutePath.replace('file://', ''))
                      }
                      if (absolutePath.startsWith('xinghe://local')) {
                        const match = absolutePath.match(/[?&]path=([^&]+)/)
                        if (match) absolutePath = decodeURIComponent(match[1])
                      }
                      if (fs.existsSync(absolutePath)) {
                        buffer = await fs.promises.readFile(absolutePath)
                      }
                    }

                    if (buffer) {
                      const blob = new Blob([buffer], { type: `video/${ext}` })
                      const formData = new FormData()
                      formData.append('purpose', 'user_data')
                      formData.append('file', blob, `upload_video_ref_${Date.now()}.${ext}`)

                      const uploadHeaders = { ...headers }
                      delete uploadHeaders['Content-Type']
                      delete uploadHeaders['content-type']

                      updateCallback(20, `正在上传视频参考到云端素材库...`)
                      const uploadRes = await fetch(
                        'https://ark.cn-beijing.volces.com/api/v3/files',
                        {
                          method: 'POST',
                          headers: uploadHeaders,
                          body: formData,
                          signal
                        }
                      )

                      if (!uploadRes.ok) {
                        const errData = await uploadRes.text()
                        throw new Error(`HTTP ${uploadRes.status}: ${errData}`)
                      }

                      const uploadData = await this.readJsonResponse(
                        uploadRes,
                        '火山引擎文件上传接口'
                      )
                      if (uploadData.id) {
                        videoSrc = uploadData.id
                        console.log(
                          `[TaskExecutor] Upload successful. Replaced reference with ASSET_ID:`,
                          videoSrc
                        )
                      }
                    }
                  } catch (e) {
                    console.error(`[TaskExecutor] Volcano Files upload blocked/failed:`, e)
                    throw new Error(`视频上传失败: ${e.message}`)
                  }
                }
              }

              if (videoSrc.startsWith('asset-')) {
                contentItems.push({
                  type: 'video_url',
                  video_url: { url: `asset://${videoSrc}` },
                  role: 'reference_video'
                })
              } else {
                contentItems.push({
                  type: 'video_url',
                  video_url: { url: videoSrc },
                  role: 'reference_video'
                })
              }
            }
          }

          if (sourceAudios && sourceAudios.length > 0) {
            for (const audioSrc of sourceAudios) {
              if (audioSrc.startsWith('asset-')) {
                contentItems.push({
                  type: 'audio_url',
                  audio_url: { url: `asset://${audioSrc}` },
                  role: 'reference_audio'
                })
              } else {
                const audioUrl = await this.resolveReferenceToOSS(
                  audioSrc,
                  'audio',
                  updateCallback,
                  signal
                )
                contentItems.push({
                  type: 'audio_url',
                  audio_url: { url: audioUrl },
                  role: 'reference_audio'
                })
              }
            }
          }

          // 仅在有多模态素材时才挂载 content 数组（纯文生视频不需要 content 字段）
          const hasMultimodalRefs = contentItems.some((item) => item.type !== 'text')

          // 临时走代理验证：asset:// 视频/音频也先交给代理通道处理。
          const hasAssetRefs = false

          if (hasAssetRefs) {
            // ═══════════════════════════════════════════════
            // 火山引擎直连通道（asset:// 过审素材）
            // ═══════════════════════════════════════════════
            const VOLCANO_BASE = 'https://ark.cn-beijing.volces.com/api/v3'
            const VOLCANO_KEY = '52505393-cac3-4b1b-bf33-3346fd160c96'
            const VOLCANO_EP = 'ep-20260426120838-z57ww'

            const volcanoBody = {
              model: VOLCANO_EP,
              content: contentItems,
              generate_audio: generateAudio !== undefined ? generateAudio : true,
              ratio: seedanceRatio,
              duration: duration ? parseInt(String(duration).replace('s', ''), 10) : 5,
              resolution: seedanceResolution
            }

            const volcanoHeaders = {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${VOLCANO_KEY}`
            }

            const volcanoEndpoint = `${VOLCANO_BASE}/contents/generations/tasks`

            console.log(`\n========== [TaskExecutor] 🌋 火山直连通道 ==========`)
            console.log(`[TaskExecutor] Endpoint: ${volcanoEndpoint}`)
            console.log(`[TaskExecutor] Model: ${VOLCANO_EP}`)
            contentItems.forEach((item, idx) => {
              if (item.type === 'text')
                console.log(`  [${idx}] text="${item.text?.substring(0, 60)}..."`)
              else if (item.type === 'video_url')
                console.log(`  [${idx}] video_url="${item.video_url?.url}", role=${item.role}`)
              else if (item.type === 'audio_url')
                console.log(`  [${idx}] audio_url="${item.audio_url?.url}", role=${item.role}`)
              else if (item.type === 'image_url')
                console.log(
                  `  [${idx}] image_url="${item.image_url?.url?.substring(0, 60)}...", role=${item.role}`
                )
            })
            console.log(`[TaskExecutor] Body:`, JSON.stringify(volcanoBody, null, 2))
            console.log(`====================================================\n`)

            updateCallback(15, '检测到过审素材，直连火山引擎 API...')

            let res
            try {
              res = await TaskExecutor.fetchWithApiTimeout(
                volcanoEndpoint,
                {
                  method: 'POST',
                  headers: volcanoHeaders,
                  body: JSON.stringify(volcanoBody),
                  signal
                },
                'Volcano submit'
              )
            } catch (error) {
              throw new Error(`火山引擎直连请求失败: ${error.message}`)
            }

            const data = await this.readJsonResponse(res, '火山引擎视频提交接口')
            if (!res.ok) {
              throw new Error(
                this.buildHttpErrorMessage(res, data, 'Volcano submit failed', {
                  endpoint: volcanoEndpoint,
                  model: VOLCANO_EP,
                  modelId,
                  configName
                })
              )
            }

            const jobId = data?.id
            if (!jobId) {
              throw new Error(`火山引擎未返回任务ID: ${JSON.stringify(data).substring(0, 200)}`)
            }

            updateCallback(30, `任务已推入火山引擎队列 (Job: ${jobId})`)

            return await this.pollVolcanoTask(
              VOLCANO_BASE,
              volcanoHeaders,
              jobId,
              updateCallback,
              signal
            )
          }

          // ═══════════════════════════════════════════════
          // 代理通道（无 asset:// 引用，走原有代理）
          // ═══════════════════════════════════════════════
          if (hasMultimodalRefs) {
            reqBody.metadata.content = contentItems
          }
        } else if (modelId.includes('grok') || targetModel.includes('grok')) {
          reqBody = {
            model: targetModel,
            prompt: prompt || '请根据提供的参考内容生成视频',
            ratio: ratio || sizeStr || '16:9',
            resolution: resolution === '1080P' || resolution === '1080p' ? '1080P' : '720P',
            duration: duration ? parseInt(String(duration).replace('s', ''), 10) : 6
          }
          if (sourceImages && sourceImages.length > 0) {
            reqBody.images = []
            for (const imgSrc of sourceImages) {
              // asset:// 在 Grok API 暂时不支持，只转 base64
              const finalImgSrc = await this.resolveReferenceToOSS(
                imgSrc,
                'image',
                updateCallback,
                signal
              )
              reqBody.images.push(finalImgSrc)
            }
          }
        } else {
          reqBody = {
            model: targetModel,
            prompt: prompt || ''
          }

          if (sourceImages && sourceImages.length > 0) {
            reqBody.image_url = await this.resolveReferenceToOSS(
              sourceImages[0],
              'image',
              updateCallback,
              signal
            )
          }
        }

        console.log(`\n========== [TaskExecutor] 🔀 代理通道 ==========`)
        console.log(`[TaskExecutor] Endpoint: ${submitEndpoint}`)
        console.log(`[TaskExecutor] Model: ${targetModel}`)
        console.log(`[TaskExecutor] Body:`, JSON.stringify(reqBody, null, 2))
        console.log(`=================================================\n`)

        let res
        let data
        const submitAttempts = []
        const recordSubmitAttempt = (attemptBody, attemptRes, attemptData, attemptEndpoint) => {
          submitAttempts.push({
            ...TaskExecutor.summarizeSubmitBody(attemptBody),
            endpoint: attemptEndpoint || submitEndpoint,
            status: attemptRes?.status || null,
            ok: Boolean(attemptRes?.ok),
            message: TaskExecutor.getResponseErrorMessage(attemptData) || ''
          })
        }

        try {
          res = await TaskExecutor.fetchWithApiTimeout(
            submitEndpoint,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(reqBody),
              signal
            },
            'Video generation submit'
          )
        } catch (error) {
          console.error(`[TaskExecutor] fetch failed:`, error)
          let errorDetails = error.message
          if (error.cause) {
            errorDetails += ` | Cause: ${error.cause.message || error.cause}`
          }
          throw new Error(
            `网络请求核心报错: ${errorDetails} ; 尝试访问了 -> ${submitEndpoint} (诊断: targetModel=${targetModel}, modelId=${modelId}, configName=${configName})`
          )
        }

        data = await this.readJsonResponse(res, '视频生成接口')
        recordSubmitAttempt(reqBody, res, data, submitEndpoint)

        if (!res.ok && submitEndpointFallbacks.length > 0) {
          for (const fallbackEndpoint of submitEndpointFallbacks) {
            if (res.ok) break
            console.warn(
              `[TaskExecutor] Video submit failed at ${submitEndpoint}; retrying compatible endpoint ${fallbackEndpoint}.`
            )
            submitEndpoint = fallbackEndpoint
            res = await TaskExecutor.fetchWithApiTimeout(
              submitEndpoint,
              {
                method: 'POST',
                headers,
                body: JSON.stringify(reqBody),
                signal
              },
              'Video generation submit fallback'
            )
            data = await this.readJsonResponse(res, '瑙嗛鐢熸垚鎺ュ彛')
            recordSubmitAttempt(reqBody, res, data, submitEndpoint)
          }
        }

        if (!res.ok) {
          const hasReferenceMedia =
            (Array.isArray(sourceImages) && sourceImages.length > 0) ||
            (Array.isArray(sourceVideos) && sourceVideos.length > 0) ||
            (Array.isArray(sourceAudios) && sourceAudios.length > 0)
          const isSeedanceSubmit =
            String(modelId || '').includes('seedance') ||
            String(targetModel || '').includes('seedance') ||
            String(targetModel || '').includes('doubao')
          const shouldRetryLegacySeedance =
            res.status >= 500 &&
            TaskExecutor.isLegacySeedanceGateway(rootUrl) &&
            isSeedanceSubmit &&
            !Array.isArray(reqBody?.content) &&
            !hasReferenceMedia &&
            !enableWebSearch

          if (shouldRetryLegacySeedance) {
            if (reqBody?.metadata) {
              const legacyReqBody = TaskExecutor.buildLegacySeedanceSubmitBody({
                model: reqBody?.model || targetModel,
                prompt,
                ratio: reqBody?.metadata?.ratio || ratio || sizeStr,
                duration: reqBody?.metadata?.duration || duration,
                resolution: reqBody?.metadata?.resolution || resolution || sizeStr,
                generateAudio,
                framesPerSecond: seedanceFps
              })

              console.warn(
                '[TaskExecutor] Seedance legacy gateway returned 5xx for metadata payload; retrying once with flat legacy body.'
              )
              console.log(
                `[TaskExecutor] Legacy Seedance Body:`,
                JSON.stringify(legacyReqBody, null, 2)
              )

              reqBody = legacyReqBody
              res = await TaskExecutor.fetchWithApiTimeout(
                submitEndpoint,
                {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(reqBody),
                  signal
                },
                'Seedance legacy submit retry'
              )
              data = await this.readJsonResponse(res, '视频生成接口')
              recordSubmitAttempt(reqBody, res, data)

              if (res.ok) {
                console.log('[TaskExecutor] Seedance legacy flat retry accepted.')
              }
            }

            const failedResolution = String(
              reqBody?.resolution || reqBody?.metadata?.resolution || resolution || sizeStr || ''
            ).toLowerCase()
            if (!res.ok && failedResolution && failedResolution !== '480p') {
              const legacy480pReqBody = TaskExecutor.buildLegacySeedanceSubmitBody({
                model: reqBody?.model || targetModel,
                prompt,
                ratio: reqBody?.ratio || reqBody?.metadata?.ratio || ratio || sizeStr,
                duration: reqBody?.duration || reqBody?.metadata?.duration || duration,
                resolution: '480p',
                generateAudio,
                framesPerSecond: seedanceFps
              })

              console.warn(
                '[TaskExecutor] Seedance legacy flat body failed; retrying once with 480p compatibility body.'
              )
              console.log(
                `[TaskExecutor] Legacy Seedance 480p Body:`,
                JSON.stringify(legacy480pReqBody, null, 2)
              )

              reqBody = legacy480pReqBody
              res = await TaskExecutor.fetchWithApiTimeout(
                submitEndpoint,
                {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(reqBody),
                  signal
                },
                'Seedance 480p submit retry'
              )
              data = await this.readJsonResponse(res, '视频生成接口')
              recordSubmitAttempt(reqBody, res, data)

              if (res.ok) {
                console.log('[TaskExecutor] Seedance legacy 480p retry accepted.')
              }
            }

            if (!res.ok) {
              const arkReqBody = TaskExecutor.buildArkSeedanceSubmitBody({
                model: reqBody?.model || targetModel,
                prompt,
                ratio: ratio || sizeStr,
                duration,
                resolution: resolution || sizeStr,
                generateAudio,
                framesPerSecond: seedanceFps
              })

              console.warn(
                '[TaskExecutor] Seedance flat legacy body still failed; retrying once with Ark content body.'
              )
              console.log(`[TaskExecutor] Ark Seedance Body:`, JSON.stringify(arkReqBody, null, 2))

              reqBody = arkReqBody
              res = await TaskExecutor.fetchWithApiTimeout(
                submitEndpoint,
                {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(reqBody),
                  signal
                },
                'Seedance Ark submit retry'
              )
              data = await this.readJsonResponse(res, '视频生成接口')
              recordSubmitAttempt(reqBody, res, data)

              if (res.ok) {
                console.log('[TaskExecutor] Seedance Ark content retry accepted.')
              }
            }
          }
        }

        if (!res.ok) {
          throw new Error(
            this.buildHttpErrorMessage(res, data, 'Video generation submit failed', {
              endpoint: submitEndpoint,
              model: targetModel,
              submittedModel: reqBody?.model || targetModel,
              modelId,
              configName,
              submitAttempts: JSON.stringify(submitAttempts)
            })
          )
        }

        let jobId = data?.id || data?.data?.id || data?.task_id
        if (typeof jobId === 'string') {
          jobId = jobId.replace(/\/fetch$/, '')
        }
        if (!jobId) {
          const vidUrl = data?.data?.url || data?.url
          if (vidUrl) {
            updateCallback(100, '生成成功')
            return {
              success: true,
              resultUrl: vidUrl,
              requestDebug: {
                endpoint: submitEndpoint,
                submittedBody: TaskExecutor.summarizeSubmitBody(reqBody),
                submitAttempts
              }
            }
          }
          throw new Error('无法从响应中提取任务 Job ID')
        }

        updateCallback(30, `任务已推入云端队列 (Job: ${jobId})`)

        return await this.pollVideoTask(
          rootUrl,
          headers,
          jobId,
          targetModel,
          updateCallback,
          signal,
          {
            endpoint: submitEndpoint,
            submittedBody: TaskExecutor.summarizeSubmitBody(reqBody),
            submitAttempts
          }
        )
      }

      throw new Error(
        `Unsupported generation protocol: ${taskProtocol} (model=${modelId}, type=${type})`
      )
    } catch (err) {
      throw new Error(err.message)
    }
  }

  static async pollVideoTask(
    rootUrl,
    headers,
    jobId,
    targetModel,
    updateCallback,
    signal,
    requestDebug = null
  ) {
    return new Promise((resolve, reject) => {
      let attempts = 0
      const maxAttempts = 300 // 最长等待25分钟左右
      let progress = 30

      const modelKey = String(targetModel || '').toLowerCase()
      const isSeedanceModel = modelKey.includes('seedance') || modelKey.includes('doubao')
      const pollEndpoints = [`${rootUrl}/v1/videos/${jobId}`]
      let pollEndpointIndex = 0
      let pollEndpoint = pollEndpoints[pollEndpointIndex]
      if (targetModel.includes('grok')) {
        pollEndpoint = `${rootUrl}/v2/videos/generations/${jobId}`
      }

      const timer = setInterval(async () => {
        try {
          attempts++
          if (attempts > maxAttempts) {
            clearInterval(timer)
            return reject(new Error('视频生成超时'))
          }

          const res = await TaskExecutor.fetchWithApiTimeout(
            pollEndpoint,
            {
              method: 'GET',
              headers,
              signal
            },
            'Video generation poll'
          )

          // 非 200 响应：网关临时错误继续轮询；鉴权/配额/参数错误直接失败，避免前端一直转圈。
          if (!res.ok) {
            let errorData = {}
            let errorMessage = ''
            try {
              errorData = await TaskExecutor.readJsonResponse(res, '视频任务轮询接口')
              errorMessage = extractVideoTaskError(errorData)
            } catch (parseErr) {
              errorMessage = parseErr?.message || ''
            }

            if (pollEndpoints.length > 1 && res.status === 404) {
              pollEndpointIndex = (pollEndpointIndex + 1) % pollEndpoints.length
              pollEndpoint = pollEndpoints[pollEndpointIndex]
              console.warn(`[TaskExecutor] [Video Poll] Switching endpoint to ${pollEndpoint}`)
              return
            }

            const shouldFailFast =
              [400, 401, 403, 404, 409, 422, 429].includes(res.status) ||
              isFatalVideoTaskErrorMessage(errorMessage)

            if (shouldFailFast) {
              clearInterval(timer)
              return reject(
                new Error(
                  errorMessage ||
                    TaskExecutor.buildHttpErrorMessage(res, errorData, 'Video poll failed', {
                      endpoint: pollEndpoint,
                      model: targetModel
                    })
                )
              )
            }

            console.warn(`[TaskExecutor] [Video Poll ${attempts}] HTTP ${res.status}, 跳过本轮`)
            return
          }

          let data
          try {
            data = await TaskExecutor.readJsonResponse(res, '视频任务轮询接口')
          } catch {
            console.warn(`[TaskExecutor] [Video Poll ${attempts}] 响应非 JSON, 跳过本轮`)
            return
          }
          console.log(`[TaskExecutor] [Video Poll ${attempts}]`, JSON.stringify(data))

          const status = extractVideoTaskStatus(data)
          const taskError = extractVideoTaskError(data)

          if (isVideoTaskSuccess(status)) {
            clearInterval(timer)
            const finalUrl = extractVideoResultUrl(data)

            console.log('[TaskExecutor] Task completed:', {
              status,
              finalUrl: finalUrl?.substring(0, 100),
              rawData: JSON.stringify(data).substring(0, 200)
            })

            if (finalUrl) {
              if (isSeedanceModel) {
                updateCallback(96, '视频生成完毕，正在擦除字幕...')
                try {
                  const eraseResult = await TaskExecutor.eraseSubtitle(
                    headers.Authorization.replace('Bearer ', ''),
                    finalUrl,
                    (p, msg) => updateCallback(Math.min(99, 96 + Math.floor(p * 0.04)), msg)
                  )
                  if (eraseResult.success && eraseResult.resultUrl) {
                    updateCallback(100, '视频生成+字幕擦除完毕')
                    resolve({
                      success: true,
                      resultUrl: eraseResult.resultUrl,
                      remoteTaskId: jobId
                    })
                  } else {
                    updateCallback(100, '视频生成完毕（字幕擦除未返回结果，使用原始视频）')
                    resolve({
                      success: true,
                      resultUrl: finalUrl,
                      remoteTaskId: jobId,
                      requestDebug
                    })
                  }
                } catch (eraseErr) {
                  console.warn('[TaskExecutor] 字幕擦除失败，回退原始视频:', eraseErr.message)
                  updateCallback(100, '视频生成完毕（字幕擦除失败，使用原始视频）')
                  resolve({ success: true, resultUrl: finalUrl, remoteTaskId: jobId, requestDebug })
                }
              } else {
                updateCallback(100, '视频生成完毕')
                resolve({ success: true, resultUrl: finalUrl, remoteTaskId: jobId, requestDebug })
              }
            } else {
              const debugPayload = JSON.stringify(data).substring(0, 300)
              console.error(
                '[TaskExecutor] No video URL found in response:',
                JSON.stringify(data, null, 2)
              )
              reject(new Error(`云端任务完成, 但提取流地址失败! 请将此行截图反馈: ${debugPayload}`))
            }
          } else if (isVideoTaskFailure(status) || isFatalVideoTaskErrorMessage(taskError)) {
            clearInterval(timer)
            // 提取失败原因：支持多种 API 返回格式
            let errorStr = taskError || '服务侧发生未知错误'
            // 如果 errorStr 是对象（部分 API 返回对象而非字符串），序列化它
            if (typeof errorStr === 'object') {
              errorStr = errorStr.message || errorStr.code || JSON.stringify(errorStr)
            }
            // 如果 error 同时有 code 和 message，把 code 也带上方便 friendlyError 匹配
            if (data?.error?.code && data?.error?.message && !errorStr.includes(data.error.code)) {
              errorStr = `${data.error.code}: ${errorStr}`
            }
            reject(new Error(errorStr))
          } else {
            // Pending...
            progress = Math.min(95, progress + 1)
            let hint = '构架场景中...'
            if (progress > 50) hint = '正在渲染帧序列...'
            if (progress > 85) hint = '打包流媒体中...'
            updateCallback(progress, hint)
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            clearInterval(timer)
            return reject(new Error('Task Cancelled locally'))
          }
          console.error('[Engine] Video Poll Network Error:', err)
          // 网络抖动忽略，继续轮询
        }
      }, 30000)

      // 监听 abort 事件，确保定时器被清理
      if (signal) {
        signal.addEventListener('abort', () => clearInterval(timer), { once: true })
      }
    })
  }

  static async refreshVideoTaskResult(rootUrl, headers, jobId, targetModel, signal) {
    const normalizedJobId = String(jobId || '')
      .replace(/\/fetch$/, '')
      .trim()
    if (!normalizedJobId) {
      throw new Error('缺少可重新获取的云端 task_id')
    }

    const modelKey = String(targetModel || '').toLowerCase()
    const pollEndpoints = [`${rootUrl}/v1/videos/${normalizedJobId}`]

    if (modelKey.includes('grok')) {
      pollEndpoints.splice(
        0,
        pollEndpoints.length,
        `${rootUrl}/v2/videos/generations/${normalizedJobId}`
      )
    }

    let lastError = null
    for (const pollEndpoint of pollEndpoints) {
      let res
      let data = {}
      try {
        res = await TaskExecutor.fetchWithApiTimeout(
          pollEndpoint,
          {
            method: 'GET',
            headers,
            signal
          },
          'Video generation refresh'
        )
        data = await TaskExecutor.readJsonResponse(res, '视频任务结果重新获取接口')
      } catch (error) {
        lastError = error
        continue
      }

      if (!res.ok) {
        if (res.status === 404 && pollEndpoints.length > 1) {
          lastError = new Error(`视频任务结果重新获取接口 HTTP 404: ${pollEndpoint}`)
          continue
        }
        throw new Error(
          TaskExecutor.buildHttpErrorMessage(res, data, 'Video refresh failed', {
            endpoint: pollEndpoint,
            model: targetModel
          })
        )
      }

      const status = extractVideoTaskStatus(data)
      const taskError = extractVideoTaskError(data)
      if (isVideoTaskSuccess(status)) {
        const finalUrl = extractVideoResultUrl(data)
        if (finalUrl) {
          return { success: true, resultUrl: finalUrl, remoteTaskId: normalizedJobId }
        }
        throw new Error(
          `云端任务已完成，但未返回视频 URL: ${JSON.stringify(data).substring(0, 300)}`
        )
      }

      if (isVideoTaskFailure(status) || isFatalVideoTaskErrorMessage(taskError)) {
        throw new Error(taskError || '云端任务失败')
      }

      throw new Error(`云端任务还未完成，当前状态: ${status || 'unknown'}`)
    }

    throw lastError || new Error('重新获取云端任务结果失败')
  }

  /**
   * 火山引擎直连轮询（用于 asset:// 过审素材的任务）
   * 端点: GET /contents/generations/tasks/{taskId}
   */
  static async pollVolcanoTask(baseUrl, headers, taskId, updateCallback, signal) {
    const pollEndpoint = `${baseUrl}/contents/generations/tasks/${taskId}`
    const maxAttempts = 300
    let attempts = 0
    let progress = 30

    return new Promise((resolve, reject) => {
      const timer = setInterval(async () => {
        try {
          attempts++
          if (attempts > maxAttempts) {
            clearInterval(timer)
            return reject(new Error('视频生成超时'))
          }

          const res = await TaskExecutor.fetchWithApiTimeout(
            pollEndpoint,
            {
              method: 'GET',
              headers,
              signal
            },
            'Volcano video poll'
          )

          if (!res.ok) {
            console.warn(`[TaskExecutor] [Volcano Poll ${attempts}] HTTP ${res.status}, 跳过本轮`)
            return
          }

          let data
          try {
            data = await TaskExecutor.readJsonResponse(res, '火山引擎任务轮询接口')
          } catch {
            console.warn(`[TaskExecutor] [Volcano Poll ${attempts}] 响应非 JSON, 跳过本轮`)
            return
          }

          const status = (data?.status || '').toLowerCase()
          console.log(`[TaskExecutor] [Volcano Poll ${attempts}] status=${status}`)

          if (progress < 95) {
            progress = Math.min(95, progress + 2)
            let hint = '火山引擎生成中...'
            if (progress > 50) hint = '正在渲染帧序列...'
            if (progress > 85) hint = '打包流媒体中...'
            updateCallback(progress, hint)
          }

          if (status === 'succeeded') {
            clearInterval(timer)
            const finalUrl =
              data?.content?.video_url ||
              data?.output?.video_url ||
              data?.video_url ||
              data?.content?.url ||
              data?.url

            console.log('[TaskExecutor] Volcano task succeeded:', {
              finalUrl: finalUrl?.substring(0, 100),
              rawData: JSON.stringify(data).substring(0, 300)
            })

            if (finalUrl) {
              updateCallback(100, '视频生成完毕')
              resolve({ success: true, resultUrl: finalUrl, remoteTaskId: taskId })
            } else {
              reject(
                new Error(`火山任务完成但未返回视频URL: ${JSON.stringify(data).substring(0, 300)}`)
              )
            }
          } else if (status === 'failed') {
            clearInterval(timer)
            const errorMsg = data?.error?.message || data?.error?.code || '火山引擎生成失败'
            console.error('[TaskExecutor] Volcano task failed:', data?.error)
            reject(new Error(errorMsg))
          }
          // else: processing / pending，继续轮询
        } catch (err) {
          if (err.name === 'AbortError') {
            clearInterval(timer)
            return reject(new Error('Task Cancelled locally'))
          }
          console.warn(`[TaskExecutor] [Volcano Poll ${attempts}] Error:`, err.message)
        }
      }, 5000)

      if (signal) {
        signal.addEventListener('abort', () => clearInterval(timer), { once: true })
      }
    })
  }

  static async pollBananaImage(rootUrl, headers, taskId, updateCallback, signal, remoteTaskId) {
    return new Promise((resolve, reject) => {
      let attempts = 0
      let progress = 30

      const timer = setInterval(async () => {
        try {
          attempts++
          if (attempts > 120) {
            clearInterval(timer)
            return reject(new Error('图像轮询超时'))
          }

          const res = await TaskExecutor.fetchWithApiTimeout(
            `${rootUrl}/v1/images/tasks/${taskId}`,
            { headers, signal },
            'Image generation poll'
          )
          const data = await TaskExecutor.readJsonResponse(res, '图像任务轮询接口')
          console.log(`[TaskExecutor] [Image Poll ${attempts}]`, JSON.stringify(data))

          const status = (data?.data?.status || data?.status || '').toUpperCase()

          if (status === 'SUCCESS' || status === 'SUCCEEDED' || status === 'COMPLETED') {
            clearInterval(timer)
            const imageUrl =
              data?.data?.url ||
              data?.url ||
              data?.data?.[0]?.url ||
              data?.data?.[0]?.image_url ||
              data?.image_url ||
              data?.data?.image_url ||
              data?.images?.[0]?.url ||
              data?.images?.[0] ||
              data?.data?.images?.[0]?.url ||
              data?.data?.images?.[0] ||
              data?.output ||
              data?.data?.output ||
              data?.data?.result?.url ||
              data?.data?.data?.data?.[0]?.url ||
              data?.data?.data?.[0]?.url ||
              data?.data?.data?.images?.[0]?.url

            try {
              fs.writeFileSync(
                path.join(app.getPath('userData'), 'banana_debug.json'),
                JSON.stringify(data, null, 2)
              )
            } catch (e) {
              console.error('Failed to write banana_debug.json', e)
            }

            if (imageUrl) {
              updateCallback(100, '生成成功')
              resolve({ success: true, resultUrl: imageUrl, remoteTaskId: remoteTaskId || taskId })
            } else {
              console.error(
                '[TaskExecutor] No image URL found in response:',
                JSON.stringify(data, null, 2)
              )
              reject(new Error('图像任务完成但未返回URL'))
            }
          } else if (status === 'FAILED' || status === 'FAILURE' || status === 'ERROR') {
            clearInterval(timer)
            let errorStr =
              data?.data?.fail_reason ||
              data?.fail_reason ||
              data?.error?.message ||
              data?.error?.code ||
              '图像生成失败'
            if (typeof errorStr === 'object') {
              errorStr = errorStr.message || errorStr.code || JSON.stringify(errorStr)
            }
            if (data?.error?.code && data?.error?.message && !errorStr.includes(data.error.code)) {
              errorStr = `${data.error.code}: ${errorStr}`
            }
            reject(new Error(errorStr))
          } else {
            progress = Math.min(95, progress + 1)
            updateCallback(progress, '生成中...')
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            clearInterval(timer)
            return reject(new Error('Task Cancelled locally'))
          }
          console.error('[Engine] Image Poll Network Error:', err)
        }
      }, 10000)

      // 监听 abort 事件，确保定时器被清理
      if (signal) {
        signal.addEventListener('abort', () => clearInterval(timer), { once: true })
      }
    })
  }

  static async eraseSubtitle(apiKey, videoUrl, updateCallback) {
    const ERASE_ENDPOINT =
      'https://amk.cn-beijing.volces.com/api/v1/ark-tools/ark-erase-video-subtitle-pro'
    const TASK_BASE = 'https://amk.cn-beijing.volces.com/api/v1/ark-tasks'
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    }

    if (updateCallback) updateCallback(5, '提交字幕擦除任务...')

    const submitRes = await TaskExecutor.fetchWithApiTimeout(
      ERASE_ENDPOINT,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ video_url: videoUrl })
      },
      'Subtitle erase submit'
    )
    const submitData = await this.readJsonResponse(submitRes, '字幕擦除提交接口')

    if (!submitData.success) {
      const errMsg = submitData.error?.message || '字幕擦除任务提交失败'
      throw new Error(errMsg)
    }

    const taskId = submitData.task_id
    if (!taskId) {
      throw new Error('字幕擦除任务未返回 task_id')
    }

    if (updateCallback) updateCallback(15, `字幕擦除排队中 (ID: ${taskId})`)

    return new Promise((resolve, reject) => {
      let attempts = 0
      const maxAttempts = 120
      let progress = 15

      const timer = setInterval(async () => {
        try {
          attempts++
          if (attempts > maxAttempts) {
            clearInterval(timer)
            return reject(new Error('字幕擦除轮询超时'))
          }

          const res = await TaskExecutor.fetchWithApiTimeout(
            `${TASK_BASE}/${taskId}`,
            { headers },
            'Subtitle erase poll'
          )
          const data = await TaskExecutor.readJsonResponse(res, '字幕擦除轮询接口')
          console.log(`[TaskExecutor] [Erase Subtitle Poll ${attempts}]`, JSON.stringify(data))

          const status = (data?.status || '').toUpperCase()

          if (status === 'COMPLETED') {
            clearInterval(timer)
            const resultUrl = data?.result?.video_url
            if (resultUrl) {
              if (updateCallback) updateCallback(100, '字幕擦除完成')
              resolve({ success: true, resultUrl })
            } else {
              reject(new Error('字幕擦除完成但未返回视频URL'))
            }
          } else if (status === 'FAILED') {
            clearInterval(timer)
            const errMsg = data?.error?.message || '字幕擦除失败'
            reject(new Error(errMsg))
          } else {
            progress = Math.min(95, progress + 2)
            if (updateCallback) updateCallback(progress, '字幕擦除处理中...')
          }
        } catch (err) {
          console.error('[TaskExecutor] Erase Subtitle Poll Error:', err)
        }
      }, 10000)
    })
  }

  // ============================================
  // DashScope (阿里云) 异步任务轮询
  // GET /api/v1/tasks/{task_id}
  // ============================================
  static async pollDashScopeTask(dashScopeBase, headers, taskId, updateCallback, signal) {
    const pollEndpoint = `${dashScopeBase}/api/v1/tasks/${taskId}`
    const maxAttempts = 300
    let attempts = 0
    let progress = 30

    return new Promise((resolve, reject) => {
      const timer = setInterval(async () => {
        try {
          attempts++
          if (attempts > maxAttempts) {
            clearInterval(timer)
            return reject(new Error('HappyHorse 视频生成超时'))
          }

          const res = await TaskExecutor.fetchWithApiTimeout(
            pollEndpoint,
            {
              method: 'GET',
              headers: TaskExecutor.withDashScopeDataInspectionHeader({
                Authorization: headers.Authorization
              }),
              signal
            },
            'DashScope video poll'
          )

          if (!res.ok) {
            console.warn(`[TaskExecutor] [DashScope Poll ${attempts}] HTTP ${res.status}, 跳过本轮`)
            return
          }

          let data
          try {
            data = await TaskExecutor.readJsonResponse(res, 'HappyHorse 任务轮询接口')
          } catch {
            console.warn(`[TaskExecutor] [DashScope Poll ${attempts}] 响应非 JSON, 跳过本轮`)
            return
          }

          console.log(`[TaskExecutor] [DashScope Poll ${attempts}]`, JSON.stringify(data))

          const status = (data?.output?.task_status || '').toUpperCase()

          if (status === 'SUCCEEDED') {
            clearInterval(timer)
            const videoUrl = data?.output?.video_url
            if (videoUrl) {
              updateCallback(100, 'HappyHorse 视频生成完毕')
              resolve({ success: true, resultUrl: videoUrl, remoteTaskId: taskId })
            } else {
              const debugPayload = JSON.stringify(data).substring(0, 300)
              reject(new Error(`HappyHorse 任务完成但未找到 video_url: ${debugPayload}`))
            }
          } else if (status === 'FAILED') {
            clearInterval(timer)
            const errMsg =
              data?.output?.message || data?.output?.code || data?.message || 'HappyHorse 任务失败'
            reject(new Error(errMsg))
          } else {
            // PENDING / RUNNING
            progress = Math.min(95, progress + 1)
            let hint = 'HappyHorse 构架场景中...'
            if (progress > 50) hint = 'HappyHorse 渲染帧序列...'
            if (progress > 85) hint = 'HappyHorse 合成视频流...'
            updateCallback(progress, hint)
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            clearInterval(timer)
            return reject(new Error('Task Cancelled locally'))
          }
          console.error('[TaskExecutor] DashScope Poll Error:', err)
        }
      }, 15000) // DashScope 建议每 15 秒轮询一次

      if (signal) {
        signal.addEventListener('abort', () => clearInterval(timer), { once: true })
      }
    })
  }

  // ============================================
  // 将本地文件路径解析为公网 OSS URL
  // HappyHorse DashScope API 不接受 base64，只接受公网 URL
  // ============================================
  static async resolveLocalToOSS(localPath, updateCallback, signal, options = {}) {
    const absolutePath = TaskExecutor.normalizeLocalFilePath(localPath)

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`HappyHorse: 本地文件不存在: ${absolutePath}`)
    }

    if (options.validateVideo) {
      await this.assertHappyHorseVideoReadable(absolutePath, updateCallback, signal)
    }

    if (updateCallback) updateCallback(options.validateVideo ? 20 : 18, '正在上传素材到 OSS...')

    const ossResult = await uploadFileToOSS(absolutePath, { prefix: TEMP_UPLOAD_PREFIX })
    if (ossResult.success && ossResult.url) {
      console.log(`[TaskExecutor] HappyHorse OSS 上传成功: ${ossResult.url}`)
      return ossResult.url
    }

    throw new Error(`HappyHorse: OSS 上传失败: ${absolutePath}`)
  }
}

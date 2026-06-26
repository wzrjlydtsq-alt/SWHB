import crypto from 'crypto'
import { safeStorage } from 'electron'
import { deleteSetting, getSetting, setSetting } from '../database.js'

const VOD_HOST = 'vod.volcengineapi.com'
const VOD_SERVICE = 'vod'
const DEFAULT_REGION = 'cn-north-1'
const DEFAULT_VERSION = '2025-01-01'
const VOD_CONFIG_KEY = 'tapnow_volc_vod_config'

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value || '', 'utf8').digest('hex')
}

function toAmzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function normalizeBody(body = {}) {
  return JSON.stringify(body || {})
}

function buildQueryString(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

function maskAccessKey(value = '') {
  const text = String(value || '')
  if (!text) return ''
  if (text.length <= 8) return `${text.slice(0, 2)}****`
  return `${text.slice(0, 4)}****${text.slice(-4)}`
}

function encryptSecret(value = '') {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储不可用，无法保存火山 VOD SecretKey')
  }
  return safeStorage.encryptString(String(value)).toString('base64')
}

function decryptSecret(value = '') {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储不可用，无法读取火山 VOD SecretKey')
  }
  return safeStorage.decryptString(Buffer.from(String(value), 'base64'))
}

function readStoredVodConfig({ includeSecret = false } = {}) {
  try {
    const raw = getSetting(VOD_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const accessKeyId = String(parsed.accessKeyId || '').trim()
    const encryptedSecretAccessKey = String(parsed.encryptedSecretAccessKey || '')
    const config = {
      accessKeyId,
      region: parsed.region || DEFAULT_REGION,
      spaceName: parsed.spaceName || '',
      updatedAt: parsed.updatedAt || null,
      secretConfigured: Boolean(encryptedSecretAccessKey)
    }
    if (includeSecret && encryptedSecretAccessKey) {
      config.secretAccessKey = decryptSecret(encryptedSecretAccessKey)
    }
    return config
  } catch (error) {
    return { error: error?.message || String(error) }
  }
}

function getCredentials(explicitCredentials = {}) {
  const storedConfig = explicitCredentials.accessKeyId ? null : readStoredVodConfig({ includeSecret: true })
  const accessKeyId =
    explicitCredentials.accessKeyId ||
    storedConfig?.accessKeyId ||
    process.env.VOLCENGINE_ACCESS_KEY_ID ||
    process.env.VOD_ACCESS_KEY_ID ||
    process.env.VOLC_ACCESS_KEY_ID
  const secretAccessKey =
    explicitCredentials.secretAccessKey ||
    storedConfig?.secretAccessKey ||
    process.env.VOLCENGINE_SECRET_ACCESS_KEY ||
    process.env.VOD_SECRET_ACCESS_KEY ||
    process.env.VOLC_SECRET_ACCESS_KEY
  const region = explicitCredentials.region || storedConfig?.region || DEFAULT_REGION
  return { accessKeyId, secretAccessKey, region }
}

function createSignature({
  action,
  body,
  credentials,
  region = DEFAULT_REGION,
  version,
  queryParams = {}
}) {
  const payload = normalizeBody(body)
  const xDate = toAmzDate()
  const shortDate = xDate.slice(0, 8)
  const query = buildQueryString({
    Action: action,
    Version: version,
    ...queryParams
  })
  const payloadHash = sha256(payload)
  const signedHeaders = 'content-type;host;x-content-sha256;x-date'
  const canonicalHeaders = [
    'content-type:application/json',
    `host:${VOD_HOST}`,
    `x-content-sha256:${payloadHash}`,
    `x-date:${xDate}`
  ].join('\n')
  const canonicalRequest = [
    'POST',
    '/',
    query,
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash
  ].join('\n')
  const credentialScope = `${shortDate}/${region}/${VOD_SERVICE}/request`
  const stringToSign = [
    'HMAC-SHA256',
    xDate,
    credentialScope,
    sha256(canonicalRequest)
  ].join('\n')
  const dateKey = hmac(`VOLC${credentials.secretAccessKey}`, shortDate)
  const regionKey = hmac(dateKey, region)
  const serviceKey = hmac(regionKey, VOD_SERVICE)
  const signingKey = hmac(serviceKey, 'request')
  const signature = hmac(signingKey, stringToSign, 'hex')
  const authorization =
    `HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    url: `https://${VOD_HOST}/?${query}`,
    payload,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      Host: VOD_HOST,
      'X-Content-Sha256': payloadHash,
      'X-Date': xDate
    }
  }
}

export async function callVodOpenApi({
  action,
  body,
  queryParams,
  version = DEFAULT_VERSION,
  region = DEFAULT_REGION,
  credentials
}) {
  if (!action || typeof action !== 'string') {
    return { success: false, error: 'Missing VOD action' }
  }

  const resolvedCredentials = getCredentials(credentials)
  if (!resolvedCredentials.accessKeyId || !resolvedCredentials.secretAccessKey) {
    return {
      success: false,
      code: 'MISSING_VOLC_CREDENTIALS',
      error:
        '未配置火山引擎 VOD AK/SK。请在设置的“服务接入”里保存火山 VOD AccessKey/SecretKey，或配置 VOLCENGINE_ACCESS_KEY_ID 和 VOLCENGINE_SECRET_ACCESS_KEY。'
    }
  }

  const signed = createSignature({
    action,
    body,
    credentials: resolvedCredentials,
    region: resolvedCredentials.region || region,
    version,
    queryParams
  })

  try {
    const response = await fetch(signed.url, {
      method: 'POST',
      headers: signed.headers,
      body: signed.payload
    })
    const text = await response.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { raw: text }
    }

    if (!response.ok || data?.ResponseMetadata?.Error) {
      return {
        success: false,
        status: response.status,
        error:
          data?.ResponseMetadata?.Error?.Message ||
          data?.ResponseMetadata?.Error?.Code ||
          `VOD API HTTP ${response.status}`,
        data
      }
    }

    return { success: true, status: response.status, data, result: data?.Result || null }
  } catch (error) {
    return { success: false, error: error?.message || String(error) }
  }
}

export const vodAiTranslationActions = {
  submitWorkflow: 'SubmitAITranslationWorkflow',
  listProject: 'ListAITranslationProject',
  getProject: 'GetAITranslationProject',
  updateUtterances: 'UpdateAITranslationUtterances',
  continueWorkflow: 'ContinueAITranslationWorkflow',
  refreshProject: 'RefreshAITranslationProject',
  uploadMediaByUrl: 'UploadMediaByUrl',
  queryUploadTaskInfo: 'QueryUploadTaskInfo'
}

export function hasVodCredentials() {
  const credentials = getCredentials()
  return Boolean(credentials.accessKeyId && credentials.secretAccessKey)
}

export function getVodCredentialStatus() {
  const storedConfig = readStoredVodConfig()
  const envConfigured = Boolean(
    (process.env.VOLCENGINE_ACCESS_KEY_ID || process.env.VOD_ACCESS_KEY_ID || process.env.VOLC_ACCESS_KEY_ID) &&
      (process.env.VOLCENGINE_SECRET_ACCESS_KEY ||
        process.env.VOD_SECRET_ACCESS_KEY ||
        process.env.VOLC_SECRET_ACCESS_KEY)
  )

  if (storedConfig?.error) {
    return {
      success: false,
      configured: envConfigured,
      envConfigured,
      error: storedConfig.error,
      safeStorageAvailable: safeStorage.isEncryptionAvailable()
    }
  }

  const storedConfigured = Boolean(storedConfig?.accessKeyId && storedConfig?.secretConfigured)
  return {
    success: true,
    configured: storedConfigured || envConfigured,
    storedConfigured,
    envConfigured,
    safeStorageAvailable: safeStorage.isEncryptionAvailable(),
    source: storedConfigured ? 'settings' : envConfigured ? 'environment' : 'none',
    accessKeyIdMasked: storedConfigured
      ? maskAccessKey(storedConfig.accessKeyId)
      : envConfigured
        ? maskAccessKey(
            process.env.VOLCENGINE_ACCESS_KEY_ID ||
              process.env.VOD_ACCESS_KEY_ID ||
              process.env.VOLC_ACCESS_KEY_ID
          )
        : '',
    region: storedConfig?.region || DEFAULT_REGION,
    spaceName: storedConfig?.spaceName || '',
    updatedAt: storedConfig?.updatedAt || null
  }
}

export function saveVodCredentialConfig(payload = {}) {
  const accessKeyId = String(payload.accessKeyId || '').trim()
  const secretAccessKey = String(payload.secretAccessKey || '').trim()
  const region = String(payload.region || DEFAULT_REGION).trim() || DEFAULT_REGION
  const spaceName = String(payload.spaceName || '').trim()

  if (!accessKeyId) return { success: false, error: '请填写火山 AccessKey ID' }
  if (!secretAccessKey) return { success: false, error: '请填写火山 Secret AccessKey' }

  const config = {
    accessKeyId,
    encryptedSecretAccessKey: encryptSecret(secretAccessKey),
    region,
    spaceName,
    updatedAt: new Date().toISOString()
  }
  setSetting(VOD_CONFIG_KEY, JSON.stringify(config))
  return getVodCredentialStatus()
}

export function clearVodCredentialConfig() {
  deleteSetting(VOD_CONFIG_KEY)
  return getVodCredentialStatus()
}

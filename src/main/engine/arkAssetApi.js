/**
 * arkAssetApi.js — 火山引擎方舟 Seedance Asset API 客户端（主进程）
 *
 * 实现 V4 签名鉴权 + Asset CRUD API，用于素材入库和管理。
 * 仅在 Electron 主进程中运行，AK/SK 不暴露给渲染进程。
 */
import crypto from 'crypto'

// ── 运行时配置 ──
const ARK_ACCESS_KEY_ID_ENV = ['VOLCENGINE_ARK_ACCESS_KEY_ID', 'ARK_ACCESS_KEY_ID']
const ARK_ACCESS_KEY_SECRET_ENV = ['VOLCENGINE_ARK_ACCESS_KEY_SECRET', 'ARK_ACCESS_KEY_SECRET']
const ARK_REGION = 'cn-beijing'
const ARK_SERVICE = 'ark'
const ARK_HOST = 'ark.cn-beijing.volcengineapi.com'
const ARK_VERSION = '2024-01-01'

function readArkEnv(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  return ''
}

function getArkCredentials() {
  const accessKeyId = readArkEnv(...ARK_ACCESS_KEY_ID_ENV)
  const accessKeySecret = readArkEnv(...ARK_ACCESS_KEY_SECRET_ENV)
  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      'Ark asset API credentials are not configured. Set VOLCENGINE_ARK_ACCESS_KEY_ID and VOLCENGINE_ARK_ACCESS_KEY_SECRET.'
    )
  }
  return { accessKeyId, accessKeySecret }
}

// 全局默认素材组合 ID（首次使用时自动创建）
let _defaultGroupId = null

// ═══════════════════════════════════════════════
// V4 签名（火山引擎兼容 AWS Signature V4）
// ═══════════════════════════════════════════════

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function hmacSHA256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest()
}

function getSignatureKey(sk, dateStamp, region, service) {
  const kDate = hmacSHA256(sk, dateStamp)
  const kRegion = hmacSHA256(kDate, region)
  const kService = hmacSHA256(kRegion, service)
  return hmacSHA256(kService, 'request')
}

/**
 * 对火山引擎 API 发起签名请求
 */
async function signedRequest(action, body = {}, method = 'POST') {
  const { accessKeyId, accessKeySecret } = getArkCredentials()
  const now = new Date()
  const amzDate = now
    .toISOString()
    .replace(/[:-]/g, '')
    .replace(/\.\d{3}/, '') // 20260407T032000Z
  const dateStamp = amzDate.slice(0, 8) // 20260407

  const queryString = `Action=${action}&Version=${ARK_VERSION}`
  const bodyStr = JSON.stringify(body)
  const payloadHash = sha256(bodyStr)

  // 1. Canonical Request
  const canonicalHeaders =
    [
      `content-type:application/json`,
      `host:${ARK_HOST}`,
      `x-content-sha256:${payloadHash}`,
      `x-date:${amzDate}`
    ].join('\n') + '\n'

  const signedHeaders = 'content-type;host;x-content-sha256;x-date'

  const canonicalRequest = [
    method,
    '/',
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n')

  // 2. String to Sign
  const credentialScope = `${dateStamp}/${ARK_REGION}/${ARK_SERVICE}/request`
  const stringToSign = ['HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)].join(
    '\n'
  )

  // 3. Signature
  const signingKey = getSignatureKey(accessKeySecret, dateStamp, ARK_REGION, ARK_SERVICE)
  const signature = hmacSHA256(signingKey, stringToSign).toString('hex')

  // 4. Authorization Header
  const authorization = `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const url = `https://${ARK_HOST}/?${queryString}`

  console.log(`[ArkAsset] ${action} → ${url}`)

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Host: ARK_HOST,
      'X-Content-Sha256': payloadHash,
      'X-Date': amzDate,
      Authorization: authorization
    },
    body: bodyStr
  })

  const data = await response.json()

  if (data.ResponseMetadata?.Error) {
    const err = data.ResponseMetadata.Error
    throw new Error(`[ArkAsset] ${action} failed: ${err.Code} - ${err.Message}`)
  }

  return data
}

// ═══════════════════════════════════════════════
// Asset Group API
// ═══════════════════════════════════════════════

/**
 * 创建素材组合
 */
export async function createAssetGroup(name, description = '') {
  const resp = await signedRequest('CreateAssetGroup', {
    Name: name,
    Description: description,
    GroupType: 'AIGC'
  })
  const groupId = resp.Result?.Id
  console.log(`[ArkAsset] 素材组合已创建: ${groupId}`)
  return { id: groupId }
}

/**
 * 获取或创建全局默认素材组合
 */
export async function getOrCreateDefaultGroup() {
  if (_defaultGroupId) return _defaultGroupId

  try {
    // 先尝试列出已有组合
    const listResp = await signedRequest('ListAssetGroups', {
      Filter: { Name: '星河智绘默认组合', GroupType: 'AIGC' },
      PageNumber: 1,
      PageSize: 10
    })

    const items = listResp.Result?.Items || []
    if (items.length > 0) {
      _defaultGroupId = items[0].Id
      console.log(`[ArkAsset] 复用已有默认组合: ${_defaultGroupId}`)
      return _defaultGroupId
    }
  } catch (e) {
    console.warn('[ArkAsset] 列出组合失败，将创建新组合:', e.message)
  }

  // 创建新的默认组合
  const result = await createAssetGroup('星河智绘默认组合', '星河智绘画布默认素材组合')
  _defaultGroupId = result.id
  return _defaultGroupId
}

/**
 * 获取素材组合详情
 */
export async function getAssetGroup(groupId) {
  const resp = await signedRequest('GetAssetGroup', { Id: groupId })
  return resp.Result
}

/**
 * 列出素材组合
 */
export async function listAssetGroups(page = 1, pageSize = 20) {
  const resp = await signedRequest('ListAssetGroups', {
    Filter: { GroupType: 'AIGC', Name: '' },
    PageNumber: page,
    PageSize: pageSize
  })
  return {
    items: resp.Result?.Items || [],
    totalCount: resp.Result?.TotalCount || 0
  }
}

/**
 * 更新素材组合
 */
export async function updateAssetGroup(groupId, name, description) {
  const body = { Id: groupId }
  if (name) body.Name = name
  if (description !== undefined) body.Description = description
  const resp = await signedRequest('UpdateAssetGroup', body)
  return { id: resp.Result?.Id }
}

// ═══════════════════════════════════════════════
// Asset API
// ═══════════════════════════════════════════════

/**
 * 创建素材（上传图片、视频、音频到素材库）
 * @param {string} url - 公共可访问的媒体 URL
 * @param {string} [name] - 素材名称
 * @param {string} [groupId] - 组合 ID（不填则使用默认组合）
 * @param {string} [assetType] - 素材类型，默认为 'Image'，支持 'Video', 'Audio'
 */
export async function createAsset(url, name = '', groupId = null, assetType = 'Image') {
  const gid = groupId || (await getOrCreateDefaultGroup())

  const body = {
    GroupId: gid,
    URL: url,
    AssetType: assetType
  }
  if (name) body.Name = name

  const resp = await signedRequest('CreateAsset', body)
  const assetId = resp.Result?.Id
  console.log(`[ArkAsset] 素材已创建: ${assetId}`)
  return { id: assetId, groupId: gid }
}

/**
 * 获取素材详情（轮询状态）
 */
export async function getAsset(assetId) {
  const resp = await signedRequest('GetAsset', { Id: assetId })
  const result = resp.Result || {}
  return {
    id: result.Id,
    name: result.Name || '',
    url: result.URL || '',
    status: result.Status || 'Unknown', // Processing | Active | Failed
    groupId: result.GroupId || '',
    assetType: result.AssetType || '',
    error: result.Error || null,
    createTime: result.CreateTime || '',
    updateTime: result.UpdateTime || ''
  }
}

/**
 * 轮询素材直到 Active 或 Failed
 * @param {string} assetId
 * @param {number} intervalMs - 轮询间隔（默认 3 秒）
 * @param {number} timeoutMs - 超时时间（默认 2 分钟）
 * @param {function} [onProgress] - 进度回调
 */
export async function pollAssetUntilReady(
  assetId,
  intervalMs = 3000,
  timeoutMs = 120000,
  onProgress = null
) {
  const deadline = Date.now() + timeoutMs
  let attempts = 0

  while (Date.now() < deadline) {
    attempts++
    const asset = await getAsset(assetId)

    if (onProgress) onProgress({ status: asset.status, attempts, assetId })

    if (asset.status === 'Active') {
      console.log(`[ArkAsset] 素材 ${assetId} 已激活 (${attempts} 次轮询)`)
      return asset
    }

    if (asset.status === 'Failed') {
      const errMsg = asset.error?.Message || asset.error?.Code || '未知错误'
      throw new Error(`素材处理失败: ${errMsg}`)
    }

    // Processing，继续等待
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  throw new Error(`素材轮询超时 (${timeoutMs / 1000}s)，assetId: ${assetId}`)
}

/**
 * 列出素材
 */
export async function listAssets(
  groupId = null,
  page = 1,
  pageSize = 50,
  statuses = ['Active', 'Processing']
) {
  const filter = { GroupType: 'AIGC', Statuses: statuses }
  if (groupId) filter.GroupIds = [groupId]

  const resp = await signedRequest('ListAssets', {
    Filter: filter,
    PageNumber: page,
    PageSize: pageSize,
    SortBy: 'CreateTime',
    SortOrder: 'Desc'
  })

  return {
    items: (resp.Result?.Items || []).map((item) => ({
      id: item.Id,
      name: item.Name || '',
      url: item.URL || '',
      status: item.Status || 'Unknown',
      groupId: item.GroupId || '',
      assetType: item.AssetType || '',
      createTime: item.CreateTime || '',
      updateTime: item.UpdateTime || ''
    })),
    totalCount: resp.Result?.TotalCount || 0
  }
}

/**
 * 更新素材名称
 */
export async function updateAsset(assetId, name) {
  const resp = await signedRequest('UpdateAsset', { Id: assetId, Name: name })
  return { id: resp.Result?.Id }
}

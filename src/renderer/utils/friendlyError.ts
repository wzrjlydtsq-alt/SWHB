/**
 * friendlyError.ts — 用户友好错误消息翻译层
 *
 * 将引擎/API 返回的技术性错误消息翻译为用户可理解的中文提示。
 * 不修改内部错误处理逻辑，仅在 UI 展示层调用。
 */

/** 精确匹配映射表 */
const EXACT_MAP: Record<string, string> = {
  'Task failed': '任务失败',
  'Task Cancelled locally': '任务已取消',
  'cache download failed': '结果缓存下载失败，请稍后重试',
  视频生成超时: '视频生成超时，服务端排队较长，请稍后重试',
  图像轮询超时: '图像生成超时，服务端排队较长，请稍后重试',
  服务侧发生未知错误: '云端模型处理出错，请修改提示词后重试',
  图像生成失败: '图像生成失败，请修改提示词或更换参考图后重试',
  图像任务完成但未返回URL: '图片已生成但获取失败，请重试',
  'IPC Engine Submit Failed': '任务提交失败，请重启应用后重试',
  云端未返回任何有效图像连接或任务ID: '云端未返回有效结果，请检查模型配置或重试'
}

/** 模式匹配规则：[正则, 翻译函数] */
const PATTERN_RULES: Array<[RegExp, (match: RegExpMatchArray, raw: string) => string]> = [
  [
    /Cannot convert argument to a ByteString[\s\S]*character at index 7[\s\S]*greater than 255/i,
    () =>
      'API Key 配置异常：当前密钥里包含中文或其它非 ASCII 字符，导致请求头无法发送。请在模型设置里重新填写正确的 API Key 后再试。'
  ],
  [
    /Video generation submit failed:\s*HTTP 500[\s\S]*endpoint=http:\/\/47\.108\.196\.234:10086\/prod\/v1\/videos?\/generations[\s\S]*(?:model|submittedModel|configName)=doubao-seedance-2/i,
    () =>
      'Seedance 网关提交失败：doubao-seedance-2 配置可以被网关识别，但服务端返回 500。请先检查站点 SSRF 防护的“允许的端口”是否包含 10086；当前服务器地址使用 http://47.108.196.234:10086/prod，如果 10086 不在白名单里，服务端内部回调/代理/取资源可能会被拦截。'
  ],
  [
    /Video generation submit failed:\s*HTTP 401(?=[\s\S]*无效的令牌)(?=[\s\S]*endpoint=https:\/\/www\.lingjingxinghe\.cn\/v1\/video\/generations)/i,
    () =>
      '认证失败：当前 API Key 对 https://www.lingjingxinghe.cn 老站无效。若使用新站，请在该模型或视频分组里手动填写 Base URL 为 http://prod.lingjingxinghe.cn/prod，并使用新站对应的 API Key。'
  ],
  [
    /Video generation submit failed:\s*HTTP 405[\s\S]*endpoint=http:\/\/prod\.lingjingxinghe\.cn\/v1\/video\/generations/i,
    () =>
      '新站 API 地址看起来少了 /prod 路径。请把 Base URL 手动改为 http://prod.lingjingxinghe.cn/prod；不要只填 http://prod.lingjingxinghe.cn。'
  ],
  [
    /(Image|Video) generation submit failed:\s*HTTP\s+(\d+)(?:\s+[A-Za-z ]+)?(?::\s*([^()]+))?/i,
    (m) => {
      const typeLabel = m[1].toLowerCase() === 'image' ? '图像' : '视频'
      return `${typeLabel}生成提交失败：${describeHttpStatus(m[2], m[3])}`
    }
  ],
  [
    /HappyHorse submit failed:\s*HTTP\s+(\d+)(?:\s+[A-Za-z ]+)?(?::\s*([^()]+))?/i,
    (m) => `HappyHorse 任务提交失败：${describeHttpStatus(m[1], m[2])}`
  ],
  [
    /Video poll failed:\s*HTTP\s+(\d+)(?:\s+[A-Za-z ]+)?(?::\s*([^()]+))?/i,
    (m) => `视频任务轮询失败：${describeHttpStatus(m[1], m[2])}`
  ],

  // HTTP 状态码错误
  [
    /API 请求失败: (\d+)/,
    (m) => {
      const code = m[1]
      const codeMap: Record<string, string> = {
        '400': '请求参数错误，请检查模型配置',
        '401': '认证失败，API Key 无效或已过期',
        '403': '权限不足，无法访问该模型',
        '429': '请求过于频繁，请稍后再试',
        '500': '服务端内部错误，请稍后重试',
        '502': '服务网关错误，平台可能正在维护',
        '503': '服务暂时不可用，请稍后重试',
        '504': '服务响应超时，请稍后重试'
      }
      return codeMap[code] || `服务端错误 (${code})，请稍后重试`
    }
  ],

  // 网络请求核心报错
  [
    /网络请求核心报错:\s*(.+?)\s*;\s*尝试访问了/,
    (m) => {
      const detail = m[1].toLowerCase()
      if (detail.includes('enotfound') || detail.includes('dns'))
        return '网络连接失败，DNS 解析失败，请检查网络设置'
      if (detail.includes('econnrefused')) return '无法连接服务器，请检查 API 地址配置'
      if (detail.includes('econnreset') || detail.includes('socket'))
        return '网络连接被中断，请检查网络稳定性'
      if (detail.includes('timeout') || detail.includes('etimedout'))
        return '网络请求超时，请检查网络连接'
      if (detail.includes('ssl') || detail.includes('cert'))
        return '安全连接失败 (SSL 错误)，请检查代理设置'
      if (detail.includes('proxy')) return '代理连接失败，请检查代理配置'
      return '网络连接失败，请检查网络设置后重试'
    }
  ],

  // 文件大小限制
  [/参考图片过大（(.+?)MB）/, (m) => `参考图片太大 (${m[1]}MB)，请压缩到 20MB 以下`],
  [/参考图片 Base64 数据过大/, () => '参考图片数据太大，请使用更小的图片'],
  [/文件过大 \((.+?)MB\)/, (m) => `文件太大 (${m[1]}MB)，最大支持 100MB`],
  [/文件不存在: (.+)/, () => '引用的文件不存在，可能已被移动或删除'],

  // 视频上传失败
  [/视频上传失败: (.+)/, (m) => `视频上传失败：${simplifyTechError(m[1])}`],

  // 云端任务完成但无URL
  [/云端任务完成, 但提取流地址失败/, () => '生成完成但获取结果失败，请联系管理员'],

  // 无法提取 Job ID
  [/无法从响应中提取任务 Job ID/, () => '任务提交异常，请检查模型配置后重试'],

  // 不支持的任务类型
  [/仅支持标准图像或视频/, () => '不支持的生成类型，请检查节点配置'],

  // 常见英文 API 错误消息
  [
    /HappyHorse video source cannot be read/i,
    () => 'HappyHorse 无法读取视频素材，请检查素材文件是否存在、可访问，或重新导入后再试'
  ],
  [
    /Cannot determine file type/i,
    () =>
      '视频素材文件格式无法识别。请重新导出为标准 MP4/MOV（建议 H.264 视频 + AAC 音频），不要直接使用缓存/加密文件，然后重新上传后再试'
  ],
  [
    /OSS reference upload failed/i,
    () => '参考素材上传到 OSS 失败，请检查网络连接、OSS 配置或素材文件后重试'
  ],
  [
    /Unsupported generation protocol/i,
    () => '当前模型协议暂不支持，请检查模型配置或切换到可用模型'
  ],
  [/Internal server error/i, () => '服务端内部错误，请稍后重试'],
  [/insufficient.?balance/i, () => '账户余额不足，请充值后重试'],
  [/invalid.?model/i, () => '模型不存在或已下线，请更换模型'],
  [/rate.?limit/i, () => '请求频率超限，请稍后重试'],
  [/content.?moderation|content.?policy|safety/i, () => '内容未通过安全审核，请修改提示词'],
  [
    /SensitiveContent|sensitive.?content/i,
    () => '内容未通过安全审核（涉及敏感信息），请更换参考素材'
  ],
  [/PrivacyInformation|privacy/i, () => '参考素材含有隐私信息（如人脸、证件等），请更换素材后重试'],
  [
    /InvalidParameter[\s\S]*content|content[\s\S]*InvalidParameter/i,
    () => '请求参数格式错误，请检查输入素材或联系管理员'
  ],
  [/InvalidParameter/i, () => '请求参数不合法，请检查模型配置和输入内容'],
  [/token.?limit|context.?length/i, () => '提示词过长，请精简后重试'],
  [/invalid.?api.?key|authentication|unauthorized/i, () => '认证失败，请检查 API Key 是否正确'],
  [
    /token.?quota.?exhausted|quota.?exhausted/i,
    () => '当前模型通道配额已耗尽，请切换可用 Key/模型通道，或联系管理员检查服务端额度'
  ],
  [/quota.?exceeded/i, () => '配额已用完，请充值或等待重置'],
  [/model.?overloaded|server.?busy|capacity/i, () => '模型繁忙，请稍后重试'],
  [
    /response.?timeout.*?(\d+)\s*ms|timeout.*?(\d+)\s*ms/i,
    (m) => {
      const ms = Number(m[1] || m[2] || 0)
      const seconds = ms > 0 ? Math.round(ms / 1000) : 60
      return `请求响应超时（${seconds} 秒）。模型或代理服务处理较慢，请稍后重试；如果经常出现，请把超时时间调大。`
    }
  ],
  [/deadline.?exceeded|request.?timeout|timed.?out/i, () => '请求响应超时，模型或代理服务处理较慢，请稍后重试'],
  [/input.?image.?quality/i, () => '参考图片质量不佳，请更换清晰度更高的图片'],
  [/unsupported.?resolution/i, () => '不支持的分辨率设置，请调整画面比例'],
  [
    /Unexpected token ['"]?<['"]?|意外的标记.*<|不是有效的 JSON|not valid JSON/i,
    () => '服务端返回了网页错误页，不是 JSON 数据。请检查 API 地址、网关/反向代理配置，或确认服务端是否在线。'
  ],
  [
    /request.?entity.?too.?large|payload.?too.?large/i,
    () => '请求数据过大，请减少参考素材或压缩文件'
  ],
  [/fetch failed|network.?error|failed to fetch/i, () => '网络请求失败，请检查网络连接'],

  // 重试失败
  [/重试失败:\s*(.+)/, (m) => `重试失败：${friendlyError(m[1])}`]
]

/**
 * 简化技术错误消息（用于嵌套场景）
 */
function simplifyTechError(msg: string): string {
  if (msg.includes('ENOTFOUND')) return '网络连接失败'
  if (msg.includes('ECONNREFUSED')) return '无法连接服务器'
  if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) return '连接超时'
  if (/Internal server error/i.test(msg)) return '服务端内部错误'
  if (/HTTP \d+/.test(msg)) {
    const code = msg.match(/HTTP (\d+)/)?.[1]
    return `服务端返回错误 (${code})`
  }
  return msg.length > 60 ? msg.substring(0, 60) + '...' : msg
}

function describeHttpStatus(code: string, detail?: string): string {
  const statusMap: Record<string, string> = {
    '400': '请求参数错误，请检查模型配置和输入内容',
    '401': '认证失败，请检查 API Key 是否正确或是否已过期',
    '403': '权限不足，当前 Key 无法访问该模型',
    '404': '接口或任务不存在，请检查 API 地址和模型配置',
    '405': '请求方法不被接口支持，请检查 API 地址是否填写正确',
    '409': '任务状态冲突，请稍后重试',
    '422': '请求参数未通过校验，请检查提示词、比例、分辨率或参考素材',
    '429': '请求过于频繁或配额不足，请稍后重试或切换可用通道',
    '500': '服务端内部错误，请稍后重试',
    '502': '服务网关错误，平台可能正在维护',
    '503': '服务暂时不可用，请稍后重试',
    '504': '服务响应超时，请稍后重试'
  }
  const hint = statusMap[code] || `服务端返回 HTTP ${code}，请稍后重试`
  const cleanedDetail = String(detail || '').trim()
  if (!cleanedDetail || /^HTTP\s+\d+/i.test(cleanedDetail)) return hint
  const translatedDetail = translateKnownDetail(cleanedDetail)
  if (translatedDetail && code === '400') return translatedDetail
  return translatedDetail ? `${hint}（${translatedDetail}）` : hint
}

function translateKnownDetail(detail: string): string {
  if (/Internal server error/i.test(detail)) return '服务端内部错误'
  if (/InputImageSensitiveContentDetected\.PrivacyInformation|input image may contain real person/i.test(detail))
    return '参考图疑似包含真实人物或隐私信息，请更换参考图后重试'
  if (/PrivacyInformation|privacy/i.test(detail)) return '参考素材含有隐私信息（如人脸、证件等）'
  if (/SensitiveContent|sensitive.?content/i.test(detail)) return '内容未通过安全审核（涉及敏感信息）'
  if (/invalid.?api.?key|authentication|unauthorized/i.test(detail)) return '认证信息无效'
  if (/token.?quota.?exhausted|quota.?exhausted/i.test(detail)) return '通道配额已耗尽'
  if (/quota.?exceeded/i.test(detail)) return '配额已用完'
  if (/rate.?limit/i.test(detail)) return '请求频率超限'
  if (/content.?moderation|content.?policy|safety/i.test(detail)) return '内容未通过安全审核'
  if (/InvalidParameter/i.test(detail)) return '请求参数不合法'
  return ''
}

/**
 * 将技术性错误消息翻译为用户友好的中文提示
 *
 * @param raw 原始错误消息
 * @returns 用户友好的中文错误提示
 */
export function friendlyError(raw: string | null | undefined): string {
  if (!raw) return '发生未知错误'

  const trimmed = raw.trim()

  // 1. 精确匹配
  if (EXACT_MAP[trimmed]) return EXACT_MAP[trimmed]

  // 2. 模式匹配
  for (const [pattern, translator] of PATTERN_RULES) {
    const match = trimmed.match(pattern)
    if (match) return translator(match, trimmed)
  }

  // 3. 如果已经是合理的中文消息（超过50%是中文字符），直接返回
  const chineseChars = trimmed.match(/[\u4e00-\u9fff]/g)?.length || 0
  if (chineseChars > trimmed.length * 0.3) {
    // 已经是中文了，截断过长消息
    return trimmed.length > 100 ? trimmed.substring(0, 100) + '...' : trimmed
  }

  // 4. 兜底：截断过长的英文/技术消息
  const prefix = trimmed.startsWith('任务失败') ? '' : '任务失败：'
  if (trimmed.length > 80) {
    return `${prefix}${trimmed.substring(0, 80)}...`
  }

  return `${prefix}${trimmed}`
}

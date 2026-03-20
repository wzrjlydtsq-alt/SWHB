import { DEFAULT_BASE_URL } from '../utils/constants.js'

/**
 * 基础的网络请求封装 (API Client)
 * 目标: 统一处理所有的鉴权 (Authorization), URL 拼接, JSON 解析及错误抛出机制。
 */

export class APIError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.data = data
  }
}

/**
 * 统一的 fetch 请求封装函数
 * @param {string} endpoint - 请求地址 (可为绝对路径或相对路径)
 * @param {object} options - fetch 选项, 包括 method, headers, body 等
 * @param {object} config - 附加配置项
 * @param {string} [config.baseUrl] - 基础的 URL
 * @param {string} [config.apiKey] - 如果需要的话, 用于 Authorization
 * @param {boolean} [config.isJson=true] - 是否自动解析 JSON
 * @returns {Promise<any>}
 */
export async function apiClient(
  endpoint,
  options = {},
  { baseUrl = DEFAULT_BASE_URL, apiKey = '', isJson = true } = {}
) {
  // 判断是否为绝对路径，包括 http, https, blob, data
  const isAbsoluteUrl = /^(https?|blob|data):/i.test(endpoint)
  // 如果是相对路径，去除可能多余的斜杠
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
  const url = isAbsoluteUrl ? endpoint : `${baseUrl.replace(/\/$/, '')}/${cleanEndpoint}`

  const headers = new Headers(options.headers || {})

  if (apiKey) {
    headers.set('Authorization', `Bearer ${apiKey}`)
  }

  // 默认附加 application/json，除非传入的是 FormData 等特殊形式（或禁止覆盖）
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const fetchOptions = {
    ...options,
    headers
  }

  try {
    const response = await fetch(url, fetchOptions)

    // 针对响应状态码直接处理错误
    if (!response.ok) {
      let errorData
      try {
        errorData = await response.json()
      } catch {
        errorData = await response.text()
      }
      throw new APIError(
        errorData?.error?.message ||
          errorData?.message ||
          `HTTP Request Failed: ${response.status}`,
        response.status,
        errorData
      )
    }

    if (isJson) {
      return await response.json()
    }
    return response // 返回原始 response (比如处理 Blob 时)
  } catch (error) {
    // 处理如网络断开、跨域拦截等基础异常
    if (error instanceof APIError) {
      throw error
    }
    throw new APIError(`Network Error: ${error.message}`, 0, null)
  }
}

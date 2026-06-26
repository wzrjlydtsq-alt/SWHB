export function createApiConfigsMap(apiConfigs: any[] = []) {
  const map = new Map<string, any>()
  const configs = Array.isArray(apiConfigs) ? apiConfigs : []
  configs.forEach((config) => {
    if (!config) return
    if (config.id) map.set(String(config.id), config)
  })
  configs.forEach((config) => {
    if (!config?.modelName) return
    const key = String(config.modelName)
    if (!map.has(key)) map.set(key, config)
  })
  return map
}

export function resolveApiConfigRuntime(
  config: any,
  groupApiKey = '',
  groupApiUrl = '',
  fallbackBaseUrl = ''
) {
  return {
    apiKey: config?.key || groupApiKey || '',
    baseUrl: (config?.url || groupApiUrl || fallbackBaseUrl || '').replace(/\/+$/, '')
  }
}

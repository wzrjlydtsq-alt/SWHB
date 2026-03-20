import { useState } from 'react'
import { apiClient } from '../services/apiClient.js'
import { DEFAULT_BASE_URL } from '../utils/constants.js'

export const useApiConfigManager = ({ apiConfigs, setApiConfigs, apiConfigsMap, globalApiKey }) => {
  const [apiTesting, setApiTesting] = useState(null)
  const [apiStatus, setApiStatus] = useState({})

  const addNewModel = (type = 'Chat') => {
    const newId = `custom-${Date.now()}`
    const currentConfigs = Array.isArray(apiConfigs) ? apiConfigs : []
    setApiConfigs([
      ...currentConfigs,
      {
        id: newId,
        provider: 'New Model',
        modelName: '',
        type: type,
        key: '',
        url: '',
        isCustom: true
      }
    ])
  }

  const updateApiConfig = (id, updates) =>
    setApiConfigs((prev) => {
      const currentConfigs = Array.isArray(prev) ? prev : []
      return currentConfigs.map((c) => (c.id === id ? { ...c, ...updates } : c))
    })

  const deleteApiConfig = (id) =>
    setApiConfigs((prev) => {
      const currentConfigs = Array.isArray(prev) ? prev : []
      return currentConfigs.filter((c) => c.id !== id)
    })

  const testApiConnection = async (id) => {
    setApiTesting(id)
    setApiStatus((prev) => ({ ...prev, [id]: 'idle' }))
    const config = apiConfigsMap.get(id)
    const apiKey = config?.key || globalApiKey

    if (!apiKey) {
      setApiStatus((prev) => ({ ...prev, [id]: 'error' }))
      setApiTesting(null)
      return
    }

    try {
      const baseUrl = (config?.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
      await apiClient('/v1/models', { method: 'GET' }, { baseUrl, apiKey })
      setApiStatus((prev) => ({ ...prev, [id]: 'success' }))
    } catch {
      setApiStatus((prev) => ({ ...prev, [id]: 'error' }))
    }
    setApiTesting(null)
  }

  const getStatusColor = (modelId) => {
    if (!modelId) return 'bg-zinc-600'
    const status = apiStatus[modelId]
    if (status === 'success') return 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]'
    if (status === 'error') return 'bg-red-500'
    const config = apiConfigsMap.get(modelId)
    return config?.key || globalApiKey ? 'bg-zinc-400' : 'bg-zinc-700'
  }

  return {
    apiTesting,
    apiStatus,
    addNewModel,
    updateApiConfig,
    deleteApiConfig,
    testApiConnection,
    getStatusColor
  }
}

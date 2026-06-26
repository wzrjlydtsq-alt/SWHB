/**
 * Provider 注册表 — 通过 modelId 自动路由到对应的 Provider 实现
 *
 * 用法：
 *   import { getProvider, resolveProvider } from './registry'
 *   const provider = resolveProvider('doubao-seedance-2-0-260128')
 *   const result = await provider.generate(request, apiKey, baseUrl)
 */
import type { IModelProvider } from './IModelProvider'
import { VolcanoProvider } from './VolcanoProvider'
import { MidjourneyProvider } from './MidjourneyProvider'

// Provider 实例注册表
const providerInstances: Map<string, IModelProvider> = new Map()

// modelId → providerId 路由表
const modelRoutes: Map<string, string> = new Map()

/**
 * 注册一个 Provider
 */
export function registerProvider(provider: IModelProvider): void {
  providerInstances.set(provider.id, provider)
}

/**
 * 绑定 modelId 到 providerId
 */
export function bindModel(modelId: string, providerId: string): void {
  modelRoutes.set(modelId, providerId)
}

/**
 * 通过 providerId 获取 Provider 实例
 */
export function getProvider(providerId: string): IModelProvider | undefined {
  return providerInstances.get(providerId)
}

/**
 * 通过 modelId 自动解析对应的 Provider
 * 先查路由表，再用模式匹配推断
 */
export function resolveProvider(modelId: string): IModelProvider | undefined {
  // 1. 精确路由
  const routedId = modelRoutes.get(modelId)
  if (routedId) return providerInstances.get(routedId)

  // 2. 模式匹配推断
  const lower = modelId.toLowerCase()

  if (
    lower.includes('seedance') ||
    lower.includes('doubao') ||
    lower.startsWith('ep-')
  ) {
    return providerInstances.get('volcano')
  }

  if (lower.includes('midjourney') || lower.includes('mj')) {
    return providerInstances.get('midjourney')
  }

  return undefined
}

/**
 * 列出所有已注册的 Provider
 */
export function listProviders(): IModelProvider[] {
  return Array.from(providerInstances.values())
}

/**
 * 列出指定 runtime 的 Provider
 */
export function listProvidersByRuntime(runtime: 'local' | 'cloud' | 'both'): IModelProvider[] {
  return listProviders().filter(
    (p) => p.capabilities.runtime === runtime || p.capabilities.runtime === 'both'
  )
}

// ═══════════════════════════════════════════
// 初始化：注册内置 Provider 并绑定常用 modelId
// ═══════════════════════════════════════════

const volcano = new VolcanoProvider()
const midjourney = new MidjourneyProvider()

registerProvider(volcano)
registerProvider(midjourney)

// 火山引擎系列
bindModel('doubao-seedance-2-0-260128', 'volcano')
bindModel('seedance-2', 'volcano')
bindModel('doubao-seedance-2', 'volcano')

// Midjourney
bindModel('midjourney', 'midjourney')
bindModel('mj-fast', 'midjourney')
bindModel('mj-relax', 'midjourney')

/**
 * Provider Registry 测试
 * - 注册/查找/路由
 * - 模式匹配推断
 * - 能力声明检查
 */
import { describe, it, expect } from 'vitest'
import {
  registerProvider,
  bindModel,
  getProvider,
  resolveProvider,
  listProviders,
  listProvidersByRuntime
} from '../../services/providers/registry'
import { VolcanoProvider } from '../../services/providers/VolcanoProvider'
import { MidjourneyProvider } from '../../services/providers/MidjourneyProvider'

describe('Provider Registry', () => {
  it('内置 Provider 已注册', () => {
    const providers = listProviders()
    expect(providers.length).toBeGreaterThanOrEqual(2)

    const volcano = getProvider('volcano')
    expect(volcano).toBeDefined()
    expect(volcano.name).toContain('火山')

    const mj = getProvider('midjourney')
    expect(mj).toBeDefined()
    expect(mj.name).toBe('Midjourney')
  })

  it('精确路由应命中', () => {
    const p = resolveProvider('doubao-seedance-2-0-260128')
    expect(p).toBeDefined()
    expect(p.id).toBe('volcano')
  })

  it('模式匹配应命中 seedance', () => {
    const p = resolveProvider('seedance-2')
    expect(p).toBeDefined()
    expect(p.id).toBe('volcano')
  })

  it('模式匹配应命中 ep- 前缀', () => {
    const p = resolveProvider('ep-20260311164945-q4wqg')
    expect(p).toBeDefined()
    expect(p.id).toBe('volcano')
  })

  it('模式匹配应命中 midjourney', () => {
    const p = resolveProvider('midjourney')
    expect(p).toBeDefined()
    expect(p.id).toBe('midjourney')
  })

  it('未知 modelId 应返回 undefined', () => {
    const p = resolveProvider('some-unknown-model-xyz')
    expect(p).toBeUndefined()
  })

  it('bindModel 可新增路由', () => {
    bindModel('my-custom-volcano-model', 'volcano')
    const p = resolveProvider('my-custom-volcano-model')
    expect(p).toBeDefined()
    expect(p.id).toBe('volcano')
  })

  it('listProvidersByRuntime 过滤正确', () => {
    const localProviders = listProvidersByRuntime('local')
    // Midjourney 是 local，Volcano 是 both（也应出现在 local 查询中）
    expect(localProviders.some((p) => p.id === 'midjourney')).toBe(true)

    const cloudProviders = listProvidersByRuntime('cloud')
    // Volcano 是 both，也应出现在 cloud 查询中
    expect(cloudProviders.some((p) => p.id === 'volcano')).toBe(true)
    // Midjourney 是 local，不应出现在 cloud 查询中
    expect(cloudProviders.some((p) => p.id === 'midjourney')).toBe(false)
  })
})

describe('VolcanoProvider 能力声明', () => {
  const provider = new VolcanoProvider()

  it('应声明为视频类型', () => {
    expect(provider.capabilities.supportedTypes).toContain('video')
  })

  it('应支持图片输入', () => {
    expect(provider.capabilities.supportsImageInput).toBe(true)
  })

  it('应为异步轮询模式', () => {
    expect(provider.capabilities.isAsyncPolling).toBe(true)
  })

  it('应声明 runtime 为 both', () => {
    expect(provider.capabilities.runtime).toBe('both')
  })

  it('poll 方法应存在', () => {
    expect(typeof provider.poll).toBe('function')
  })
})

describe('MidjourneyProvider 能力声明', () => {
  const provider = new MidjourneyProvider()

  it('应声明为图片类型', () => {
    expect(provider.capabilities.supportedTypes).toContain('image')
  })

  it('不应支持音频生成', () => {
    expect(provider.capabilities.supportsAudioGeneration).toBe(false)
  })

  it('应声明 runtime 为 local', () => {
    expect(provider.capabilities.runtime).toBe('local')
  })

  it('poll 方法应存在', () => {
    expect(typeof provider.poll).toBe('function')
  })
})

import { describe, expect, it } from 'vitest'
import { createApiConfigsMap, resolveApiConfigRuntime } from './apiConfigResolver'

describe('api config resolver', () => {
  it('resolves model configs by id and modelName', () => {
    const config = {
      id: 'custom-video',
      modelName: 'real-video-model',
      type: 'Video',
      key: 'model-key',
      url: 'https://model.example.com/'
    }
    const map = createApiConfigsMap([config])

    expect(map.get('custom-video')).toBe(config)
    expect(map.get('real-video-model')).toBe(config)
  })

  it('keeps id lookups from being overwritten by duplicate model names', () => {
    const t8starImage = {
      id: 'gpt-image-2',
      modelName: 'gpt-image-2',
      provider: 'GPT Image 2',
      type: 'Image',
      url: 'https://ai.t8star.org'
    }
    const sub2apiImage = {
      id: 'sub2api-gpt-image-2',
      modelName: 'gpt-image-2',
      provider: 'Sub2API',
      type: 'Image',
      url: 'http://8.209.238.65:8080'
    }

    const map = createApiConfigsMap([t8starImage, sub2apiImage])

    expect(map.get('gpt-image-2')).toBe(t8starImage)
    expect(map.get('sub2api-gpt-image-2')).toBe(sub2apiImage)
  })

  it('prefers per-model key and url over group defaults', () => {
    const runtime = resolveApiConfigRuntime(
      { key: 'model-key', url: 'https://model.example.com/' },
      'group-key',
      'https://group.example.com/',
      'https://fallback.example.com'
    )

    expect(runtime).toEqual({
      apiKey: 'model-key',
      baseUrl: 'https://model.example.com'
    })
  })

  it('falls back to group defaults when per-model fields are empty', () => {
    const runtime = resolveApiConfigRuntime(
      { key: '', url: '' },
      'group-key',
      'https://group.example.com/',
      'https://fallback.example.com'
    )

    expect(runtime).toEqual({
      apiKey: 'group-key',
      baseUrl: 'https://group.example.com'
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_API_CONFIGS,
  LINGJING_XINGHE_TOP_GATEWAY_URL,
  OPENAI_COMPATIBLE_GATEWAY_URL,
  T8STAR_IMAGE_GATEWAY_URL,
  getModelParams,
  getRatiosForModel,
  getResolutionsForModel,
  isKnownLegacyVideoGatewayUrl,
  normalizeKnownLegacyVideoGatewayUrl,
  normalizeModelApiBaseUrl,
  normalizeOptionalModelApiBaseUrl
} from './constants'

describe('legacy video gateway migration', () => {
  it('does not keep removed legacy gateways as known options', () => {
    expect(isKnownLegacyVideoGatewayUrl('http://47.108.196.234:10086/prod')).toBe(false)
    expect(isKnownLegacyVideoGatewayUrl('http://47.108.196.234:10086/prod///')).toBe(false)
  })

  it('migrates the known legacy gateway to an empty url when no user fallback exists', () => {
    expect(
      normalizeKnownLegacyVideoGatewayUrl('http://47.108.196.234:10086/prod')
    ).toBe('')
    expect(
      normalizeKnownLegacyVideoGatewayUrl('https://private.example.com/prod')
    ).toBe('')
  })
})

describe('model api base url options', () => {
  it('keeps allowed urls and trims trailing slashes', () => {
    expect(normalizeModelApiBaseUrl('https://dashscope.aliyuncs.com///')).toBe(
      'https://dashscope.aliyuncs.com'
    )
    expect(normalizeModelApiBaseUrl(`${LINGJING_XINGHE_TOP_GATEWAY_URL}///`)).toBe(
      LINGJING_XINGHE_TOP_GATEWAY_URL
    )
    expect(normalizeModelApiBaseUrl(`${T8STAR_IMAGE_GATEWAY_URL}///`)).toBe(
      T8STAR_IMAGE_GATEWAY_URL
    )
    expect(normalizeModelApiBaseUrl(`${OPENAI_COMPATIBLE_GATEWAY_URL}///`)).toBe(
      OPENAI_COMPATIBLE_GATEWAY_URL
    )
  })

  it('falls back for removed Lingjing urls', () => {
    expect(normalizeModelApiBaseUrl('https://www.lingjingxinghe.com///')).toBe('')
    expect(normalizeOptionalModelApiBaseUrl('https://www.lingjingxinghe.cn///')).toBe('')
    expect(normalizeModelApiBaseUrl('http://new.lingjingxinghe.cn///')).toBe('')
  })

  it('maps legacy Lingjing top urls to the https www gateway', () => {
    expect(normalizeModelApiBaseUrl('http://lingjingxinghe.top///')).toBe(
      LINGJING_XINGHE_TOP_GATEWAY_URL
    )
    expect(normalizeOptionalModelApiBaseUrl('https://lingjingxinghe.top///')).toBe(
      LINGJING_XINGHE_TOP_GATEWAY_URL
    )
  })

  it('falls back when a custom url is not in the allowed list', () => {
    expect(normalizeModelApiBaseUrl('https://private.example.com')).toBe('')
    expect(normalizeOptionalModelApiBaseUrl('https://private.example.com')).toBe('')
  })

  it('preserves an empty per-model url so it can inherit group defaults', () => {
    expect(normalizeOptionalModelApiBaseUrl('')).toBe('')
  })
})

describe('Chat model defaults', () => {
  it('keeps only the requested default chat models', () => {
    const chatModels = DEFAULT_API_CONFIGS.filter((config) => config.type === 'Chat')

    expect(chatModels.map((config) => config.id)).toEqual([
      'gpt-5.5',
      'claude-opus-4-6',
      'kimi-k2.6'
    ])
    expect(chatModels.every((config) => config.url === '')).toBe(true)
  })
})

describe('Sub2API OpenAI-compatible defaults', () => {
  it('keeps the original gpt-image-2 and separate Sub2API image model without default urls', () => {
    const originalImage = DEFAULT_API_CONFIGS.find((config) => config.id === 'gpt-image-2')
    const sub2apiImage = DEFAULT_API_CONFIGS.find((config) => config.id === 'sub2api-gpt-image-2')

    expect(originalImage).toMatchObject({
      modelName: 'gpt-image-2',
      type: 'Image',
      url: ''
    })
    expect(sub2apiImage).toMatchObject({
      provider: 'Sub2API',
      modelName: 'gpt-image-2',
      type: 'Image',
      url: ''
    })
  })
})

describe('HappyHorse defaults', () => {
  it('includes HappyHorse 1.1 T2V/I2V/R2V without default urls', () => {
    const happyHorse11 = DEFAULT_API_CONFIGS.filter((config) =>
      String(config.modelName).startsWith('happyhorse-1.1-')
    )

    expect(happyHorse11.map((config) => config.modelName).sort()).toEqual([
      'happyhorse-1.1-i2v',
      'happyhorse-1.1-r2v',
      'happyhorse-1.1-t2v'
    ])
    expect(happyHorse11.every((config) => config.url === '')).toBe(true)
  })
})

describe('Doubao Seedance defaults', () => {
  it('includes the formal fast model and routes it through Seedance video options', () => {
    const fast = DEFAULT_API_CONFIGS.find((config) => config.id === 'doubao-seedance-2.0-fast')

    expect(fast).toMatchObject({
      provider: 'Doubao-Seedance-2.0-fast',
      modelName: 'Doubao-Seedance-2.0-fast',
      type: 'Video',
      url: ''
    })
    expect(getRatiosForModel(fast?.modelName)).toContain('16:9')
    expect(getResolutionsForModel(fast?.modelName)).toEqual(['720p', '480p'])
    expect(getModelParams(fast?.modelName, '16:9', '720p')).toMatchObject({
      sizeStr: '720p',
      w: 1280,
      h: 720
    })
  })
})

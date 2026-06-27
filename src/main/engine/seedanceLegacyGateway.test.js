import { describe, expect, it } from 'vitest'

import { TaskExecutor } from './TaskExecutor.js'

describe('Seedance legacy gateway helpers', () => {
  it('uses a larger configurable API request timeout and forwards timeout headers', () => {
    const previous = process.env.XINGHE_API_REQUEST_TIMEOUT_MS
    delete process.env.XINGHE_API_REQUEST_TIMEOUT_MS
    expect(TaskExecutor.getApiRequestTimeoutMs()).toBe(300000)

    process.env.XINGHE_API_REQUEST_TIMEOUT_MS = '600000'
    expect(TaskExecutor.getApiRequestTimeoutMs()).toBe(600000)
    expect(TaskExecutor.withRequestTimeoutHeaders({ Authorization: 'Bearer test' })).toMatchObject({
      Authorization: 'Bearer test',
      'X-Request-Timeout-Ms': '600000',
      'X-Response-Timeout-Ms': '600000',
      'X-Timeout-Ms': '600000'
    })

    if (previous === undefined) delete process.env.XINGHE_API_REQUEST_TIMEOUT_MS
    else process.env.XINGHE_API_REQUEST_TIMEOUT_MS = previous
  })

  it('adds the DashScope data inspection bypass header for HappyHorse calls', () => {
    expect(
      TaskExecutor.withDashScopeDataInspectionHeader({ Authorization: 'Bearer test' })
    ).toMatchObject({
      Authorization: 'Bearer test',
      'X-DashScope-DataInspection': '{"input":"disable","output":"disable"}'
    })
  })

  it('recognizes the old proxy URL with trailing slashes', () => {
    expect(TaskExecutor.isLegacySeedanceGateway('http://47.108.196.234:10086/prod')).toBe(true)
    expect(TaskExecutor.isLegacySeedanceGateway('http://47.108.196.234:10086/prod///')).toBe(true)
    expect(TaskExecutor.isLegacySeedanceGateway('https://www.lingjingxinghe.cn')).toBe(false)
  })

  it('builds the flat legacy Seedance request body', () => {
    expect(
      TaskExecutor.buildLegacySeedanceSubmitBody({
        model: 'doubao-seedance-2',
        prompt: '1girl',
        ratio: '16:9',
        duration: '5',
        resolution: '720p'
      })
    ).toEqual({
      model: 'doubao-seedance-2',
      prompt: '1girl',
      ratio: '16:9',
      duration: 5,
      resolution: '720p',
      framespersecond: 24
    })
  })

  it('uses the flat legacy body first for pure text on the 47.108 proxy only', () => {
    expect(
      TaskExecutor.shouldUseLegacySeedanceSubmitBody({
        rootUrl: 'http://47.108.196.234:10086/prod',
        sourceImages: [],
        sourceVideos: [],
        sourceAudios: [],
        enableWebSearch: false
      })
    ).toBe(true)

    expect(
      TaskExecutor.shouldUseLegacySeedanceSubmitBody({
        rootUrl: 'http://47.108.196.234:10086/prod',
        sourceImages: ['https://example.com/a.png']
      })
    ).toBe(false)

    expect(
      TaskExecutor.shouldUseLegacySeedanceSubmitBody({
        rootUrl: 'https://www.lingjingxinghe.cn'
      })
    ).toBe(false)
  })

  it('prefers the documented plural video submit endpoint with the old singular path as fallback', () => {
    expect(
      TaskExecutor.getVideoGenerationSubmitEndpoints('http://47.108.196.234:10086/prod', {
        preferPluralVideos: true
      })
    ).toEqual([
      'http://47.108.196.234:10086/prod/v1/videos/generations',
      'http://47.108.196.234:10086/prod/v1/video/generations'
    ])

    expect(
      TaskExecutor.getVideoGenerationSubmitEndpoints('http://47.108.196.234:10086/prod/')
    ).toEqual([
      'http://47.108.196.234:10086/prod/v1/video/generations',
      'http://47.108.196.234:10086/prod/v1/videos/generations'
    ])
  })

  it('preserves billing-critical Seedance parameters in metadata', () => {
    const metadata = TaskExecutor.buildSeedanceMetadata({
      ratio: '16:9',
      duration: '00:13',
      resolution: '480p',
      generateAudio: undefined
    })

    expect(metadata).toEqual({
      duration: 13,
      ratio: '16:9',
      resolution: '480p',
      watermark: false,
      generate_audio: true,
      framespersecond: 24
    })
  })

  it('builds a proxy Seedance body with matching top-level and metadata parameters', () => {
    expect(
      TaskExecutor.buildSeedanceProxySubmitBody({
        model: 'doubao-seedance-2',
        prompt: '1girl',
        ratio: '16:9',
        duration: '13秒',
        resolution: '480p',
        generateAudio: undefined
      })
    ).toEqual({
      model: 'doubao-seedance-2',
      prompt: '1girl',
      generate_audio: true,
      ratio: '16:9',
      duration: 13,
      resolution: '480p',
      framespersecond: 24,
      watermark: false,
      metadata: {
        duration: 13,
        ratio: '16:9',
        resolution: '480p',
        watermark: false,
        generate_audio: true,
        framespersecond: 24
      }
    })
  })

  it('builds an Ark-style Seedance body with top-level content and parameters', () => {
    expect(
      TaskExecutor.buildArkSeedanceSubmitBody({
        model: 'doubao-seedance-2',
        prompt: '1girl',
        ratio: '16:9',
        duration: '5',
        resolution: '720p',
        generateAudio: undefined
      })
    ).toEqual({
      model: 'doubao-seedance-2',
      content: [{ type: 'text', text: '1girl' }],
      generate_audio: true,
      ratio: '16:9',
      duration: 5,
      resolution: '720p',
      framespersecond: 24,
      watermark: false
    })
  })

  it('summarizes submit bodies without leaking the full prompt', () => {
    const summary = TaskExecutor.summarizeSubmitBody({
      model: 'doubao-seedance-2',
      prompt: 'a'.repeat(200),
      ratio: '16:9',
      duration: 5,
      resolution: '480p',
      framespersecond: 24,
      generate_audio: true
    })

    expect(summary).toEqual({
      kind: 'flat',
      model: 'doubao-seedance-2',
      promptLength: 200,
      ratio: '16:9',
      duration: 5,
      resolution: '480p',
      framespersecond: 24,
      generate_audio: true,
      hasMetadata: false,
      contentTypes: []
    })
    expect(JSON.stringify(summary)).not.toContain('aaaaaaaaaaaaaaaaaaaa')
  })

  it('summarizes 480p compatibility retries distinctly', () => {
    const body = TaskExecutor.buildLegacySeedanceSubmitBody({
      model: 'doubao-seedance-2',
      prompt: 'x',
      ratio: '16:9',
      duration: '5',
      resolution: '480p',
      generateAudio: true
    })

    expect(TaskExecutor.summarizeSubmitBody(body)).toMatchObject({
      kind: 'flat',
      ratio: '16:9',
      duration: 5,
      resolution: '480p',
      generate_audio: true
    })
  })
})

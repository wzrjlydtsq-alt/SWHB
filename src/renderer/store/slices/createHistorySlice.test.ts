import { describe, expect, it } from 'vitest'
import { normalizeHistoryForPlayback, sanitizeHistoryForSave } from './createHistorySlice'

describe('sanitizeHistoryForSave', () => {
  it('keeps audit fields while stripping non-persistent media and secrets', () => {
    const bigDataUrl = `data:image/png;base64,${'a'.repeat(10000)}`
    const [item] = sanitizeHistoryForSave([
      {
        id: 'h1',
        status: 'failed',
        url: bigDataUrl,
        rawErrorMsg: 'HTTP 500 upstream',
        apiConfig: { modelId: 'm1', apiKey: 'secret-key', baseUrl: 'https://example.com' },
        originalPayload: { prompt: 'x', apiKey: 'secret-key', sourceImages: [bigDataUrl] },
        sourceMeta: { shotId: 's1' },
        cacheStatus: 'failed',
        cacheError: 'download failed',
        blob: {},
        file: {}
      }
    ] as any)

    expect(item.url).toMatch(/^\[DATA_URL image\/png length=/)
    expect(item.rawErrorMsg).toBe('HTTP 500 upstream')
    expect(item.apiConfig.apiKey).toBe('[REDACTED]')
    expect(item.originalPayload.apiKey).toBe('[REDACTED]')
    expect(item.originalPayload.sourceImages[0]).toMatch(/^\[DATA_URL image\/png length=/)
    expect(item.cacheStatus).toBe('failed')
    expect(item.cacheError).toBe('download failed')
    expect(item.blob).toBeUndefined()
    expect(item.file).toBeUndefined()
  })

  it('promotes local cache URLs so old history previews do not use expired remote media', () => {
    const remoteUrl = 'https://ark.example.com/temp.mp4?X-Tos-Expires=86400'
    const localUrl = 'xinghe://local/?path=C%3A%5Ccache%5Cvideos%5Cgen_h1.mp4'
    const [normalized] = normalizeHistoryForPlayback([
      {
        id: 'h1',
        type: 'video',
        status: 'completed',
        url: remoteUrl,
        resultUrl: remoteUrl,
        localCacheUrl: localUrl
      }
    ] as any)

    expect(normalized.url).toBe(localUrl)
    expect(normalized.originalUrl).toBe(remoteUrl)

    const [saved] = sanitizeHistoryForSave([normalized] as any)
    expect(saved.url).toBe(localUrl)
    expect(saved.localCacheUrl).toBe(localUrl)
    expect(saved.resultUrl).toBe(remoteUrl)
  })
})

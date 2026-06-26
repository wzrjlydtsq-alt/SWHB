import { describe, expect, it } from 'vitest'
import { getPreferredMediaUrl, getPreferredMediaUrls } from './fileHelpers'

describe('getPreferredMediaUrl', () => {
  it('prefers local video cache because remote relay URLs expire', () => {
    const url = 'xinghe://local/?path=C%3A%5Ccache%5Cvideos%5Cclip.mp4'

    expect(
      getPreferredMediaUrl({
        type: 'video',
        localFilePath: 'videos/history_clip.mp4',
        localCacheUrl: url,
        url: 'https://example.com/clip.mp4'
      })
    ).toBe(url)
  })

  it('falls back to local video cache when no remote URL is available', () => {
    const url = 'xinghe://local/?path=C%3A%5Ccache%5Cvideos%5Cclip.mp4'

    expect(
      getPreferredMediaUrl({
        type: 'video',
        localFilePath: 'videos/history_clip.mp4',
        localCacheUrl: url
      })
    ).toBe(url)
  })

  it('does not let relative path fields hide a playable media URL', () => {
    expect(
      getPreferredMediaUrl({
        cachePath: 'videos/gen_clip.mp4',
        path: 'videos/other_clip.mp4',
        url: 'https://example.com/new-video.mp4'
      })
    ).toBe('https://example.com/new-video.mp4')
  })

  it('still accepts absolute local file paths when no cache URL exists', () => {
    expect(
      getPreferredMediaUrl({
        localFilePath: 'D:\\cache\\videos\\clip.mp4',
        url: 'https://example.com/clip.mp4'
      })
    ).toBe('D:\\cache\\videos\\clip.mp4')
  })

  it('keeps local cached output results ahead of remote task URLs', () => {
    const localUrl = 'xinghe://local/?path=D%3A%5Ccache%5Cvideos%5Cgen_hist_1.mp4'
    const remoteUrl = 'https://relay.example.com/temporary.mp4'

    expect(
      getPreferredMediaUrls({
        id: 'hist_1',
        type: 'video',
        url: remoteUrl,
        resultUrl: remoteUrl,
        localCacheUrl: localUrl,
        localFilePath: 'D:\\cache\\videos\\gen_hist_1.mp4'
      })
    ).toEqual([localUrl, 'D:\\cache\\videos\\gen_hist_1.mp4', remoteUrl])
  })
})

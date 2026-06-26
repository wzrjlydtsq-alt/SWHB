import { describe, expect, it } from 'vitest'

import {
  getModelParams,
  getRatiosForModel,
  normalizeSeedanceVideoRatio,
  normalizeSeedanceVideoResolution,
  SEEDANCE_VIDEO_RATIOS,
  SEEDANCE_VIDEO_RES_OPTIONS
} from './constants.ts'

const seedanceDimensions = {
  '480p': {
    '16:9': [864, 496],
    '9:16': [496, 864],
    '1:1': [640, 640],
    '4:3': [752, 560],
    '3:4': [560, 752],
    '21:9': [992, 432]
  },
  '720p': {
    '16:9': [1280, 720],
    '9:16': [720, 1280],
    '1:1': [960, 960],
    '4:3': [1112, 834],
    '3:4': [834, 1112],
    '21:9': [1470, 630]
  }
}

describe('Seedance video size parameters', () => {
  it('only exposes ratios and resolutions supported by the Seedance proxy', () => {
    expect(getRatiosForModel('doubao-seedance-2')).toEqual(SEEDANCE_VIDEO_RATIOS)
    expect(SEEDANCE_VIDEO_RES_OPTIONS).toEqual(['720p', '480p'])
  })

  it.each(SEEDANCE_VIDEO_RES_OPTIONS)('maps all %s ratios to documented display sizes', (resolution) => {
    for (const ratio of SEEDANCE_VIDEO_RATIOS) {
      const params = getModelParams('doubao-seedance-2', ratio, resolution)
      const [w, h] = seedanceDimensions[resolution][ratio]

      expect(params).toMatchObject({ sizeStr: resolution, w, h })
    }
  })

  it('normalizes legacy or image-only values before submission', () => {
    expect(normalizeSeedanceVideoRatio('4:1')).toBe('16:9')
    expect(normalizeSeedanceVideoRatio('Auto')).toBe('adaptive')
    expect(normalizeSeedanceVideoResolution('1080P')).toBe('720p')
    expect(normalizeSeedanceVideoResolution('1K')).toBe('720p')
  })
})

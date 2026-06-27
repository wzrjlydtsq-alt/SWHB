import { describe, expect, it, vi } from 'vitest'
import { createProjectSlice } from './createProjectSlice'

describe('createProjectSlice api config initialization', () => {
  it('clears user-entered per-model urls that are not allowed options', () => {
    const state: any = {
      apiConfigs: [
        {
          id: 'doubao-seedance-2',
          provider: 'doubao',
          modelName: 'doubao-seedance-2',
          type: 'Video',
          key: 'custom-key',
          url: 'https://custom.example.com',
          durations: ['9s']
        }
      ],
      groupApiUrls: {},
      jimengSessionId: ''
    }
    const set = vi.fn((patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch
      Object.assign(state, next)
    })
    const get = () => state
    const slice: any = createProjectSlice(set, get)

    slice.initializeConfigs()

    const seedanceConfig = state.apiConfigs.find((config) => config.id === 'doubao-seedance-2')
    expect(seedanceConfig).toMatchObject({
      modelName: 'doubao-seedance-2',
      key: 'custom-key',
      url: '',
      durations: ['9s']
    })
  })

  it('clears the removed legacy gateway instead of replacing it with a default url', () => {
    const state: any = {
      apiConfigs: [
        {
          id: 'doubao-seedance-2',
          provider: 'doubao',
          modelName: 'doubao-seedance-2',
          type: 'Video',
          key: 'custom-key',
          url: 'http://47.108.196.234:10086/prod',
          durations: ['5s']
        }
      ],
      groupApiUrls: {},
      jimengSessionId: ''
    }
    const set = vi.fn((patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch
      Object.assign(state, next)
    })
    const get = () => state
    const slice: any = createProjectSlice(set, get)

    slice.initializeConfigs()

    const seedanceConfig = state.apiConfigs.find((config) => config.id === 'doubao-seedance-2')
    expect(seedanceConfig.url).toBe('')
  })

  it('keeps an empty per-model url and key when restoring group defaults', () => {
    const state: any = {
      apiConfigs: [
        {
          id: 'doubao-seedance-2',
          provider: 'doubao',
          modelName: 'doubao-seedance-2',
          type: 'Video',
          key: '',
          url: '',
          durations: ['5s']
        }
      ],
      groupApiUrls: { Video: 'https://www.lingjingxinghe.cn' },
      jimengSessionId: ''
    }
    const set = vi.fn((patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch
      Object.assign(state, next)
    })
    const get = () => state
    const slice: any = createProjectSlice(set, get)

    slice.initializeConfigs()

    const seedanceConfig = state.apiConfigs.find((config) => config.id === 'doubao-seedance-2')
    expect(seedanceConfig).toMatchObject({ key: '', url: '' })
  })

  it('does not revive deleted seedance configs with jimeng session id or ark url', () => {
    const state: any = {
      apiConfigs: [
        {
          id: 'seedance-2',
          provider: 'Seedance 2.0',
          modelName: '',
          type: 'Video',
          key: '',
          url: '',
          durations: null
        }
      ],
      groupApiUrls: {},
      jimengSessionId: 'jimeng-session'
    }
    const set = vi.fn((patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch
      Object.assign(state, next)
    })
    const get = () => state
    const slice: any = createProjectSlice(set, get)

    slice.initializeConfigs()

    const seedanceConfig = state.apiConfigs.find((config) => config.id === 'seedance-2')
    expect(seedanceConfig).toBeUndefined()
  })
})

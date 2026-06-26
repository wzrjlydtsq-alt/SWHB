import { describe, expect, it } from 'vitest'

import {
  sanitizeTaskForRenderer,
  sanitizeTaskPayloadForRenderer,
  summarizeTaskPayload
} from './TaskQueue.js'

describe('TaskQueue task payload safety', () => {
  const payload = {
    historyTaskId: 'hist_1',
    nodeId: 'node_1',
    projectId: 'project_1',
    type: 'video',
    modelId: 'doubao-seedance-2',
    configName: 'doubao-seedance-2',
    baseUrl: 'https://user.example.test',
    apiKey: 'secret-key',
    prompt: 'x'.repeat(1000),
    sourceImages: ['data:image/png;base64,' + 'a'.repeat(1000)],
    sourceVideos: ['file:///D:/video.mp4'],
    sourceAudios: [],
    ratio: '16:9',
    resolution: '720p'
  }

  it('summarizes task payloads without leaking secrets or media bodies', () => {
    const summary = summarizeTaskPayload(payload)

    expect(summary).toMatchObject({
      historyTaskId: 'hist_1',
      sourceImages: 1,
      sourceVideos: 1,
      hasApiKey: true,
      promptLength: 1000
    })
    expect(JSON.stringify(summary)).not.toContain('secret-key')
    expect(JSON.stringify(summary)).not.toContain('data:image')
  })

  it('keeps renderer matching fields but drops api keys and large media arrays', () => {
    const safePayload = sanitizeTaskPayloadForRenderer(payload)

    expect(safePayload).toMatchObject({
      historyTaskId: 'hist_1',
      nodeId: 'node_1',
      projectId: 'project_1',
      type: 'video',
      modelId: 'doubao-seedance-2',
      baseUrl: 'https://user.example.test'
    })
    expect(safePayload.apiKey).toBeUndefined()
    expect(safePayload.prompt).toBeUndefined()
    expect(safePayload.sourceImages).toBeUndefined()
  })

  it('sanitizes complete task updates for IPC', () => {
    const update = sanitizeTaskForRenderer({
      id: 'task_1',
      status: 'processing',
      progress: 42,
      payload,
      requestDebug: { endpoint: '/v1/videos/generations' }
    })

    expect(update.payload.historyTaskId).toBe('hist_1')
    expect(update.payload.apiKey).toBeUndefined()
    expect(update.requestDebug).toEqual({ endpoint: '/v1/videos/generations' })
  })
})

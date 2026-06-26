import { describe, expect, it } from 'vitest'
import { resolveTaskProtocol, TASK_PROTOCOLS } from './taskProtocols.js'

describe('task protocol resolution', () => {
  it('keeps image, video and chat protocols separate', () => {
    expect(resolveTaskProtocol({ type: 'image' })).toBe(TASK_PROTOCOLS.IMAGE)
    expect(resolveTaskProtocol({ type: 'video' })).toBe(TASK_PROTOCOLS.VIDEO)
    expect(resolveTaskProtocol({ type: 'chat' })).toBe(TASK_PROTOCOLS.CHAT)
  })

  it('does not guess unknown protocols from model names', () => {
    expect(resolveTaskProtocol({ modelId: 'doubao-seedance-2' })).toBe(TASK_PROTOCOLS.UNKNOWN)
  })
})

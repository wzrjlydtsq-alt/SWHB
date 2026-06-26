export const TASK_PROTOCOLS = Object.freeze({
  IMAGE: 'image',
  VIDEO: 'video',
  CHAT: 'chat',
  UNKNOWN: 'unknown'
})

export function resolveTaskProtocol(payload = {}) {
  const type = String(payload.type || '').toLowerCase()
  if (type === 'image') return TASK_PROTOCOLS.IMAGE
  if (type === 'video') return TASK_PROTOCOLS.VIDEO
  if (type === 'chat' || type === 'text') return TASK_PROTOCOLS.CHAT
  return TASK_PROTOCOLS.UNKNOWN
}

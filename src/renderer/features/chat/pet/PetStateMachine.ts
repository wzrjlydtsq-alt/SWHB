import { PET_STATES, type PetState } from './petConfig'

export function resolvePetState({
  happyUntil,
  isReplyTyping,
  isChatSending,
  hasInput,
  isDragActive
}: {
  happyUntil: number
  isReplyTyping: boolean
  isChatSending: boolean
  hasInput: boolean
  isDragActive: boolean
}): PetState {
  const now = Date.now()
  if (isDragActive) return PET_STATES.DRAGGING
  if (happyUntil > now) return PET_STATES.HAPPY
  if (isReplyTyping) return PET_STATES.TYPING
  if (isChatSending) return PET_STATES.THINKING
  if (hasInput) return PET_STATES.LISTENING
  return PET_STATES.WATCHING
}

export function getPetStateLabel(state: PetState) {
  switch (state) {
    case PET_STATES.LISTENING:
      return '正在听你说'
    case PET_STATES.THINKING:
      return '正在思考'
    case PET_STATES.TYPING:
      return '正在打字'
    case PET_STATES.HAPPY:
      return '心情很好'
    default:
      return '待机陪伴'
  }
}

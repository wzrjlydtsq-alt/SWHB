export const PET_STORAGE_KEY = 'tapnow_pet_profile'

export const PET_STATES = {
  IDLE: 'idle',
  WATCHING: 'watching',
  LISTENING: 'listening',
  THINKING: 'thinking',
  TYPING: 'typing',
  HAPPY: 'happy',
  GENERATING: 'generating',
  SUCCESS: 'success',
  ERROR: 'error',
  CLOUD_NOTICE: 'cloudNotice',
  DRAGGING: 'dragging'
} as const

export type PetState = (typeof PET_STATES)[keyof typeof PET_STATES]

export const DEFAULT_PET_PROFILE = {
  name: '星河球球',
  level: 1,
  exp: 0,
  intimacy: 12,
  mood: 72,
  streakDays: 1,
  totalInputChars: 0,
  unlockCredits: 0,
  unlockedItemIds: [
    'pet-phrolova',
    'pet-qgirl',
    'pet-tenshi',
    'pet-byte-bunny',
    'pet-nene',
    'pet-usagi',
    'pet-mochi',
    'pet-aka-shiba',
    'pet-xiaobai',
    'pet-feibi',
    'pet-baoer',
    'pet-golden-retriever'
  ],
  deletedItemIds: [],
  duplicateTokens: 0,
  equippedSkinId: 'pet-phrolova',
  equippedHatId: '',
  equippedExpressionId: '',
  equippedAccessoryIds: [],
  lastActiveAt: null
}

export const PET_EVENT_REWARDS = {
  chatSent: { exp: 2, mood: 1, intimacy: 1 },
  assistantReply: { exp: 4, mood: 2, intimacy: 1 },
  headPat: { exp: 1, mood: 5, intimacy: 3 },
  feed: { exp: 3, mood: 8, intimacy: 2 },
  dropHover: { exp: 1, mood: 2, intimacy: 1 }
}

export const PET_LEVEL_EXP = 100

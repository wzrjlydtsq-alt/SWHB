import { useCallback, useEffect, useMemo, useState } from 'react'

import { getSettingJSON, setSettingJSON } from '../../../services/dbService'
import {
  DEFAULT_PET_PROFILE,
  PET_EVENT_REWARDS,
  PET_LEVEL_EXP,
  PET_STORAGE_KEY
} from './petConfig'
import { resolvePetState } from './PetStateMachine'
import { getNextUnlockableItem, PET_UNLOCK_CHAR_STEP, PET_WARDROBE_ITEMS } from './petWardrobe'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeProfile(profile) {
  const allItemIds = PET_WARDROBE_ITEMS.map((item) => item.id)
  const equippedSkinId = allItemIds.includes(profile?.equippedSkinId)
    ? profile.equippedSkinId
    : DEFAULT_PET_PROFILE.equippedSkinId
  return {
    ...DEFAULT_PET_PROFILE,
    ...(profile || {}),
    unlockedItemIds: Array.from(
      new Set([
        ...(Array.isArray(profile?.unlockedItemIds) ? profile.unlockedItemIds : []),
        ...DEFAULT_PET_PROFILE.unlockedItemIds,
        ...allItemIds
      ])
    ),
    deletedItemIds: [],
    equippedSkinId,
    equippedHatId: '',
    equippedExpressionId: '',
    equippedAccessoryIds: Array.isArray(profile?.equippedAccessoryIds)
      ? profile.equippedAccessoryIds
      : []
  }
}

function applyReward(profile, reward) {
  const nextExp = Number(profile.exp || 0) + reward.exp
  const levelGain = Math.floor(nextExp / PET_LEVEL_EXP)
  return {
    ...profile,
    level: Number(profile.level || 1) + levelGain,
    exp: nextExp % PET_LEVEL_EXP,
    mood: clamp(Number(profile.mood || 0) + reward.mood, 0, 100),
    intimacy: clamp(Number(profile.intimacy || 0) + reward.intimacy, 0, 100),
    lastActiveAt: Date.now()
  }
}

export function usePetCompanion({ isChatSending, chatInput, isReplyTyping, isDragActive }) {
  const [profile, setProfile] = useState(() =>
    normalizeProfile(getSettingJSON(PET_STORAGE_KEY, DEFAULT_PET_PROFILE))
  )
  const [happyUntil, setHappyUntil] = useState(0)

  useEffect(() => {
    setSettingJSON(PET_STORAGE_KEY, profile)
  }, [profile])

  useEffect(() => {
    const allItemIds = PET_WARDROBE_ITEMS.map((item) => item.id)
    const unlocked = new Set(profile.unlockedItemIds || [])
    const hasMissingItem = allItemIds.some((id) => !unlocked.has(id))
    if (!hasMissingItem && (profile.deletedItemIds || []).length === 0) return

    setProfile((prev) => ({
      ...prev,
      unlockedItemIds: Array.from(new Set([...(prev.unlockedItemIds || []), ...allItemIds])),
      deletedItemIds: []
    }))
  }, [])

  const petState = useMemo(
    () =>
      resolvePetState({
        happyUntil,
        isReplyTyping,
        isChatSending,
        hasInput: Boolean(chatInput?.trim()),
        isDragActive
      }),
    [chatInput, happyUntil, isChatSending, isDragActive, isReplyTyping]
  )

  const reward = useCallback((type: keyof typeof PET_EVENT_REWARDS, happyMs = 1600) => {
    setProfile((prev) => applyReward(prev, PET_EVENT_REWARDS[type]))
    if (happyMs > 0) setHappyUntil(Date.now() + happyMs)
  }, [])

  const updateName = useCallback((name) => {
    setProfile((prev) => ({
      ...prev,
      name: String(name || '').slice(0, 12) || DEFAULT_PET_PROFILE.name
    }))
  }, [])

  const recordInputChars = useCallback((text) => {
    const count = String(text || '').trim().length
    if (count <= 0) return

    setProfile((prev) => {
      const totalInputChars = Number(prev.totalInputChars || 0) + count
      const prevMilestone = Math.floor(Number(prev.totalInputChars || 0) / PET_UNLOCK_CHAR_STEP)
      const nextMilestone = Math.floor(totalInputChars / PET_UNLOCK_CHAR_STEP)
      return {
        ...prev,
        totalInputChars,
        unlockCredits: Number(prev.unlockCredits || 0) + Math.max(0, nextMilestone - prevMilestone)
      }
    })
  }, [])

  const unlockNextItem = useCallback(() => {
    setProfile((prev) => {
      if (Number(prev.unlockCredits || 0) <= 0) return prev
      const nextItem = getNextUnlockableItem(prev)
      if (!nextItem) {
        return {
          ...prev,
          unlockCredits: Number(prev.unlockCredits || 0) - 1,
          duplicateTokens: Number(prev.duplicateTokens || 0) + 1
        }
      }
      return {
        ...prev,
        unlockCredits: Number(prev.unlockCredits || 0) - 1,
        unlockedItemIds: [...(prev.unlockedItemIds || []), nextItem.id]
      }
    })
  }, [])

  const equipItem = useCallback((item) => {
    if (!item) return
    setProfile((prev) => {
      const field =
        item.type === 'skin'
          ? 'equippedSkinId'
          : item.type === 'hat'
            ? 'equippedHatId'
            : 'equippedExpressionId'
      return { ...prev, [field]: item.id }
    })
  }, [])

  const deleteItem = useCallback((item) => {
    if (!item || item.rarity === 'starter') return
    setProfile((prev) => ({
      ...prev,
      unlockedItemIds: (prev.unlockedItemIds || []).filter((id) => id !== item.id),
      deletedItemIds: Array.from(new Set([...(prev.deletedItemIds || []), item.id])),
      duplicateTokens: Number(prev.duplicateTokens || 0) + 1,
      equippedSkinId: prev.equippedSkinId === item.id ? DEFAULT_PET_PROFILE.equippedSkinId : prev.equippedSkinId,
      equippedHatId: prev.equippedHatId === item.id ? '' : prev.equippedHatId,
      equippedExpressionId:
        prev.equippedExpressionId === item.id
          ? DEFAULT_PET_PROFILE.equippedExpressionId
          : prev.equippedExpressionId
    }))
  }, [])

  const exchangeTokens = useCallback(() => {
    setProfile((prev) => {
      if (Number(prev.duplicateTokens || 0) < 10) return prev
      return {
        ...prev,
        duplicateTokens: Number(prev.duplicateTokens || 0) - 10,
        unlockCredits: Number(prev.unlockCredits || 0) + 1
      }
    })
  }, [])

  return {
    profile,
    petState,
    actions: {
      updateName,
      recordInputChars,
      unlockNextItem,
      equipItem,
      deleteItem,
      exchangeTokens,
      recordChatSent: () => reward('chatSent', 800),
      recordAssistantReply: () => reward('assistantReply', 1200),
      patHead: () => reward('headPat', 1800),
      feed: () => reward('feed', 1800),
      cheerDrop: () => reward('dropHover', 1200)
    }
  }
}

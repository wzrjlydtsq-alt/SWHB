import { useEffect } from 'react'

import { useAppStore } from '../store/useAppStore.js'

import {
  GRID_PROMPT_TEXT,
  UPSCALE_PROMPT_TEXT,
  MOOD_BOARD_PROMPT_TEXT,
  STORYBOARD_PROMPT_TEXT,
  CHARACTER_SHEET_PROMPT_TEXT
} from '../utils/constants.js'

/**
 * usePromptLibrary Hook
 * 管理提示词库的加载、保存及默认值合并。
 */
export const usePromptLibrary = () => {
  const promptLibrary = useAppStore((state) => state.promptLibrary)
  const setPromptLibrary = useAppStore((state) => state.setPromptLibrary)
  const promptLibraryForm = useAppStore((state) => state.promptLibraryForm)
  const setPromptLibraryForm = useAppStore((state) => state.setPromptLibraryForm)
  const promptLibraryCollapsed = useAppStore((state) => state.promptLibraryCollapsed)
  const setPromptLibraryCollapsed = useAppStore((state) => state.setPromptLibraryCollapsed)
  const promptLibraryEditorOpen = useAppStore((state) => state.promptLibraryEditorOpen)
  const setPromptLibraryEditorOpen = useAppStore((state) => state.setPromptLibraryEditorOpen)

  // 确保默认项存在
  useEffect(() => {
    const defaults = [
      { id: 'grid-default', name: '九宫格分镜脚本', prompt: GRID_PROMPT_TEXT },
      { id: 'upscale-default', name: '高清放大', prompt: UPSCALE_PROMPT_TEXT },
      { id: 'moodboard-default', name: '情绪板', prompt: MOOD_BOARD_PROMPT_TEXT },
      { id: 'storyboard-default', name: '【分镜版】', prompt: STORYBOARD_PROMPT_TEXT },
      { id: 'character-sheet-default', name: '【角色板】', prompt: CHARACTER_SHEET_PROMPT_TEXT }
    ]

    const existingIds = new Set((promptLibrary || []).map((p) => p.id))
    const merged = [...(promptLibrary || [])]
    let changed = false

    defaults.forEach((def) => {
      const hasSameName = merged.some((p) => p.name === def.name)
      if (!existingIds.has(def.id) && !hasSameName) {
        merged.unshift(def)
        changed = true
      }
    })

    if (changed) {
      setPromptLibrary(merged)
    }
  }, [promptLibrary, setPromptLibrary])

  const addPromptLibraryItem = () => {
    const name = promptLibraryForm.name.trim()
    const prompt = promptLibraryForm.prompt.trim()
    if (!name || !prompt) {
      alert('请输入名称和提示词内容')
      return
    }
    setPromptLibrary((prev) => [{ id: `custom-${Date.now()}`, name, prompt }, ...prev])
    setPromptLibraryForm({ name: '', prompt: '' })
  }

  const removePromptLibraryItem = (id) => {
    setPromptLibrary((prev) => prev.filter((p) => p.id !== id))
  }

  return {
    promptLibrary,
    setPromptLibrary,
    promptLibraryForm,
    setPromptLibraryForm,
    promptLibraryCollapsed,
    setPromptLibraryCollapsed,
    promptLibraryEditorOpen,
    setPromptLibraryEditorOpen,
    addPromptLibraryItem,
    removePromptLibraryItem
  }
}

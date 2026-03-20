import { useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useAppStore } from '../store/useAppStore.js'
import { apiClient } from '../services/apiClient.js'
import { setSettingJSON } from '../services/dbService.js'

/**
 * useCharacterLibrary Hook
 * 管理角色库的加载、保存及相关 UI 状态。
 */
export const useCharacterLibrary = ({ videoApiKey, videoApiUrl, DEFAULT_BASE_URL }) => {
  const { characterLibrary, setCharacterLibrary } = useAppStore(
    useShallow((state) => ({
      characterLibrary: state.characterLibrary,
      setCharacterLibrary: state.setCharacterLibrary
    }))
  )

  const [charactersOpen, setCharactersOpen] = useState(false)
  const [createCharacterOpen, setCreateCharacterOpen] = useState(false)
  const [createCharacterVideoSourceType, setCreateCharacterVideoSourceType] = useState('url')
  const [createCharacterVideoUrl, setCreateCharacterVideoUrl] = useState('')
  const [createCharacterSelectedTaskId, setCreateCharacterSelectedTaskId] = useState('')
  const [createCharacterHistoryDropdownOpen, setCreateCharacterHistoryDropdownOpen] =
    useState(false)
  const [createCharacterStartSecond, setCreateCharacterStartSecond] = useState(1)
  const [createCharacterEndSecond, setCreateCharacterEndSecond] = useState(3)
  const [createCharacterEndpoint, setCreateCharacterEndpoint] = useState('')
  const [createCharacterSubmitting, setCreateCharacterSubmitting] = useState(false)
  const [createCharacterVideoError, setCreateCharacterVideoError] = useState(null)
  const [characterReferenceBarExpanded, setCharacterReferenceBarExpanded] = useState({})

  useEffect(() => {
    try {
      setSettingJSON('tapnow_characters', characterLibrary)
    } catch (err) {
      console.error('Failed to save character library:', err)
    }
  }, [characterLibrary])

  const createCharacter = async (
    videoUrl,
    startSecond,
    endSecond,
    fromTaskId = null,
    customEndpoint = null
  ) => {
    setCreateCharacterSubmitting(true)
    try {
      if (!videoApiKey) {
        alert('请先配置 API Key')
        setCreateCharacterSubmitting(false)
        return
      }

      if (endSecond - startSecond < 1 || endSecond - startSecond > 3) {
        alert('时间范围必须在 1-3 秒之间')
        setCreateCharacterSubmitting(false)
        return
      }

      const timestamps = `${startSecond},${endSecond}`
      let endpoint
      if (customEndpoint && customEndpoint.trim()) {
        endpoint = customEndpoint.trim()
      } else {
        const baseUrl = (videoApiUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
        endpoint = `${baseUrl}/sora/v1/characters`
      }

      const payload = fromTaskId
        ? { from_task: fromTaskId, timestamps }
        : { url: videoUrl, timestamps }

      const data = await apiClient(
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        },
        { baseUrl: '', apiKey: videoApiKey } // endpoint is full URL or relative, and we explicitly pass apiKey. Since we pass full endpoint, apiClient will use it directly.
        // Actually, apiClient expects relative endpoint and base URL option string. For now, since user can set customEndpoint, we handle it carefully.
      )

      if (data && data.id && data.username) {
        const newCharacter = {
          id: data.id,
          username: data.username,
          profile_picture_url: data.profile_picture_url || '',
          permalink: data.permalink || ''
        }
        setCharacterLibrary((prev) => [...prev, newCharacter])
        alert(`角色 "${data.username}" 创建成功！`)
        setCreateCharacterOpen(false)
        // 重置表单
        setCreateCharacterVideoSourceType('url')
        setCreateCharacterVideoUrl('')
        setCreateCharacterSelectedTaskId('')
        setCreateCharacterStartSecond(1)
        setCreateCharacterEndSecond(3)
        setCreateCharacterEndpoint('')
      } else {
        throw new Error('返回数据缺少 id 或 username')
      }
    } catch (err) {
      console.error('[Create Character] Failed:', err)
      let msg = err.message
      if (msg === 'TASK_NOT_FOUND') {
        alert(
          '创建失败：原任务已过期或无法访问\n\n请尝试获取该视频的下载链接，使用"输入视频 URL"方式重新创建。'
        )
      } else {
        alert(`创建角色失败: ${msg}`)
      }
    } finally {
      setCreateCharacterSubmitting(false)
    }
  }

  return {
    characterLibrary,
    setCharacterLibrary,
    charactersOpen,
    setCharactersOpen,
    createCharacterOpen,
    setCreateCharacterOpen,
    createCharacterVideoSourceType,
    setCreateCharacterVideoSourceType,
    createCharacterVideoUrl,
    setCreateCharacterVideoUrl,
    createCharacterSelectedTaskId,
    setCreateCharacterSelectedTaskId,
    createCharacterHistoryDropdownOpen,
    setCreateCharacterHistoryDropdownOpen,
    createCharacterStartSecond,
    setCreateCharacterStartSecond,
    createCharacterEndSecond,
    setCreateCharacterEndSecond,
    createCharacterEndpoint,
    setCreateCharacterEndpoint,
    createCharacterSubmitting,
    setCreateCharacterSubmitting,
    createCharacterVideoError,
    setCreateCharacterVideoError,
    characterReferenceBarExpanded,
    setCharacterReferenceBarExpanded,
    createCharacter
  }
}

import { useState, useRef, useMemo, useEffect, useCallback } from 'react'

import { DEFAULT_BASE_URL } from '../utils/constants.js'
import { debounce } from '../utils/fileHelpers.js'
import { apiClient } from '../services/apiClient.js'
import { useAppStore } from '../store/useAppStore.js'
import { getSetting, getSettingJSON, setSetting, setSettingJSON } from '../services/dbService.js'

/**
 * useChatManager Hook
 * 管理聊天会话、消息发送、文件上传及 UI 状态。
 */
export const useChatManager = ({ apiConfigsMap, chatApiKey }) => {
  const [chatSessions, setChatSessions] = useState(() => {
    return getSettingJSON('tapnow_chat_sessions', [
      { id: 'default', title: '新对话', messages: [] }
    ])
  })

  const [currentChatId, setCurrentChatId] = useState(() => {
    return getSetting('tapnow_current_chat_id', 'default')
  })

  const [chatInput, setChatInput] = useState('')
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [chatWidth, setChatWidth] = useState(400)
  const [chatFiles, setChatFiles] = useState([])
  const [chatModel, setChatModel] = useState('gemini-3-pro') // 默认使用 Gemini
  const [isChatSending, setIsChatSending] = useState(false)
  const [chatSessionDropdownOpen, setChatSessionDropdownOpen] = useState(false)
  const chatEndRef = useRef(null)

  // 提取到 React 函数组件顶层以符合 Hook 规则
  const chatApiUrl = useAppStore((state) => state.chatApiUrl)

  // 保存会话到 localStorage
  const debouncedSaveChatSessions = useMemo(
    () =>
      debounce((sessions) => {
        try {
          // 清洗体积过大的文件缓存避免撑爆 localStorage
          const safeSessions = sessions.map((s) => ({
            ...s,
            messages: s.messages.map((m) => ({
              ...m,
              files: m.files
                ? m.files.map((f) => ({
                    name: f.name,
                    type: f.type,
                    fileExt: f.fileExt,
                    isImage: f.isImage,
                    isVideo: f.isVideo,
                    isAudio: f.isAudio,
                    isPDF: f.isPDF,
                    isDoc: f.isDoc,
                    isExcel: f.isExcel,
                    isCode: f.isCode,
                    // 对于过大的 Base64 直接清理，放弃本地恢复文件以免崩溃
                    content: f.content && f.content.length > 50000 && !f.isCode ? null : f.content
                  }))
                : []
            }))
          }))
          setSettingJSON('tapnow_chat_sessions', safeSessions)
        } catch (err) {
          console.error(err)
        }
      }, 1000),
    []
  )

  useEffect(() => {
    debouncedSaveChatSessions(chatSessions)
  }, [chatSessions, debouncedSaveChatSessions])

  useEffect(() => {
    setSetting('tapnow_current_chat_id', currentChatId)
  }, [currentChatId])

  const currentSession = useMemo(
    () => chatSessions.find((s) => s.id === currentChatId) || chatSessions[0],
    [chatSessions, currentChatId]
  )

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (isChatOpen) {
      scrollToBottom()
    }
  }, [currentSession?.messages, isChatOpen, scrollToBottom])

  const createNewChat = useCallback(() => {
    const newId = `chat-${Date.now()}`
    const newSession = { id: newId, title: '新对话', messages: [] }
    setChatSessions((prev) => [newSession, ...prev])
    setCurrentChatId(newId)
  }, [])

  const deleteChatSession = useCallback(
    (e, id) => {
      if (e) e.stopPropagation()
      setChatSessions((prev) => {
        const newSessions = prev.filter((s) => s.id !== id)
        if (newSessions.length === 0) {
          const defaultSession = { id: 'default', title: '新对话', messages: [] }
          setCurrentChatId('default')
          return [defaultSession]
        }
        if (currentChatId === id) {
          setCurrentChatId(newSessions[0].id)
        }
        return newSessions
      })
    },
    [currentChatId]
  )

  const handleChatFileUpload = useCallback((e) => {
    const files = Array.from(e.target.files)
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = ev.target.result
        const fileExt = file.name.split('.').pop()?.toLowerCase() || ''

        const isImage = file.type.startsWith('image/')
        const isVideo = file.type.startsWith('video/')
        const isAudio = file.type.startsWith('audio/')
        const isPDF = file.type === 'application/pdf' || fileExt === 'pdf'
        const isDoc = ['doc', 'docx'].includes(fileExt) || file.type.includes('word')
        const isExcel =
          ['xls', 'xlsx'].includes(fileExt) ||
          file.type.includes('excel') ||
          file.type.includes('spreadsheet')
        const isCode = [
          'js',
          'jsx',
          'ts',
          'tsx',
          'py',
          'java',
          'cpp',
          'c',
          'html',
          'css',
          'json',
          'xml',
          'yaml',
          'yml',
          'md',
          'txt',
          'sh',
          'bash'
        ].includes(fileExt)

        setChatFiles((prev) => [
          ...prev,
          {
            name: file.name,
            type: file.type,
            content: content,
            isImage,
            isVideo,
            isAudio,
            isPDF,
            isDoc,
            isExcel,
            isCode,
            fileExt
          }
        ])
      }

      if (
        file.type.startsWith('image/') ||
        file.type.startsWith('video/') ||
        file.type.startsWith('audio/') ||
        file.type === 'application/pdf'
      ) {
        reader.readAsDataURL(file)
      } else if (
        file.name.match(
          /\.(txt|md|js|jsx|ts|tsx|py|html|css|json|csv|xml|yaml|yml|sh|bash|java|cpp|c)$/i
        )
      ) {
        reader.readAsText(file)
      } else {
        reader.readAsDataURL(file)
      }
    })
    e.target.value = ''
  }, [])

  const removeChatFile = useCallback((index) => {
    setChatFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const sendChatMessage = useCallback(async () => {
    if ((!chatInput.trim() && chatFiles.length === 0) || isChatSending) return

    const config = apiConfigsMap.get(chatModel)
    // 优先使用模型配置中的 key 和 baseUrl，回退到全局配置
    const apiKey = config?.key || chatApiKey
    const baseUrl = (config?.url || chatApiUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')

    if (!apiKey) {
      alert('请先在模型接口配置或系统设置中配置 API Key')
      return
    }

    const chatIdToUse = currentChatId || chatSessions[0]?.id
    const sessionToUse = chatSessions.find((s) => s.id === chatIdToUse) || chatSessions[0]
    const currentSessionMessages = sessionToUse?.messages || []

    setIsChatSending(true)

    const newUserMsg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: chatInput,
      files: [...chatFiles],
      timestamp: Date.now(),
      modelId: chatModel
    }

    setChatSessions((prev) =>
      prev.map((s) => {
        if (s.id === chatIdToUse) {
          return {
            ...s,
            messages: [...s.messages, newUserMsg],
            title: s.messages.length === 0 ? chatInput.slice(0, 20) : s.title
          }
        }
        return s
      })
    )
    setChatInput('')
    setChatFiles([])

    const allMessages = [...currentSessionMessages, newUserMsg]
    const MAX_HISTORY_MESSAGES = 20
    const recentMessages =
      allMessages.length > MAX_HISTORY_MESSAGES
        ? allMessages.slice(-MAX_HISTORY_MESSAGES)
        : allMessages

    let apiMessages = [
      { role: 'system', content: '你是多模态AI助手，需要结合对话上下文进行回答。' }
    ]

    recentMessages.forEach((m) => {
      // 还原用户的多模态或者文本消息
      if (m.role === 'user') {
        const userContentArr = []
        if (m.content) userContentArr.push({ type: 'text', text: m.content })
        if (m.files && m.files.length > 0) {
          m.files.forEach((f) => {
            const isGeminiLike = (config?.modelName ?? '').toLowerCase().includes('gemini')
            // 处理缓存大文件拦截回调的提示补全
            if (!f.content && !f.isCode) {
              userContentArr.push({
                type: 'text',
                text: `\n[User attached file (cleared): ${f.name}]\n`
              })
              return
            }
            if (f.isImage || (f.isVideo && isGeminiLike)) {
              userContentArr.push({ type: 'image_url', image_url: { url: f.content } })
            } else if (
              f.isCode ||
              (f.content && typeof f.content === 'string' && f.content.length < 50000)
            ) {
              userContentArr.push({
                type: 'text',
                text: `\n[File: ${f.name}]\n\`\`\`${f.fileExt || 'text'}\n${f.content}\n\`\`\`\n`
              })
            } else {
              userContentArr.push({ type: 'text', text: `\n[User attached file: ${f.name}]\n` })
            }
          })
        }
        apiMessages.push({
          role: 'user',
          content: userContentArr.length > 0 ? userContentArr : m.content
        })
      } else {
        // 返回普通的 AI 信息
        apiMessages.push({ role: m.role, content: m.content })
      }
    })

    try {
      const data = await apiClient(
        '/v1/chat/completions',
        {
          method: 'POST',
          body: JSON.stringify({
            model: config?.modelName || 'gemini-3-pro-preview',
            messages: apiMessages,
            stream: false
          })
        },
        { baseUrl, apiKey }
      )

      let aiContent =
        data.choices?.[0]?.message?.content || data.content || data.text || 'No response'

      const newAssistantMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: aiContent,
        timestamp: Date.now(),
        modelId: chatModel
      }

      setChatSessions((prev) =>
        prev.map((s) => {
          if (s.id === chatIdToUse) {
            return { ...s, messages: [...s.messages, newAssistantMsg] }
          }
          return s
        })
      )
    } catch (err) {
      console.error('Chat Error', err)
      const errorMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: `Error: ${err.message}`,
        isError: true,
        timestamp: Date.now()
      }
      setChatSessions((prev) =>
        prev.map((s) => {
          if (s.id === chatIdToUse) {
            return { ...s, messages: [...s.messages, errorMsg] }
          }
          return s
        })
      )
    } finally {
      setIsChatSending(false)
    }
  }, [
    chatInput,
    chatFiles,
    isChatSending,
    chatModel,
    apiConfigsMap,
    chatApiKey,
    currentChatId,
    chatSessions
  ])

  const handleChatResizeStart = useCallback(
    (e) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = chatWidth

      const onMouseMove = (moveEvent) => {
        const delta = startX - moveEvent.clientX
        const newWidth = Math.max(300, Math.min(800, startWidth + delta))
        setChatWidth(newWidth)
      }

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [chatWidth]
  )

  return {
    chatSessions,
    setChatSessions,
    currentChatId,
    setCurrentChatId,
    chatInput,
    setChatInput,
    isChatOpen,
    setIsChatOpen,
    chatWidth,
    setChatWidth,
    chatFiles,
    setChatFiles,
    chatModel,
    setChatModel,
    isChatSending,
    chatSessionDropdownOpen,
    setChatSessionDropdownOpen,
    chatEndRef,
    currentSession,
    createNewChat,
    deleteChatSession,
    handleChatFileUpload,
    removeChatFile,
    sendChatMessage,
    handleChatResizeStart
  }
}

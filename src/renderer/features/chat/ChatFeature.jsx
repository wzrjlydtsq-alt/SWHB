import { useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'

import { useChatManager } from '../../hooks/useChatManager.js'
import { ChatSidebar } from '../../components/ui/ChatSidebar.jsx'
import { debounce } from '../../utils/fileHelpers.js'
import { setSettingJSON } from '../../services/dbService.js'

export const ChatFeature = forwardRef(function ChatFeature(
  { theme, apiConfigs, apiConfigsMap, globalApiKey },
  ref
) {
  const chatManagerResult = useChatManager({ apiConfigsMap, chatApiKey: globalApiKey })

  const {
    chatSessions,
    setChatSessions,
    currentChatId,
    setCurrentChatId,
    chatInput,
    setChatInput,
    isChatOpen,
    setIsChatOpen,
    chatFiles,
    setChatFiles,
    chatModel,
    setChatModel,
    isChatSending,
    chatSessionDropdownOpen,
    setChatSessionDropdownOpen,
    chatEndRef,
    chatWidth,
    currentSession,
    createNewChat,
    deleteChatSession,
    handleChatFileUpload,
    removeChatFile,
    sendChatMessage,
    handleChatResizeStart
  } = chatManagerResult

  // 暴露内部方法给父组件
  useImperativeHandle(
    ref,
    () => ({
      setChatSessions,
      setChatFiles,
      setIsChatOpen,
      isChatOpen
    }),
    [setChatSessions, setChatFiles, setIsChatOpen, isChatOpen]
  )

  // 持久化聊天会话
  const debouncedSaveChatSessions = useMemo(
    () =>
      debounce((sessions) => {
        try {
          setSettingJSON('tapnow_chat_sessions', sessions)
        } catch (e) {
          console.error(e)
        }
      }, 1000),
    []
  )

  useEffect(() => {
    debouncedSaveChatSessions(chatSessions)
  }, [chatSessions, debouncedSaveChatSessions])

  return (
    <ChatSidebar
      theme={theme}
      apiConfigs={apiConfigs}
      isChatOpen={isChatOpen}
      setIsChatOpen={setIsChatOpen}
      chatWidth={chatWidth}
      handleChatResizeStart={handleChatResizeStart}
      chatModel={chatModel}
      setChatModel={setChatModel}
      createNewChat={createNewChat}
      chatSessions={chatSessions}
      chatSessionDropdownOpen={chatSessionDropdownOpen}
      setChatSessionDropdownOpen={setChatSessionDropdownOpen}
      currentChatId={currentChatId}
      setCurrentChatId={setCurrentChatId}
      deleteChatSession={deleteChatSession}
      currentSession={currentSession}
      chatFiles={chatFiles}
      removeChatFile={removeChatFile}
      handleChatFileUpload={handleChatFileUpload}
      chatInput={chatInput}
      setChatInput={setChatInput}
      sendChatMessage={sendChatMessage}
      isChatSending={isChatSending}
      chatEndRef={chatEndRef}
    />
  )
})

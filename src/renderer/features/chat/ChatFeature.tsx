import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react'

import { useChatManager } from '../../hooks/useChatManager.ts'
import { useFeishuBridge } from '../../hooks/useFeishuBridge.ts'
import { debounce } from '../../utils/fileHelpers.ts'
import { setSettingJSON } from '../../services/dbService.ts'
import { PetChatWidget } from './pet/PetChatWidget.tsx'

export const ChatFeature = forwardRef<any, any>(function ChatFeature(
  { theme, apiConfigs, apiConfigsMap, globalApiKey, globalApiUrl },
  ref
) {
  const chatManagerResult = useChatManager({
    apiConfigsMap,
    chatApiKey: globalApiKey,
    chatApiUrl: globalApiUrl
  })

  const {
    chatSessions,
    setChatSessions,
    chatInput,
    setChatInput,
    isChatOpen,
    setIsChatOpen,
    chatFiles,
    chatModel,
    setChatModel,
    isChatSending,
    chatEndRef,
    currentChatId,
    currentSession,
    createNewChat,
    deleteChatSession,
    handleChatFileUpload,
    removeChatFile,
    setCurrentChatId,
    sendChatMessage
  } = chatManagerResult

  useFeishuBridge({
    sendChatMessage: chatManagerResult.sendChatMessage,
    isChatSending: chatManagerResult.isChatSending
  })

  useImperativeHandle(
    ref,
    () => ({
      setChatSessions,
      setChatFiles: chatManagerResult.setChatFiles,
      setIsChatOpen,
      setChatInput,
      chatModel,
      setChatModel,
      sendChatMessage,
      isChatOpen
    }),
    [
      setChatSessions,
      chatManagerResult.setChatFiles,
      setIsChatOpen,
      setChatInput,
      chatModel,
      setChatModel,
      sendChatMessage,
      isChatOpen
    ]
  )

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
    <PetChatWidget
      theme={theme}
      apiConfigs={apiConfigs}
      isChatOpen={isChatOpen}
      setIsChatOpen={setIsChatOpen}
      chatModel={chatModel}
      setChatModel={setChatModel}
      chatSessions={chatSessions}
      currentChatId={currentChatId}
      setCurrentChatId={setCurrentChatId}
      deleteChatSession={deleteChatSession}
      createNewChat={createNewChat}
      currentSession={currentSession}
      chatFiles={chatFiles}
      setChatFiles={chatManagerResult.setChatFiles}
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

import { useState, useRef, useMemo, useEffect, useCallback } from 'react'

import { DEFAULT_BASE_URL } from '../utils/constants.ts'
import { resolveApiConfigRuntime } from '../utils/apiConfigResolver.ts'
import { canReadFileAsDataUrl, debounce } from '../utils/fileHelpers.ts'
import { apiClient } from '../services/apiClient.ts'
import { useAppStore } from '../store/useAppStore.ts'
import { getSetting, getSettingJSON, setSetting, setSettingJSON } from '../services/dbService.ts'
import { CANVAS_TOOLS } from '../utils/toolDefinitions.ts'
import * as canvasTools from '../utils/canvasTools.ts'

const CLEAR_CANVAS_REQUEST_RE =
  /(清空|清除|删除|移除|删掉).{0,12}(画布|全部节点|所有节点|整个画布)|clear.{0,12}canvas|delete.{0,12}all.{0,12}nodes/i

function guardDangerousToolCall(fnName, args, inputText) {
  if (fnName !== 'clear_canvas') return null
  const explicitUserRequest = CLEAR_CANVAS_REQUEST_RE.test(String(inputText || ''))
  const confirmed = args?.confirm === canvasTools.CANVAS_CLEAR_CONFIRM_TOKEN
  if (explicitUserRequest && confirmed) return null
  return {
    error:
      '已拦截 clear_canvas：清空画布是高危操作，必须由用户本轮明确要求清空画布，并传入 confirm="CLEAR_CANVAS"。'
  }
}

/**
 * useChatManager Hook
 * 管理聊天会话、消息发送、文件上传及 UI 状态。
 */
export const useChatManager = ({ apiConfigsMap, chatApiKey, chatApiUrl }) => {
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
  const [chatModel, setChatModel] = useState('gpt-5.5')
  const [isChatSending, setIsChatSending] = useState(false)
  const [chatSessionDropdownOpen, setChatSessionDropdownOpen] = useState(false)
  const chatEndRef = useRef(null)
  const sendingLockRef = useRef(false)

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
                    // 对于过大的 Base64 直接清理，放弃本地恢复文件以免崩溃。
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

  const handleChatFileUpload = useCallback((e: any) => {
    const input = e.currentTarget || e.target
    const files = Array.from(input.files || []) as File[]
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = ev.target?.result
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
        if (!canReadFileAsDataUrl(file, 'Chat attachment')) return
        reader.readAsDataURL(file)
      } else if (
        file.name.match(
          /\.(txt|md|js|jsx|ts|tsx|py|html|css|json|csv|xml|yaml|yml|sh|bash|java|cpp|c)$/i
        )
      ) {
        reader.readAsText(file)
      } else {
        if (!canReadFileAsDataUrl(file, 'Chat attachment')) return
        reader.readAsDataURL(file)
      }
    })
    input.value = ''
  }, [])

  const removeChatFile = useCallback((index) => {
    setChatFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const getRuntimeForModel = useCallback(
    (modelId) => {
      const config = apiConfigsMap.get(modelId)
      const modelName = config?.modelName || modelId || 'gpt-5.5'
      const runtime = resolveApiConfigRuntime(config, chatApiKey, chatApiUrl, DEFAULT_BASE_URL)
      return {
        modelId,
        config,
        modelName,
        label: config?.provider || config?.modelName || modelId || '未知模型',
        apiKey: runtime.apiKey,
        baseUrl: runtime.baseUrl
      }
    },
    [apiConfigsMap, chatApiKey, chatApiUrl]
  )

  const getFallbackRuntimes = useCallback(
    (currentModelId) => {
      const configs = useAppStore.getState().apiConfigs || []
      const runtimes = [getRuntimeForModel(currentModelId)]
      const seen = new Set(runtimes.map((runtime) => runtime.modelName.toLowerCase()))

      configs
        .filter((config) => config.type === 'Chat')
        .forEach((config) => {
          const runtime = getRuntimeForModel(config.id)
          const key = runtime.modelName.toLowerCase()
          if (!runtime.apiKey || seen.has(key)) return
          seen.add(key)
          runtimes.push(runtime)
        })

      return runtimes
    },
    [getRuntimeForModel]
  )

  const isModelUnavailableError = useCallback((error) => {
    const status = error?.status
    if ([0, 400, 401, 403, 404, 408, 429, 500, 502, 503, 504].includes(status)) return true

    const message = String(error?.message || error?.data?.message || '').toLowerCase()
    return /model|not found|unavailable|unauthorized|forbidden|api key|quota|rate.?limit|timeout|network/.test(
      message
    )
  }, [])

  const sendChatMessage = useCallback(
    async (
      overrideText?: string,
      options: {
        source?: string
        autoFallback?: boolean
        extraFiles?: any[]
        modelId?: string
      } = {}
    ) => {
      // 类型保护：防止 React onClick 传入 MouseEvent
      const inputText = typeof overrideText === 'string' && overrideText ? overrideText : chatInput
      const filesToSend = [
        ...chatFiles,
        ...(Array.isArray(options?.extraFiles) ? options.extraFiles : [])
      ]
      if ((!inputText.trim() && filesToSend.length === 0) || isChatSending) return
      // Ref 互斥锁：防止同一帧内重复调用（React state 更新是异步的）
      if (sendingLockRef.current) return
      sendingLockRef.current = true

      const autoFallback = options?.autoFallback === true
      const selectedModelId = options?.modelId || chatModel
      const initialRuntime = getRuntimeForModel(selectedModelId)

      if (!initialRuntime.apiKey && !autoFallback) {
        alert('请先在模型接口配置或系统设置中配置 API Key')
        sendingLockRef.current = false
        return
      }

      const chatIdToUse = currentChatId || chatSessions[0]?.id
      const sessionToUse = chatSessions.find((s) => s.id === chatIdToUse) || chatSessions[0]
      const currentSessionMessages = sessionToUse?.messages || []

      setIsChatSending(true)

      const newUserMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'user',
        content: inputText,
        files: filesToSend,
        timestamp: Date.now(),
        modelId: selectedModelId
      }

      setChatSessions((prev) =>
        prev.map((s) => {
          if (s.id === chatIdToUse) {
            return {
              ...s,
              messages: [...s.messages, newUserMsg],
              title: s.messages.length === 0 ? inputText.slice(0, 20) : s.title
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

      // ---- AI 副驾动态 System Prompt ----
      const storeState = useAppStore.getState()
      const allNodes = storeState.nodes || []
      const nodeCount = allNodes.length
      const allApiConfigs = storeState.apiConfigs || []
      const imageModels = allApiConfigs
        .filter((c) => c.type === 'Image' && c.key)
        .map((c) => `${c.modelName || c.id}`)
      const videoModels = allApiConfigs
        .filter((c) => c.type === 'Video' && c.key)
        .map((c) => `${c.modelName || c.id}`)
      const chatModels = allApiConfigs
        .filter((c) => c.type === 'Chat' && (c.key || chatApiKey))
        .map((c) => c.modelName || c.id)

      // 画布节点快照（最多展示前 10 个）
      const nodeSnippets = allNodes
        .slice(0, 10)
        .map((n, i) => {
          const p = n.settings?.prompt || n.settings?.videoPrompt || ''
          const m = n.settings?.model || ''
          const status = n.settings?.isGenerating ? '生成中' : n.settings?.error ? '失败' : '空闲'
          return `  ${i + 1}. [${n.type}] id=${n.id} | prompt="${p.slice(0, 40)}" | model=${m} | ${status}`
        })
        .join('\n')

      // 历史统计
      const hist = storeState.history || []
      const histStats = {
        total: hist.length,
        generating: hist.filter((h) => h.status === 'generating').length,
        completed: hist.filter((h) => h.status === 'completed').length,
        failed: hist.filter((h) => h.status === 'failed').length
      }

      // 选中节点
      const selectedId = storeState.selectedNodeId
      const selectedInfo = selectedId ? `当前选中节点: ${selectedId}` : '未选中任何节点'

      let systemContent = [
        '你是「星河智绘」的 AI 助手，可以通过工具操作画布、资产库、生成任务，以及用户授权的本机文件和命令。',
        '',
        '== 当前状态 ==',
        `画布节点：${nodeCount} 个${nodeCount > 10 ? '（仅显示前 10 个）' : ''}`,
        nodeCount > 0 ? nodeSnippets : '  (画布为空)',
        selectedInfo,
        `历史记录：共 ${histStats.total} 条（生成中 ${histStats.generating} / 完成 ${histStats.completed} / 失败 ${histStats.failed}）`,
        '',
        '== 可用模型 ==',
        `图片模型：${imageModels.length > 0 ? imageModels.join(', ') : '暂无，请提醒用户去设置里配置'}`,
        `视频模型：${videoModels.length > 0 ? videoModels.join(', ') : '暂无'}`,
        `Chat模型：${chatModels.length > 0 ? chatModels.join(', ') : '暂无'}`,
        '',
        '== 规则 ==',
        '1. 用中文回答，语气友好专业。',
        '2. 创建、修改、删除节点必须调用工具，不要只用文字描述 JSON。',
        '3. 用户要求生成图片/视频时，优先使用 create_and_generate 或对应节点工具。',
        '4. 用户提到本机路径时，用 read_local_file 或 list_local_directory；路径不确定时用 pick_file_dialog / pick_folder_dialog。',
        '5. 用户要求创建、修改、复制、移动、删除本机文件时，用 write_local_text_file / copy_local_path / move_local_path / delete_local_path / make_local_directory。',
        '6. 用户要求打开本机文件或文件夹时，用 open_local_path。',
        '7. 用户要求运行命令、测试项目、安装依赖、执行脚本时，用 run_local_command；长任务或开发服务用 start_terminal_session。',
        '8. 用户要求打开、检查、验证网页或本地预览时，先用 inspect_browser_url / inspect_browser_dom / capture_browser_url_screenshot 回收状态、页面结构和截图证据；涉及响应式或移动端时用 capture_browser_viewport_matrix；需要指出问题位置时用 annotate_browser_screenshot；一次性填写页面时用 fill_browser_form，默认只填不提交；需要多步页面流程、登录态复用或连续操作时，用 start_browser_session 后接 inspect_browser_session_dom / click_browser_session_element / fill_browser_session_form / capture_browser_session_screenshot，结束时 close_browser_session；如果用户要求复用真实 Chrome/Edge 登录态，先用 list_external_browser_profiles 发现本机 profile，再在用户授权后用 import_external_browser_profile_cookies 直读导入；失败时回退到用户提供 cookies JSON 的 import_browser_cookies 或工作台持久会话手动登录；只需外部打开时才用 open_browser_url。',
        '9. 用户要求审查改动、查看差异、准备代码审查时，用 get_workspace_git_summary 获取 git status 和 diff 摘要；如果用户要求把单条审查意见写回 GitHub PR，用 post_github_pr_comment；如果要求一次提交多条行内意见或完整 Review，用 submit_github_pr_review；如果是 GitLab MR，用 post_gitlab_mr_comment；失败时说明 gh/glab 登录或 PR/MR 参数问题。',
        '10. 用户询问工作台里上传的大 PDF、Excel、Word 或长文本内容时，优先用 search_workspace_documents 定向检索素材索引，不要只依赖被截断的附件摘要。',
        '11. 删除、覆盖、移动重要文件前说明风险；如果工具返回需要批准，提醒用户在工作台权限弹层处理。',
        '12. 用户说“执行xxx”时，先 list_skills 检查是否有匹配 Skill；本机命令再用 run_local_command。',
        '13. 创建 Skill 时，steps.tool 必须是已有工具名。',
        '14. 分析截图/图片文字时，不要臆造不可辨认内容；不确定就说文字不可辨认。',
        '15. 用户要求修 bug、执行“Bug 自修复”或反馈软件异常时，先区分用户工程内 bug 与软件本体 bug：用户工程内可以在授权范围内最小修复并验证；软件本体 bug 默认生成诊断报告、复现步骤、日志摘要和补丁建议，只有开发者模式且源码仓库已授权时才修改源码。'
      ].join('\n')

      // 注入当前工作模式后缀
      try {
        const { get_current_agent_suffix } = await import('../utils/canvasTools')
        const agentSuffix = get_current_agent_suffix()
        if (agentSuffix) systemContent += '\n\n== 当前角色 ==\n' + agentSuffix
      } catch {}

      const buildApiMessages = (runtime) => {
        const messages = [{ role: 'system', content: systemContent }]

        recentMessages.forEach((m) => {
          if (m.role === 'user') {
            const userContentArr = []
            if (m.content) userContentArr.push({ type: 'text', text: m.content })
            if (m.files && m.files.length > 0) {
              m.files.forEach((f) => {
                const isGeminiLike = (runtime.config?.modelName ?? '')
                  .toLowerCase()
                  .includes('gemini')
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
            messages.push({
              role: 'user',
              content: userContentArr.length > 0 ? userContentArr : m.content
            })
          } else {
            // 返回普通的 AI 信息
            messages.push({ role: m.role, content: m.content })
          }
        })

        return messages
      }

      try {
        const requestInitialResponse = async (runtime) => {
          const messages = buildApiMessages(runtime)
          const requestBody = {
            model: runtime.modelName,
            messages,
            stream: false,
            tools: CANVAS_TOOLS,
            tool_choice: 'auto'
          }

          try {
            const response = await apiClient(
              '/v1/chat/completions',
              { method: 'POST', body: JSON.stringify(requestBody) },
              { baseUrl: runtime.baseUrl, apiKey: runtime.apiKey }
            )
            return { data: response, apiMessages: messages }
          } catch (toolsErr) {
            // 降级：如果 API 不支持 function calling，去掉 tools 重试。
            if (toolsErr.status === 400 || toolsErr.status === 422) {
              console.warn(
                '[AI副驾] API 不支持 function calling，降级为纯文本模式',
                toolsErr.status,
                toolsErr.message
              )
              const fallbackBody = {
                model: runtime.modelName,
                messages,
                stream: false
              }
              const response = await apiClient(
                '/v1/chat/completions',
                { method: 'POST', body: JSON.stringify(fallbackBody) },
                { baseUrl: runtime.baseUrl, apiKey: runtime.apiKey }
              )
              return { data: response, apiMessages: messages }
            }
            throw toolsErr
          }
        }

        const candidates = autoFallback
          ? getFallbackRuntimes(selectedModelId).filter((runtime) => runtime.apiKey)
          : [initialRuntime]
        let activeRuntime = null
        let apiMessages = null
        let data = null
        let lastError = null

        for (const runtime of candidates) {
          try {
            const result = await requestInitialResponse(runtime)
            activeRuntime = runtime
            apiMessages = result.apiMessages
            data = result.data
            break
          } catch (attemptError) {
            lastError = attemptError
            console.warn('[AI副驾] 模型请求失败:', runtime.label, attemptError)
            if (!autoFallback || !isModelUnavailableError(attemptError)) throw attemptError
          }
        }

        if (!activeRuntime || !data || !apiMessages) {
          throw (
            lastError ||
            new Error(
              autoFallback
                ? '当前模型不可用，且没有找到其他已配置 API Key 的文本模型。请在模型接口配置里设置文本组默认 API Key，或给至少一个文本模型单独配置 API Key。'
                : '没有可用的文本模型'
            )
          )
        }

        const switchedModel = activeRuntime.modelId !== selectedModelId
        const fallbackNotice =
          autoFallback && switchedModel
            ? `⚠️ 当前模型「${initialRuntime.label}」不可用，已自动切换到「${activeRuntime.label}」继续处理。\n\n`
            : ''

        if (switchedModel) {
          setChatModel(activeRuntime.modelId)
        }

        let message = data.choices?.[0]?.message
        let aiContent = message?.content || data.content || data.text || ''
        const executedTools = []

        // Tool Calls 解析执行循环（最多 5 轮防无限循环）。
        let toolRound = 0
        while (message?.tool_calls && message.tool_calls.length > 0 && toolRound < 5) {
          toolRound++
          console.log(
            `[AI副驾] Tool calls 第${toolRound}轮:`,
            message.tool_calls.map((tc) => tc.function?.name)
          )

          const toolMessages = []
          for (const call of message.tool_calls) {
            const fnName = call.function?.name
            const fn = canvasTools[fnName]
            let result

            if (fn) {
              try {
                const args = JSON.parse(call.function?.arguments || '{}')
                result = guardDangerousToolCall(fnName, args, inputText)
                if (!result) result = fn(args)
                if (result && typeof result.then === 'function') {
                  result = await result
                }
                executedTools.push({ name: fnName, success: !result?.error, error: result?.error })
              } catch (execErr) {
                result = { error: '工具执行失败: ' + execErr.message }
                executedTools.push({ name: fnName, success: false, error: execErr.message })
              }
            } else {
              result = { error: '未知工具: ' + fnName }
              executedTools.push({ name: fnName, success: false, error: '未知工具' })
            }

            toolMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(result)
            })
          }

          // 把 assistant 的 tool_calls 消息和 tool 结果回传给 AI。
          const followUpMessages = [...apiMessages, message, ...toolMessages]
          const followUpBody = {
            model: activeRuntime.modelName,
            messages: followUpMessages,
            stream: false,
            tools: CANVAS_TOOLS,
            tool_choice: 'auto'
          }

          data = await apiClient(
            '/v1/chat/completions',
            { method: 'POST', body: JSON.stringify(followUpBody) },
            { baseUrl: activeRuntime.baseUrl, apiKey: activeRuntime.apiKey }
          )

          message = data.choices?.[0]?.message
          aiContent = message?.content || aiContent
        }

        if (!aiContent && executedTools.length > 0) {
          aiContent = '已执行 ' + executedTools.length + ' 个操作。'
        }
        const assistantContent = `${fallbackNotice}${aiContent || 'No response'}`

        const newAssistantMsg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant',
          content: assistantContent,
          timestamp: Date.now(),
          modelId: activeRuntime.modelId,
          toolCalls: executedTools.length > 0 ? executedTools : undefined
        }

        setChatSessions((prev) =>
          prev.map((s) => {
            if (s.id === chatIdToUse) {
              return { ...s, messages: [...s.messages, newAssistantMsg] }
            }
            return s
          })
        )

        // 返回 AI 回复内容（供飞书等外部调用获取）。
        return {
          assistantMessage: assistantContent,
          toolCalls: executedTools,
          switchedModel: switchedModel
            ? {
                from: initialRuntime.label,
                to: activeRuntime.label,
                modelId: activeRuntime.modelId
              }
            : undefined
        }
      } catch (err) {
        console.error('Chat Error', err)
        const errorContent = autoFallback
          ? `⚠️ 模型自动切换失败：${err.message}`
          : `Error: ${err.message}`
        const errorMsg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant',
          content: errorContent,
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

        // 返回错误信息（供飞书等外部调用获取）。
        return { assistantMessage: errorContent, isError: true }
      } finally {
        setIsChatSending(false)
        sendingLockRef.current = false
      }
    },
    [
      chatInput,
      chatFiles,
      isChatSending,
      chatModel,
      apiConfigsMap,
      chatApiKey,
      chatApiUrl,
      getRuntimeForModel,
      getFallbackRuntimes,
      isModelUnavailableError,
      currentChatId,
      chatSessions
    ]
  )

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

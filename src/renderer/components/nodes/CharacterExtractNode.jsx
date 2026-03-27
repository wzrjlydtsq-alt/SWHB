import { useState, useEffect } from 'react'
import { ChevronRight, Play, Users } from '../../utils/icons.jsx'
import { DEFAULT_BASE_URL } from '../../utils/constants.js'
import { apiClient } from '../../services/apiClient.js'

const DEFAULT_SYSTEM_PROMPT = `你是一名专业的剧本分析师。请从用户提供的剧本/故事内容中提取所有角色信息。

输出格式要求：
- 对每个角色使用 【角色N】（N=1,2,3...）作为标题
- 每个角色需包含：姓名、性别、年龄段、外貌特征、性格特点、角色定位、服装描述
- 外貌和服装描述要尽可能详细具体，适合用于 AI 绘图的提示词

示例输出格式：
【角色1】
姓名：张小明
性别：男
年龄段：25-30岁
外貌特征：短发、浓眉大眼、身材高大健壮
性格特点：正直勇敢、热心肠
角色定位：男主角
服装描述：深蓝色西装外套，白色衬衫，黑色领带

【角色2】
...`

export const CharacterExtractNode = ({
  node,
  apiConfigs,
  updateNodeSettings,
  globalApiKey,
  setSettingsOpen
}) => {
  const [localInput, setLocalInput] = useState(node.settings?.input || '')
  const [activeDropdown, setActiveDropdown] = useState(null)

  useEffect(() => {
    setLocalInput(node.settings?.input || '')
  }, [node.settings?.input])

  // 执行角色提取
  const handleRun = async (e) => {
    e.stopPropagation()
    if (!localInput.trim()) return

    const modelId = node.settings?.chatModel || apiConfigs.find((c) => c.type === 'Chat')?.id
    if (!modelId) {
      alert('请选择或配置 Chat 模型')
      return
    }
    const config = apiConfigs.find((c) => c.id === modelId)
    if (!config) {
      alert('未找到选中的模型配置')
      return
    }
    const apiKey = config.key || globalApiKey
    if (!apiKey) {
      alert('请配置 API Key')
      if (setSettingsOpen) setSettingsOpen(true)
      return
    }

    const systemRole = node.settings?.systemRole || DEFAULT_SYSTEM_PROMPT
    const messages = [
      { role: 'system', content: systemRole },
      { role: 'user', content: localInput }
    ]

    updateNodeSettings(node.id, { status: 'running', outputText: '⏳ 正在提取角色信息...' })

    try {
      const baseUrl = (config.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
      const responseData = await apiClient(
        '/v1/chat/completions',
        {
          method: 'POST',
          body: JSON.stringify({
            model: config.modelName || config.id || 'gpt-3.5-turbo',
            messages,
            temperature: 0.7
          })
        },
        { baseUrl, apiKey }
      )
      const resultText = responseData.choices?.[0]?.message?.content || ''
      updateNodeSettings(node.id, { status: 'completed', outputText: resultText })
    } catch (error) {
      console.error('角色提取失败:', error)
      updateNodeSettings(node.id, { status: 'error', outputText: `出错: ${error.message}` })
    }
  }

  const chatModels = apiConfigs.filter((c) => c.type === 'Chat')
  const currentModel = apiConfigs.find((c) => c.id === node.settings?.chatModel)
  const isRunning = node.settings?.status === 'running'

  return (
    <div
      className="flex flex-col h-full pointer-events-auto overflow-hidden"
      style={{
        background: 'var(--bg-secondary)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        filter: 'brightness(1.15)'
      }}
    >
      {/* 文字输入区 */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <textarea
            className="nodrag nowheel flex-1 bg-transparent text-xs outline-none resize-none custom-scrollbar text-[var(--text-primary)] placeholder-[var(--text-muted)] leading-relaxed p-3"
            placeholder="粘贴剧本或故事内容，自动提取角色信息..."
            value={localInput}
            onChange={(e) => {
              setLocalInput(e.target.value)
              updateNodeSettings(node.id, { input: e.target.value })
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {/* 输出结果区 */}
      {node.settings?.outputText && (
        <div className="shrink-0 max-h-[40%] border-t border-[var(--border-color)] overflow-y-auto custom-scrollbar">
          <div
            className="nodrag nowheel p-3 text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap select-text cursor-text"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {node.settings.outputText}
          </div>
        </div>
      )}

      {/* 底部工具栏 */}
      <div className="flex items-center gap-1.5 shrink-0 px-3 py-2 border-t border-[var(--border-color)]">
        {/* 模型选择 */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setActiveDropdown(activeDropdown === 'model' ? null : 'model')
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] active:scale-95"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="truncate max-w-[80px]">{currentModel?.provider || '选择模型'}</span>
            <ChevronRight size={10} className="text-[var(--text-muted)] rotate-90 shrink-0" />
          </button>
          {activeDropdown === 'model' && (
            <div
              className="absolute bottom-full left-0 mb-1 w-48 rounded-lg shadow-xl p-1 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)] max-h-48 overflow-y-auto custom-scrollbar"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {chatModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    updateNodeSettings(node.id, { chatModel: m.id })
                    setActiveDropdown(null)
                  }}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                >
                  <span className="text-xs font-medium truncate pr-2">{m.provider}</span>
                  {node.settings?.chatModel === m.id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary-color)] shrink-0"></div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-[9px] text-[var(--text-muted)] font-mono">
          <Users size={10} />
          <span>触发词: 角色1 角色2 ...</span>
        </div>

        {/* 执行按钮 */}
        <button
          onClick={handleRun}
          disabled={isRunning || !localInput.trim()}
          className="ml-auto flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95 bg-[var(--primary-color)] text-white hover:opacity-90 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Play size={10} fill="currentColor" />
          <span>{isRunning ? '提取中' : '提取角色'}</span>
        </button>
      </div>
    </div>
  )
}

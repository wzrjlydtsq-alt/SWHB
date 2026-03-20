import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, Play, Plus } from '../../utils/icons.jsx'
import { DEFAULT_BASE_URL } from '../../utils/constants.js'
import { apiClient } from '../../services/apiClient.js'

export const AlchemyNode = ({
  node,
  apiConfigs,
  updateNodeSettings,
  globalApiKey,
  setSettingsOpen
}) => {
  const [localInput, setLocalInput] = useState(node.settings?.input || '')
  const [activeDropdown, setActiveDropdown] = useState(null)
  const [templateName, setTemplateName] = useState('')

  useEffect(() => {
    setLocalInput(node.settings?.input || '')
  }, [node.settings?.input])

  // 模板列表（存储在节点 settings 中）
  const templates = node.settings?.templates || []

  // 保存当前文字为模板
  const saveAsTemplate = useCallback(() => {
    if (!localInput.trim()) return
    const name = templateName.trim() || `模板 ${templates.length + 1}`
    const newTemplate = {
      id: `tpl-${Date.now()}`,
      name,
      content: localInput
    }
    updateNodeSettings(node.id, {
      templates: [...templates, newTemplate]
    })
    setTemplateName('')
    setActiveDropdown(null)
  }, [localInput, templateName, templates, node.id, updateNodeSettings])

  // 应用模板
  const applyTemplate = useCallback(
    (tpl) => {
      setLocalInput(tpl.content)
      updateNodeSettings(node.id, { input: tpl.content })
      setActiveDropdown(null)
    },
    [node.id, updateNodeSettings]
  )

  // 删除模板
  const deleteTemplate = useCallback(
    (tplId, e) => {
      e.stopPropagation()
      updateNodeSettings(node.id, {
        templates: templates.filter((t) => t.id !== tplId)
      })
    },
    [node.id, templates, updateNodeSettings]
  )

  // 执行炼丹（调用 AI）
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

    // 构造消息
    const systemRole = node.settings?.systemRole || ''
    const messages = []
    if (systemRole) messages.push({ role: 'system', content: systemRole })
    messages.push({ role: 'user', content: localInput })

    // Store result directly in the node's settings (no more text-node creation)
    updateNodeSettings(node.id, { status: 'running', outputText: '⏳ 生成中...' })

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
      console.error('炼丹失败:', error)
      updateNodeSettings(node.id, { status: 'error', outputText: `出错: ${error.message}` })
    }
  }

  const chatModels = apiConfigs.filter((c) => c.type === 'Chat')
  const currentModel = apiConfigs.find((c) => c.id === node.settings?.chatModel)
  const isRunning = node.settings?.status === 'running'



  return (
    <div className="flex flex-col h-full pointer-events-auto overflow-hidden" style={{ background: 'var(--bg-secondary)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', filter: 'brightness(1.15)' }}>
      {/* ── 文字输入区（占满上部） ── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <textarea
            className="nodrag nowheel flex-1 bg-transparent text-xs outline-none resize-none custom-scrollbar text-[var(--text-primary)] placeholder-[var(--text-muted)] leading-relaxed p-3"
            placeholder="输入你的提示词，开始炼丹..."
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

      {/* ── 输出结果区 ── */}
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

      {/* ── 底部工具栏（一行三个功能） ── */}
      <div className="flex items-center gap-1.5 shrink-0 px-3 py-2 border-t border-[var(--border-color)]">
        {/* 模板选择 */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setActiveDropdown(activeDropdown === 'template' ? null : 'template')
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] active:scale-95"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="truncate max-w-[60px]">
              {templates.length > 0 ? `模板 (${templates.length})` : '模板'}
            </span>
            <ChevronRight size={10} className="text-[var(--text-muted)] rotate-90 shrink-0" />
          </button>
          {activeDropdown === 'template' && (
            <div
              className="absolute bottom-full left-0 mb-1 w-48 rounded-lg shadow-xl p-1 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)] max-h-48 overflow-y-auto custom-scrollbar"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {templates.length === 0 ? (
                <div className="px-3 py-2 text-[10px] text-[var(--text-muted)] text-center">
                  暂无模板
                </div>
              ) : (
                templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors hover:bg-[var(--bg-hover)] cursor-pointer group"
                    onClick={() => applyTemplate(tpl)}
                  >
                    <span className="text-xs font-medium truncate pr-2 text-[var(--text-primary)]">
                      {tpl.name}
                    </span>
                    <button
                      onClick={(e) => deleteTemplate(tpl.id, e)}
                      className="text-[10px] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:text-red-300"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 模板制作（保存当前文字为模板） */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setActiveDropdown(activeDropdown === 'saveTemplate' ? null : 'saveTemplate')
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] active:scale-95"
            onMouseDown={(e) => e.stopPropagation()}
            title="将当前文字保存为模板"
          >
            <Plus size={10} className="shrink-0" />
            <span>存模板</span>
          </button>
          {activeDropdown === 'saveTemplate' && (
            <div
              className="absolute bottom-full left-0 mb-1 w-48 rounded-lg shadow-xl p-2 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)] space-y-1.5"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="text-[10px] font-medium text-[var(--text-muted)]">模板名称</div>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="输入名称..."
                className="nodrag w-full bg-[var(--bg-base)] text-[10px] outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)] px-2 py-1.5 rounded border border-[var(--border-color)] focus:border-[var(--primary-color)]/50 transition-colors"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') saveAsTemplate()
                }}
              />
              <button
                onClick={saveAsTemplate}
                disabled={!localInput.trim()}
                className="w-full px-2 py-1.5 rounded text-[10px] font-medium transition-all bg-[var(--primary-color)]/15 text-[var(--primary-color)] hover:bg-[var(--primary-color)]/25 border border-[var(--primary-color)]/30 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                保存
              </button>
            </div>
          )}
        </div>

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




        {/* 执行按钮 */}
        <button
          onClick={handleRun}
          disabled={isRunning || !localInput.trim()}
          className="ml-auto flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95 bg-[var(--primary-color)] text-white hover:opacity-90 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Play size={10} fill="currentColor" />
          <span>{isRunning ? '运行中' : '炼丹'}</span>
        </button>
      </div>
    </div>
  )
}

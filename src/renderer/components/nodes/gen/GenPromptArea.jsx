import React, { useState, useRef, useEffect, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Music, X, Plus, Trash2, FileText } from '../../../utils/icons.jsx'
import { getXingheMediaSrc } from '../../../utils/fileHelpers.js'
import { getSettingJSON, setSettingJSON } from '../../../services/dbService.js'

const IMAGE_TEMPLATES_KEY = 'tapnow_prompt_templates_image'
const VIDEO_TEMPLATES_KEY = 'tapnow_prompt_templates_video'

// 旧 key 迁移
function migrateOldTemplates() {
  try {
    const old = getSettingJSON('tapnow_prompt_templates', null)
    if (old && Array.isArray(old) && old.length > 0) {
      const imgTpls = old.filter((t) => t.type === 'image')
      const vidTpls = old.filter((t) => t.type === 'video')
      if (imgTpls.length > 0) {
        const existing = getSettingJSON(IMAGE_TEMPLATES_KEY, [])
        setSettingJSON(IMAGE_TEMPLATES_KEY, [...imgTpls, ...existing])
      }
      if (vidTpls.length > 0) {
        const existing = getSettingJSON(VIDEO_TEMPLATES_KEY, [])
        setSettingJSON(VIDEO_TEMPLATES_KEY, [...vidTpls, ...existing])
      }
      setSettingJSON('tapnow_prompt_templates', [])
    }
  } catch {
    // ignore
  }
}

/**
 * GenPromptArea — 提示词输入区域 + @引用弹窗 + 模板标签芯片
 *
 * 模板以"芯片"形式显示在输入框上方，只显示模板名称（带底色）。
 * 生成时将芯片替换为模板实际内容。
 */
export const GenPromptArea = memo(function GenPromptArea({
  nodeId,
  nodeType,
  prompt,
  updateNodeSettings,
  allRefImages,
  allRefAudios,
  placeholder
}) {
  const [localPrompt, setLocalPrompt] = useState(prompt || '')
  const [showAtPopup, setShowAtPopup] = useState(false)
  const [atPopupPos, setAtPopupPos] = useState({ x: 0, y: 0 })
  const textareaRef = useRef(null)
  const atPosRef = useRef(0)

  // 模板库状态
  const [showTemplates, setShowTemplates] = useState(false)
  const [templates, setTemplates] = useState([])
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const templateBtnRef = useRef(null)

  const isImage = nodeType === 'gen-image'
  const templateKey = isImage ? IMAGE_TEMPLATES_KEY : VIDEO_TEMPLATES_KEY

  // 已应用的模板列表（存在节点 settings 中）
  const settingsKey = isImage ? 'appliedTemplates' : 'appliedVideoTemplates'

  // 从节点 settings 读取已应用模板
  const [appliedTemplates, setAppliedTemplates] = useState([])

  // 同步外部 applied templates
  useEffect(() => {
    // 从 updateNodeSettings 的反向路径读取 — 通过传入的 prompt 同步
    // 实际已应用模板存储在节点 settings 中
  }, [])

  // 加载模板
  const loadTemplates = useCallback(() => {
    migrateOldTemplates()
    const saved = getSettingJSON(templateKey, [])
    setTemplates(saved)
  }, [templateKey])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // 同步外部 prompt 变化
  useEffect(() => {
    setLocalPrompt(prompt || '')
  }, [prompt])

  // 全局点击关闭弹窗
  useEffect(() => {
    if (!showAtPopup) return
    const handleClick = () => setShowAtPopup(false)
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [showAtPopup])

  const promptKey = isImage ? 'prompt' : 'videoPrompt'

  // 插入 @图片N
  const doInsertRef = (type, idx) => {
    const ta = textareaRef.current
    if (!ta) return
    const cursorAfterAt = atPosRef.current
    const text = ta.value
    const atIdx = cursorAfterAt - 1
    if (atIdx < 0) return
    const label = type === 'image' ? `@图片${idx + 1} ` : `@音频${idx + 1} `
    const result = text.slice(0, atIdx) + label + text.slice(cursorAfterAt)
    ta.value = result
    setLocalPrompt(result)
    updateNodeSettings(nodeId, { [promptKey]: result })
    setShowAtPopup(false)
    ta.focus()
    const newCursor = atIdx + label.length
    ta.setSelectionRange(newCursor, newCursor)
  }

  const handleChange = (e) => {
    const val = e.target.value
    setLocalPrompt(val)
    updateNodeSettings(nodeId, { [promptKey]: val })
    const pos = e.target.selectionStart
    const hasRefs = allRefImages.length > 0 || allRefAudios.length > 0
    if (pos > 0 && val[pos - 1] === '@' && hasRefs) {
      atPosRef.current = pos
      const rect = e.target.getBoundingClientRect()
      setAtPopupPos({ x: rect.left + 12, y: rect.top + 28 })
      setShowAtPopup(true)
    } else {
      setShowAtPopup(false)
    }
  }

  // ===== 模板操作 =====
  const handleSaveTemplate = useCallback(() => {
    if (!templateName.trim() || !localPrompt.trim()) return
    const newTemplate = {
      id: `tpl-${Date.now()}`,
      name: templateName.trim(),
      content: localPrompt.trim(),
      type: isImage ? 'image' : 'video',
      createdAt: new Date().toISOString()
    }
    const updated = [newTemplate, ...templates]
    setTemplates(updated)
    setSettingJSON(templateKey, updated)
    setTemplateName('')
    setSavingTemplate(false)
  }, [templateName, localPrompt, templates, isImage, templateKey])

  // 应用模板 = 添加为芯片标签（不替换输入框文本）
  const handleApplyTemplate = useCallback(
    (tpl) => {
      // 检查是否已存在
      const current = appliedTemplates
      if (current.some((t) => t.id === tpl.id)) {
        setShowTemplates(false)
        return
      }
      const updated = [...current, { id: tpl.id, name: tpl.name, content: tpl.content }]
      setAppliedTemplates(updated)
      updateNodeSettings(nodeId, { [settingsKey]: updated })
      setShowTemplates(false)
    },
    [appliedTemplates, nodeId, settingsKey, updateNodeSettings]
  )

  // 移除已应用的模板芯片
  const handleRemoveApplied = useCallback(
    (tplId) => {
      const updated = appliedTemplates.filter((t) => t.id !== tplId)
      setAppliedTemplates(updated)
      updateNodeSettings(nodeId, { [settingsKey]: updated })
    },
    [appliedTemplates, nodeId, settingsKey, updateNodeSettings]
  )

  const handleDeleteTemplate = useCallback(
    (tplId) => {
      const updated = templates.filter((t) => t.id !== tplId)
      setTemplates(updated)
      setSettingJSON(templateKey, updated)
      // 同时从已应用列表中移除
      if (appliedTemplates.some((t) => t.id === tplId)) {
        handleRemoveApplied(tplId)
      }
    },
    [templates, templateKey, appliedTemplates, handleRemoveApplied]
  )

  // 从外部节点 settings 同步已应用模板
  useEffect(() => {
    // 需要通过 store 获取，但这里简化：通过初始化一次
    // 实际通过 GenNode 传入
  }, [])

  // @ 弹窗 Portal
  const atPopupPortal =
    showAtPopup &&
    (allRefImages.length > 0 || allRefAudios.length > 0) &&
    createPortal(
      <div
        style={{
          position: 'fixed',
          left: atPopupPos.x,
          top: atPopupPos.y,
          zIndex: 99999,
          minWidth: 160
        }}
        className="bg-[#2a2a2a] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] text-zinc-500 px-3 pt-2 pb-1">可能@的内容</div>
        <div className="max-h-[200px] overflow-y-auto pb-1">
          {allRefImages.map((imgSrc, idx) => (
            <div
              key={`img-${idx}`}
              className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-white/10 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                doInsertRef('image', idx)
              }}
            >
              <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 border border-zinc-700">
                <img
                  src={getXingheMediaSrc(imgSrc)}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
              <span className="text-[12px] text-zinc-200">图片{idx + 1}</span>
            </div>
          ))}
          {allRefAudios.map((_, idx) => (
            <div
              key={`aud-${idx}`}
              className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-white/10 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                doInsertRef('audio', idx)
              }}
            >
              <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 border border-zinc-700 flex items-center justify-center bg-zinc-800">
                <Music size={12} className="text-emerald-400" />
              </div>
              <span className="text-[12px] text-zinc-200">音频{idx + 1}</span>
            </div>
          ))}
        </div>
      </div>,
      document.body
    )

  // 模板面板 Portal
  const templatePanel =
    showTemplates &&
    createPortal(
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
        onClick={() => {
          setShowTemplates(false)
          setSavingTemplate(false)
        }}
      >
        <div
          style={{
            position: 'fixed',
            left: templateBtnRef.current
              ? Math.max(8, templateBtnRef.current.getBoundingClientRect().right - 280)
              : 100,
            top: templateBtnRef.current
              ? templateBtnRef.current.getBoundingClientRect().bottom + 6
              : 100,
            zIndex: 99999,
            width: 280,
            maxHeight: 380,
            background: 'var(--bg-panel)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            display: 'flex',
            flexDirection: 'column'
          }}
          className="rounded-xl shadow-2xl border border-[var(--border-color)] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-color)] shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={13} className={isImage ? 'text-emerald-400' : 'text-indigo-400'} />
              <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                {isImage ? '绘图模板库' : '视频模板库'}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">({templates.length})</span>
            </div>
            <button
              onClick={() => {
                setShowTemplates(false)
                setSavingTemplate(false)
              }}
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X size={12} />
            </button>
          </div>

          {/* 模板列表 */}
          <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
            {templates.length === 0 && !savingTemplate && (
              <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
                <FileText size={24} className="mb-2 opacity-30" />
                <span className="text-[11px]">暂无模板</span>
                <span className="text-[10px] mt-0.5 opacity-60">保存常用提示词为模板</span>
              </div>
            )}
            {templates.map((tpl) => {
              const isApplied = appliedTemplates.some((a) => a.id === tpl.id)
              return (
                <div
                  key={tpl.id}
                  className="group border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="flex items-start gap-2 px-3 py-2">
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => handleApplyTemplate(tpl)}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                          {tpl.name}
                        </span>
                        {isApplied && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/20 text-green-400">
                            已应用
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5 line-clamp-2 leading-relaxed">
                        {tpl.content}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      className="p-1 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0 mt-0.5"
                      title="删除模板"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 保存新模板区域 */}
          <div className="border-t border-[var(--border-color)] shrink-0 px-3 py-2">
            {savingTemplate ? (
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') handleSaveTemplate()
                    if (e.key === 'Escape') setSavingTemplate(false)
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  placeholder="输入模板名称..."
                  className="flex-1 text-[11px] px-2 py-1.5 rounded-lg border outline-none bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-purple-400/50"
                />
                <button
                  onClick={handleSaveTemplate}
                  disabled={!templateName.trim() || !localPrompt.trim()}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  保存
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSavingTemplate(true)}
                disabled={!localPrompt.trim()}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-medium transition-all border border-dashed border-[var(--border-color)] text-[var(--text-secondary)] hover:text-purple-400 hover:border-purple-400/50 hover:bg-purple-500/5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus size={11} />
                保存当前提示词为模板
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body
    )

  // 芯片底色
  const chipBg = isImage
    ? 'bg-emerald-500/15 border-emerald-500/30'
    : 'bg-indigo-500/15 border-indigo-500/30'
  const chipText = isImage ? 'text-emerald-300' : 'text-indigo-300'

  return (
    <>
      <div className="relative flex-1 flex flex-col min-h-0">
        {/* 模板按钮 */}
        <button
          ref={templateBtnRef}
          onClick={(e) => {
            e.stopPropagation()
            loadTemplates()
            setShowTemplates(!showTemplates)
            setSavingTemplate(false)
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className={`absolute top-1.5 right-1.5 z-10 p-1 rounded-md transition-all ${
            isImage
              ? 'text-[var(--text-muted)] hover:text-emerald-400 hover:bg-emerald-500/10'
              : 'text-[var(--text-muted)] hover:text-indigo-400 hover:bg-indigo-500/10'
          }`}
          title={isImage ? '绘图模板库' : '视频模板库'}
        >
          <FileText size={12} />
        </button>

        {/* 已应用的模板芯片 */}
        {appliedTemplates.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2 pb-1">
            {appliedTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border ${chipBg} ${chipText} group cursor-default`}
                title={`模板内容: ${tpl.content?.substring(0, 100)}...`}
              >
                <FileText size={9} className="shrink-0 opacity-70" />
                <span className="truncate max-w-[100px]">{tpl.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveApplied(tpl.id)
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors opacity-60 hover:opacity-100"
                >
                  <X size={8} />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="nodrag nowheel flex-1 bg-transparent text-xs outline-none resize-none overflow-y-auto custom-scrollbar text-[var(--text-primary)] placeholder-[var(--text-muted)] leading-relaxed p-3 pr-8"
          placeholder={placeholder || '今天我们要创作什么'}
          value={localPrompt}
          onChange={handleChange}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') setShowAtPopup(false)
          }}
          onBlur={() => setTimeout(() => setShowAtPopup(false), 200)}
        />
      </div>
      {atPopupPortal}
      {templatePanel}
    </>
  )
})

import React, { useState, useRef, useEffect, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useUpdateNodeInternals } from '@xyflow/react'
import { Music, X, Plus, Trash2, FileText, Sparkles, FileSearch } from '../../../utils/icons.tsx'
import { VideoThumbnail } from '../../ui/VideoThumbnail.tsx'
import { getPreferredMediaUrl, getXingheMediaSrc } from '../../../utils/fileHelpers.ts'
import { getSettingJSON, setSettingJSON } from '../../../services/dbService.ts'
import { loadAssetLibrary } from '../../../utils/assetLibrary.ts'
import { useAppStore } from '../../../store/useAppStore.ts'

const IMAGE_TEMPLATES_KEY = 'tapnow_prompt_templates_image'
const VIDEO_TEMPLATES_KEY = 'tapnow_prompt_templates_video'
const PROMPT_PILOT_PANEL_WIDTH = 340
const PROMPT_PILOT_PANEL_GAP = 10
const PROMPT_PILOT_PANEL_MIN_HEIGHT = 360

function tokenizePromptDiff(text) {
  return String(text || '').match(/[\u4e00-\u9fff]|[a-zA-Z0-9_]+|\s+|[^\s]/g) || []
}

function buildPromptDiffParts(original, next) {
  const a = tokenizePromptDiff(original)
  const b = tokenizePromptDiff(next)
  if (a.length === 0) return b.map((text) => ({ type: 'add', text }))
  if (b.length === 0) return a.map((text) => ({ type: 'remove', text }))
  if (a.length * b.length > 900000) {
    return [
      { type: 'remove', text: original },
      { type: 'add', text: next }
    ]
  }

  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const parts = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      parts.push({ type: 'same', text: a[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      parts.push({ type: 'remove', text: a[i] })
      i += 1
    } else {
      parts.push({ type: 'add', text: b[j] })
      j += 1
    }
  }
  while (i < a.length) {
    parts.push({ type: 'remove', text: a[i] })
    i += 1
  }
  while (j < b.length) {
    parts.push({ type: 'add', text: b[j] })
    j += 1
  }

  return parts
}

function renderPromptDiff(original, next) {
  return buildPromptDiffParts(original, next).map((part, index) => {
    if (part.type === 'add') {
      return (
        <span key={index} className="rounded bg-emerald-500/20 text-emerald-100">
          {part.text}
        </span>
      )
    }
    if (part.type === 'remove') {
      return (
        <span key={index} className="rounded bg-rose-500/20 text-rose-100 line-through">
          {part.text}
        </span>
      )
    }
    return <span key={index}>{part.text}</span>
  })
}

function flattenAssetLibrary(library) {
  if (!library || typeof library !== 'object') return []
  return Object.values(library).flatMap((cat: any) => [
    ...(cat?.items || []),
    ...(cat?.folders || []).flatMap((folder: any) => folder?.items || [])
  ])
}

function looksLikeMediaPath(value) {
  return (
    /^(https?:|file:|blob:|data:|xinghe:\/\/|[a-zA-Z]:[\\/]|\/|\\\\)/.test(value) ||
    /\.(png|jpe?g|webp|gif|bmp|svg|mp4|webm|mov|ogg)(\?.*)?$/i.test(value)
  )
}

function normalizeAssetRefId(value) {
  const raw =
    typeof value === 'object'
      ? value?.id ||
        value?.assetId ||
        value?.asset_id ||
        value?.cloudAssetId ||
        value?.seedanceId ||
        value?.providerAssetId ||
        value?.externalAssetId
      : value
  const text = String(raw || '').trim()
  if (!text) return ''
  return text.replace(/^asset:\/\//, '').replace(/^asset-/, '')
}

function getAssetPreviewSrc(item) {
  if (!item) return ''
  if (typeof item === 'string') return looksLikeMediaPath(item) ? item : ''
  return (
    item.thumbUrl ||
    item.thumbnailUrl ||
    item.thumb_url ||
    item.asset_thumb_url ||
    item.previewUrl ||
    item.preview_url ||
    getPreferredMediaUrl(item, item.downloadUrl, item.src)
  )
}

function getAtPopupPosition(anchorRect) {
  const margin = 8
  const width = 180
  const preferredHeight = 220
  const viewportWidth = window.innerWidth || 1280
  const viewportHeight = window.innerHeight || 720
  const spaceBelow = viewportHeight - anchorRect.bottom - margin
  const spaceAbove = anchorRect.top - margin
  const openBelow = spaceBelow >= 140 || spaceBelow >= spaceAbove
  const maxHeight = Math.max(
    120,
    Math.min(preferredHeight, openBelow ? spaceBelow : spaceAbove)
  )

  return {
    x: Math.min(Math.max(anchorRect.left + 12, margin), viewportWidth - width - margin),
    y: openBelow
      ? Math.min(anchorRect.bottom + margin, viewportHeight - maxHeight - margin)
      : Math.max(anchorRect.top - maxHeight - margin, margin),
    maxHeight
  }
}

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
  allRefVideos,
  placeholder
}: any) {
  const [localPrompt, setLocalPrompt] = useState(prompt || '')
  const [showAtPopup, setShowAtPopup] = useState(false)
  const [atPopupPos, setAtPopupPos] = useState({ x: 0, y: 0, maxHeight: 220 })
  const [selectedAtIdx, setSelectedAtIdx] = useState(0)
  const [promptPilotBusy, setPromptPilotBusy] = useState('')
  const [promptPilotError, setPromptPilotError] = useState('')
  const [promptPilotReport, setPromptPilotReport] = useState('')
  const [promptPilotResultMode, setPromptPilotResultMode] = useState('')
  const [promptPilotLockedEditorWidth, setPromptPilotLockedEditorWidth] = useState(null)
  const promptPilotBaseSizeRef = useRef(null)
  const promptPilotEditorRef = useRef(null)
  const promptPilotPanelRef = useRef(null)
  const updateNodeInternals = useUpdateNodeInternals()
  const textareaRef = useRef(null)
  const atListRef = useRef(null)
  const atItemRefs = useRef(new Map())
  const atPosRef = useRef(0)
  const [allAssetItems, setAllAssetItems] = useState([])

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

  useEffect(() => {
    const refreshAssets = () => {
      try {
        setAllAssetItems(flattenAssetLibrary(loadAssetLibrary()))
      } catch (err) {
        console.error('Failed to load assets for @ preview', err)
      }
    }

    refreshAssets()
    window.addEventListener('asset-library-updated', refreshAssets)
    return () => window.removeEventListener('asset-library-updated', refreshAssets)
  }, [])

  useEffect(() => {
    if (!showAtPopup) return
    setAllAssetItems(flattenAssetLibrary(loadAssetLibrary()))
  }, [showAtPopup])

  // 同步外部 prompt 变化
  useEffect(() => {
    setLocalPrompt(prompt || '')
  }, [prompt])

  useEffect(() => {
    if (!showAtPopup) return
    const itemEl = atItemRefs.current.get(selectedAtIdx)
    itemEl?.scrollIntoView({ block: 'nearest' })
  }, [selectedAtIdx, showAtPopup])

  useEffect(() => {
    if (!showAtPopup) return
    const listEl = atListRef.current
    if (!listEl) return

    const handleWheel = (e) => {
      e.stopPropagation()
    }

    listEl.addEventListener('wheel', handleWheel, { passive: false })
    return () => listEl.removeEventListener('wheel', handleWheel)
  }, [showAtPopup])

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

  const findAssetItemByRef = useCallback(
    (ref) => {
      const normalizedId = normalizeAssetRefId(ref)
      if (!normalizedId) return null

      return allAssetItems.find((item: any) => {
        const ids = [
          item?.id,
          item?.assetId,
          item?.asset_id,
          item?.cloudAssetId,
          item?.seedanceId,
          item?.providerAssetId,
          item?.externalAssetId
        ]
        return ids.some((id) => normalizeAssetRefId(id) === normalizedId)
      })
    },
    [allAssetItems]
  )

  const resolveImagePreviewSrc = useCallback(
    (imgSrc) => {
      if (!imgSrc) return ''

      if (typeof imgSrc === 'object') {
        const directSrc = getAssetPreviewSrc(imgSrc)
        if (directSrc) return directSrc
      }

      const matchedItem = findAssetItemByRef(imgSrc)
      if (matchedItem) return getAssetPreviewSrc(matchedItem)

      return typeof imgSrc === 'string' && looksLikeMediaPath(imgSrc) ? imgSrc : ''
    },
    [findAssetItemByRef]
  )

  const resolveVideoPreviewSrc = useCallback(
    (videoSrc) => {
      if (!videoSrc) return ''

      if (typeof videoSrc === 'object') {
        const directSrc = getAssetPreviewSrc(videoSrc)
        if (directSrc) return directSrc
      }

      const matchedItem = findAssetItemByRef(videoSrc)
      if (matchedItem) return getAssetPreviewSrc(matchedItem) || matchedItem.path || ''

      return typeof videoSrc === 'string' && looksLikeMediaPath(videoSrc) ? videoSrc : ''
    },
    [findAssetItemByRef]
  )

  // 原生 wheel 事件拦截：让 textarea 内可以用滚轮滚动文字
  // 必须用原生 addEventListener + passive:false，因为画布的 wheel 监听在捕获阶段
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const handleWheel = (e) => {
      if (ta.scrollHeight > ta.clientHeight + 2) e.stopPropagation()
    }
    ta.addEventListener('wheel', handleWheel, { passive: false })
    return () => ta.removeEventListener('wheel', handleWheel)
  }, [])

  // 插入 @图片N / @素材N
  const doInsertRef = (type, idx) => {
    const ta = textareaRef.current
    if (!ta) return
    const cursorAfterAt = atPosRef.current
    const text = ta.value
    const atIdx = cursorAfterAt - 1
    if (atIdx < 0) return
    let label
    if (type === 'image') {
      label = `@图片${idx + 1} `
    } else if (type === 'audio') {
      label = `@音频${idx + 1} `
    } else {
      label = `@视频${idx + 1} `
    }
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
    setPromptPilotError('')
    setPromptPilotReport('')
    setPromptPilotResultMode('')
    restorePromptPilotNodeWidth()
    const pos = e.target.selectionStart
    const hasRefs =
      allRefImages.length > 0 || allRefAudios.length > 0 || (allRefVideos || []).length > 0
    if (pos > 0 && val[pos - 1] === '@' && hasRefs) {
      atPosRef.current = pos
      const rect = e.target.getBoundingClientRect()
      setAtPopupPos(getAtPopupPosition(rect))
      setShowAtPopup(true)
      setSelectedAtIdx(0)
    } else {
      setShowAtPopup(false)
    }
  }

  const updatePromptPilotNodeWidth = useCallback(
    (nextWidth, nextHeight = null) => {
      const store = useAppStore.getState()
      store.setNodes((prev) =>
        prev.map((candidate) => {
          if (candidate.id !== nodeId) return candidate
          const width = Math.round(nextWidth)
          const height = nextHeight ? Math.round(nextHeight) : candidate.height
          return {
            ...candidate,
            width,
            height,
            dimensions: {
              ...(candidate.dimensions || {}),
              w: width,
              h: height
            }
          }
        })
      )
      requestAnimationFrame(() => updateNodeInternals(nodeId))
    },
    [nodeId, updateNodeInternals]
  )

  const expandPromptPilotNodeWidth = useCallback(() => {
    const store = useAppStore.getState()
    const currentNode = store.nodesMap?.get(nodeId) || store.nodes?.find((item) => item.id === nodeId)
    const currentWidth = Number(currentNode?.width) || 400
    const currentHeight = Number(currentNode?.height) || 300
    if (!promptPilotBaseSizeRef.current) {
      promptPilotBaseSizeRef.current = { width: currentWidth, height: currentHeight }
    }
    const editorWidth = promptPilotEditorRef.current?.getBoundingClientRect?.().width
    if (editorWidth && editorWidth > 160) {
      setPromptPilotLockedEditorWidth(Math.round(editorWidth))
    }
    const baseSize = promptPilotBaseSizeRef.current
    const nextWidth = baseSize.width + PROMPT_PILOT_PANEL_WIDTH + PROMPT_PILOT_PANEL_GAP
    const nextHeight = Math.max(baseSize.height, PROMPT_PILOT_PANEL_MIN_HEIGHT)
    if (currentWidth < nextWidth - 1 || currentHeight < nextHeight - 1) {
      updatePromptPilotNodeWidth(nextWidth, nextHeight)
    }
  }, [nodeId, updatePromptPilotNodeWidth])

  const restorePromptPilotNodeWidth = useCallback(() => {
    const baseSize = promptPilotBaseSizeRef.current
    if (!baseSize) return
    promptPilotBaseSizeRef.current = null
    setPromptPilotLockedEditorWidth(null)
    updatePromptPilotNodeWidth(baseSize.width, baseSize.height)
  }, [updatePromptPilotNodeWidth])

  useEffect(() => {
    return () => restorePromptPilotNodeWidth()
  }, [restorePromptPilotNodeWidth])

  useEffect(() => {
    if (!promptPilotBusy && !promptPilotReport) return
    const panel = promptPilotPanelRef.current
    if (!panel) return
    const handleWheel = (e) => {
      e.stopPropagation()
    }
    panel.addEventListener('wheel', handleWheel, { passive: false })
    return () => panel.removeEventListener('wheel', handleWheel)
  }, [promptPilotBusy, promptPilotReport])

  // 将所有可 @ 的项目扁平化为一个列表，方便键盘索引
  const runPromptPilot = useCallback(
    async (mode) => {
      const sourceText = String(localPrompt || '').trim()
      if (!sourceText) {
        setPromptPilotError('请先输入文本')
        return
      }

      if (mode === 'check' || mode === 'optimize') {
        expandPromptPilotNodeWidth()
      }
      setPromptPilotBusy(mode)
      setPromptPilotError('')
      setPromptPilotReport('')
      setPromptPilotResultMode('')
      try {
        const result = await window.api?.promptPilot?.run?.({
          mode,
          text: sourceText,
          context: {
            target: isImage ? 'image' : 'video',
            nodeType,
            language: 'zh-CN'
          }
        })

        if (!result?.success) {
          setPromptPilotError(result?.error || 'PromptPilot 调用失败')
          restorePromptPilotNodeWidth()
          return
        }

        if (mode === 'check' || mode === 'optimize') {
          setPromptPilotReport(result.text)
          setPromptPilotResultMode(mode)
          return
        }
      } catch (err) {
        const message = err?.message || String(err)
        setPromptPilotError(
          message.includes('No handler registered') && message.includes('promptpilot:run')
            ? 'PromptPilot 主进程通道尚未加载，请重启应用或重新启动 dev 服务后再试。'
            : message
        )
        restorePromptPilotNodeWidth()
      } finally {
        setPromptPilotBusy('')
      }
    },
    [
      expandPromptPilotNodeWidth,
      isImage,
      localPrompt,
      nodeType,
      restorePromptPilotNodeWidth,
      updateNodeSettings
    ]
  )

  const applyPromptPilotResult = useCallback(() => {
    if (!['optimize', 'check'].includes(promptPilotResultMode) || !String(promptPilotReport || '').trim()) {
      return
    }
    setLocalPrompt(promptPilotReport)
    updateNodeSettings(nodeId, { [promptKey]: promptPilotReport })
    setPromptPilotReport('')
    setPromptPilotResultMode('')
    restorePromptPilotNodeWidth()
  }, [
    nodeId,
    promptKey,
    promptPilotReport,
    promptPilotResultMode,
    restorePromptPilotNodeWidth,
    updateNodeSettings
  ])

  const atItems = React.useMemo(() => {
    const items = []
    allRefImages.forEach((_, idx) => items.push({ type: 'image', idx }))
    allRefAudios.forEach((_, idx) => items.push({ type: 'audio', idx }))
    ;(allRefVideos || []).forEach((_, idx) => items.push({ type: 'video', idx }))
    return items
  }, [allRefImages, allRefAudios, allRefVideos])

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
    (allRefImages.length > 0 || allRefAudios.length > 0 || (allRefVideos || []).length > 0) &&
    createPortal(
      <div
        style={{
          position: 'fixed',
          left: atPopupPos.x,
          top: atPopupPos.y,
          zIndex: 99999,
          minWidth: 180,
          width: 180,
          maxHeight: atPopupPos.maxHeight,
          overscrollBehavior: 'contain'
        }}
        className="bg-[#2a2a2a] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] text-zinc-500 px-3 pt-2 pb-1">可@的内容</div>
        <div
          ref={atListRef}
          className="overflow-y-auto pb-1 custom-scrollbar"
          style={{
            maxHeight: Math.max(80, atPopupPos.maxHeight - 28),
            overscrollBehavior: 'contain'
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          {atItems.map((item, flatIdx) => {
            const isSelected = flatIdx === selectedAtIdx
            const bgClass = isSelected ? 'bg-white/15' : 'hover:bg-white/10'

            if (item.type === 'image') {
              const imgSrc = allRefImages[item.idx]
              const previewSrc = resolveImagePreviewSrc(imgSrc)
              return (
                <div
                  key={`img-${item.idx}`}
                  ref={(el) => {
                    if (el) atItemRefs.current.set(flatIdx, el)
                    else atItemRefs.current.delete(flatIdx)
                  }}
                  className={`flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors ${bgClass}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    doInsertRef('image', item.idx)
                  }}
                  onMouseEnter={() => setSelectedAtIdx(flatIdx)}
                >
                  <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 border border-zinc-700 flex items-center justify-center bg-zinc-800">
                    {!previewSrc ? (
                      <span className="text-[10px] text-blue-400">🔗</span>
                    ) : (
                      <img
                        src={getXingheMediaSrc(previewSrc)}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    )}
                  </div>
                  <span className="text-[12px] text-zinc-200">
                    图片{item.idx + 1}
                  </span>
                </div>
              )
            }
            if (item.type === 'audio') {
              return (
                <div
                  key={`aud-${item.idx}`}
                  ref={(el) => {
                    if (el) atItemRefs.current.set(flatIdx, el)
                    else atItemRefs.current.delete(flatIdx)
                  }}
                  className={`flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors ${bgClass}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    doInsertRef('audio', item.idx)
                  }}
                  onMouseEnter={() => setSelectedAtIdx(flatIdx)}
                >
                  <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 border border-zinc-700 flex items-center justify-center bg-zinc-800">
                    <Music size={12} className="text-emerald-400" />
                  </div>
                  <span className="text-[12px] text-zinc-200">音频{item.idx + 1}</span>
                </div>
              )
            }
            // video
            const videoSrc = allRefVideos?.[item.idx]
            const previewSrc = resolveVideoPreviewSrc(videoSrc)
            return (
              <div
                key={`vid-${item.idx}`}
                ref={(el) => {
                  if (el) atItemRefs.current.set(flatIdx, el)
                  else atItemRefs.current.delete(flatIdx)
                }}
                className={`flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors ${bgClass}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  doInsertRef('video', item.idx)
                }}
                onMouseEnter={() => setSelectedAtIdx(flatIdx)}
              >
                <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 border border-zinc-700 flex items-center justify-center bg-zinc-800">
                  {!previewSrc ? (
                    <span className="text-[10px] text-purple-400">🎬</span>
                  ) : (
                    <VideoThumbnail
                      src={previewSrc}
                      className="w-full h-full object-cover"
                      allowCapture
                    />
                  )}
                </div>
                <span className="text-[12px] text-zinc-200">视频{item.idx + 1}</span>
              </div>
            )
          })}
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
  const promptPilotPanelMode = promptPilotBusy || promptPilotResultMode

  return (
    <>
      <div className="relative flex-1 flex min-h-0">
        <div
          ref={promptPilotEditorRef}
          className="relative flex min-w-0 flex-1 flex-col"
          style={
            promptPilotLockedEditorWidth
              ? {
                  width: promptPilotLockedEditorWidth,
                  flex: `0 0 ${promptPilotLockedEditorWidth}px`
                }
              : undefined
          }
        >
        <div className="absolute top-1.5 right-8 z-10 flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              runPromptPilot('optimize')
            }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={!!promptPilotBusy || !localPrompt.trim()}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-purple-400 hover:bg-purple-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="优化你的 Prompt"
          >
            <Sparkles size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              runPromptPilot('check')
            }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={!!promptPilotBusy || !localPrompt.trim()}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-purple-400 hover:bg-purple-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="检查 Prompt"
          >
            <FileSearch size={12} />
          </button>
        </div>
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
          className="nodrag no-auto-expand flex-1 min-h-0 bg-transparent text-[13px] outline-none resize-none overflow-y-auto custom-scrollbar text-[var(--text-primary)] placeholder:text-[var(--text-muted)] placeholder:opacity-60 leading-relaxed p-3 pr-24"
          placeholder={placeholder || '今天我们要创作什么'}
          value={localPrompt}
          onChange={handleChange}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (showAtPopup && atItems.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedAtIdx((prev) => (prev + 1) % atItems.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedAtIdx((prev) => (prev - 1 + atItems.length) % atItems.length)
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                const item = atItems[selectedAtIdx]
                if (item) doInsertRef(item.type, item.idx)
                return
              }
            }
            if (e.key === 'Escape') setShowAtPopup(false)
          }}
          onBlur={() => setTimeout(() => setShowAtPopup(false), 200)}
        />
        {promptPilotError && (
          <div
            className="mx-2 mb-2 rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed"
            style={{
              borderColor: promptPilotError ? 'rgba(248,113,113,0.35)' : 'var(--border-color)',
              color: promptPilotError ? '#fca5a5' : 'var(--text-secondary)',
              background: 'var(--bg-secondary)'
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {promptPilotError}
          </div>
        )}
        </div>
        {((promptPilotPanelMode === 'check' || promptPilotPanelMode === 'optimize') ||
          promptPilotReport) && (
          <aside
            ref={promptPilotPanelRef}
            className="nodrag nowheel m-2 ml-0 flex w-[340px] shrink-0 flex-col rounded-xl border text-[10px] leading-relaxed"
            style={{
              borderColor: 'var(--border-color)',
              color: 'var(--text-secondary)',
              background: 'var(--bg-secondary)'
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between gap-2 border-b px-2.5 py-1.5 font-medium"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              <span>{promptPilotPanelMode === 'optimize' ? 'Prompt 优化' : 'Prompt 检查'}</span>
              <div className="flex items-center gap-1">
                {['optimize', 'check'].includes(promptPilotPanelMode) &&
                  promptPilotReport &&
                  !promptPilotBusy && (
                  <button
                    type="button"
                    onClick={applyPromptPilotResult}
                    className="rounded-md border px-1.5 py-0.5 text-[10px] transition-colors hover:bg-white/10"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                    title="快捷替换为当前结果"
                  >
                    替换
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPromptPilotReport('')
                    setPromptPilotResultMode('')
                    restorePromptPilotNodeWidth()
                  }}
                  className="rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--text-primary)]"
                  title="关闭结果"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-2.5 py-2 custom-scrollbar">
              {promptPilotBusy
                ? `PromptPilot ${promptPilotBusy === 'optimize' ? '优化' : '检查'}中...`
                : ['optimize', 'check'].includes(promptPilotPanelMode)
                  ? renderPromptDiff(localPrompt, promptPilotReport)
                  : promptPilotReport}
            </div>
          </aside>
        )}
      </div>
      {atPopupPortal}
      {templatePanel}
    </>
  )
})

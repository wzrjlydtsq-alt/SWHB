import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Play, ChevronRight, Eraser, Plus, X, Music, LinkIcon } from '../../utils/icons.jsx'
import { OutputResultsPanel } from './OutputResultsPanel.jsx'
import {
  getRatiosForModel,
  VIDEO_RES_OPTIONS,
  getResolutionsForModel
} from '../../utils/constants.js'
import { getXingheMediaSrc } from '../../utils/fileHelpers.js'
import { useAppStore } from '../../store/useAppStore.js'

// 自定义比较函数：只在节点关键数据变化时重渲染
function areGenNodePropsEqual(prevProps, nextProps) {
  const pn = prevProps.node
  const nn = nextProps.node
  if (pn.id !== nn.id) return false
  if (pn.type !== nn.type) return false

  const ps = pn.settings || {}
  const ns = nn.settings || {}
  if (
    ps.progress !== ns.progress ||
    ps.isGenerating !== ns.isGenerating ||
    ps.error !== ns.error ||
    ps.model !== ns.model ||
    ps.ratio !== ns.ratio ||
    ps.resolution !== ns.resolution ||
    ps.duration !== ns.duration ||
    ps.prompt !== ns.prompt ||
    ps.videoPrompt !== ns.videoPrompt ||
    ps.imageUrl !== ns.imageUrl ||
    ps.videoStartFrameUrl !== ns.videoStartFrameUrl ||
    ps.videoEndFrameUrl !== ns.videoEndFrameUrl ||
    ps.videoRefUrls !== ns.videoRefUrls ||
    ps.generateAudio !== ns.generateAudio ||
    ps.enableWebSearch !== ns.enableWebSearch ||
    ps.manualStartFrame !== ns.manualStartFrame ||
    ps.manualEndFrame !== ns.manualEndFrame ||
    ps.veoFramesMode !== ns.veoFramesMode ||
    ps.batchSize !== ns.batchSize
  ) return false

  // 比较参考图/音频数组长度
  const pmi = ps.manualImages || []
  const nmi = ns.manualImages || []
  if (pmi.length !== nmi.length) return false
  if (pmi.length > 0 && pmi[pmi.length - 1] !== nmi[nmi.length - 1]) return false

  const pma = ps.manualAudios || []
  const nma = ns.manualAudios || []
  if (pma.length !== nma.length) return false

  const pai = ps.assetIds || []
  const nai = ns.assetIds || []
  if (pai.length !== nai.length) return false
  if (pai.length > 0 && pai[pai.length - 1] !== nai[nai.length - 1]) return false

  // 比较 outputResults 数组长度
  const pr = ps.outputResults || []
  const nr = ns.outputResults || []
  if (pr.length !== nr.length) return false
  if (pr.length > 0 && pr[pr.length - 1]?.url !== nr[nr.length - 1]?.url) return false

  // 其他关键 props
  if (prevProps.connectedImages?.length !== nextProps.connectedImages?.length) return false
  if (prevProps.activeDropdown !== nextProps.activeDropdown) return false

  return true
}

export const GenNode = React.memo(function GenNode({
  node,
  apiConfigs,
  updateNodeSettings,
  connections,
  nodesMap,
  apiConfigsMap,
  connectedImages,
  screenToWorld,
  startGeneration,
  getStatusColor,

  connectingTarget,
  connectingInputType,
  setMousePos,
  setConnectingTarget,
  setConnectingInputType,
  handleNodeMouseUp,
  getConnectedImageForInput,
  activeDropdown,
  setActiveDropdown,
  getConnectedTextNodes,
  getConnectedAudioNodes,
  setLightboxItem
}) {
  // 直接从 store 订阅首尾帧和开关状态，绕过 ReactFlow props 缓存
  const storeManualStartFrame = useAppStore((state) => state.nodesMap.get(node.id)?.settings?.manualStartFrame)
  const storeManualEndFrame = useAppStore((state) => state.nodesMap.get(node.id)?.settings?.manualEndFrame)
  const storeVeoFramesMode = useAppStore((state) => state.nodesMap.get(node.id)?.settings?.veoFramesMode)

  const [localPrompt, setLocalPrompt] = useState(
    node.type === 'gen-image' ? node.settings?.prompt || '' : node.settings?.videoPrompt || ''
  )
  const [localSourceVideos, setLocalSourceVideos] = useState(node.settings?.sourceVideosText || '')
  const [assetIdInput, setAssetIdInput] = useState(null) // null=隐藏, ''=显示空输入框

  // ========== @ 引用参考图 ==========
  const [showAtPopup, setShowAtPopup] = useState(false)
  const [atPopupPos, setAtPopupPos] = useState({ x: 0, y: 0 })
  const textareaRef = useRef(null)
  const atPosRef = useRef(0)

  const allRefImages = [...connectedImages, ...(node.settings?.manualImages || []), ...(node.settings?.assetIds || [])]
  const connectedAudios = getConnectedAudioNodes ? getConnectedAudioNodes(node.id) : []
  const allRefAudios = [...connectedAudios, ...(node.settings?.manualAudios || [])]

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

  // 插入 @图片N
  const doInsertAtRef = (idx) => {
    const ta = textareaRef.current
    if (!ta) return
    const cursorAfterAt = atPosRef.current
    const text = ta.value
    const atIdx = cursorAfterAt - 1
    if (atIdx < 0) return
    const insertion = `@图片${idx + 1} `
    const result = text.slice(0, atIdx) + insertion + text.slice(cursorAfterAt)
    ta.value = result
    setLocalPrompt(result)
    updateNodeSettings(node.id, {
      [node.type === 'gen-image' ? 'prompt' : 'videoPrompt']: result
    })
    setShowAtPopup(false)
    ta.focus()
    const newCursor = atIdx + insertion.length
    ta.setSelectionRange(newCursor, newCursor)
  }

  // 插入 @音频N
  const doInsertAtAudioRef = (idx) => {
    const ta = textareaRef.current
    if (!ta) return
    const cursorAfterAt = atPosRef.current
    const text = ta.value
    const atIdx = cursorAfterAt - 1
    if (atIdx < 0) return
    const insertion = `@音频${idx + 1} `
    const result = text.slice(0, atIdx) + insertion + text.slice(cursorAfterAt)
    ta.value = result
    setLocalPrompt(result)
    updateNodeSettings(node.id, {
      [node.type === 'gen-image' ? 'prompt' : 'videoPrompt']: result
    })
    setShowAtPopup(false)
    ta.focus()
    const newCursor = atIdx + insertion.length
    ta.setSelectionRange(newCursor, newCursor)
  }

  useEffect(() => {
    setLocalPrompt(
      node.type === 'gen-image' ? node.settings?.prompt || '' : node.settings?.videoPrompt || ''
    )
  }, [node.settings?.prompt, node.settings?.videoPrompt, node.type])

  useEffect(() => {
    setLocalSourceVideos(node.settings?.sourceVideosText || '')
  }, [node.settings?.sourceVideosText])
  // 查找当前节点对应的正在生成的历史记录
  const activeTask = useAppStore((state) =>
    state.history.find(
      (h) => h.sourceNodeId === node.id && (h.status === 'generating' || h.status === 'completed')
    )
  )
  const isGenerating = activeTask && activeTask.status === 'generating'

  // 缓存蒙版检测结果
  const hasMaskInfo = useMemo(() => {
    if (node.type !== 'gen-image') return null
    let incomingConn = connections.find(
      (c) => c.to === node.id && (!c.inputType || c.inputType === 'default')
    )
    if (!incomingConn) {
      incomingConn = connections.find((c) => c.to === node.id)
    }
    const sourceNode = incomingConn ? nodesMap.get(incomingConn.from) : null
    const hasMask = node?.maskContent || (sourceNode && sourceNode.maskContent)
    return hasMask ? { hasMask: true, hasMaskFromSource: !!(sourceNode && sourceNode.maskContent) } : null
  }, [node.type, node.id, node?.maskContent, connections, nodesMap])

  // ========== 生成处理函数（gen-image / gen-video 通用） ==========
  const handleGenerate = async (e) => {
    e.stopPropagation()
    const basePrompt =
      node.type === 'gen-image' ? node.settings?.prompt || '' : node.settings?.videoPrompt || ''
    const connectedTexts = getConnectedTextNodes(node.id)
    let rawPrompt =
      connectedTexts.length > 0
        ? connectedTexts.join(' ') + (basePrompt ? ' ' + basePrompt : '')
        : basePrompt
    // @图片N → 【图N】, @音频N → 【音N】
    const finalPrompt = rawPrompt.replace(/@图片(\d+)\s?/g, '【图$1】').replace(/@音频(\d+)\s?/g, '【音$1】')

    const manualImgs = (node.settings?.manualImages || []).map((p) => getXingheMediaSrc(p))
    let finalConnectedImages = [...connectedImages, ...manualImgs]
    let payloadSettings = { ...node.settings, batchSize: 1 }

    if (node.type === 'gen-video' && node.settings?.veoFramesMode) {
      const sf = node.settings?.manualStartFrame || getConnectedImageForInput(node.id, 'veo_start')
      const ef = node.settings?.manualEndFrame || getConnectedImageForInput(node.id, 'veo_end')
      finalConnectedImages = []
      const roles = []
      if (sf) {
        finalConnectedImages.push(sf)
        roles.push('first_frame')
      }
      if (ef) {
        finalConnectedImages.push(ef)
        roles.push(sf ? 'last_frame' : 'first_frame')
      }
      payloadSettings.imageRoles = roles.length > 0 ? roles : undefined
      payloadSettings.generationMode = 'image-first-last-frame'
    }

    if (node.type === 'gen-video') {
      payloadSettings.sourceVideos = node.settings?.sourceVideosText
        ? node.settings.sourceVideosText.split('\n').filter((u) => u.trim())
        : undefined
      const genConnectedAudios = getConnectedAudioNodes ? getConnectedAudioNodes(node.id) : []
      const manualAuds = node.settings?.manualAudios || []
      const allAudios = [...genConnectedAudios, ...manualAuds]
      payloadSettings.sourceAudios = allAudios.length > 0 ? allAudios : undefined
    }

    const batchSize = node.settings?.batchSize || 1
    for (let i = 0; i < batchSize; i++) {
      await startGeneration(
        finalPrompt,
        node.type === 'gen-image' ? 'image' : 'video',
        finalConnectedImages,
        node.id,
        payloadSettings
      )

      if (i < batchSize - 1) await new Promise((r) => setTimeout(r, 1000))
    }
  }

  // ========== AI 视频节点 - 卡片式 UI ==========
  // @ 弹窗 Portal（渲染到 document.body，脱离 ReactFlow transform）
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
                doInsertAtRef(idx)
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
          {allRefAudios.map((audioSrc, idx) => (
            <div
              key={`aud-${idx}`}
              className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-white/10 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                doInsertAtAudioRef(idx)
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

  if (node.type === 'gen-video') {
    const vModel = apiConfigsMap.get(node.settings?.model)
    const vModelId = vModel?.id || vModel?.modelName || node.settings?.model || ''
    const vIsVeo31 = vModelId.includes('veo3.1')
    const vIsSeedance =
      vModelId.toLowerCase().includes('seedance') ||
      vModelId.toLowerCase().includes('doubao') ||
      (vModel?.modelName &&
        (vModel.modelName.toLowerCase().includes('seedance') ||
          vModel.modelName.toLowerCase().includes('doubao'))) ||
      (vModel?.provider &&
        (vModel.provider.toLowerCase().includes('seedance') ||
          vModel.provider.toLowerCase().includes('doubao')))
    const vIsGrok = vModelId.includes('grok')
    const vStartFrame = storeManualStartFrame || node.settings?.manualStartFrame || getConnectedImageForInput(node.id, 'veo_start')
    const vEndFrame = storeManualEndFrame || node.settings?.manualEndFrame || getConnectedImageForInput(node.id, 'veo_end')
    const vRatio = node.settings?.ratio || '16:9'
    const vDuration = node.settings?.duration || '5s'
    const vResolution = node.settings?.resolution || (vIsSeedance ? '720p' : '1080P')
    const vRatios = getRatiosForModel(node.settings?.model)
    const vDurations = (() => {
      if (vIsSeedance) return Array.from({ length: 15 }, (_, i) => `${i + 1}s`)
      return apiConfigs.find((c) => c.id === node.settings?.model)?.durations || ['5s', '10s']
    })()

    const genVideoContent = (
      <div className="flex flex-col h-full pointer-events-auto overflow-hidden" style={{ background: 'var(--bg-secondary)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', filter: 'brightness(1.15)' }}>
        {/* ── 提示词区域（占满上部） ── */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="relative flex-1 flex flex-col min-h-0">
              <textarea
                ref={textareaRef}
                className="nodrag nowheel flex-1 bg-transparent text-xs outline-none resize-none overflow-y-auto custom-scrollbar text-[var(--text-primary)] placeholder-[var(--text-muted)] leading-relaxed p-3"
                placeholder="今天我们要创作什么"
                value={localPrompt}
                onChange={(e) => {
                  const val = e.target.value
                  setLocalPrompt(val)
                  updateNodeSettings(node.id, { videoPrompt: val })
                  const pos = e.target.selectionStart
                  if (pos > 0 && val[pos - 1] === '@' && (allRefImages.length > 0 || allRefAudios.length > 0)) {
                    atPosRef.current = pos
                    const rect = e.target.getBoundingClientRect()
                    setAtPopupPos({ x: rect.left + 12, y: rect.top + 28 })
                    setShowAtPopup(true)
                  } else {
                    setShowAtPopup(false)
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Escape') setShowAtPopup(false)
                }}
                onBlur={() => setTimeout(() => setShowAtPopup(false), 200)}
              />
            </div>

            {/* 音频引用区域 */}
            {node.type === 'gen-video' && (
              <div
                className="nodrag flex items-center gap-1.5 px-3 pb-2 border-t border-[var(--border-color)] pt-2 flex-wrap"
                onDragEnter={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const assetPath = e.dataTransfer.getData('asset-path')
                  const assetType = e.dataTransfer.getData('asset-type')
                  if (assetPath && assetType?.startsWith('audio/')) {
                    const prev = node.settings?.manualAudios || []
                    if (!prev.includes(assetPath)) {
                      updateNodeSettings(node.id, { manualAudios: [...prev, assetPath] })
                    }
                  }
                }}
              >
                <Music size={10} className="text-emerald-400 shrink-0 opacity-60" />
                {connectedAudios.map((audioSrc, idx) => (
                  <div
                    key={`ca-${idx}`}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 pointer-events-none"
                  >
                    <Music size={8} />
                    <span>音频{idx + 1}</span>
                  </div>
                ))}
                {(node.settings?.manualAudios || []).map((audioPath, idx) => (
                  <div
                    key={`ma-${idx}`}
                    className="relative flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400"
                  >
                    <Music size={8} />
                    <span className="max-w-[60px] truncate">{audioPath.split(/[\\/]/).pop()}</span>
                    <span
                      className="ml-0.5 w-3 h-3 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer hover:bg-red-500 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        const prev = node.settings?.manualAudios || []
                        updateNodeSettings(node.id, {
                          manualAudios: prev.filter((_, i) => i !== idx)
                        })
                      }}
                    >
                      <X size={6} />
                    </span>
                  </div>
                ))}
                <div
                  className="w-6 h-6 border border-dashed border-emerald-500/30 flex items-center justify-center shrink-0 rounded hover:border-emerald-500 hover:bg-emerald-500/5 transition-colors cursor-pointer pointer-events-auto"
                  onClick={async (e) => {
                    e.stopPropagation()
                    const result = await window.api.localCacheAPI.openFiles({
                      filters: [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] }],
                      multiple: true
                    })
                    if (result.success && result.paths?.length) {
                      const prev = node.settings?.manualAudios || []
                      updateNodeSettings(node.id, { manualAudios: [...prev, ...result.paths] })
                    }
                  }}
                >
                  <Plus size={10} className="text-emerald-400/50 pointer-events-none" />
                </div>
              </div>
            )}

            {/* 参考图区域 - 始终显示，整个区域可接收拖拽 */}
            <div
              className="nodrag flex items-center gap-1.5 px-3 pb-2 border-t border-[var(--border-color)] pt-2 flex-wrap"
              onDragEnter={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const folderPaths = e.dataTransfer.getData('asset-paths')
                const assetPath = e.dataTransfer.getData('asset-path')
                if (folderPaths) {
                  try {
                    const paths = JSON.parse(folderPaths)
                    const prev = node.settings?.manualImages || []
                    const newPaths = paths.filter((p) => !prev.includes(p))
                    if (newPaths.length > 0) {
                      updateNodeSettings(node.id, { manualImages: [...prev, ...newPaths] })
                    }
                  } catch { /* ignore */ }
                } else if (assetPath) {
                  const prev = node.settings?.manualImages || []
                  if (!prev.includes(assetPath)) {
                    updateNodeSettings(node.id, { manualImages: [...prev, assetPath] })
                  }
                } else if (e.dataTransfer.files?.length > 0) {
                  // 外部文件拖入
                  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
                  const prev = node.settings?.manualImages || []
                  const newPaths = []
                  for (const file of e.dataTransfer.files) {
                    if (!file.path) continue
                    const ext = file.path.split('.').pop()?.toLowerCase() || ''
                    if (imageExts.includes(ext) && !prev.includes(file.path)) {
                      newPaths.push(file.path)
                    }
                  }
                  if (newPaths.length > 0) {
                    updateNodeSettings(node.id, { manualImages: [...prev, ...newPaths] })
                  }
                }
              }}
            >
              {connectedImages.map((imgSrc, idx) => (
                <div
                  key={`c-${idx}`}
                  className="w-8 h-8 overflow-hidden border border-[var(--border-color)] shrink-0 shadow-sm pointer-events-auto cursor-pointer"
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (setLightboxItem) setLightboxItem({ type: 'image', url: getXingheMediaSrc(imgSrc) })
                  }}
                >
                  <img
                    src={getXingheMediaSrc(imgSrc)}
                    draggable={false}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
              {(node.settings?.manualImages || []).map((imgPath, idx) => (
                <div
                  key={`m-${idx}`}
                  className="relative w-8 h-8 overflow-hidden border border-[var(--border-color)] shrink-0 shadow-sm pointer-events-auto cursor-pointer"
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (setLightboxItem) setLightboxItem({ type: 'image', url: getXingheMediaSrc(imgPath) })
                  }}
                >
                  <img
                    src={getXingheMediaSrc(imgPath)}
                    draggable={false}
                    className="w-full h-full object-cover"
                  />
                  <span
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer pointer-events-auto"
                    onClick={(e) => {
                      e.stopPropagation()
                      const prev = node.settings?.manualImages || []
                      updateNodeSettings(node.id, {
                        manualImages: prev.filter((_, i) => i !== idx)
                      })
                    }}
                  >
                    <X size={8} />
                  </span>
                </div>
              ))}
              <div
                className="w-8 h-8 border border-dashed border-[var(--border-color)] flex items-center justify-center shrink-0 hover:border-[var(--primary-color)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer pointer-events-auto"
                onDragEnter={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'copy'
                }}
                onClick={async (e) => {
                  e.stopPropagation()
                  const result = await window.api.localCacheAPI.openFiles({
                    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
                    multiple: true
                  })
                  if (result.success && result.paths?.length) {
                    const prev = node.settings?.manualImages || []
                    updateNodeSettings(node.id, { manualImages: [...prev, ...result.paths] })
                  }
                }}
              >
                <Plus size={14} className="text-[var(--text-muted)] pointer-events-none" />
              </div>
              {/* Asset ID 标签 */}
              {(node.settings?.assetIds || []).map((assetId, idx) => (
                <div
                  key={`asset-${idx}`}
                  className="relative flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-[9px] text-blue-400 max-w-[100px] pointer-events-auto"
                  title={assetId}
                >
                  <LinkIcon size={8} className="shrink-0" />
                  <span className="truncate">{assetId.replace('asset-', '')}</span>
                  <span
                    className="ml-0.5 w-3 h-3 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer hover:bg-red-500 transition-colors shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      const prev = node.settings?.assetIds || []
                      updateNodeSettings(node.id, { assetIds: prev.filter((_, i) => i !== idx) })
                    }}
                  >
                    <X size={6} />
                  </span>
                </div>
              ))}
              {/* 添加 Asset ID */}
              {assetIdInput !== null ? (
                <input
                  autoFocus
                  type="text"
                  placeholder="asset-xxxxx"
                  value={assetIdInput}
                  onChange={(e) => setAssetIdInput(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      const val = assetIdInput.trim()
                      if (val) {
                        const assetId = val.startsWith('asset-') ? val : `asset-${val}`
                        const prev = node.settings?.assetIds || []
                        if (!prev.includes(assetId)) {
                          updateNodeSettings(node.id, { assetIds: [...prev, assetId] })
                        }
                      }
                      setAssetIdInput(null)
                    } else if (e.key === 'Escape') {
                      setAssetIdInput(null)
                    }
                  }}
                  onBlur={() => {
                    const val = (assetIdInput || '').trim()
                    if (val) {
                      const assetId = val.startsWith('asset-') ? val : `asset-${val}`
                      const prev = node.settings?.assetIds || []
                      if (!prev.includes(assetId)) {
                        updateNodeSettings(node.id, { assetIds: [...prev, assetId] })
                      }
                    }
                    setAssetIdInput(null)
                  }}
                  className="nodrag w-24 h-6 px-1.5 text-[9px] rounded border border-blue-500/40 bg-[var(--bg-secondary)] text-blue-400 outline-none focus:border-blue-500 pointer-events-auto"
                />
              ) : (
                <div
                  className="w-8 h-8 border border-dashed border-blue-500/30 flex items-center justify-center shrink-0 hover:border-blue-500 hover:bg-blue-500/5 transition-colors cursor-pointer pointer-events-auto"
                  title="添加素材 Asset ID"
                  onClick={(e) => {
                    e.stopPropagation()
                    setAssetIdInput('')
                  }}
                >
                  <LinkIcon size={12} className="text-blue-400/50 pointer-events-none" />
                </div>
              )}
            </div>

            {/* 首尾帧区域 */}
            {(storeVeoFramesMode ?? node.settings?.veoFramesMode) && (vIsVeo31 || vIsSeedance) && (
              <div
                className="nodrag px-3 pb-2 pt-2 border-t border-[var(--border-color)]"
                onMouseDown={(e) => e.stopPropagation()}
                onDragEnter={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'copy'
                }}
              >
                <div className="text-[9px] text-[var(--text-muted)] font-medium mb-1.5">
                  首帧 / 尾帧
                </div>
                <div className="flex gap-2">
                  {/* 首帧 */}
                  <div className="flex-1">
                    <div
                      className={`h-14 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer hover:border-[var(--primary-color)] transition-colors pointer-events-auto ${vStartFrame ? 'border-[var(--primary-color)]' : 'border-[var(--border-color)]'}`}
                      onDragEnter={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        e.dataTransfer.dropEffect = 'copy'
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const assetPath = e.dataTransfer.getData('asset-path')
                        if (assetPath) {
                          updateNodeSettings(node.id, { manualStartFrame: assetPath })
                        } else if (e.dataTransfer.files?.length > 0) {
                          const file = e.dataTransfer.files[0]
                          if (file.path) {
                            updateNodeSettings(node.id, { manualStartFrame: file.path })
                          }
                        }
                      }}
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (vStartFrame) return
                        const result = await window.api.localCacheAPI.openFiles({
                          filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
                          multiple: false
                        })
                        if (result.success && result.paths?.length) {
                          updateNodeSettings(node.id, { manualStartFrame: result.paths[0] })
                        }
                      }}
                    >
                      {vStartFrame ? (
                        <div
                          className="relative w-full h-full cursor-pointer"
                          onMouseDown={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (setLightboxItem) setLightboxItem({ type: 'image', url: getXingheMediaSrc(vStartFrame) })
                          }}
                        >
                          <img
                            src={getXingheMediaSrc(vStartFrame)}
                            draggable={false}
                            className="w-full h-full object-cover"
                          />
                          <span
                            className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer pointer-events-auto hover:bg-red-500 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation()
                              updateNodeSettings(node.id, { manualStartFrame: undefined })
                            }}
                          >
                            <X size={7} />
                          </span>
                        </div>
                      ) : (
                        <span className="text-[9px] text-[var(--text-muted)]">首帧</span>
                      )}
                    </div>
                  </div>
                  {/* 尾帧 */}
                  <div className="flex-1">
                    <div
                      className={`h-14 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer hover:border-emerald-500 transition-colors pointer-events-auto ${vEndFrame ? 'border-emerald-500' : 'border-[var(--border-color)]'}`}
                      onDragEnter={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        e.dataTransfer.dropEffect = 'copy'
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const assetPath = e.dataTransfer.getData('asset-path')
                        if (assetPath) {
                          updateNodeSettings(node.id, { manualEndFrame: assetPath })
                        } else if (e.dataTransfer.files?.length > 0) {
                          const file = e.dataTransfer.files[0]
                          if (file.path) {
                            updateNodeSettings(node.id, { manualEndFrame: file.path })
                          }
                        }
                      }}
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (vEndFrame) return
                        const result = await window.api.localCacheAPI.openFiles({
                          filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
                          multiple: false
                        })
                        if (result.success && result.paths?.length) {
                          updateNodeSettings(node.id, { manualEndFrame: result.paths[0] })
                        }
                      }}
                    >
                      {vEndFrame ? (
                        <div
                          className="relative w-full h-full cursor-pointer"
                          onMouseDown={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (setLightboxItem) setLightboxItem({ type: 'image', url: getXingheMediaSrc(vEndFrame) })
                          }}
                        >
                          <img
                            src={getXingheMediaSrc(vEndFrame)}
                            draggable={false}
                            className="w-full h-full object-cover"
                          />
                          <span
                            className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer pointer-events-auto hover:bg-red-500 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation()
                              updateNodeSettings(node.id, { manualEndFrame: undefined })
                            }}
                          >
                            <X size={7} />
                          </span>
                        </div>
                      ) : (
                        <span className="text-[9px] text-[var(--text-muted)]">尾帧</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Seedance 参考视频 URL */}
            {vIsSeedance && (
              <div className="px-3 pb-2">
                <input
                  type="text"
                  placeholder="参考视频 URL（换行分隔）"
                  className="nodrag w-full bg-[var(--bg-panel)] text-[10px] font-mono outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)] px-2 py-1.5 rounded border border-[var(--border-color)] focus:border-[var(--primary-color)]/50 transition-colors"
                  value={localSourceVideos}
                  onChange={(e) => {
                    setLocalSourceVideos(e.target.value)
                    updateNodeSettings(node.id, { sourceVideosText: e.target.value })
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>

          {/* ── 底部工具栏 ── */}
          <div className="flex items-center gap-1.5 flex-wrap shrink-0 px-3 py-2 border-t border-[var(--border-color)]">
            {/* 首尾帧开关 */}
            {(vIsVeo31 || vIsSeedance) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  updateNodeSettings(node.id, { veoFramesMode: !node.settings?.veoFramesMode })
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all active:scale-95 ${
                  node.settings?.veoFramesMode
                    ? 'bg-[var(--primary-color)]/15 border-[var(--primary-color)]/50 text-[var(--primary-color)]'
                    : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                onMouseDown={(e) => e.stopPropagation()}
              >
                首尾帧
              </button>
            )}

            {/* 模型选择器 */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveDropdown(
                    activeDropdown?.type === 'model' ? null : { nodeId: node.id, type: 'model' }
                  )
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] active:scale-95"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(node.settings?.model)}`}
                ></span>
                <span className="truncate max-w-[80px]">{vModel?.provider || '选择模型'}</span>
                <ChevronRight size={10} className="text-[var(--text-muted)] rotate-90 shrink-0" />
              </button>
              {activeDropdown?.nodeId === node.id && activeDropdown.type === 'model' && (
                <div
                  className="absolute bottom-full left-0 mb-1 w-48 rounded-lg shadow-xl p-1 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)]"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {apiConfigs
                    .filter((m) => m.type === 'Video')
                    .map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          const next = { model: m.id }
                          if (m.id === 'grok-3') {
                            next.ratio = '3:2'
                            next.duration = '8s'
                            next.resolution = '1080P'
                          }
                          updateNodeSettings(node.id, next)
                          setActiveDropdown(null)
                        }}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                      >
                        <span className="text-xs font-medium truncate pr-2">{m.provider}</span>
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(m.id)}`}
                        ></div>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* 比例 · 时长设置 */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveDropdown(
                    activeDropdown?.type === 'videoSettings' && activeDropdown.nodeId === node.id
                      ? null
                      : { nodeId: node.id, type: 'videoSettings' }
                  )
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium border transition-all bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] active:scale-95"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {vRatio} · {vDuration}
                <ChevronRight size={10} className="text-[var(--text-muted)] rotate-90 shrink-0" />
              </button>
              {activeDropdown?.nodeId === node.id && activeDropdown.type === 'videoSettings' && (
                <div
                  className="absolute bottom-full left-0 mb-1 w-56 rounded-xl shadow-2xl p-3 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)] space-y-3"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {/* 比例 */}
                  <div>
                    <div className="text-[10px] font-medium text-[var(--text-muted)] mb-1.5">
                      比例
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {vRatios.map((r) => (
                        <button
                          key={r}
                          onClick={() => updateNodeSettings(node.id, { ratio: r })}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${
                            vRatio === r
                              ? 'bg-[var(--primary-color)]/15 border-[var(--primary-color)] text-[var(--primary-color)]'
                              : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 时长 */}
                  <div>
                    <div className="text-[10px] font-medium text-[var(--text-muted)] mb-1.5">
                      时长
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {vDurations.map((d) => (
                        <button
                          key={d}
                          onClick={() => updateNodeSettings(node.id, { duration: d })}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${
                            vDuration === d
                              ? 'bg-[var(--primary-color)]/15 border-[var(--primary-color)] text-[var(--primary-color)]'
                              : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 分辨率 */}
                  {(vIsGrok || vIsSeedance) && (
                    <div>
                      <div className="text-[10px] font-medium text-[var(--text-muted)] mb-1.5">
                        分辨率
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(vIsSeedance ? ['720p', '480p'] : VIDEO_RES_OPTIONS).map((r) => (
                          <button
                            key={r}
                            onClick={() => updateNodeSettings(node.id, { resolution: r })}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${
                              vResolution === r
                                ? 'bg-[var(--primary-color)]/15 border-[var(--primary-color)] text-[var(--primary-color)]'
                                : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* HD */}
                  {node.settings?.model === 'sora-2' && (
                    <label
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={node.settings?.isHD || false}
                        onChange={(e) => {
                          e.stopPropagation()
                          updateNodeSettings(node.id, { isHD: e.target.checked })
                        }}
                        className="w-3 h-3 cursor-pointer accent-[var(--primary-color)]"
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      <span className="text-[10px] text-[var(--text-secondary)]">HD 高清</span>
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* 生成按钮 */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="ml-auto flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95 bg-[var(--primary-color)] text-white hover:opacity-90 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <span>⚡</span>
              <span>生成</span>
            </button>
          </div>
        </div>

        {/* 生成结果缩略图 */}
        <OutputResultsPanel
          results={node.settings?.outputResults}
          nodeId={node.id}
          updateNodeSettings={updateNodeSettings}
          setLightboxItem={setLightboxItem}
          startGeneration={startGeneration}
        />
      </div>
    )
    return (
      <>
        {genVideoContent}
        {atPopupPortal}
      </>
    )
  }

  const genImageContent = (
    <div className="flex flex-col h-full pointer-events-auto overflow-hidden" style={{ background: 'var(--bg-secondary)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', filter: 'brightness(1.15)' }}>
      {/* ── 提示词区域（占满上部） ── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* 蒙版状态提示 */}
          {hasMaskInfo && (
            <div className="flex items-center gap-2 mx-3 mt-2 px-2.5 py-1.5 rounded text-[10px] font-medium bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20 shadow-sm">
              <Eraser size={12} className="shrink-0" />
              <span>{hasMaskInfo.hasMaskFromSource ? '已链接蒙版区域' : '已设置蒙版区域'}</span>
            </div>
          )}
          <div className="relative flex-1 flex flex-col min-h-0">
            <textarea
              ref={textareaRef}
              className="nodrag nowheel flex-1 bg-transparent text-xs outline-none resize-none custom-scrollbar text-[var(--text-primary)] placeholder-[var(--text-muted)] leading-relaxed p-3"
              placeholder="输入提示词..."
              value={localPrompt}
              onChange={(e) => {
                const val = e.target.value
                setLocalPrompt(val)
                updateNodeSettings(node.id, { prompt: val })
                const pos = e.target.selectionStart
                if (pos > 0 && val[pos - 1] === '@' && allRefImages.length > 0) {
                  atPosRef.current = pos
                  const rect = e.target.getBoundingClientRect()
                  setAtPopupPos({ x: rect.left + 12, y: rect.top + 28 })
                  setShowAtPopup(true)
                } else {
                  setShowAtPopup(false)
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') setShowAtPopup(false)
              }}
              onBlur={() => setTimeout(() => setShowAtPopup(false), 200)}
            />
          </div>

          {/* 参考图区域 - 始终显示，整个区域可接收拖拽 */}
          <div
            className="nodrag flex items-center gap-1.5 px-3 pb-2 border-t border-[var(--border-color)] pt-2 flex-wrap"
            onDragEnter={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const folderPaths = e.dataTransfer.getData('asset-paths')
              const assetPath = e.dataTransfer.getData('asset-path')
              if (folderPaths) {
                try {
                  const paths = JSON.parse(folderPaths)
                  const prev = node.settings?.manualImages || []
                  const newPaths = paths.filter((p) => !prev.includes(p))
                  if (newPaths.length > 0) {
                    updateNodeSettings(node.id, { manualImages: [...prev, ...newPaths] })
                  }
                } catch { /* ignore */ }
              } else if (assetPath) {
                const prev = node.settings?.manualImages || []
                if (!prev.includes(assetPath)) {
                  updateNodeSettings(node.id, { manualImages: [...prev, assetPath] })
                }
              } else if (e.dataTransfer.files?.length > 0) {
                // 外部文件拖入
                const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
                const prev = node.settings?.manualImages || []
                const newPaths = []
                for (const file of e.dataTransfer.files) {
                  if (!file.path) continue
                  const ext = file.path.split('.').pop()?.toLowerCase() || ''
                  if (imageExts.includes(ext) && !prev.includes(file.path)) {
                    newPaths.push(file.path)
                  }
                }
                if (newPaths.length > 0) {
                  updateNodeSettings(node.id, { manualImages: [...prev, ...newPaths] })
                }
              }
            }}
          >
            {connectedImages.map((imgSrc, idx) => (
              <div
                key={`c-${idx}`}
                className="w-8 h-8 overflow-hidden border border-[var(--border-color)] shrink-0 shadow-sm relative pointer-events-auto cursor-pointer"
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (setLightboxItem) setLightboxItem({ type: 'image', url: getXingheMediaSrc(imgSrc) })
                }}
              >
                <span
                  className="absolute -top-1 -left-1 w-3.5 h-3.5 text-[8px] font-semibold rounded-full bg-[var(--bg-secondary)] text-[var(--text-primary)] select-none flex items-center justify-center border border-[var(--border-color)] shadow-sm leading-none pointer-events-none"
                  style={{ zIndex: 30 }}
                >
                  {idx + 1}
                </span>
                <img
                  src={getXingheMediaSrc(imgSrc)}
                  draggable={false}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {(node.settings?.manualImages || []).map((imgPath, idx) => (
              <div
                key={`m-${idx}`}
                className="relative w-8 h-8 overflow-hidden border border-[var(--border-color)] shrink-0 shadow-sm pointer-events-auto cursor-pointer"
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (setLightboxItem) setLightboxItem({ type: 'image', url: getXingheMediaSrc(imgPath) })
                }}
              >
                <img
                  src={getXingheMediaSrc(imgPath)}
                  draggable={false}
                  className="w-full h-full object-cover"
                />
                <span
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer pointer-events-auto"
                  onClick={(e) => {
                    e.stopPropagation()
                    const prev = node.settings?.manualImages || []
                    updateNodeSettings(node.id, { manualImages: prev.filter((_, i) => i !== idx) })
                  }}
                >
                  <X size={8} />
                </span>
              </div>
            ))}
            <div
              className="w-8 h-8 border border-dashed border-[var(--border-color)] flex items-center justify-center shrink-0 hover:border-[var(--primary-color)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer pointer-events-auto"
              onDragEnter={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onClick={async (e) => {
                e.stopPropagation()
                const result = await window.api.localCacheAPI.openFiles({
                  filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
                  multiple: true
                })
                if (result.success && result.paths?.length) {
                  const prev = node.settings?.manualImages || []
                  updateNodeSettings(node.id, { manualImages: [...prev, ...result.paths] })
                }
              }}
            >
              <Plus size={14} className="text-[var(--text-muted)] pointer-events-none" />
            </div>
            {/* Asset ID 标签 */}
            {(node.settings?.assetIds || []).map((assetId, idx) => (
              <div
                key={`asset-${idx}`}
                className="relative flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-[9px] text-blue-400 max-w-[100px] pointer-events-auto"
                title={assetId}
              >
                <LinkIcon size={8} className="shrink-0" />
                <span className="truncate">{assetId.replace('asset-', '')}</span>
                <span
                  className="ml-0.5 w-3 h-3 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer hover:bg-red-500 transition-colors shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    const prev = node.settings?.assetIds || []
                    updateNodeSettings(node.id, { assetIds: prev.filter((_, i) => i !== idx) })
                  }}
                >
                  <X size={6} />
                </span>
              </div>
            ))}
            {/* 添加 Asset ID */}
            {assetIdInput !== null ? (
              <input
                autoFocus
                type="text"
                placeholder="asset-xxxxx"
                value={assetIdInput}
                onChange={(e) => setAssetIdInput(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    const val = assetIdInput.trim()
                    if (val) {
                      const assetId = val.startsWith('asset-') ? val : `asset-${val}`
                      const prev = node.settings?.assetIds || []
                      if (!prev.includes(assetId)) {
                        updateNodeSettings(node.id, { assetIds: [...prev, assetId] })
                      }
                    }
                    setAssetIdInput(null)
                  } else if (e.key === 'Escape') {
                    setAssetIdInput(null)
                  }
                }}
                onBlur={() => {
                  const val = (assetIdInput || '').trim()
                  if (val) {
                    const assetId = val.startsWith('asset-') ? val : `asset-${val}`
                    const prev = node.settings?.assetIds || []
                    if (!prev.includes(assetId)) {
                      updateNodeSettings(node.id, { assetIds: [...prev, assetId] })
                    }
                  }
                  setAssetIdInput(null)
                }}
                className="nodrag w-24 h-6 px-1.5 text-[9px] rounded border border-blue-500/40 bg-[var(--bg-secondary)] text-blue-400 outline-none focus:border-blue-500 pointer-events-auto"
              />
            ) : (
              <div
                className="w-8 h-8 border border-dashed border-blue-500/30 flex items-center justify-center shrink-0 hover:border-blue-500 hover:bg-blue-500/5 transition-colors cursor-pointer pointer-events-auto"
                title="添加素材 Asset ID"
                onClick={(e) => {
                  e.stopPropagation()
                  setAssetIdInput('')
                }}
              >
                <LinkIcon size={12} className="text-blue-400/50 pointer-events-none" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 底部工具栏 ── */}
      <div className="flex items-center justify-between shrink-0 relative gap-2 px-3 py-2 border-t border-[var(--border-color)]">
        <div className="relative flex-1 min-w-0">
          <button
            title={apiConfigsMap.get(node.settings?.model)?.provider}
            onClick={(e) => {
              e.stopPropagation()
              setActiveDropdown(
                activeDropdown?.type === 'model' ? null : { nodeId: node.id, type: 'model' }
              )
            }}
            className="flex items-center justify-between pl-1.5 pr-2 py-1 rounded text-[10px] font-medium transition-colors border w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-color)] active:scale-95 shadow-sm"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(node.settings?.model)}`}
              ></span>
              <span className="truncate">
                {apiConfigsMap.get(node.settings?.model)?.provider || 'Model'}
              </span>
            </div>
            <ChevronRight size={10} className="text-[var(--text-muted)] rotate-90 shrink-0 ml-1" />
          </button>
          {activeDropdown?.nodeId === node.id && activeDropdown.type === 'model' && (
            <div
              className="absolute bottom-full left-0 mb-1 w-48 rounded shadow-xl p-1 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {apiConfigs
                .filter(
                  (m) =>
                    m.type === (node.type === 'gen-image' ? 'Image' : 'Video')
                )
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      const nextSettings = { model: m.id }
                      if (m.id === 'grok-3') {
                        nextSettings.ratio = '3:2'
                        nextSettings.duration = '8s'
                        nextSettings.resolution = '1080P'
                      }
                      updateNodeSettings(node.id, nextSettings)
                      setActiveDropdown(null)
                    }}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                  >
                    <span className="text-xs font-medium truncate pr-2">{m.provider}</span>
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(m.id)}`}
                    ></div>
                  </button>
                ))}
            </div>
          )}
        </div>


        <div className="flex gap-1 shrink-0">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setActiveDropdown(
                  activeDropdown?.type === 'ratio' && activeDropdown.nodeId === node.id
                    ? null
                    : { nodeId: node.id, type: 'ratio' }
                )
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border transition-colors bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-color)] active:scale-95 shadow-sm"
            >
              {node.settings?.ratio || 'Auto'}
              <ChevronRight size={10} className="text-[var(--text-muted)] rotate-90 shrink-0" />
            </button>
            {activeDropdown?.nodeId === node.id && activeDropdown.type === 'ratio' && (
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-20 rounded shadow-xl p-1 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)]"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {getRatiosForModel(node.settings?.model).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      updateNodeSettings(node.id, { ratio: r })
                      setActiveDropdown(null)
                    }}
                    className="w-full text-center py-1 text-[10px] rounded text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {node.type === 'gen-video' &&
            (() => {
              const currentModel = apiConfigsMap.get(node.settings?.model)
              const modelId =
                currentModel?.id || currentModel?.modelName || node.settings?.model || ''
              const isGrok = modelId.includes('grok')
              const isSeedance =
                modelId.toLowerCase().includes('seedance') ||
                modelId.toLowerCase().includes('doubao') ||
                (currentModel?.modelName &&
                  (currentModel.modelName.toLowerCase().includes('seedance') ||
                    currentModel.modelName.toLowerCase().includes('doubao'))) ||
                (currentModel?.provider &&
                  (currentModel.provider.toLowerCase().includes('seedance') ||
                    currentModel.provider.toLowerCase().includes('doubao')))
              return isGrok || isSeedance ? (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveDropdown(
                        activeDropdown?.type === 'vres' && activeDropdown.nodeId === node.id
                          ? null
                          : { nodeId: node.id, type: 'vres' }
                      )
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border transition-colors bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-color)] active:scale-95 shadow-sm"
                  >
                    {node.settings?.resolution || (isSeedance ? '720p' : '1080P')}
                    <ChevronRight
                      size={10}
                      className="text-[var(--text-muted)] rotate-90 shrink-0"
                    />
                  </button>
                  {activeDropdown?.nodeId === node.id && activeDropdown.type === 'vres' && (
                    <div
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-24 rounded shadow-xl p-1 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)]"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {(isSeedance ? ['720p', '480p'] : VIDEO_RES_OPTIONS).map((r) => (
                        <button
                          key={r}
                          onClick={() => {
                            updateNodeSettings(node.id, { resolution: r })
                            setActiveDropdown(null)
                          }}
                          className="w-full text-center py-1 text-[10px] rounded text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null
            })()}

          {node.type === 'gen-image' &&
          (() => {
            const currentModel = apiConfigsMap.get(node.settings?.model)
            const isMidjourney =
              currentModel &&
              (currentModel.id.includes('mj') ||
                currentModel.provider.toLowerCase().includes('midjourney'))
            return !isMidjourney
          })() ? (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveDropdown(
                    activeDropdown?.type === 'res' && activeDropdown.nodeId === node.id
                      ? null
                      : { nodeId: node.id, type: 'res' }
                  )
                }}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border transition-colors bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-color)] active:scale-95 shadow-sm"
              >
                {(() => {
                  const currentModel = apiConfigsMap.get(node.settings?.model)
                  const modelId = currentModel?.id || currentModel?.modelName || ''
                  const availableResolutions = getResolutionsForModel(modelId)
                  const currentResolution = node.settings?.resolution || 'Auto'
                  // 如果当前分辨率不在可用选项中，使用第一个可用选项作为显示值
                  const displayResolution = availableResolutions.includes(currentResolution)
                    ? currentResolution
                    : availableResolutions[0] || 'Auto'
                  // 如果当前分辨率不在可用选项中，自动更新
                  if (
                    !availableResolutions.includes(currentResolution) &&
                    availableResolutions.length > 0
                  ) {
                    setTimeout(() => {
                      updateNodeSettings(node.id, { resolution: availableResolutions[0] })
                    }, 0)
                  }
                  return displayResolution
                })()}
                <ChevronRight size={10} className="text-[var(--text-muted)] rotate-90 shrink-0" />
              </button>
              {activeDropdown?.nodeId === node.id &&
                activeDropdown.type === 'res' &&
                (() => {
                  const currentModel = apiConfigsMap.get(node.settings?.model)
                  const modelId = currentModel?.id || currentModel?.modelName || ''
                  const availableResolutions = getResolutionsForModel(modelId)
                  return (
                    <div
                      className="absolute bottom-full right-0 mb-1 w-24 rounded shadow-xl p-1 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)]"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {availableResolutions.map((r) => (
                        <button
                          key={r}
                          onClick={() => {
                            updateNodeSettings(node.id, { resolution: r })
                            setActiveDropdown(null)
                          }}
                          className="w-full text-center py-1 text-[10px] rounded text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )
                })()}
            </div>
          ) : (
            (() => {
              const currentModel = apiConfigsMap.get(node.settings?.model)
              const isMidjourney =
                currentModel &&
                (currentModel.id.includes('mj') ||
                  currentModel.provider.toLowerCase().includes('midjourney'))
              return !isMidjourney ? (
                <>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveDropdown(
                          activeDropdown?.type === 'duration' && activeDropdown.nodeId === node.id
                            ? null
                            : { nodeId: node.id, type: 'duration' }
                        )
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono font-medium transition-colors border bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-color)] active:scale-95 shadow-sm outline-none"
                    >
                      {node.settings?.duration || '5s'}
                      <ChevronRight
                        size={10}
                        className="text-[var(--text-muted)] rotate-90 shrink-0"
                      />
                    </button>
                    {activeDropdown?.nodeId === node.id && activeDropdown.type === 'duration' && (
                      <div
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-20 rounded shadow-xl p-1 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)]"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          const isSeedanceOrDoubao =
                            node.settings?.model?.toLowerCase().includes('seedance') ||
                            node.settings?.model?.toLowerCase().includes('doubao') ||
                            apiConfigsMap
                              .get(node.settings?.model)
                              ?.modelName?.toLowerCase()
                              .includes('seedance') ||
                            apiConfigsMap
                              .get(node.settings?.model)
                              ?.modelName?.toLowerCase()
                              .includes('doubao') ||
                            apiConfigsMap
                              .get(node.settings?.model)
                              ?.provider?.toLowerCase()
                              .includes('seedance') ||
                            apiConfigsMap
                              .get(node.settings?.model)
                              ?.provider?.toLowerCase()
                              .includes('doubao')

                          if (isSeedanceOrDoubao) {
                            return Array.from({ length: 15 }, (_, i) => `${i + 1}s`)
                          }
                          return (
                            apiConfigs.find((c) => c.id === node.settings?.model)?.durations || [
                              '5s',
                              '10s'
                            ]
                          )
                        })().map((d) => (
                          <button
                            key={d}
                            onClick={() => {
                              updateNodeSettings(node.id, { duration: d })
                              setActiveDropdown(null)
                            }}
                            className="w-full text-center py-1 text-[10px] rounded text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {node.type === 'gen-video' && node.settings?.model === 'sora-2' && (
                    <label
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border cursor-pointer transition-colors shadow-sm active:scale-95 ${
                        node.settings?.isHD
                          ? 'bg-[var(--primary-color)]/20 border-[var(--primary-color)] text-[var(--primary-color)]'
                          : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={node.settings?.isHD || false}
                        onChange={(e) => {
                          e.stopPropagation()
                          updateNodeSettings(node.id, { isHD: e.target.checked })
                        }}
                        className="w-3 h-3 cursor-pointer accent-[var(--primary-color)]"
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      <span>HD</span>
                    </label>
                  )}
                  {node.type === 'gen-video' &&
                    (() => {
                      const currentModel = apiConfigsMap.get(node.settings?.model)
                      const modelId =
                        currentModel?.id || currentModel?.modelName || node.settings?.model || ''
                      const isVeo31 = modelId.includes('veo3.1')
                      const isSeedance = modelId.includes('seedance')
                      if (!(isVeo31 || isSeedance)) return null
                      return (
                        <label
                          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border cursor-pointer transition-colors shadow-sm active:scale-95 ${
                            node.settings?.veoFramesMode
                              ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                              : 'bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={node.settings?.veoFramesMode || false}
                            onChange={(e) => {
                              e.stopPropagation()
                              updateNodeSettings(node.id, { veoFramesMode: e.target.checked })
                            }}
                            className="w-3 h-3 cursor-pointer accent-emerald-500"
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                          <span>首尾帧</span>
                        </label>
                      )
                    })()}
                </>
              ) : null
            })()
          )}
        </div>
        {/* Batch Size Selector */}
        <div className="flex items-center mr-2">
          <span className="text-[10px] mr-1.5 font-medium text-[var(--text-secondary)]">
            Batch:
          </span>
          <select
            value={node.settings?.batchSize || 1}
            onChange={(e) => updateNodeSettings(node.id, { batchSize: parseInt(e.target.value) })}
            onClick={(e) => e.stopPropagation()}
            className="w-10 px-0.5 py-0.5 rounded text-[10px] font-mono border outline-none transition-colors text-center cursor-pointer bg-[var(--bg-panel)] border-[var(--border-color)] hover:border-[var(--primary-color)]/50 text-[var(--text-primary)] shadow-sm"
            title="批量生成数量"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>


        <button
          onClick={async (e) => {
            e.stopPropagation()
            const basePrompt =
              node.type === 'gen-image'
                ? node.settings?.prompt || ''
                : node.settings?.videoPrompt || ''
            const connectedTexts = getConnectedTextNodes(node.id)
            let rawPrompt =
              connectedTexts.length > 0
                ? connectedTexts.join(' ') + (basePrompt ? ' ' + basePrompt : '')
                : basePrompt
            // @图片N → 【图N】
            const finalPrompt = rawPrompt.replace(/@图片(\d+)\s?/g, '【图$1】')

            // Get connected images + manual images
            const manualImgs = (node.settings?.manualImages || []).map((p) => getXingheMediaSrc(p))
            let finalConnectedImages = [...connectedImages, ...manualImgs]
            let payloadSettings = { ...node.settings, batchSize: 1 }

            if (node.type === 'gen-video' && node.settings?.veoFramesMode) {
              const startFrame = getConnectedImageForInput(node.id, 'veo_start')
              const endFrame = getConnectedImageForInput(node.id, 'veo_end')
              finalConnectedImages = []
              const roles = []
              if (startFrame) {
                finalConnectedImages.push(startFrame)
                roles.push('first_frame')
              }
              if (endFrame) {
                finalConnectedImages.push(endFrame)
                roles.push(startFrame ? 'last_frame' : 'first_frame') // 如果只有这一个，那就算首帧，如果有首帧，这就叫尾帧
              }
              payloadSettings.imageRoles = roles.length > 0 ? roles : undefined
              payloadSettings.generationMode = 'image-first-last-frame'
            }

            // Extract audio and video text values
            if (node.type === 'gen-video') {
              payloadSettings.sourceVideos = node.settings?.sourceVideosText
                ? node.settings.sourceVideosText.split('\n').filter((u) => u.trim())
                : undefined

              // Append explicitly connected audios
              const connectedAudios = getConnectedAudioNodes ? getConnectedAudioNodes(node.id) : []
              if (connectedAudios.length > 0) {
                payloadSettings.sourceAudios = connectedAudios
              } else {
                payloadSettings.sourceAudios = undefined
              }
            }

            const batchSize = node.settings?.batchSize || 1

            for (let i = 0; i < batchSize; i++) {
              // Start generation — results stored in node.settings.outputResults
              await startGeneration(
                finalPrompt,
                node.type === 'gen-image' ? 'image' : 'video',
                finalConnectedImages,
                node.id,
                payloadSettings
              )

              if (i < batchSize - 1) await new Promise((r) => setTimeout(r, 1000))
            }
          }}
          className="p-1.5 flex items-center justify-center rounded transition-all active:scale-95 bg-[var(--primary-color)] text-white hover:opacity-90 shadow-sm shrink-0 outline-none"
          title="生成"
        >
          <Play size={14} fill="currentColor" />
        </button>
      </div>

      {/* 生成结果缩略图 */}
      <OutputResultsPanel
        results={node.settings?.outputResults}
        nodeId={node.id}
        updateNodeSettings={updateNodeSettings}
        setLightboxItem={setLightboxItem}
        startGeneration={startGeneration}
      />
    </div>
  )
  return (
    <>
      {genImageContent}
      {atPopupPortal}
    </>
  )
}, areGenNodePropsEqual)

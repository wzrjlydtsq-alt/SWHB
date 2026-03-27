import React, { useMemo } from 'react'
import { Eraser } from '../../utils/icons.jsx'
import { OutputResultsPanel } from './OutputResultsPanel.jsx'
import { GenPromptArea } from './gen/GenPromptArea.jsx'
import { GenMediaPanel } from './gen/GenMediaPanel.jsx'
import { GenToolbar } from './gen/GenToolbar.jsx'
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
    ps.batchSize !== ns.batchSize ||
    ps.appliedTemplates?.length !== ns.appliedTemplates?.length ||
    ps.appliedVideoTemplates?.length !== ns.appliedVideoTemplates?.length
  )
    return false

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
  startGeneration,
  getStatusColor,
  getConnectedImageForInput,
  activeDropdown,
  setActiveDropdown,
  getConnectedTextNodes,
  getConnectedAudioNodes,
  setLightboxItem
}) {
  // 直接从 store 订阅首尾帧和开关状态，绕过 ReactFlow props 缓存
  const storeManualStartFrame = useAppStore(
    (state) => state.nodesMap.get(node.id)?.settings?.manualStartFrame
  )
  const storeManualEndFrame = useAppStore(
    (state) => state.nodesMap.get(node.id)?.settings?.manualEndFrame
  )
  const storeVeoFramesMode = useAppStore(
    (state) => state.nodesMap.get(node.id)?.settings?.veoFramesMode
  )

  // 查找当前节点对应的正在生成的历史记录
  const activeTask = useAppStore((state) =>
    state.history.find(
      (h) => h.sourceNodeId === node.id && (h.status === 'generating' || h.status === 'completed')
    )
  )
  const isGenerating = activeTask && activeTask.status === 'generating'

  // 派生数据
  const connectedAudios = getConnectedAudioNodes ? getConnectedAudioNodes(node.id) : []
  const allRefImages = [
    ...connectedImages,
    ...(node.settings?.manualImages || []),
    ...(node.settings?.assetIds || [])
  ]
  const allRefAudios = [...connectedAudios, ...(node.settings?.manualAudios || [])]

  // 模型信息
  const model = apiConfigsMap.get(node.settings?.model)
  const modelId = model?.id || model?.modelName || node.settings?.model || ''
  const isVeo31 = modelId.includes('veo3.1')
  const isSeedance =
    modelId.toLowerCase().includes('seedance') ||
    modelId.toLowerCase().includes('doubao') ||
    (model?.modelName &&
      (model.modelName.toLowerCase().includes('seedance') ||
        model.modelName.toLowerCase().includes('doubao'))) ||
    (model?.provider &&
      (model.provider.toLowerCase().includes('seedance') ||
        model.provider.toLowerCase().includes('doubao')))

  // 首尾帧
  const vStartFrame =
    storeManualStartFrame ||
    node.settings?.manualStartFrame ||
    getConnectedImageForInput(node.id, 'veo_start')
  const vEndFrame =
    storeManualEndFrame ||
    node.settings?.manualEndFrame ||
    getConnectedImageForInput(node.id, 'veo_end')

  // 蒙版检测
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
    return hasMask
      ? { hasMask: true, hasMaskFromSource: !!(sourceNode && sourceNode.maskContent) }
      : null
  }, [node.type, node.id, node?.maskContent, connections, nodesMap])

  // ========== 生成处理函数 ==========
  const handleGenerate = async (e) => {
    e.stopPropagation()
    const basePrompt =
      node.type === 'gen-image' ? node.settings?.prompt || '' : node.settings?.videoPrompt || ''

    // 读取已应用的模板内容，拼在 prompt 前面
    const appliedTpls =
      node.type === 'gen-image'
        ? node.settings?.appliedTemplates || []
        : node.settings?.appliedVideoTemplates || []
    const templateContents = appliedTpls.map((t) => t.content).filter(Boolean)

    const connectedTexts = getConnectedTextNodes(node.id)
    const allParts = [...templateContents, ...connectedTexts]
    if (basePrompt) allParts.push(basePrompt)
    let rawPrompt = allParts.join(' ')

    const finalPrompt = rawPrompt
      .replace(/@图片(\d+)\s?/g, '【图$1】')
      .replace(/@音频(\d+)\s?/g, '【音$1】')

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
      const genAudios = getConnectedAudioNodes ? getConnectedAudioNodes(node.id) : []
      const manualAuds = node.settings?.manualAudios || []
      const allAudios = [...genAudios, ...manualAuds]
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

  // ========== prompt 参数 ==========
  const prompt =
    node.type === 'gen-image' ? node.settings?.prompt || '' : node.settings?.videoPrompt || ''
  const showFrames =
    node.type === 'gen-video' &&
    (storeVeoFramesMode ?? node.settings?.veoFramesMode) &&
    (isVeo31 || isSeedance)

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
      {/* ── 提示词区域 ── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* 蒙版提示 (仅 gen-image) */}
          {hasMaskInfo && (
            <div className="flex items-center gap-2 mx-3 mt-2 px-2.5 py-1.5 rounded text-[10px] font-medium bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20 shadow-sm">
              <Eraser size={12} className="shrink-0" />
              <span>{hasMaskInfo.hasMaskFromSource ? '已链接蒙版区域' : '已设置蒙版区域'}</span>
            </div>
          )}

          {/* Prompt 输入 */}
          <GenPromptArea
            nodeId={node.id}
            nodeType={node.type}
            prompt={prompt}
            updateNodeSettings={updateNodeSettings}
            allRefImages={allRefImages}
            allRefAudios={allRefAudios}
            placeholder={node.type === 'gen-image' ? '输入提示词...' : '今天我们要创作什么'}
          />

          {/* 参考图/音频/首尾帧 */}
          <GenMediaPanel
            nodeId={node.id}
            nodeType={node.type}
            connectedImages={connectedImages}
            manualImages={node.settings?.manualImages}
            manualAudios={node.settings?.manualAudios}
            connectedAudios={connectedAudios}
            assetIds={node.settings?.assetIds}
            showFrames={showFrames}
            startFrame={vStartFrame}
            endFrame={vEndFrame}
            updateNodeSettings={updateNodeSettings}
            setLightboxItem={setLightboxItem}
            showSourceVideos={node.type === 'gen-video' && isSeedance}
            sourceVideosText={node.settings?.sourceVideosText}
          />
        </div>
      </div>

      {/* ── 底部工具栏 ── */}
      <GenToolbar
        nodeId={node.id}
        nodeType={node.type}
        settings={node.settings}
        apiConfigs={apiConfigs}
        apiConfigsMap={apiConfigsMap}
        activeDropdown={activeDropdown}
        setActiveDropdown={setActiveDropdown}
        updateNodeSettings={updateNodeSettings}
        getStatusColor={getStatusColor}
        handleGenerate={handleGenerate}
        isGenerating={isGenerating}
        hasMaskInfo={hasMaskInfo}
      />

      {/* ── 生成结果缩略图 ── */}
      <OutputResultsPanel
        results={node.settings?.outputResults}
        nodeId={node.id}
        updateNodeSettings={updateNodeSettings}
        setLightboxItem={setLightboxItem}
        startGeneration={startGeneration}
      />
    </div>
  )
}, areGenNodePropsEqual)

import { useState, useCallback } from 'react'

import { HistoryPanel } from '../../components/ui/HistoryPanel.jsx'
import { setSettingJSON } from '../../services/dbService.js'
import { X } from '../../utils/icons.jsx'
import { useAppStore } from '../../store/useAppStore.js'

export function HistoryFeature({
  theme,
  historyOpen,
  setHistoryOpen,
  historyPerformanceMode,
  localCacheServerConnected,
  localCacheSettingsOpen,
  setLocalCacheSettingsOpen,
  localServerConfig,
  setLocalServerConfig,
  updateLocalServerConfig,
  setBatchModalOpen,
  setBatchSelectedIds,
  history,
  setHistory,
  screenToWorld,
  setHistoryContextMenu,
  historyContextMenu,
  nodes,
  setNodes,
  setEdges,
  setConnections,
  view
}) {
  const lightboxItem = useAppStore((s) => s.lightboxItem)
  const setLightboxItem = useAppStore((s) => s.setLightboxItem)
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [promptModalContent, setPromptModalContent] = useState('')

  const handleShowPrompt = useCallback((item) => {
    setPromptModalContent(item.prompt || '暂无提示词')
    setPromptModalOpen(true)
  }, [])

  const deleteHistoryItem = useCallback(
    (id) => {
      setHistory((prev) => {
        const filtered = prev.filter((item) => item.id !== id)
        try {
          setSettingJSON('tapnow_history', filtered)
        } catch (e) {
          console.error('立即保存历史记录失败:', e)
        }
        return filtered
      })
      if (historyContextMenu.item && historyContextMenu.item.id === id) {
        setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null })
      }
    },
    [setHistory, historyContextMenu, setHistoryContextMenu]
  )

  const handleHistoryRightClick = useCallback(
    (e, item, imageUrl = null, imageIndex = null) => {
      e.preventDefault()
      e.stopPropagation()

      const selectedUrl = imageUrl || item.url || item.originalUrl
      const selectedIndex =
        imageIndex !== null
          ? imageIndex
          : item.selectedMjImageIndex !== undefined
            ? item.selectedMjImageIndex
            : null

      const menuItem = {
        ...item,
        url: selectedUrl,
        selectedMjImageIndex: selectedIndex
      }

      const world = screenToWorld(e.clientX, e.clientY)
      setHistoryContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        worldX: world.x,
        worldY: world.y,
        item: menuItem
      })
    },
    [screenToWorld, setHistoryContextMenu]
  )

  const handleRegenerateFromHistory = useCallback(
    (item) => {
      if (!item.originalPayload) {
        alert('该历史记录缺少详细参数，无法在画布上复原。')
        return
      }
      const payload = item.originalPayload
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      let worldX = (cx - (view?.x || 0)) / (view?.zoom || 1)
      let worldY = (cy - (view?.y || 0)) / (view?.zoom || 1)

      while (
        nodes.some(
          (n) =>
            Math.abs((n.position?.x ?? n.x ?? 0) - worldX) < 150 &&
            Math.abs((n.position?.y ?? n.y ?? 0) - worldY) < 150
        )
      ) {
        worldX += 100
        worldY += 100
      }

      const newNodes = []
      const newEdges = []
      let currentInputY = worldY - 50

      const createInputNode = (inputType, content, dims) => {
        const id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_ext`
        const n = {
          id,
          type: inputType,
          position: { x: worldX - 450, y: currentInputY },
          x: worldX - 450,
          y: currentInputY,
          data: {},
          content,
          width: dims.w,
          height: dims.h,
          dimensions: dims
        }
        currentInputY += dims.h + 50
        return n
      }

      const genNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}_gen`
      const isVideo =
        payload.type === 'video' ||
        payload.modelId?.includes('video') ||
        payload.modelId?.includes('sora') ||
        payload.modelId?.includes('veo') ||
        payload.modelId?.includes('kling')

      const genNode = {
        id: genNodeId,
        type: isVideo ? 'gen-video' : 'gen-image',
        position: { x: worldX, y: worldY },
        x: worldX,
        y: worldY,
        data: { prompt: payload.prompt || '' },
        settings: {
          model: payload.modelId,
          ratio: payload.ratio || (isVideo ? '16:9' : '1:1'),
          resolution: payload.resolution || (isVideo ? '1080P' : 'Auto'),
          duration: payload.duration || '5'
        },
        width: 320,
        height: 480
      }
      newNodes.push(genNode)

      if (payload.sourceImages && payload.sourceImages.length > 0) {
        payload.sourceImages.forEach((img) => {
          const inode = createInputNode('input-image', img, { w: 300, h: 300 })
          newNodes.push(inode)
          newEdges.push({
            id: `reactflow__edge-${inode.id}-${genNodeId}`,
            source: inode.id,
            target: genNodeId,
            from: inode.id,
            to: genNodeId,
            sourceHandle: 'default',
            targetHandle: 'default'
          })
        })
      }

      if (payload.sourceVideos && payload.sourceVideos.length > 0) {
        payload.sourceVideos.forEach((vid) => {
          const inode = createInputNode('video-input', vid, { w: 360, h: 420 })
          newNodes.push(inode)
          newEdges.push({
            id: `reactflow__edge-${inode.id}-${genNodeId}`,
            source: inode.id,
            target: genNodeId,
            from: inode.id,
            to: genNodeId,
            sourceHandle: 'default',
            targetHandle: 'default'
          })
        })
      }

      setNodes((prev) => [...prev, ...newNodes])
      setEdges((prev) => [...prev, ...newEdges.map((e) => ({ ...e, type: 'customedge' }))])

      const localConnections = newEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        from: e.source,
        to: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle
      }))
      setConnections((prev) => [...prev, ...localConnections])
      setHistoryOpen(false)
    },
    [nodes, view, setNodes, setEdges, setConnections, setHistoryOpen]
  )

  return (
    <>
      <HistoryPanel
        theme={theme}
        historyOpen={historyOpen}
        setHistoryOpen={setHistoryOpen}
        historyPerformanceMode={historyPerformanceMode}
        localCacheServerConnected={localCacheServerConnected}
        localCacheSettingsOpen={localCacheSettingsOpen}
        setLocalCacheSettingsOpen={setLocalCacheSettingsOpen}
        localServerConfig={localServerConfig}
        setLocalServerConfig={setLocalServerConfig}
        updateLocalServerConfig={updateLocalServerConfig}
        setBatchModalOpen={setBatchModalOpen}
        setBatchSelectedIds={setBatchSelectedIds}
        history={history}
        setHistory={setHistory}
        lightboxItem={lightboxItem}
        setLightboxItem={setLightboxItem}
        deleteHistoryItem={deleteHistoryItem}
        handleHistoryRightClick={handleHistoryRightClick}
        onShowPrompt={handleShowPrompt}
        onRegenerate={handleRegenerateFromHistory}
      />

      {/* Prompt Viewer Modal */}
      {promptModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col bg-[var(--bg-base)] border border-[var(--border-color)] rounded-xl shadow-2xl overflow-hidden`}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <h3 className="font-bold text-sm text-[var(--text-primary)]">完整提示词 (Prompt)</h3>
              <button
                onClick={() => setPromptModalOpen(false)}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 text-[var(--text-primary)] leading-relaxed text-[13px] whitespace-pre-wrap select-text">
              {promptModalContent}
            </div>

            <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex justify-end">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(promptModalContent)
                    alert('已复制到剪贴板！')
                  } catch (err) {
                    console.error('Copy failed:', err)
                    alert('复制失败，请手动选择文本后使用快捷键复制。')
                  }
                }}
                className="px-6 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors flex items-center gap-2"
              >
                一键复制完整咒语
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

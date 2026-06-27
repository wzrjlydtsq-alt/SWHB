import { memo } from 'react'
import { GlobalContextMenu } from './GlobalContextMenu.tsx'
import { getXingheMediaSrc } from '../../utils/fileHelpers.ts'
import { useAppStore } from '../../store/useAppStore.ts'
import {
  MessageSquare,
  CopyPlus,
  Maximize2,
  ArrowRightSquare,
  LayoutGrid,
  Scissors,
  Download,
  ClipboardCopy,
  Eraser,
  Trash2
} from '../../utils/icons.tsx'

export const ContextMenuManager = memo(function ContextMenuManager({
  contextMenu,
  setContextMenu,
  addNode,
  historyContextMenu,
  sendHistoryToChat,
  sendHistoryToCanvas,
  setNodes,
  setHistoryContextMenu,
  applyHistoryToSelectedNode,
  activeShot,
  updateShot,
  handleSplitGridFromUrl,
  frameContextMenu,
  sendFrameToChat,
  sendFrameToCanvas,
  applyFrameToSelectedNode,
  selectedNodeIdsRef,
  selectedNodeId,
  inputImageContextMenu,
  closeInputImageContextMenu,
  sendInputImageToChat,
  nodesMap,
  // nodeContextMenu, setNodeContextMenu, deleteNode 已移除 — 节点仅通过 Delete 键删除
  nodeContextMenu: _ncm,
  setNodeContextMenu: _sncm,
  deleteNode: _dn
}: any) {
  return (
    <>
      <GlobalContextMenu
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        addNode={addNode}
      />

      {historyContextMenu.visible && (
        <div
          className="context-menu fixed z-[100] w-40"
          style={{
            left: historyContextMenu.x,
            top: historyContextMenu.y,
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            boxShadow: 'none'
          }}
        >
          <div className="px-3 py-1.5 text-[10px] font-medium text-[var(--text-muted)]">操作</div>
          <div className="context-menu-divider" />
          {historyContextMenu.item?.type === 'video' && (
            <button
              className="context-menu-item text-xs"
              onClick={async () => {
                const item = historyContextMenu.item
                if (!item?.url) return
                const resolvedUrl = getXingheMediaSrc(item.url)
                if (!resolvedUrl.startsWith('http')) {
                  alert('仅支持擦除云端视频的字幕')
                  return
                }
                try {
                  const apiKey = useAppStore.getState().globalApiKey
                  const res = await window.api.videoAPI.eraseSubtitle(resolvedUrl, apiKey)
                  if (res?.success && res.resultUrl) {
                    useAppStore
                      .getState()
                      .setHistory((prev) =>
                        prev.map((h) => (h.id === item.id ? { ...h, url: res.resultUrl } : h))
                      )
                  } else {
                    alert(res?.error || '字幕擦除失败')
                  }
                } catch (err) {
                  alert('字幕擦除失败')
                }
                setHistoryContextMenu({
                  visible: false,
                  x: 0,
                  y: 0,
                  worldX: 0,
                  worldY: 0,
                  item: null
                })
              }}
            >
              <Eraser size={14} className="text-[var(--text-secondary)]" /> 擦除字幕
            </button>
          )}
          {historyContextMenu.item?.type !== 'video' && (
            <button
              className="context-menu-item text-xs"
              onClick={async () => {
                const item = historyContextMenu.item
                if (!item?.url) return
                try {
                  const res = await window.api.invoke('clipboard:copy-image', {
                    filePath: item.url
                  })
                  if (!res?.success) console.warn('复制失败:', res?.error)
                } catch (e) {
                  console.error('复制图片失败:', e)
                }
                setHistoryContextMenu({
                  visible: false,
                  x: 0,
                  y: 0,
                  worldX: 0,
                  worldY: 0,
                  item: null
                })
              }}
            >
              <ClipboardCopy size={14} className="text-[var(--text-secondary)]" /> 复制图片
            </button>
          )}
          <button
            className="context-menu-item text-xs"
            onClick={async () => {
              const item = historyContextMenu.item
              if (!item?.url) return
              const rawUrl = item.url
              const resolvedUrl = getXingheMediaSrc(rawUrl)
              let name = rawUrl.split(/[/\\]/).pop()?.split('?')[0] || `output-${Date.now()}`
              if (!name.includes('.')) {
                name += item.type === 'video' ? '.mp4' : '.png'
              }
              try {
                await window.api.localCacheAPI.saveFileAs(resolvedUrl, name)
              } catch (e) {
                console.error('另存为失败:', e)
              }
              setHistoryContextMenu({
                visible: false,
                x: 0,
                y: 0,
                worldX: 0,
                worldY: 0,
                item: null
              })
            }}
          >
            <Download size={14} className="text-[var(--text-secondary)]" /> 另存为...
          </button>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item text-xs"
            onClick={() => {
              const item = historyContextMenu.item
              if (item?.id) {
                useAppStore
                  .getState()
                  .setHistory((prev) => prev.filter((historyItem) => historyItem.id !== item.id))
              }
              setHistoryContextMenu({
                visible: false,
                x: 0,
                y: 0,
                worldX: 0,
                worldY: 0,
                item: null
              })
            }}
          >
            <Trash2 size={14} className="text-red-400" /> 删除
          </button>
        </div>
      )}

      {frameContextMenu.visible && (
        <div
          className="context-menu fixed z-[110] w-48"
          style={{ left: frameContextMenu.x, top: frameContextMenu.y }}
        >
          <div className="px-3 py-1.5 text-[10px] font-medium text-[var(--text-muted)]">操作</div>
          <div className="context-menu-divider" />
          <button className="context-menu-item text-xs" onClick={sendFrameToChat}>
            <MessageSquare size={14} className="text-purple-500" /> 发送到当前对话
          </button>
          <button className="context-menu-item text-xs" onClick={sendFrameToCanvas}>
            <CopyPlus size={14} className="text-blue-500" /> 发送到画布
          </button>

          <button className="context-menu-item text-xs" onClick={applyFrameToSelectedNode}>
            <ArrowRightSquare
              size={14}
              className={selectedNodeId ? 'text-green-500' : 'text-zinc-400'}
            />{' '}
            应用到选中节点
          </button>
        </div>
      )}

      {inputImageContextMenu.visible && (
        <div
          className="context-menu fixed z-[110] w-48"
          style={{ left: inputImageContextMenu.x, top: inputImageContextMenu.y }}
          onMouseLeave={closeInputImageContextMenu}
        >
          <div className="px-3 py-1.5 text-[10px] font-medium text-[var(--text-muted)]">操作</div>
          <div className="context-menu-divider" />
          <button className="context-menu-item text-xs" onClick={sendInputImageToChat}>
            <MessageSquare size={14} className="text-purple-500" /> 发送到当前对话
          </button>
          <button
            className="context-menu-item text-xs"
            onClick={() => {
              const nodeId = inputImageContextMenu.nodeId
              const node = nodesMap.get(nodeId)
              if (!node || !node.content) return

              // 检查是否有框选的节点，且数量正好是9个
              const currentSelectedIds = selectedNodeIdsRef.current
              const hasSelectedNodes = currentSelectedIds && currentSelectedIds.size === 9

              if (hasSelectedNodes) {
                // 替换模式：直接替换已选中的9个节点
                handleSplitGridFromUrl(node.content, { replaceSelected: true })
              } else {
                // 创建新节点模式：在源节点旁边创建
                const originX = node.x + node.width + 20
                const originY = node.y
                handleSplitGridFromUrl(node.content, { originX, originY })
              }
              closeInputImageContextMenu()
            }}
          >
            <Scissors size={14} className="text-blue-500" /> 九宫格裁切
          </button>
        </div>
      )}

      {/* 框选节点右键菜单 (已被移除) */}

      {/* 节点右键菜单已移除 — 仅通过 Delete 键删除节点 */}
    </>
  )
})

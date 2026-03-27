import { memo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getXingheMediaSrc } from '../../utils/fileHelpers.js'
import { ThumbnailImage } from '../ui/ThumbnailImage.jsx'
import { useAppStore } from '../../store/useAppStore.js'

function getStorageKey() {
  const projectId = useAppStore.getState().currentProject?.id
  return projectId ? `tapnow_asset_library_${projectId}` : 'tapnow_asset_library'
}

function addToAssetLibrary(category, url) {
  try {
    const key = getStorageKey()
    const rawData = localStorage.getItem(key)
    const data = rawData ? JSON.parse(rawData) : {}
    if (!data[category] || typeof data[category] !== 'object') {
      data[category] = { folders: [], items: [] }
    }
    if (Array.isArray(data[category])) {
      data[category] = { folders: [], items: data[category] }
    }
    if (!Array.isArray(data[category].items)) {
      data[category].items = []
    }

    const name = url.split(/[/\\]/).pop() || `asset-${Date.now()}`
    const ext = name.split('.').pop()?.toLowerCase() || ''
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
    const videoExts = ['mp4', 'webm', 'mov']
    let type = 'image/png'
    if (imageExts.includes(ext)) type = `image/${ext === 'jpg' ? 'jpeg' : ext}`
    else if (videoExts.includes(ext)) type = `video/${ext}`

    data[category].items.push({
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      type,
      path: url,
      addedAt: Date.now()
    })
    localStorage.setItem(key, JSON.stringify(data))
    window.dispatchEvent(new CustomEvent('asset-library-updated'))
    return true
  } catch (e) {
    console.error('Failed to add to asset library:', e)
    return false
  }
}

/**
 * OutputResultsPanel — 生成结果卡片
 *
 * Portal 到画布 transform 容器内，使用节点世界坐标定位。
 * 面板在 CSS transform 内，自动跟随画布平移/缩放，零事件监听。
 */
export const OutputResultsPanel = memo(function OutputResultsPanel({
  results: propResults,
  nodeId,
  updateNodeSettings,
  setLightboxItem,
  startGeneration
}) {
  const [contextMenu, setContextMenu] = useState(null)
  const [toast, setToast] = useState(null)
  const [editPopup, setEditPopup] = useState(null)
  const [editPrompt, setEditPrompt] = useState('')
  const [dims, setDims] = useState({})

  // 直接从 store 订阅，不依赖 GenNode props 传递（避免 memo 阻断更新）
  const nodeX = useAppStore((state) => state.nodesMap.get(nodeId)?.x ?? 0)
  const nodeY = useAppStore((state) => state.nodesMap.get(nodeId)?.y ?? 0)
  const nodeWidth = useAppStore((state) => state.nodesMap.get(nodeId)?.width ?? 300)
  const nodeExists = useAppStore((state) => state.nodesMap.has(nodeId))
  const storeResults = useAppStore((state) => state.nodesMap.get(nodeId)?.settings?.outputResults)

  // 优先使用 store 订阅的数据，props 作为后备
  const results = storeResults || propResults

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1500)
    return () => clearTimeout(t)
  }, [toast])

  if (!results || results.length === 0 || !nodeExists) return null

  const cardSize = 120

  const handleContextMenu = (e, result, idx) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, result, idx })
  }

  const closeContextMenu = () => setContextMenu(null)

  const handleViewLarge = (result) => {
    if (setLightboxItem) {
      const isVideo = result.type === 'video'
      setLightboxItem({
        type: isVideo ? 'video' : 'image',
        url: getXingheMediaSrc(result.url)
      })
    }
    closeContextMenu()
  }

  const handleEdit = (result) => {
    setEditPopup(result)
    setEditPrompt('')
    closeContextMenu()
  }

  const handleSubmitEdit = async () => {
    if (!editPopup || !editPrompt.trim()) return
    const sourceUrl = editPopup.url
    if (startGeneration) {
      await startGeneration(editPrompt.trim(), 'image', [sourceUrl], nodeId, {})
    }
    setEditPopup(null)
    setEditPrompt('')
  }

  const handleAddToLibrary = (result, category, label) => {
    const ok = addToAssetLibrary(category, result.url)
    setToast(ok ? `已添加到${label}` : '添加失败')
    closeContextMenu()
  }

  const handleImageLoad = (e, idx) => {
    const nw = e.target.naturalWidth
    const nh = e.target.naturalHeight
    if (nw && nh) setDims((prev) => ({ ...prev, [idx]: `${nw}×${nh}` }))
  }

  const handleVideoMeta = (e, idx) => {
    const vw = e.target.videoWidth
    const vh = e.target.videoHeight
    if (vw && vh) setDims((prev) => ({ ...prev, [idx]: `${vw}×${vh}` }))
  }

  // 世界坐标定位：节点右侧 + 12px 间距
  const panelX = nodeX + nodeWidth + 12
  const panelY = nodeY

  const panel = (
    <div
      className="pointer-events-auto"
      style={{
        position: 'absolute',
        left: panelX,
        top: panelY,
        zIndex: 50
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (contextMenu && !e.target.closest('[data-context-menu]')) {
          closeContextMenu()
        }
      }}
    >
      <div className="flex flex-nowrap gap-2">
        {results.map((result, idx) => {
          const isVideo = result.type === 'video'
          return (
            <div
              key={result.id || idx}
              className="relative group rounded-lg overflow-hidden border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-md cursor-pointer hover:border-[var(--primary-color)] transition-all"
              style={{ width: cardSize, height: cardSize }}
              onDoubleClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleViewLarge(result)
              }}
              onContextMenu={(e) => handleContextMenu(e, result, idx)}
            >
              {isVideo ? (
                <video
                  src={getXingheMediaSrc(result.url)}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  playsInline
                  onLoadedMetadata={(e) => handleVideoMeta(e, idx)}
                  onMouseEnter={(e) => e.target.play().catch(() => {})}
                  onMouseLeave={(e) => {
                    e.target.pause()
                    e.target.currentTime = 0
                  }}
                />
              ) : (
                <ThumbnailImage
                  src={getXingheMediaSrc(result.url)}
                  alt={`Output ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onLoad={(e) => handleImageLoad(e, idx)}
                />
              )}

              {dims[idx] && (
                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[8px] text-white/90 font-mono pointer-events-none">
                  {dims[idx]}
                </div>
              )}

              {isVideo && (
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[8px] text-white font-medium">
                  ▶
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  // 右键菜单、编辑弹窗、Toast 用 fixed 定位，必须 Portal 到 body（避免 transform 祖先影响）
  const overlays = (
    <>
      {/* Right-click context menu */}
      {contextMenu && (
        <div
          data-context-menu
          className="fixed z-[200] w-36 rounded-lg shadow-xl border bg-[#18181b] border-zinc-800 p-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 rounded hover:bg-zinc-800"
            onClick={() => handleViewLarge(contextMenu.result)}
          >
            查看大图
          </button>
          {contextMenu.result.type !== 'video' && (
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 rounded hover:bg-zinc-800"
              onClick={async () => {
                try {
                  const res = await window.api.invoke('clipboard:copy-image', {
                    filePath: contextMenu.result.url
                  })
                  setToast(res?.success ? '已复制到剪贴板' : `复制失败: ${res?.error || '未知错误'}`)
                } catch (e) {
                  setToast('复制失败')
                }
                closeContextMenu()
              }}
            >
              复制图片
            </button>
          )}
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 rounded hover:bg-zinc-800"
            onClick={() => handleEdit(contextMenu.result)}
          >
            修改
          </button>
          <div className="my-1 border-t border-zinc-700/50" />
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 rounded hover:bg-zinc-800"
            onClick={() => handleAddToLibrary(contextMenu.result, 'characters', '人物库')}
          >
            添加到人物库
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 rounded hover:bg-zinc-800"
            onClick={() => handleAddToLibrary(contextMenu.result, 'scenes', '场景库')}
          >
            添加到场景库
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 rounded hover:bg-zinc-800"
            onClick={() => handleAddToLibrary(contextMenu.result, 'materials', '素材库')}
          >
            添加到素材库
          </button>
          <div className="my-1 border-t border-zinc-700/50" />
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 rounded hover:bg-zinc-800"
            onClick={async () => {
              const rawUrl = contextMenu.result.url
              const resolvedUrl = getXingheMediaSrc(rawUrl)
              const name = rawUrl.split(/[/\\]/).pop()?.split('?')[0] || `output-${Date.now()}.png`
              try {
                await window.api.localCacheAPI.saveFileAs(resolvedUrl, name)
              } catch (e) {
                console.error('另存为失败:', e)
              }
              closeContextMenu()
            }}
          >
            另存为...
          </button>
          <div className="my-1 border-t border-zinc-700/50" />
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 rounded hover:bg-zinc-800"
            onClick={(e) => {
              e.stopPropagation()
              const updated = results.filter((_, i) => i !== contextMenu.idx)
              if (updateNodeSettings) updateNodeSettings(nodeId, { outputResults: updated })
              closeContextMenu()
            }}
          >
            删除
          </button>
        </div>
      )}

      {/* Edit prompt popup */}
      {editPopup && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50"
          onClick={() => setEditPopup(null)}
        >
          <div
            className="bg-[#1e1e22] border border-zinc-700 rounded-xl shadow-2xl p-4 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <img
                src={getXingheMediaSrc(editPopup.url)}
                alt="source"
                className="w-16 h-16 rounded-lg object-cover border border-zinc-700"
              />
              <div className="text-xs text-zinc-400">基于此图进行修改</div>
            </div>
            <textarea
              autoFocus
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmitEdit()
                }
                if (e.key === 'Escape') setEditPopup(null)
              }}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="输入修改提示词..."
              className="w-full h-20 bg-[#2a2a2e] border border-zinc-700 rounded-lg p-2.5 text-xs text-zinc-200 outline-none resize-none placeholder-zinc-500 focus:border-[var(--primary-color)]"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setEditPopup(null)}
                className="px-3 py-1.5 text-xs text-zinc-400 rounded-lg hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                onClick={handleSubmitEdit}
                disabled={!editPrompt.trim()}
                className="px-4 py-1.5 text-xs text-white bg-[var(--primary-color)] rounded-lg hover:opacity-90 disabled:opacity-40"
              >
                生成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] px-4 py-2 rounded-lg bg-[#18181b] border border-zinc-700 text-xs text-zinc-200 shadow-xl">
          {toast}
        </div>
      )}
    </>
  )

  // 卡片面板 Portal 到 viewport（跟随画布缩放/平移）
  const viewport = document.querySelector('.react-flow__viewport')
  if (!viewport) return null

  return (
    <>
      {createPortal(panel, viewport)}
      {createPortal(overlays, document.body)}
    </>
  )
})

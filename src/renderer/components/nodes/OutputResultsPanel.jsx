import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getXingheMediaSrc } from '../../utils/fileHelpers.js'
import { ThumbnailImage } from '../ui/ThumbnailImage.jsx'

const STORAGE_KEY = 'tapnow_asset_library'

function addToAssetLibrary(category, url) {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY)
    const data = rawData ? JSON.parse(rawData) : {}
    // Ensure category structure exists
    if (!data[category] || typeof data[category] !== 'object') {
      data[category] = { folders: [], items: [] }
    }
    // Handle legacy array format
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    // 通知 AssetLibrary 实时重新加载
    window.dispatchEvent(new CustomEvent('asset-library-updated'))
    return true
  } catch (e) {
    console.error('Failed to add to asset library:', e)
    return false
  }
}

/**
 * OutputResultsPanel — renders generated results as cards
 * on the RIGHT side of the gen node using a React Portal.
 */
export const OutputResultsPanel = memo(function OutputResultsPanel({
  results,
  nodeId,
  updateNodeSettings,
  setLightboxItem,
  startGeneration
}) {
  const [contextMenu, setContextMenu] = useState(null)
  const [toast, setToast] = useState(null)
  const [pos, setPos] = useState(null)
  const [editPopup, setEditPopup] = useState(null) // { result, prompt }
  const [editPrompt, setEditPrompt] = useState('')
  const [dims, setDims] = useState({}) // { [idx]: 'WxH' }
  const lastPosRef = useRef({ top: 0, left: 0 })

  // 计算并更新面板位置（仅在位置变化 >0.5px 时触发 setState）
  const syncPosition = useCallback(() => {
    const nodeEl = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`)
    if (!nodeEl) return
    const rect = nodeEl.getBoundingClientRect()
    const newTop = rect.top
    const newLeft = rect.right + 12
    if (
      Math.abs(lastPosRef.current.top - newTop) > 0.5 ||
      Math.abs(lastPosRef.current.left - newLeft) > 0.5
    ) {
      lastPosRef.current = { top: newTop, left: newLeft }
      setPos({ top: newTop, left: newLeft })
    }
  }, [nodeId])

  // 事件驱动位置更新：只在画布交互时更新，不再每帧轮询
  useEffect(() => {
    if (!results || results.length === 0) return

    // 初始定位
    syncPosition()

    const canvas = document.querySelector('.react-flow')
    if (!canvas) return

    // 用 RAF 节流事件处理，避免高频事件导致性能问题
    let rafPending = false
    const throttledSync = () => {
      if (rafPending) return
      rafPending = true
      requestAnimationFrame(() => {
        syncPosition()
        rafPending = false
      })
    }

    // 监听画布交互事件
    canvas.addEventListener('wheel', throttledSync, { passive: true })
    canvas.addEventListener('mousemove', throttledSync, { passive: true })
    canvas.addEventListener('scroll', throttledSync, { passive: true })
    window.addEventListener('resize', throttledSync)

    return () => {
      canvas.removeEventListener('wheel', throttledSync)
      canvas.removeEventListener('mousemove', throttledSync)
      canvas.removeEventListener('scroll', throttledSync)
      window.removeEventListener('resize', throttledSync)
    }
  }, [results, syncPosition])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1500)
    return () => clearTimeout(t)
  }, [toast])

  if (!results || results.length === 0 || !pos) return null

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

  const panel = (
    <div
      className="pointer-events-auto"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 50
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => contextMenu && closeContextMenu()}
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

              {/* Dimensions badge */}
              {dims[idx] && (
                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[8px] text-white/90 font-mono pointer-events-none">
                  {dims[idx]}
                </div>
              )}

              {/* Video badge */}
              {isVideo && (
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[8px] text-white font-medium">
                  ▶
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-[200] w-36 rounded-lg shadow-xl border bg-[#18181b] border-zinc-800 p-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={closeContextMenu}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 rounded hover:bg-zinc-800"
            onClick={() => handleViewLarge(contextMenu.result)}
          >
            查看大图
          </button>
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
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 rounded hover:bg-zinc-800"
            onClick={() => {
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
              <div className="text-xs text-zinc-400">
                基于此图进行修改
              </div>
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
    </div>
  )

  // Portal 到画布容器内，而非 document.body，避免遮挡其他 UI 模块
  const canvasContainer = document.querySelector('.react-flow')
  if (!canvasContainer) return null
  return createPortal(panel, canvasContainer)
})

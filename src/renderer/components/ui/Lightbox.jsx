import { useRef, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from '../../utils/icons.jsx'
import { getXingheMediaSrc } from '../../utils/fileHelpers.js'

export const Lightbox = ({ item, onClose, onNavigate }) => {
  if (!item) return null

  // 使用ref存储最新的item值，避免闭包问题
  const itemRef = useRef(item)
  useEffect(() => {
    itemRef.current = item
  }, [item])

  // 键盘事件处理：左右方向键切换图片
  useEffect(() => {
    if (!item) return

    const handleKeyDown = (e) => {
      // 使用ref获取最新的item值
      const currentItem = itemRef.current
      if (!currentItem) return

      // 只在有多张图片时响应方向键
      if (!currentItem.mjImages || currentItem.mjImages.length <= 1) return

      // 防止在输入框中触发
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      if (e.key === 'ArrowLeft' || e.key === 'Left') {
        e.preventDefault()
        e.stopPropagation()
        // 切换到上一张（只在当前item的mjImages范围内）
        const currentIndex =
          currentItem.selectedMjImageIndex !== undefined ? currentItem.selectedMjImageIndex : 0
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : currentItem.mjImages.length - 1
        // 确保索引在有效范围内，并且只操作当前item的mjImages
        if (prevIndex >= 0 && prevIndex < currentItem.mjImages.length && onNavigate) {
          onNavigate(prevIndex)
        }
      } else if (e.key === 'ArrowRight' || e.key === 'Right') {
        e.preventDefault()
        e.stopPropagation()
        // 切换到下一张（只在当前item的mjImages范围内）
        const currentIndex =
          currentItem.selectedMjImageIndex !== undefined ? currentItem.selectedMjImageIndex : 0
        const nextIndex = currentIndex < currentItem.mjImages.length - 1 ? currentIndex + 1 : 0
        // 确保索引在有效范围内，并且只操作当前item的mjImages
        if (nextIndex >= 0 && nextIndex < currentItem.mjImages.length && onNavigate) {
          onNavigate(nextIndex)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [item, onNavigate])

  return (
    <div
      className="fixed inset-0 z-[200] lightbox-overlay flex flex-col items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white p-2 bg-black/50 rounded-full transition-colors"
        onClick={onClose}
      >
        <X size={24} />
      </button>
      <div className="max-w-[90vw] max-h-[85vh] relative" onClick={(e) => e.stopPropagation()}>
        {item.type === 'image' ? (
          <img
            src={getXingheMediaSrc(item.url || item.originalUrl)}
            alt={item.prompt}
            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
          />
        ) : (
          <video
            src={getXingheMediaSrc(item.url || item.originalUrl)}
            controls
            autoPlay
            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
          />
        )}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-6 py-3 rounded-full text-white text-sm font-medium border border-white/10 text-center shadow-2xl">
          <div className="line-clamp-1 max-w-xl">{item.prompt}</div>
          <div className="text-[10px] text-zinc-400 mt-1">
            {item.width}x{item.height} • {item.modelName}
            {item.mjImages && item.mjImages.length > 1 && (
              <span className="ml-2">
                ({(item.selectedMjImageIndex !== undefined ? item.selectedMjImageIndex : 0) + 1}/
                {item.mjImages.length})
              </span>
            )}
          </div>
        </div>
        {/* 左右切换提示 */}
        {item.mjImages && item.mjImages.length > 1 && (
          <>
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 bg-black/50 rounded-full transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                const currentIndex =
                  item.selectedMjImageIndex !== undefined ? item.selectedMjImageIndex : 0
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : item.mjImages.length - 1
                if (onNavigate) onNavigate(prevIndex)
              }}
              title="上一张 (←)"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 bg-black/50 rounded-full transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                const currentIndex =
                  item.selectedMjImageIndex !== undefined ? item.selectedMjImageIndex : 0
                const nextIndex = currentIndex < item.mjImages.length - 1 ? currentIndex + 1 : 0
                if (onNavigate) onNavigate(nextIndex)
              }}
              title="下一张 (→)"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

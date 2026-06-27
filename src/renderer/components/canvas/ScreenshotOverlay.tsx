import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { captureViewport, handleCaptureAction } from '../../utils/canvasCapture'

/**
 * 截图覆盖层 - 框选截图模式
 * 覆盖整个画布区域，用户拖拽选择截取范围
 */
export const ScreenshotOverlay = memo(function ScreenshotOverlay({ onClose, onCapture }: any) {
  const [isDragging, setIsDragging] = useState(false)
  const [startPos, setStartPos] = useState(null)
  const [endPos, setEndPos] = useState(null)
  const overlayRef = useRef(null)

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setStartPos({ x: e.clientX, y: e.clientY })
    setEndPos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging) return
      setEndPos({ x: e.clientX, y: e.clientY })
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(async () => {
    if (!isDragging || !startPos || !endPos) return
    setIsDragging(false)

    const rect = {
      x: Math.min(startPos.x, endPos.x),
      y: Math.min(startPos.y, endPos.y),
      width: Math.abs(endPos.x - startPos.x),
      height: Math.abs(endPos.y - startPos.y)
    }

    // 最小尺寸检查
    if (rect.width < 10 || rect.height < 10) {
      onClose?.()
      return
    }

    // 先隐藏遮罩层再截图
    if (overlayRef.current) {
      overlayRef.current.style.display = 'none'
    }

    // 等一帧让渲染更新
    await new Promise((r) => requestAnimationFrame(r))

    const result = await captureViewport()
    if (result && onCapture) {
      // 裁切选区
      const canvas = document.createElement('canvas')
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')

      const img = new Image()
      img.onload = () => {
        ctx.drawImage(
          img,
          rect.x * dpr,
          rect.y * dpr,
          rect.width * dpr,
          rect.height * dpr,
          0,
          0,
          rect.width * dpr,
          rect.height * dpr
        )
        onCapture({
          dataUrl: canvas.toDataURL('image/png'),
          width: rect.width,
          height: rect.height
        })
        onClose?.()
      }
      img.onerror = () => {
        console.warn('[截图] 图片加载失败')
        onClose?.()
      }
      img.src = result.dataUrl
    } else {
      onClose?.()
    }
  }, [isDragging, startPos, endPos, onClose, onCapture])

  // ESC 取消
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const selectionRect =
    startPos && endPos
      ? {
          left: Math.min(startPos.x, endPos.x),
          top: Math.min(startPos.y, endPos.y),
          width: Math.abs(endPos.x - startPos.x),
          height: Math.abs(endPos.y - startPos.y)
        }
      : null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[10000] cursor-crosshair"
      style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* 提示文字 */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium"
        style={{
          backgroundColor: 'var(--bg-panel)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-default)'
        }}
      >
        拖拽选择截图区域 · ESC 取消
      </div>

      {/* 选区框 */}
      {selectionRect && selectionRect.width > 2 && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
            border: '2px solid var(--primary-color)',
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderRadius: 4
          }}
        >
          {/* 尺寸标注 */}
          <span
            className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] px-2 py-0.5 rounded"
            style={{
              backgroundColor: 'var(--primary-color)',
              color: 'var(--text-on-primary)'
            }}
          >
            {Math.round(selectionRect.width)} × {Math.round(selectionRect.height)}
          </span>
        </div>
      )}
    </div>
  )
})

/**
 * 截图操作选择弹窗
 */
export const ScreenshotActionDialog = memo(function ScreenshotActionDialog({ result, onClose }: any) {
  if (!result) return null

  const handleAction = async (action) => {
    await handleCaptureAction(result, action)
    onClose?.()
  }

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-4 max-w-sm w-80"
        style={{
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 预览 */}
        <div
          className="rounded-lg overflow-hidden mb-3"
          style={{ backgroundColor: 'var(--bg-base)' }}
        >
          <img
            src={result.dataUrl}
            alt="截图预览"
            className="w-full h-auto max-h-48 object-contain"
          />
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          {result.width} × {result.height}
        </p>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('clipboard')}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              backgroundColor: 'var(--primary-color)',
              color: 'var(--text-on-primary)'
            }}
          >
            📋 复制到剪贴板
          </button>
          <button
            onClick={() => handleAction('save')}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)'
            }}
          >
            💾 保存文件
          </button>
        </div>
      </div>
    </div>
  )
})

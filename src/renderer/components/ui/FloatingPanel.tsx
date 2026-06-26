import { useCallback, useRef, useState } from 'react'
import { X } from '../../utils/icons.tsx'

/**
 * 通用画布浮窗容器
 * 特性：可拖拽、可折叠、可调整大小、毛玻璃、阴影
 */
export function FloatingPanel({
  open,
  onClose,
  title,
  icon,
  defaultX = 80,
  defaultY = 80,
  width = 320,
  minWidth = 220,
  minHeight = 120,
  maxHeight = '70vh',
  zIndex = 90,
  children
}: {
  open: boolean
  onClose: () => void
  title: string
  icon?: string
  defaultX?: number
  defaultY?: number
  width?: number
  minWidth?: number
  minHeight?: number
  maxHeight?: string
  zIndex?: number
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [pos, setPos] = useState({ x: defaultX, y: defaultY })
  const [size, setSize] = useState({ w: width, h: 0 }) // h=0 表示自动高度
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // ── 拖拽移动 ──
  const onTitleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        setPos({
          x: Math.max(0, dragRef.current.ox + ev.clientX - dragRef.current.sx),
          y: Math.max(0, dragRef.current.oy + ev.clientY - dragRef.current.sy)
        })
      }
      const onUp = () => {
        dragRef.current = null
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [pos]
  )

  // ── 拖拽调整大小 ──
  const onResizeStart = useCallback(
    (
      e: React.MouseEvent,
      edges: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean }
    ) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startY = e.clientY
      const startW = size.w
      const startH = size.h || panelRef.current?.offsetHeight || 300
      const startPosX = pos.x
      const startPosY = pos.y

      const onMove = (ev: MouseEvent) => {
        let newW = startW
        let newH = startH
        let newX = startPosX
        let newY = startPosY
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY

        if (edges.right) newW = Math.max(minWidth, startW + dx)
        if (edges.bottom) newH = Math.max(minHeight, startH + dy)
        if (edges.left) {
          newW = Math.max(minWidth, startW - dx)
          if (newW !== startW || newW > minWidth) newX = startPosX + startW - newW
        }
        if (edges.top) {
          newH = Math.max(minHeight, startH - dy)
          if (newH !== startH || newH > minHeight) newY = startPosY + startH - newH
        }

        setSize({ w: newW, h: newH })
        setPos({ x: Math.max(0, newX), y: Math.max(0, newY) })
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [size, pos, minWidth, minHeight]
  )

  if (!open) return null

  const sizeStyle: React.CSSProperties = {
    left: pos.x,
    top: pos.y,
    width: size.w,
    zIndex,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-color)',
    backdropFilter: 'blur(16px)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 1px rgba(255,255,255,0.08) inset'
  }
  if (collapsed) {
    // collapsed 时不限制高度
  } else if (size.h > 0) {
    sizeStyle.height = size.h
  } else {
    sizeStyle.maxHeight = maxHeight
  }

  return (
    <div
      ref={panelRef}
      className="fixed flex flex-col rounded-xl overflow-hidden select-none"
      style={sizeStyle}
    >
      {/* 标题栏 — 可拖拽 */}
      <div
        className="px-3 py-2 flex justify-between items-center cursor-grab active:cursor-grabbing shrink-0"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04))'
        }}
        onMouseDown={onTitleMouseDown}
      >
        <h3 className="font-bold text-[11px] text-[var(--text-primary)] flex items-center gap-1.5">
          {icon && <span>{icon}</span>}
          {title}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-white/10 text-[var(--text-secondary)] text-[10px] transition-colors"
          >
            {collapsed ? '▼' : '▲'}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-[var(--text-secondary)] transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-hidden flex flex-col select-text min-h-0">{children}</div>
      )}

      {/* ── 8 个 Resize 把手 ── */}
      {!collapsed && (
        <>
          {/* 四条边 */}
          <div
            className="absolute top-0 left-2 right-2 h-1.5 cursor-ns-resize z-10"
            onMouseDown={(e) => onResizeStart(e, { top: true })}
          />
          <div
            className="absolute bottom-0 left-2 right-2 h-1.5 cursor-ns-resize z-10"
            onMouseDown={(e) => onResizeStart(e, { bottom: true })}
          />
          <div
            className="absolute left-0 top-2 bottom-2 w-1.5 cursor-ew-resize z-10"
            onMouseDown={(e) => onResizeStart(e, { left: true })}
          />
          <div
            className="absolute right-0 top-2 bottom-2 w-1.5 cursor-ew-resize z-10"
            onMouseDown={(e) => onResizeStart(e, { right: true })}
          />
          {/* 四个角 */}
          <div
            className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-20"
            onMouseDown={(e) => onResizeStart(e, { top: true, left: true })}
          />
          <div
            className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-20"
            onMouseDown={(e) => onResizeStart(e, { top: true, right: true })}
          />
          <div
            className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-20"
            onMouseDown={(e) => onResizeStart(e, { bottom: true, left: true })}
          />
          <div
            className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-20"
            onMouseDown={(e) => onResizeStart(e, { bottom: true, right: true })}
          />
          {/* 右下角小三角视觉提示 */}
          <div
            className="absolute bottom-0.5 right-0.5 w-3 h-3 pointer-events-none opacity-30"
            style={{
              background: 'linear-gradient(135deg, transparent 50%, var(--text-secondary) 50%)',
              borderRadius: '0 0 6px 0'
            }}
          />
        </>
      )}
    </div>
  )
}

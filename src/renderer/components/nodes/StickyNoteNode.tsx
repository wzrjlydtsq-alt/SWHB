import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'

const STICKY_COLORS = [
  {
    id: 'yellow',
    bg: 'rgba(250, 204, 21, 0.15)',
    border: 'rgba(250, 204, 21, 0.4)',
    text: '#fbbf24',
    label: '黄色'
  },
  {
    id: 'blue',
    bg: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.4)',
    text: '#60a5fa',
    label: '蓝色'
  },
  {
    id: 'green',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)',
    text: '#34d399',
    label: '绿色'
  },
  {
    id: 'red',
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.4)',
    text: '#f87171',
    label: '红色'
  },
  {
    id: 'purple',
    bg: 'rgba(139, 92, 246, 0.15)',
    border: 'rgba(139, 92, 246, 0.4)',
    text: '#a78bfa',
    label: '紫色'
  }
]

/**
 * 便签节点 - 轻量纯文字节点
 * 支持多种颜色标记、双击编辑、自动调整大小
 */
export const StickyNoteNode = memo(function StickyNoteNode({ node }: any) {
  const settings = node.settings || {}
  const text = settings.text || ''
  const colorId = settings.stickyColor || 'yellow'
  const colorConfig = STICKY_COLORS.find((c) => c.id === colorId) || STICKY_COLORS[0]

  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(text)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const textareaRef = useRef(null)

  const updateNodeSettings = useAppStore((s) => s.updateNodeSettingsById)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(editText.length, editText.length)
    }
  }, [isEditing])

  const handleSave = useCallback(() => {
    setIsEditing(false)
    setShowColorPicker(false)
    if (editText !== text) {
      updateNodeSettings(node.id, { text: editText })
    }
  }, [editText, text, node.id, updateNodeSettings])

  const handleColorChange = useCallback(
    (newColorId) => {
      updateNodeSettings(node.id, { stickyColor: newColorId })
      setShowColorPicker(false)
    },
    [node.id, updateNodeSettings]
  )

  const handleDoubleClick = useCallback(
    (e) => {
      e.stopPropagation()
      setIsEditing(true)
      setEditText(text)
    },
    [text]
  )

  return (
    <div
      className="sticky-note-node relative group pointer-events-auto"
      style={{
        width: node.width || 200,
        height: node.height || 150,
        minWidth: 120,
        minHeight: 80,
        backgroundColor: colorConfig.bg,
        border: `1px solid ${colorConfig.border}`,
        borderRadius: 12,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        cursor: isEditing ? 'text' : 'grab',
        transition: 'border-color 0.2s ease',
        boxShadow: 'none'
      }}
      onDoubleClick={handleDoubleClick}
    >
      {/* 顶部栏：颜色选择器 + 拖拽把手 */}
      <div
        className="flex items-center justify-between mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ minHeight: 20 }}
      >
        {/* 颜色圆点 */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowColorPicker(!showColorPicker)
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded-full cursor-pointer transition-transform hover:scale-125"
            style={{ backgroundColor: colorConfig.text }}
            title="切换颜色"
          />
          {/* 颜色选择弹窗 */}
          {showColorPicker && (
            <div
              className="absolute top-6 left-0 flex gap-1.5 p-1.5 rounded-lg z-50"
              style={{
                backgroundColor: 'var(--bg-panel)',
                border: '1px solid var(--border-default)',
                boxShadow: 'var(--shadow-md)'
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {STICKY_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleColorChange(c.id)}
                  className="w-5 h-5 rounded-full cursor-pointer transition-transform hover:scale-125"
                  style={{
                    backgroundColor: c.text,
                    outline: c.id === colorId ? '2px solid white' : 'none',
                    outlineOffset: 1
                  }}
                  title={c.label}
                />
              ))}
            </div>
          )}
        </div>

        {/* 便签图标 */}
        <span className="text-[10px]" style={{ color: colorConfig.text, opacity: 0.6 }}>
          📌
        </span>
      </div>

      {/* 文字内容 */}
      <div className="flex-1 overflow-hidden">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') handleSave()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="nodrag nowheel w-full h-full resize-none outline-none bg-transparent text-sm leading-relaxed"
            style={{ color: 'var(--text-primary)' }}
            placeholder="双击编辑..."
          />
        ) : (
          <div
            className="w-full h-full text-sm leading-relaxed whitespace-pre-wrap break-words overflow-auto"
            style={{
              color: text ? 'var(--text-primary)' : 'var(--text-muted)',
              scrollbarWidth: 'none'
            }}
          >
            {text || '双击编辑...'}
          </div>
        )}
      </div>
    </div>
  )
})

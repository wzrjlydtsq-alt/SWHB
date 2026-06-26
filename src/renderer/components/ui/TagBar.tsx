import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useShallow } from 'zustand/react/shallow'
import { X, Plus, Tag } from 'lucide-react'

const DEFAULT_TAG_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316'
]

/**
 * 画布顶部标签筛选栏
 * 显示所有标签，点击筛选/高亮
 */
export const TagBar = memo(function TagBar() {
  const { tags, activeTagFilter, setActiveTagFilter, addTag, removeTag } = useAppStore(
    useShallow((s) => ({
      tags: s.tags || [],
      activeTagFilter: s.activeTagFilter,
      setActiveTagFilter: s.setActiveTagFilter,
      addTag: s.addTag,
      removeTag: s.removeTag
    }))
  )

  const [showAddInput, setShowAddInput] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (showAddInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showAddInput])

  const handleAddTag = useCallback(() => {
    if (newTagName.trim()) {
      addTag(newTagName.trim())
      setNewTagName('')
      setShowAddInput(false)
    }
  }, [newTagName, addTag])

  const handleTagClick = useCallback(
    (tagId) => {
      if (activeTagFilter === tagId) {
        setActiveTagFilter(null) // 取消筛选
      } else {
        setActiveTagFilter(tagId)
      }
    },
    [activeTagFilter, setActiveTagFilter]
  )

  // 没有标签也不显示（只有 + 按钮）
  if (tags.length === 0 && !showAddInput) {
    return null
  }

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all duration-300"
      style={{
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <Tag size={13} style={{ color: 'var(--text-muted)' }} />

      {/* 标签列表 */}
      {tags.map((tag) => (
        <button
          key={tag.id}
          onClick={() => handleTagClick(tag.id)}
          className="group/tag flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all duration-150"
          style={{
            backgroundColor: activeTagFilter === tag.id ? `${tag.color}30` : 'transparent',
            color: activeTagFilter === tag.id ? tag.color : 'var(--text-secondary)',
            border:
              activeTagFilter === tag.id ? `1px solid ${tag.color}50` : '1px solid transparent'
          }}
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: tag.color }}
          />
          {tag.name}
          {/* 删除按钮 */}
          <span
            className="opacity-0 group-hover/tag:opacity-100 cursor-pointer transition-opacity ml-0.5"
            onClick={(e) => {
              e.stopPropagation()
              if (activeTagFilter === tag.id) setActiveTagFilter(null)
              removeTag(tag.id)
            }}
          >
            <X size={10} />
          </span>
        </button>
      ))}

      {/* 分隔线 */}
      {tags.length > 0 && (
        <div className="w-px h-3" style={{ backgroundColor: 'var(--border-subtle)' }} />
      )}

      {/* 添加标签 */}
      {showAddInput ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') handleAddTag()
              if (e.key === 'Escape') {
                setShowAddInput(false)
                setNewTagName('')
              }
            }}
            onBlur={() => {
              if (newTagName.trim()) handleAddTag()
              else {
                setShowAddInput(false)
                setNewTagName('')
              }
            }}
            placeholder="标签名..."
            className="text-[11px] px-1.5 py-0.5 rounded w-16 outline-none"
            style={{
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--primary-color)'
            }}
          />
        </div>
      ) : (
        <button
          onClick={() => setShowAddInput(true)}
          className="p-0.5 rounded-md transition-colors"
          style={{ color: 'var(--text-muted)' }}
          title="添加标签"
        >
          <Plus size={13} />
        </button>
      )}

      {/* 清除筛选 */}
      {activeTagFilter && (
        <>
          <div className="w-px h-3" style={{ backgroundColor: 'var(--border-subtle)' }} />
          <button
            onClick={() => setActiveTagFilter(null)}
            className="text-[10px] px-1.5 py-0.5 rounded-md transition-colors"
            style={{
              color: 'var(--text-muted)',
              backgroundColor: 'var(--bg-hover)'
            }}
          >
            清除筛选
          </button>
        </>
      )}
    </div>
  )
})

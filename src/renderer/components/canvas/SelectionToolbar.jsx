import { memo, useMemo, useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore.js'
import { useShallow } from 'zustand/react/shallow'
import { Group, Ungroup, EyeOff, Eye } from 'lucide-react'
import { useCanvasContext } from '../../contexts/CanvasContext.jsx'

export const SelectionToolbar = memo(function SelectionToolbar() {
  const {
    selectedNodeIds,
    nodes,
    nodeGroups,
    createGroup,
    removeGroup,
    renameGroup,
    view
  } = useAppStore(
    useShallow((state) => ({
      selectedNodeIds: state.selectedNodeIds,
      nodes: state.nodes,
      nodeGroups: state.nodeGroups,
      createGroup: state.createGroup,
      removeGroup: state.removeGroup,
      renameGroup: state.renameGroup,
      view: state.view
    }))
  )

  const { updateNodeSettings } = useCanvasContext()
  const setConnections = useAppStore((s) => s.setConnections)

  const [editingGroupId, setEditingGroupId] = useState(null)
  const [editName, setEditName] = useState('')
  const nameInputRef = useRef(null)

  useEffect(() => {
    if (editingGroupId && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editingGroupId])

  const selectedIds = useMemo(() => Array.from(selectedNodeIds), [selectedNodeIds])

  // 不显示条件：选中少于2个节点
  if (selectedIds.length < 2) return null

  // 计算选中节点的边界框（世界坐标）
  const selectedNodes = nodes.filter((n) => selectedNodeIds.has(n.id))
  if (selectedNodes.length < 2) return null

  let minX = Infinity, maxX = -Infinity, minY = Infinity
  for (const n of selectedNodes) {
    const nx = n.x ?? n.position?.x ?? 0
    const ny = n.y ?? n.position?.y ?? 0
    const nw = n.width || 300
    if (nx < minX) minX = nx
    if (nx + nw > maxX) maxX = nx + nw
    if (ny < minY) minY = ny
  }

  // 工具栏在选区上方中心（世界坐标 → 屏幕坐标）
  const centerX = (minX + maxX) / 2
  const screenX = centerX * view.zoom + view.x
  const screenY = minY * view.zoom + view.y - 50

  // 检查选中节点是否已在同一个组
  const existingGroup = nodeGroups.find((g) => {
    return selectedIds.every((id) => g.nodeIds.includes(id))
  })

  // 检查选中节点中是否有任何已收纳的
  const allCollapsed = selectedNodes.every((n) => n.settings?.outputCollapsed)

  const handleToggleCollapse = (e) => {
    e.stopPropagation()
    e.preventDefault()
    const newCollapsed = !allCollapsed
    for (const id of selectedIds) {
      updateNodeSettings(id, { outputCollapsed: newCollapsed })
    }
    // 刷新 edges hidden 状态
    setTimeout(() => {
      setConnections((prev) => [...prev])
    }, 50)
  }

  const handleCreateGroup = (e) => {
    e.stopPropagation()
    e.preventDefault()
    // 如果已有组包含部分选中节点，先移除
    createGroup(selectedIds)
  }

  const handleRemoveGroup = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (existingGroup) {
      removeGroup(existingGroup.id)
    }
  }

  const handleStartRename = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (existingGroup) {
      setEditingGroupId(existingGroup.id)
      setEditName(existingGroup.name)
    }
  }

  const handleSaveRename = () => {
    if (editingGroupId && editName.trim()) {
      renameGroup(editingGroupId, editName.trim())
    }
    setEditingGroupId(null)
  }

  return (
    <div
      className="fixed z-[9999] pointer-events-auto"
      style={{
        left: screenX,
        top: Math.max(8, screenY),
        transform: 'translateX(-50%)'
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--bg-panel)]/95 backdrop-blur-md border border-[var(--border-color)] shadow-xl">
        {/* 收纳输出按钮 */}
        <button
          onClick={handleToggleCollapse}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
            allCollapsed
              ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          }`}
          title={allCollapsed ? '展开输出' : '收纳输出'}
        >
          {allCollapsed ? <Eye size={13} /> : <EyeOff size={13} />}
          <span>{allCollapsed ? '展开' : '收纳'}</span>
        </button>

        <div className="w-px h-4 bg-[var(--border-color)]" />

        {/* 编组 / 解散组 */}
        {existingGroup ? (
          <div className="flex items-center gap-1">
            {editingGroupId === existingGroup.id ? (
              <input
                ref={nameInputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveRename}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') handleSaveRename()
                  if (e.key === 'Escape') setEditingGroupId(null)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="nodrag text-[11px] font-mono bg-[var(--bg-base)] border border-[var(--primary-color)] rounded px-1.5 py-0.5 outline-none text-[var(--text-primary)] w-20"
              />
            ) : (
              <span
                className="text-[11px] font-medium px-1.5 py-0.5 rounded cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                style={{ color: existingGroup.color }}
                onDoubleClick={handleStartRename}
                title="双击编辑组名"
              >
                {existingGroup.name}
              </span>
            )}
            <button
              onClick={handleRemoveGroup}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-red-400 hover:bg-red-500/15 transition-all"
              title="解散组"
            >
              <Ungroup size={13} />
              <span>解散</span>
            </button>
          </div>
        ) : (
          <button
            onClick={handleCreateGroup}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-all"
            title="编组"
          >
            <Group size={13} />
            <span>编组</span>
          </button>
        )}
      </div>
    </div>
  )
})

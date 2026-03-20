import { memo, useMemo, useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore.js'
import { useShallow } from 'zustand/react/shallow'

export const GroupLayer = memo(function GroupLayer() {
  const { nodeGroups, nodesMap, renameGroup } = useAppStore(
    useShallow((state) => ({
      nodeGroups: state.nodeGroups,
      nodesMap: state.nodesMap,
      renameGroup: state.renameGroup
    }))
  )

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  // Build a position-only fingerprint to avoid recalc when only settings/content change
  const positionFingerprint = useMemo(() => {
    if (nodeGroups.length === 0) return ''
    const allIds = new Set()
    for (const g of nodeGroups) {
      for (const id of g.nodeIds) allIds.add(id)
    }
    let fp = ''
    for (const id of allIds) {
      const n = nodesMap.get(id)
      if (n) {
        fp += `${id}:${n.x ?? n.position?.x ?? 0},${n.y ?? n.position?.y ?? 0},${n.width || 300},${n.height || 200};`
      }
    }
    return fp
  }, [nodeGroups, nodesMap])

  const groupBounds = useMemo(() => {
    return nodeGroups.map((group) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      let valid = false

      for (const nodeId of group.nodeIds) {
        const node = nodesMap.get(nodeId)
        if (!node) continue
        valid = true
        const nx = node.x ?? node.position?.x ?? 0
        const ny = node.y ?? node.position?.y ?? 0
        const nw = node.width || 300
        const nh = node.height || 200
        if (nx < minX) minX = nx
        if (ny < minY) minY = ny
        if (nx + nw > maxX) maxX = nx + nw
        if (ny + nh > maxY) maxY = ny + nh
      }

      if (!valid) return null

      const pad = 16
      return {
        ...group,
        x: minX - pad,
        y: minY - pad - 22,
        w: maxX - minX + pad * 2,
        h: maxY - minY + pad * 2 + 22
      }
    }).filter(Boolean)
  }, [nodeGroups, positionFingerprint])

  if (groupBounds.length === 0) return null

  const saveName = () => {
    if (editingId && editName.trim()) {
      renameGroup(editingId, editName.trim())
    }
    setEditingId(null)
  }

  return (
    <>
      {groupBounds.map((g) => (
        <div
          key={g.id}
          className="absolute pointer-events-none"
          style={{
            left: g.x,
            top: g.y,
            width: g.w,
            height: g.h,
            borderRadius: 12,
            border: `2px dashed ${g.color}99`,
            backgroundColor: `${g.color}1A`
          }}
        >
          {/* 组名标签 */}
          <div
            className="absolute pointer-events-auto"
            style={{
              top: 4,
              left: 10,
              zIndex: 2
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {editingId === g.id ? (
              <input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') saveName()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                className="nodrag text-[10px] font-medium bg-[var(--bg-base)] border rounded px-1.5 py-0.5 outline-none text-[var(--text-primary)] w-20"
                style={{ borderColor: g.color }}
              />
            ) : (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer select-none transition-colors"
                style={{
                  color: g.color,
                  backgroundColor: `${g.color}15`
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  setEditingId(g.id)
                  setEditName(g.name)
                }}
                title="双击编辑组名"
              >
                {g.name}
              </span>
            )}
          </div>
        </div>
      ))}
    </>
  )
})

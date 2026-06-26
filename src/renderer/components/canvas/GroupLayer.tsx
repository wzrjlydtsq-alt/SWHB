import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { FolderArchive, Maximize2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store/useAppStore.ts'

function getNodePosition(node) {
  const position = node?.position || { x: node?.x || 0, y: node?.y || 0 }
  return {
    x: Number(position.x) || 0,
    y: Number(position.y) || 0
  }
}

function resetDragElement(element) {
  if (!element) return
  element.style.transform = ''
  element.style.willChange = ''
}

export const GroupLayer = memo(function GroupLayer() {
  const { nodeGroups, nodesMap, renameGroup, setGroupCollapsed, setNodes, view } = useAppStore(
    useShallow((state) => ({
      nodeGroups: state.nodeGroups || [],
      nodesMap: state.nodesMap,
      renameGroup: state.renameGroup,
      setGroupCollapsed: state.setGroupCollapsed,
      setNodes: state.setNodes,
      view: state.view
    }))
  )

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef(null)
  const dragRef = useRef(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const positionFingerprint = useMemo(() => {
    if (!nodeGroups.length) return ''
    const allIds = new Set<string>()
    for (const group of nodeGroups) {
      for (const id of group.nodeIds || []) allIds.add(id)
    }

    let fingerprint = ''
    for (const id of allIds) {
      const node = nodesMap.get(id)
      if (!node) continue
      const position = getNodePosition(node)
      fingerprint += `${id}:${position.x},${position.y},${node.width || 300},${node.height || 200};`
    }
    return fingerprint
  }, [nodeGroups, nodesMap])

  const groupBounds = useMemo(() => {
    return nodeGroups
      .map((group) => {
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        let valid = false

        for (const nodeId of group.nodeIds || []) {
          const node = nodesMap.get(nodeId)
          if (!node) continue
          valid = true
          const position = getNodePosition(node)
          const width = node.width || 300
          const height = node.height || 200
          minX = Math.min(minX, position.x)
          minY = Math.min(minY, position.y)
          maxX = Math.max(maxX, position.x + width)
          maxY = Math.max(maxY, position.y + height)
        }

        if (!valid) return null

        const pad = 16
        return {
          ...group,
          x: minX - pad,
          y: minY - pad - 22,
          w: maxX - minX + pad * 2,
          h: maxY - minY + pad * 2 + 22,
          count: (group.nodeIds || []).length
        }
      })
      .filter(Boolean)
  }, [nodeGroups, nodesMap, positionFingerprint])

  if (groupBounds.length === 0) return null

  const startRename = (group) => {
    setEditingId(group.id)
    setEditName(group.name || '')
  }

  const saveName = () => {
    if (editingId && editName.trim()) {
      renameGroup(editingId, editName.trim())
    }
    setEditingId(null)
  }

  const startGroupDrag = (event, group) => {
    if (event.button !== 0 || editingId === group.id) return
    event.preventDefault()
    event.stopPropagation()

    const startNodes = new Map()
    for (const nodeId of group.nodeIds || []) {
      const node = nodesMap.get(nodeId)
      if (!node) continue
      startNodes.set(nodeId, getNodePosition(node))
    }

    if (startNodes.size === 0) return

    const target = event.currentTarget
    target.style.willChange = 'transform'
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      startNodes,
      target
    }
    target.setPointerCapture?.(event.pointerId)
  }

  const moveGroupDrag = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()

    const zoom = Math.max(0.05, view?.zoom || 1)
    const dx = (event.clientX - drag.startX) / zoom
    const dy = (event.clientY - drag.startY) / zoom
    if (Math.abs(dx - drag.dx) < 0.1 && Math.abs(dy - drag.dy) < 0.1) return

    drag.dx = dx
    drag.dy = dy
    drag.target.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
  }

  const endGroupDrag = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    resetDragElement(drag.target)
    dragRef.current = null

    const { dx, dy, startNodes } = drag
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return

    setNodes((prev) =>
      prev.map((node) => {
        const start = startNodes.get(node.id)
        if (!start) return node
        const position = {
          x: start.x + dx,
          y: start.y + dy
        }
        return {
          ...node,
          position,
          x: position.x,
          y: position.y
        }
      })
    )
  }

  return (
    <>
      {groupBounds.map((group) => {
        if (group.collapsed) {
          return (
            <div
              key={group.id}
              className="canvas-group-folder nodrag nowheel"
              style={{
                left: group.x,
                top: group.y,
                borderColor: `${group.color}66`,
                backgroundColor: `${group.color}22`
              }}
              onPointerDown={(event) => startGroupDrag(event, group)}
              onPointerMove={moveGroupDrag}
              onPointerUp={endGroupDrag}
              onPointerCancel={endGroupDrag}
              title="拖动文件夹移动整组"
            >
              <div className="canvas-group-folder__icon" style={{ color: group.color }}>
                <FolderArchive size={20} />
              </div>
              <div className="canvas-group-folder__body">
                {editingId === group.id ? (
                  <input
                    ref={inputRef}
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    onBlur={saveName}
                    onPointerDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Enter') saveName()
                      if (event.key === 'Escape') setEditingId(null)
                    }}
                    className="canvas-group-folder__name-input nodrag"
                    aria-label="组名"
                  />
                ) : (
                  <div
                    className="canvas-group-folder__name"
                    onPointerDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      startRename(group)
                    }}
                    title="双击重命名"
                  >
                    {group.name || '未命名组'}
                  </div>
                )}
                <div className="canvas-group-folder__meta">{group.count} 个节点</div>
              </div>
              <button
                className="canvas-group-folder__expand"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setGroupCollapsed(group.id, false)
                }}
                title="展开"
              >
                <Maximize2 size={13} />
              </button>
            </div>
          )
        }

        return (
          <div
            key={group.id}
            className="canvas-group-box nodrag nowheel"
            style={{
              left: group.x,
              top: group.y,
              width: group.w,
              height: group.h,
              borderColor: `${group.color}99`,
              backgroundColor: `${group.color}1A`
            }}
            onPointerDown={(event) => startGroupDrag(event, group)}
            onPointerMove={moveGroupDrag}
            onPointerUp={endGroupDrag}
            onPointerCancel={endGroupDrag}
            title="拖动空白区域移动整组"
          >
            <div
              className="absolute pointer-events-auto"
              style={{
                top: 4,
                left: 10,
                zIndex: 2
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {editingId === group.id ? (
                <input
                  ref={inputRef}
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  onBlur={saveName}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === 'Enter') saveName()
                    if (event.key === 'Escape') setEditingId(null)
                  }}
                  className="nodrag text-[10px] font-medium bg-[var(--bg-base)] border rounded px-1.5 py-0.5 outline-none text-[var(--text-primary)] w-20"
                  style={{ borderColor: group.color }}
                />
              ) : (
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer select-none transition-colors"
                  style={{
                    color: group.color,
                    backgroundColor: `${group.color}15`
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    startRename(group)
                  }}
                  title="双击编辑组名"
                >
                  {group.name || '未命名组'}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
})

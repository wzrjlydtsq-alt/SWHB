import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react'
import { getNodeConfig } from '../../utils/nodeRegistry.ts'
import { reconcileGenerationNodeStatus } from '../../utils/generationStatus.ts'

const canvasNodeSaveTimers = new Map()

function debouncedPersistCanvasNode(node, projectId) {
  if (!window.dbAPI?.nodes?.save || !projectId || !node?.id) return

  if (canvasNodeSaveTimers.has(node.id)) {
    clearTimeout(canvasNodeSaveTimers.get(node.id))
  }

  const timer = setTimeout(() => {
    window.dbAPI.nodes.save(node, projectId).catch(console.error)
    canvasNodeSaveTimers.delete(node.id)
  }, 180)

  canvasNodeSaveTimers.set(node.id, timer)
}

// 杈呭姪锛氭爣鍑嗗寲鑺傜偣 position/x/y 鍚屾锛堝箓绛夆€斺€斾笉蹇呰鏃朵笉鍒涘缓鏂板紩鐢級
function getNodeDragHandle(nodeType) {
  return nodeType === 'director-node' || nodeType === 'director-stage'
    ? '.node-drag-handle'
    : undefined
}

const KNOWN_NODE_TYPES = new Set([
  'gen-image',
  'gen-video',
  'novel-input',
  'agent-node',
  'director-node',
  'director-stage',
  'sticky-note'
])

const LEGACY_NODE_TYPE_MAP = {
  image: 'gen-image',
  video: 'gen-video',
  text: 'sticky-note',
  note: 'sticky-note',
  sticky: 'sticky-note',
  agent: 'agent-node',
  director: 'director-node'
}

function asPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

function parseSettings(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return asPlainObject(parsed)
    } catch {
      return {}
    }
  }
  return {}
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeNodeType(type) {
  const raw = typeof type === 'string' ? type.trim() : ''
  const mapped = LEGACY_NODE_TYPE_MAP[raw] || raw
  return KNOWN_NODE_TYPES.has(mapped) ? mapped : 'sticky-note'
}

function normalizeNode(n, index = 0) {
  if (!n || typeof n !== 'object') return null
  const type = normalizeNodeType(n.type || n.nodeType || n.kind)
  const posSource = asPlainObject(n.position)
  const x = finiteNumber(posSource.x ?? n.x, 80 + index * 24)
  const y = finiteNumber(posSource.y ?? n.y, 80 + index * 24)
  const hasSyncedPosition =
    n.position &&
    typeof n.position === 'object' &&
    Number(n.position.x) === x &&
    Number(n.position.y) === y
  const pos = hasSyncedPosition ? n.position : { x, y }
  const id = typeof n.id === 'string' && n.id.trim() ? n.id : `legacy-node-${Date.now()}-${index}`
  const settings = parseSettings(n.settings)
  const data = asPlainObject(n.data)
  const dragHandle = getNodeDragHandle(type)
  const needsUpdate =
    n.id !== id ||
    n.type !== type ||
    !hasSyncedPosition ||
    n.x !== pos.x ||
    n.y !== pos.y ||
    n.settings !== settings ||
    n.data !== data ||
    n.dragHandle !== dragHandle
  if (!needsUpdate) return n
  const normalized = {
    ...n,
    id,
    type,
    position: pos,
    x: pos.x,
    y: pos.y,
    data,
    settings,
    dragHandle
  }
  if (n.width !== undefined) normalized.width = finiteNumber(n.width, undefined)
  if (n.height !== undefined) normalized.height = finiteNumber(n.height, undefined)
  return normalized
}

// 杈呭姪锛氫粠鑺傜偣鏁扮粍鏋勫缓 Map
function buildNodesMap(nodes) {
  const map = new Map()
  for (let i = 0; i < nodes.length; i++) {
    map.set(nodes[i].id, nodes[i])
  }
  return map
}

function buildNodeIndexMap(nodes) {
  const map = new Map()
  for (let i = 0; i < nodes.length; i++) {
    map.set(nodes[i].id, i + 1)
  }
  return map
}

function buildNodeGroupMap(groups) {
  const map = new Map()
  const safeGroups = Array.isArray(groups) ? groups : []
  for (const group of safeGroups) {
    const ids = Array.isArray(group?.nodeIds) ? group.nodeIds : []
    for (const nodeId of ids) {
      map.set(nodeId, group)
    }
  }
  return map
}

function getNodePosition(node) {
  const position = node?.position || { x: node?.x || 0, y: node?.y || 0 }
  return {
    x: Number(position.x) || 0,
    y: Number(position.y) || 0
  }
}

function expandGroupedPositionChanges(changes, state) {
  if (!Array.isArray(changes) || changes.length === 0) return changes
  if (!state.nodeGroupMap || state.nodeGroupMap.size === 0) return changes
  const selectedNodeIds = state.selectedNodeIds instanceof Set ? state.selectedNodeIds : new Set()
  if (selectedNodeIds.size < 2) return changes

  const positionChangeIds = new Set()
  const groupMoves = new Map()

  for (const change of changes) {
    if (change?.type !== 'position' || !change.id || !change.position) continue
    positionChangeIds.add(change.id)

    const group = state.nodeGroupMap.get(change.id)
    if (!group || !Array.isArray(group.nodeIds) || group.nodeIds.length < 2) continue
    if (!group.nodeIds.every((nodeId) => selectedNodeIds.has(nodeId))) continue

    const sourceNode = state.nodesMap.get(change.id)
    if (!sourceNode) continue

    const sourcePos = getNodePosition(sourceNode)
    const dx = (Number(change.position.x) || 0) - sourcePos.x
    const dy = (Number(change.position.y) || 0) - sourcePos.y
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) continue

    groupMoves.set(group.id, {
      group,
      dx,
      dy,
      dragging: change.dragging
    })
  }

  if (groupMoves.size === 0) return changes

  const expanded = [...changes]
  for (const { group, dx, dy, dragging } of groupMoves.values()) {
    for (const nodeId of group.nodeIds) {
      if (positionChangeIds.has(nodeId)) continue
      const node = state.nodesMap.get(nodeId)
      if (!node) continue
      const position = getNodePosition(node)
      expanded.push({
        id: nodeId,
        type: 'position',
        position: {
          x: position.x + dx,
          y: position.y + dy
        },
        dragging
      })
      positionChangeIds.add(nodeId)
    }
  }

  return expanded
}

function buildNodesLayoutSignature(nodes) {
  let signature = ''
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const pos = node.position || { x: node.x || 0, y: node.y || 0 }
    const tags = Array.isArray(node.data?.tags) ? node.data.tags.join(',') : ''
    signature += `${node.id}:${node.type}:${pos.x}:${pos.y}:${node.width || ''}:${node.height || ''}:${node.hidden ? 1 : 0}:${node.selected ? 1 : 0}:${node.dragHandle || ''}:${tags};`
  }
  return signature
}

function getNodesStatePatch(state, normalized) {
  const reconciled = reconcileGenerationNodeStatus(normalized, state.history || [])
  if (Array.isArray(state.nodes) && state.nodes.length > 0 && reconciled.length === 0) {
    console.warn(
      `[CanvasGuard] nodes changed from ${state.nodes.length} to 0 via setNodes.`,
      new Error().stack
    )
  }
  const layoutSignature = buildNodesLayoutSignature(reconciled)
  const layoutChanged = state.nodesLayoutSignature !== layoutSignature
  const sameNodeRefs =
    Array.isArray(state.nodes) &&
    state.nodes.length === reconciled.length &&
    state.nodes.every((node, index) => node === reconciled[index])
  if (sameNodeRefs && !layoutChanged) return state
  return {
    nodes: reconciled,
    nodesMap: buildNodesMap(reconciled),
    nodeIndexMap: buildNodeIndexMap(reconciled),
    nodesLayoutSignature: layoutSignature,
    nodesLayoutVersion: layoutChanged
      ? (state.nodesLayoutVersion || 0) + 1
      : state.nodesLayoutVersion || 0
  }
}

function normalizeNodes(nodes) {
  if (!Array.isArray(nodes)) return []
  return nodes.map((node, index) => normalizeNode(node, index)).filter(Boolean)
}

function normalizeView(view) {
  if (!view || typeof view !== 'object') return { x: 0, y: 0, zoom: 1 }
  const zoom = finiteNumber(view.zoom, 1)
  return {
    ...view,
    x: finiteNumber(view.x, 0),
    y: finiteNumber(view.y, 0),
    zoom: Math.min(4, Math.max(0.05, zoom || 1))
  }
}

function areViewsEqual(a, b) {
  return (
    finiteNumber(a?.x, 0) === finiteNumber(b?.x, 0) &&
    finiteNumber(a?.y, 0) === finiteNumber(b?.y, 0) &&
    finiteNumber(a?.zoom, 1) === finiteNumber(b?.zoom, 1)
  )
}

function normalizeConnection(connection, index = 0, nodeIds = null) {
  if (!connection || typeof connection !== 'object') return null
  const from = String(
    connection.from || connection.source || connection.sourceId || connection.source_node_id || ''
  ).trim()
  const to = String(
    connection.to || connection.target || connection.targetId || connection.target_node_id || ''
  ).trim()
  if (!from || !to) return null
  if (nodeIds && (!nodeIds.has(from) || !nodeIds.has(to))) return null
  const id =
    typeof connection.id === 'string' && connection.id.trim()
      ? connection.id
      : `legacy-connection-${from}-${to}-${index}`
  return {
    ...connection,
    id,
    from,
    to,
    source: from,
    target: to,
    sourceHandle: connection.sourceHandle || 'default',
    targetHandle: connection.targetHandle || 'default'
  }
}

function normalizeConnections(connections, nodes = []) {
  if (!Array.isArray(connections)) return []
  const nodeIds = new Set((Array.isArray(nodes) ? nodes : []).map((node) => node.id))
  return connections
    .map((connection, index) => normalizeConnection(connection, index, nodeIds))
    .filter(Boolean)
}

function doesSettingsPatchChange(settings = {}, patch = {}) {
  const keys = Object.keys(patch)
  if (keys.length === 0) return false
  return keys.some((key) => settings?.[key] !== patch[key])
}

export const createCanvasSlice = (set, get) => ({
  // Canvas View
  view: { x: 0, y: 0, zoom: 1 },
  setView: (viewOrFn) => {
    set((state) => {
      const nextView = normalizeView(
        typeof viewOrFn === 'function' ? viewOrFn(state.view) : viewOrFn
      )
      return areViewsEqual(state.view, nextView) ? state : { view: nextView }
    })
  },

  // Nodes & Connections
  nodes: [],
  nodesMap: new Map(),
  nodeIndexMap: new Map(),
  nodesLayoutSignature: '',
  nodesLayoutVersion: 0,
  setNodes: (nodesOrFn) => {
    if (typeof nodesOrFn === 'function') {
      set((state) => {
        const raw = nodesOrFn(state.nodes)
        const normalized = normalizeNodes(raw)
        return getNodesStatePatch(state, normalized)
      })
    } else {
      set((state) => {
        const normalized = normalizeNodes(nodesOrFn)
        return getNodesStatePatch(state, normalized)
      })
    }
  },

  // 鍘熷瓙绾ц妭鐐?settings 鏇存柊锛氶伩鍏嶅叏閲?nodes.map + nodesMap 閲嶅缓
  updateNodeSettingsById: (nodeId, newSettings) => {
    set((state) => {
      const idx = state.nodes.findIndex((n) => n.id === nodeId)
      if (idx === -1) return state
      const oldNode = state.nodes[idx]
      if (!doesSettingsPatchChange(oldNode.settings, newSettings)) return state
      const updatedNode = {
        ...oldNode,
        settings: { ...oldNode.settings, ...newSettings }
      }
      const nextNodes = [...state.nodes]
      nextNodes[idx] = updatedNode
      const nextMap = new Map(state.nodesMap)
      nextMap.set(nodeId, updatedNode)
      return { nodes: nextNodes, nodesMap: nextMap }
    })
  },

  // RAF 鎵瑰鐞嗭細灏嗗悓涓€甯у唴鐨勫娆?onNodesChange 鍚堝苟涓轰竴娆?set()
  _pendingChanges: null,
  _changeRaf: null,

  onNodesChange: (changes) => {
    // 绱Н鍙樻洿
    const state = get()
    if (!state._pendingChanges) {
      state._pendingChanges = changes
    } else {
      state._pendingChanges = state._pendingChanges.concat(changes)
    }

    // 涓嬩竴甯х粺涓€澶勭悊
    if (!state._changeRaf) {
      set({
        _changeRaf: requestAnimationFrame(() => {
          const current = get()
          const allChanges = expandGroupedPositionChanges(current._pendingChanges, current)
          if (!allChanges || allChanges.length === 0) {
            set({ _pendingChanges: null, _changeRaf: null })
            return
          }

          const prev = current.nodes
          const prevMap = current.nodesMap
          const changesForApply = allChanges.map((change) => {
            if (change?.type !== 'replace' || !change.id || !change.item) return change
            const previousNode = prevMap.get(change.id)
            if (!previousNode) return change
            return {
              ...change,
              item: {
                ...previousNode,
                ...change.item,
                data: previousNode.data || change.item.data || {},
                settings: previousNode.settings,
                content: previousNode.content
              }
            }
          })
          const updated = applyNodeChanges(changesForApply, prev)
          const removeChanges = changesForApply.filter((change) => change?.type === 'remove')
          if (prev.length > 0 && updated.length === 0 && removeChanges.length >= prev.length) {
            console.warn(
              `[CanvasGuard] Blocked ReactFlow remove-all change for ${prev.length} nodes.`,
              removeChanges
            )
            set({ _pendingChanges: null, _changeRaf: null })
            return
          }
          const dirtyNodeIds = new Set()

          for (let i = 0; i < changesForApply.length; i++) {
            const change = changesForApply[i]
            if (!change?.id) continue
            if (
              change.type === 'position' ||
              change.type === 'dimensions' ||
              change.type === 'replace'
            ) {
              dirtyNodeIds.add(change.id)
            }
          }

          // Fast path: identify when all changes are simple position updates.
          const positionChangeIds = new Set()
          for (let i = 0; i < changesForApply.length; i++) {
            const c = changesForApply[i]
            if (c.type === 'position' && c.position) {
              positionChangeIds.add(c.id)
            }
          }

          let result, newMap
          if (positionChangeIds.size > 0 && positionChangeIds.size === changesForApply.length) {
            result = new Array(updated.length)
            newMap = new Map(prevMap)
            for (let i = 0; i < updated.length; i++) {
              const n = updated[i] as any
              if (positionChangeIds.has(n.id)) {
                const pos = n.position || { x: n.x || 0, y: n.y || 0 }
                const updatedNode = { ...n, position: pos, x: pos.x, y: pos.y }
                result[i] = updatedNode
                newMap.set(n.id, updatedNode)
              } else {
                result[i] = prev[i] !== undefined && prev[i].id === n.id ? prev[i] : n
              }
            }
          } else {
            // 浠呭瀹為檯鍙樻洿鐨勮妭鐐瑰垱寤烘柊寮曠敤锛屼繚鐣欐湭鍙樻洿鑺傜偣鐨勫師濮嬪紩鐢?            // 閬垮厤 ReactFlow 璇 replace 宸紓瀵艰嚧鏃犻檺寰幆
            let hasRealChange = false
            result = updated.map((n, i) => {
              const nextNode = n as any
              const pos = nextNode.position || { x: nextNode.x || 0, y: nextNode.y || 0 }
              // Check whether the node actually changed before replacing the reference
              if (n === prev[i]) return n
              hasRealChange = true
              if (nextNode.position === pos && nextNode.x === pos.x && nextNode.y === pos.y)
                return nextNode
              return { ...nextNode, position: pos, x: pos.x, y: pos.y }
            })
            // Keep the previous array reference when React Flow reports no actual node changes
            if (!hasRealChange) {
              set({ _pendingChanges: null, _changeRaf: null })
              return
            }
            newMap = buildNodesMap(result)
          }

          if (dirtyNodeIds.size > 0) {
            const projectId = current.currentProject?.id
            dirtyNodeIds.forEach((nodeId) => {
              const dirtyNode = newMap.get(nodeId)
              if (dirtyNode) {
                debouncedPersistCanvasNode(dirtyNode, projectId)
              }
            })
          }

          const layoutSignature = buildNodesLayoutSignature(result)
          const layoutChanged = current.nodesLayoutSignature !== layoutSignature

          set({
            nodes: result,
            nodesMap: newMap,
            nodeIndexMap: buildNodeIndexMap(result),
            nodesLayoutSignature: layoutSignature,
            nodesLayoutVersion: layoutChanged
              ? (current.nodesLayoutVersion || 0) + 1
              : current.nodesLayoutVersion || 0,
            _pendingChanges: null,
            _changeRaf: null
          })
        })
      })
    }
  },

  edges: [],
  setEdges: (edges) => set({ edges }),
  onEdgesChange: (changes) => {
    set((state) => {
      const newEdges = applyEdgeChanges(changes, state.edges)
      const removedIds = changes.filter((c) => c.type === 'remove').map((c) => c.id)

      if (removedIds.length > 0) {
        return {
          edges: newEdges,
          connections: state.connections.filter((c) => !removedIds.includes(c.id))
        }
      }
      return { edges: newEdges }
    })
  },
  onConnect: (connection) => {
    set((state) => {
      let resolvedTargetHandle = connection.targetHandle
      if (!resolvedTargetHandle || resolvedTargetHandle === 'default') {
        const targetNode = state.nodes.find((n) => n.id === connection.target)
        if (targetNode) {
          const config = getNodeConfig(targetNode.type)
          if (config.inputCount === 2) {
            resolvedTargetHandle = 'input1'
          } else {
            resolvedTargetHandle = 'default'
          }
        } else {
          resolvedTargetHandle = 'default'
        }
      }

      const newEdge = { ...connection, type: 'customedge', targetHandle: resolvedTargetHandle }
      const newEdges = addEdge(newEdge, state.edges)

      // Sync back to connections array for DAG engine
      const newConn = {
        id: newEdge.id || `reactflow__edge-${connection.source}-${connection.target}`,
        source: connection.source,
        target: connection.target,
        from: connection.source,
        to: connection.target,
        sourceHandle: connection.sourceHandle || 'default',
        targetHandle: resolvedTargetHandle
      }

      return {
        edges: newEdges,
        connections: [...state.connections, newConn]
      }
    })
  },

  connections: [],
  setConnections: (connectionsOrFn) => {
    const resolveEdgesFromConns = (conns, nodes) => {
      const nodesLookup = new Map()
      for (const n of nodes) nodesLookup.set(n.id, n)

      return conns.map((c) => {
        let resolvedTargetHandle = c.targetHandle
        if (!resolvedTargetHandle || resolvedTargetHandle === 'default') {
          const targetNode = nodesLookup.get(c.to || c.target)
          if (targetNode) {
            const config = getNodeConfig(targetNode.type)
            if (config.inputCount === 2) {
              resolvedTargetHandle = 'input1'
            } else {
              resolvedTargetHandle = 'default'
            }
          } else {
            resolvedTargetHandle = 'default'
          }
        }

        // Hide connections when the source node collapses its output area.
        const sourceNode = nodesLookup.get(c.from || '')
        const isHidden = sourceNode?.settings?.outputCollapsed || false

        return {
          id: c.id,
          source: c.from || '',
          target: c.to || '',
          sourceHandle: c.sourceHandle || 'default',
          targetHandle: resolvedTargetHandle,
          selected: false,
          hidden: isHidden,
          style: { stroke: 'transparent', strokeWidth: 20 }
        }
      })
    }

    if (typeof connectionsOrFn === 'function') {
      set((state) => {
        const newConns = connectionsOrFn(state.connections)
        const normalizedConns = normalizeConnections(newConns, state.nodes)
        const newEdges = resolveEdgesFromConns(normalizedConns, state.nodes)
        return { connections: normalizedConns, edges: newEdges }
      })
    } else {
      set((state) => {
        const normalizedConns = normalizeConnections(connectionsOrFn, state.nodes)
        const newEdges = resolveEdgesFromConns(normalizedConns, state.nodes)
        return { connections: normalizedConns, edges: newEdges }
      })
    }
  },

  // Ephemeral Canvas State
  selectedNodeIds: new Set(),
  setSelectedNodeIds: (idsOrFn) => {
    if (typeof idsOrFn === 'function') {
      set((state) => ({ selectedNodeIds: idsOrFn(state.selectedNodeIds) }))
    } else {
      set({ selectedNodeIds: idsOrFn })
    }
  },
  selectedNodeId: null,
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  dragNodeId: null,
  setDragNodeId: (dragNodeId) =>
    set((state) => (state.dragNodeId === dragNodeId ? state : { dragNodeId })),
  hoverTargetId: null,
  setHoverTargetId: (hoverTargetId) => set({ hoverTargetId }),
  connectingSource: null,
  setConnectingSource: (connectingSource) => set({ connectingSource }),
  connectingTarget: null,
  setConnectingTarget: (connectingTarget) => set({ connectingTarget }),
  connectingInputType: null,
  setConnectingInputType: (connectingInputType) => set({ connectingInputType }),
  isPanning: false,
  setIsPanning: (isPanning) =>
    set((state) => (state.isPanning === isPanning ? state : { isPanning })),
  isDragging: false,
  setIsDragging: (isDragging) =>
    set((state) => (state.isDragging === isDragging ? state : { isDragging })),
  resizingNodeId: null,
  setResizingNodeId: (resizingNodeId) =>
    set((state) => (state.resizingNodeId === resizingNodeId ? state : { resizingNodeId })),
  mousePos: { x: 0, y: 0 },
  setMousePos: (mousePos) => set({ mousePos }),
  isSelecting: false,
  setIsSelecting: (isSelecting) =>
    set((state) => (state.isSelecting === isSelecting ? state : { isSelecting })),
  selectionBox: null,
  setSelectionBox: (selectionBoxOrFn) => {
    if (typeof selectionBoxOrFn === 'function') {
      set((state) => {
        const nextSelectionBox = selectionBoxOrFn(state.selectionBox)
        return state.selectionBox === nextSelectionBox ? state : { selectionBox: nextSelectionBox }
      })
    } else {
      set((state) =>
        state.selectionBox === selectionBoxOrFn ? state : { selectionBox: selectionBoxOrFn }
      )
    }
  },

  // Ephemeral Node Generation Timers
  nodeTimers: {},
  setNodeTimers: (nodeTimers) => set({ nodeTimers }),

  // Node Groups
  nodeGroups: [],
  nodeGroupMap: new Map(),
  setNodeGroups: (groups) => {
    const safeGroups = Array.isArray(groups) ? groups : []
    set({ nodeGroups: safeGroups, nodeGroupMap: buildNodeGroupMap(safeGroups) })
  },
  createGroup: (nodeIds, name) => {
    const uniqueNodeIds = Array.from(new Set(Array.isArray(nodeIds) ? nodeIds : [])).filter(Boolean)
    if (uniqueNodeIds.length < 2) return null
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']
    const existingGroups = Array.isArray(get().nodeGroups) ? get().nodeGroups : []
    const color = colors[existingGroups.length % colors.length]
    set((state) => {
      const selectedSet = new Set(uniqueNodeIds)
      const cleanedGroups = (Array.isArray(state.nodeGroups) ? state.nodeGroups : [])
        .map((group) => ({
          ...group,
          nodeIds: (Array.isArray(group.nodeIds) ? group.nodeIds : []).filter(
            (nodeId) => !selectedSet.has(nodeId)
          )
        }))
        .filter((group) => group.nodeIds.length >= 2)
      const nodeGroups = [
        ...cleanedGroups,
        {
          id: groupId,
          name: name || `组 ${existingGroups.length + 1}`,
          nodeIds: uniqueNodeIds,
          color,
          tags: [],
          collapsed: false,
          commonParams: {}
        }
      ]
      return { nodeGroups, nodeGroupMap: buildNodeGroupMap(nodeGroups) }
    })
    return groupId
  },
  removeGroup: (groupId) => {
    set((state) => {
      const nodeGroups = (Array.isArray(state.nodeGroups) ? state.nodeGroups : []).filter(
        (g) => g.id !== groupId
      )
      return { nodeGroups, nodeGroupMap: buildNodeGroupMap(nodeGroups) }
    })
  },
  renameGroup: (groupId, name) => {
    set((state) => {
      const nodeGroups = (Array.isArray(state.nodeGroups) ? state.nodeGroups : []).map((g) =>
        g.id === groupId ? { ...g, name } : g
      )
      return { nodeGroups, nodeGroupMap: buildNodeGroupMap(nodeGroups) }
    })
  },
  getGroupForNode: (nodeId) => {
    return get().nodeGroupMap?.get(nodeId) || null
  },
  // 鍒嗙粍鎵╁睍锛氭姌鍙?灞曞紑
  toggleGroupCollapse: (groupId) => {
    set((state) => {
      const nodeGroups = (Array.isArray(state.nodeGroups) ? state.nodeGroups : []).map((g) =>
        g.id === groupId ? { ...g, collapsed: !g.collapsed } : g
      )
      return { nodeGroups, nodeGroupMap: buildNodeGroupMap(nodeGroups) }
    })
  },
  setGroupCollapsed: (groupId, collapsed) => {
    set((state) => {
      const nodeGroups = (Array.isArray(state.nodeGroups) ? state.nodeGroups : []).map((g) =>
        g.id === groupId ? { ...g, collapsed: Boolean(collapsed) } : g
      )
      return { nodeGroups, nodeGroupMap: buildNodeGroupMap(nodeGroups) }
    })
  },
  // 鍒嗙粍鎵╁睍锛氳缃€氱敤鍙傛暟
  setGroupCommonParams: (groupId, params) => {
    set((state) => {
      const nodeGroups = (Array.isArray(state.nodeGroups) ? state.nodeGroups : []).map((g) =>
        g.id === groupId ? { ...g, commonParams: { ...g.commonParams, ...params } } : g
      )
      return { nodeGroups, nodeGroupMap: buildNodeGroupMap(nodeGroups) }
    })
  },
  // Update the node list that belongs to a group.
  updateGroupNodeIds: (groupId, nodeIds) => {
    set((state) => {
      const nodeGroups = (Array.isArray(state.nodeGroups) ? state.nodeGroups : []).map((g) =>
        g.id === groupId ? { ...g, nodeIds: [...nodeIds] } : g
      )
      return { nodeGroups, nodeGroupMap: buildNodeGroupMap(nodeGroups) }
    })
  },
  // Attach a tag to a group.
  addGroupTag: (groupId, tagId) => {
    set((state) => {
      const nodeGroups = (Array.isArray(state.nodeGroups) ? state.nodeGroups : []).map((g) =>
        g.id === groupId && !g.tags?.includes(tagId)
          ? { ...g, tags: [...(g.tags || []), tagId] }
          : g
      )
      return { nodeGroups, nodeGroupMap: buildNodeGroupMap(nodeGroups) }
    })
  },

  // 鈺愨晲 鏍囩绯荤粺 鈺愨晲
  tags: [],
  setTags: (tags) => set({ tags }),
  activeTagFilter: null,
  setActiveTagFilter: (id) => set({ activeTagFilter: id }),
  addTag: (name) => {
    const tagColors = [
      '#3b82f6',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#ec4899',
      '#06b6d4',
      '#f97316'
    ]
    const existingTags = get().tags || []
    // Do not create duplicate tags.
    if (existingTags.some((t) => t.name === name)) return
    const color = tagColors[existingTags.length % tagColors.length]
    const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
    set({ tags: [...existingTags, { id: tagId, name, color }] })
  },
  removeTag: (tagId) => {
    set((state) => ({
      tags: (state.tags || []).filter((t) => t.id !== tagId),
      activeTagFilter: state.activeTagFilter === tagId ? null : state.activeTagFilter
    }))
  },
  // Add a tag to a node and store it in node.data.tags.
  addNodeTag: (nodeId, tagId) => {
    set((state) => {
      const idx = state.nodes.findIndex((n) => n.id === nodeId)
      if (idx === -1) return state
      const node = state.nodes[idx]
      const currentTags = node.data?.tags || []
      if (currentTags.includes(tagId)) return state
      const updatedNode = {
        ...node,
        data: { ...node.data, tags: [...currentTags, tagId] }
      }
      const nextNodes = [...state.nodes]
      nextNodes[idx] = updatedNode
      const nextMap = new Map(state.nodesMap)
      nextMap.set(nodeId, updatedNode)
      return { nodes: nextNodes, nodesMap: nextMap }
    })
  },
  removeNodeTag: (nodeId, tagId) => {
    set((state) => {
      const idx = state.nodes.findIndex((n) => n.id === nodeId)
      if (idx === -1) return state
      const node = state.nodes[idx]
      const currentTags = node.data?.tags || []
      if (!currentTags.includes(tagId)) return state
      const updatedNode = {
        ...node,
        data: { ...node.data, tags: currentTags.filter((t) => t !== tagId) }
      }
      const nextNodes = [...state.nodes]
      nextNodes[idx] = updatedNode
      const nextMap = new Map(state.nodesMap)
      nextMap.set(nodeId, updatedNode)
      return { nodes: nextNodes, nodesMap: nextMap }
    })
  },

  // 鈺愨晲 鎴浘鐘舵€?鈺愨晲
  screenshotMode: null, // null | 'full' | 'viewport' | 'selection'
  setScreenshotMode: (mode) => set({ screenshotMode: mode }),
  screenshotResult: null,
  setScreenshotResult: (result) => set({ screenshotResult: result })
})

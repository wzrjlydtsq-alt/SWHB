import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react'
import { getNodeConfig } from '../../utils/nodeRegistry.js'

// 辅助：标准化节点 position/x/y 同步
function normalizeNode(n) {
  const pos = n.position || { x: n.x || 0, y: n.y || 0 }
  return { ...n, position: pos, x: pos.x, y: pos.y, data: n.data || {} }
}

// 辅助：从节点数组构建 Map
function buildNodesMap(nodes) {
  const map = new Map()
  for (let i = 0; i < nodes.length; i++) {
    map.set(nodes[i].id, nodes[i])
  }
  return map
}

export const createCanvasSlice = (set, get) => ({
  // Canvas View
  view: { x: 0, y: 0, zoom: 1 },
  setView: (viewOrFn) => {
    if (typeof viewOrFn === 'function') {
      set((state) => ({ view: viewOrFn(state.view) }))
    } else {
      set({ view: viewOrFn })
    }
  },

  // Nodes & Connections
  nodes: [],
  nodesMap: new Map(),
  setNodes: (nodesOrFn) => {
    if (typeof nodesOrFn === 'function') {
      set((state) => {
        const raw = nodesOrFn(state.nodes)
        const normalized = raw.map(normalizeNode)
        return { nodes: normalized, nodesMap: buildNodesMap(normalized) }
      })
    } else {
      const normalized = nodesOrFn.map(normalizeNode)
      set({ nodes: normalized, nodesMap: buildNodesMap(normalized) })
    }
  },

  // 原子级节点 settings 更新：避免全量 nodes.map + nodesMap 重建
  updateNodeSettingsById: (nodeId, newSettings) => {
    set((state) => {
      const idx = state.nodes.findIndex((n) => n.id === nodeId)
      if (idx === -1) return null
      const oldNode = state.nodes[idx]
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

  // RAF 批处理：将同一帧内的多次 onNodesChange 合并为一次 set()
  _pendingChanges: null,
  _changeRaf: null,

  onNodesChange: (changes) => {
    // 累积变更
    const state = get()
    if (!state._pendingChanges) {
      state._pendingChanges = changes
    } else {
      state._pendingChanges = state._pendingChanges.concat(changes)
    }

    // 下一帧统一处理
    if (!state._changeRaf) {
      set({
        _changeRaf: requestAnimationFrame(() => {
          const current = get()
          const allChanges = current._pendingChanges
          if (!allChanges || allChanges.length === 0) {
            set({ _pendingChanges: null, _changeRaf: null })
            return
          }

          const prev = current.nodes
          const prevMap = current.nodesMap
          const updated = applyNodeChanges(allChanges, prev)

          // 快速路径：识别仅位置变化
          const positionChangeIds = new Set()
          for (let i = 0; i < allChanges.length; i++) {
            const c = allChanges[i]
            if (c.type === 'position' && c.position) {
              positionChangeIds.add(c.id)
            }
          }

          let result, newMap
          if (positionChangeIds.size > 0 && positionChangeIds.size === allChanges.length) {
            result = new Array(updated.length)
            newMap = new Map(prevMap)
            for (let i = 0; i < updated.length; i++) {
              const n = updated[i]
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
            result = updated.map((n) => {
              const pos = n.position || { x: n.x || 0, y: n.y || 0 }
              return { ...n, position: pos, x: pos.x, y: pos.y }
            })
            newMap = buildNodesMap(result)
          }

          set({ nodes: result, nodesMap: newMap, _pendingChanges: null, _changeRaf: null })
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

        // 收纳模式：源节点折叠时隐藏连线
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
        const newEdges = resolveEdgesFromConns(newConns, state.nodes)
        return { connections: newConns, edges: newEdges }
      })
    } else {
      set((state) => {
        const newEdges = resolveEdgesFromConns(connectionsOrFn, state.nodes)
        return { connections: connectionsOrFn, edges: newEdges }
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
  setDragNodeId: (dragNodeId) => set({ dragNodeId }),
  hoverTargetId: null,
  setHoverTargetId: (hoverTargetId) => set({ hoverTargetId }),
  connectingSource: null,
  setConnectingSource: (connectingSource) => set({ connectingSource }),
  connectingTarget: null,
  setConnectingTarget: (connectingTarget) => set({ connectingTarget }),
  connectingInputType: null,
  setConnectingInputType: (connectingInputType) => set({ connectingInputType }),
  isPanning: false,
  setIsPanning: (isPanning) => set({ isPanning }),
  isDragging: false,
  setIsDragging: (isDragging) => set({ isDragging }),
  resizingNodeId: null,
  setResizingNodeId: (resizingNodeId) => set({ resizingNodeId }),
  mousePos: { x: 0, y: 0 },
  setMousePos: (mousePos) => set({ mousePos }),
  isSelecting: false,
  setIsSelecting: (isSelecting) => set({ isSelecting }),
  selectionBox: null,
  setSelectionBox: (selectionBoxOrFn) => {
    if (typeof selectionBoxOrFn === 'function') {
      set((state) => ({ selectionBox: selectionBoxOrFn(state.selectionBox) }))
    } else {
      set({ selectionBox: selectionBoxOrFn })
    }
  },

  // Ephemeral Node Generation Timers
  nodeTimers: {},
  setNodeTimers: (nodeTimers) => set({ nodeTimers }),

  // Node Groups (编组)
  nodeGroups: [],
  setNodeGroups: (groups) => set({ nodeGroups: groups }),
  createGroup: (nodeIds, name) => {
    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']
    const color = colors[get().nodeGroups.length % colors.length]
    set((state) => ({
      nodeGroups: [
        ...state.nodeGroups,
        { id: groupId, name: name || `组 ${state.nodeGroups.length + 1}`, nodeIds: [...nodeIds], color }
      ]
    }))
    return groupId
  },
  removeGroup: (groupId) => {
    set((state) => ({
      nodeGroups: state.nodeGroups.filter((g) => g.id !== groupId)
    }))
  },
  renameGroup: (groupId, name) => {
    set((state) => ({
      nodeGroups: state.nodeGroups.map((g) => (g.id === groupId ? { ...g, name } : g))
    }))
  },
  getGroupForNode: (nodeId) => {
    return get().nodeGroups.find((g) => g.nodeIds.includes(nodeId)) || null
  }
})

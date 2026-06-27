/**
 * DAG 引擎核心 (Graph Engine Core)
 * 接收标准扁平化的 workflow 对象，解析出依赖的有向无环图节点运行顺序。
 */

/**
 * 遍历 workflow 并完成依赖拓扑排序，返回可以按次序执行的节点 ID 数组，
 * 同事会抛出基于循环依赖的异常。
 */
export function buildExecutionGraph(workflowObj) {
  const nodes = Object.keys(workflowObj)
  const incomingEdges = new Map() // target_id -> Set of source_ids
  const outgoingEdges = new Map() // source_id -> Set of target_ids

  // Initialize graph
  nodes.forEach((nodeId) => {
    incomingEdges.set(nodeId, new Set())
    outgoingEdges.set(nodeId, new Set())
  })

  // Parse inputs to build graph
  nodes.forEach((nodeId) => {
    const nodeDef = workflowObj[nodeId]
    const inputs = nodeDef.inputs || {}

    // 扫描每个 input 的值
    Object.values(inputs).forEach((val) => {
      // 检查是否是一组标准的连接依赖： ["source_node_id", "slot_name"]
      if (Array.isArray(val) && val.length === 2 && typeof val[0] === 'string') {
        const sourceNodeId = val[0]
        // 保证这个上游节点真的存在于流程里
        if (workflowObj[sourceNodeId]) {
          incomingEdges.get(nodeId).add(sourceNodeId)
          outgoingEdges.get(sourceNodeId).add(nodeId)
        }
      }
    })
  })

  // Topological Sort (Kahn's Algorithm)
  const executionOrder = []
  const zeroInDegreeQueue = []
  const tempIncoming = new Map()

  nodes.forEach((nodeId) => {
    const inDegreeCount = incomingEdges.get(nodeId).size
    tempIncoming.set(nodeId, inDegreeCount)
    if (inDegreeCount === 0) {
      zeroInDegreeQueue.push(nodeId)
    }
  })

  while (zeroInDegreeQueue.length > 0) {
    const currentNode = zeroInDegreeQueue.shift()
    executionOrder.push(currentNode)

    // 对于刚才移出的节点，把它所有的下游节点的入度减少 1
    const neighbors = outgoingEdges.get(currentNode)
    if (neighbors) {
      neighbors.forEach((neighbor) => {
        const currentInDegree = tempIncoming.get(neighbor) - 1
        tempIncoming.set(neighbor, currentInDegree)
        if (currentInDegree === 0) {
          zeroInDegreeQueue.push(neighbor)
        }
      })
    }
  }

  // 环路检测 (如果排序完之后还有节点没被排进去，说明存在互相依赖的环路！)
  if (executionOrder.length !== nodes.length) {
    throw new Error('Graph contains a cyclical dependency (循环依赖); Execution halted.')
  }

  // 返回解析出的执行顺序、完整的依赖关系结构字典以供引擎使用
  return {
    executionOrder,
    incomingEdges, // 帮助引擎知道当前节点在等哪些人完成
    outgoingEdges // 帮助引擎知道当前节点完成后应该唤醒哪些人
  }
}

/**
 * 按层级分组的拓扑排序 — 同一层内节点互无依赖，可 Promise.all() 并发执行
 *
 * 示例：A→C, B→C, C→D, C→E
 *   Layer 0: [A, B]   ← 无依赖，可并行
 *   Layer 1: [C]      ← 等 A、B 完成
 *   Layer 2: [D, E]   ← 等 C 完成，可并行
 */
export function buildExecutionLayers(workflowObj) {
  const { executionOrder, incomingEdges, outgoingEdges } = buildExecutionGraph(workflowObj)

  // 按层级收集：每轮取出所有当前入度为 0 的节点为一层
  const layers = []
  const remaining = new Set(executionOrder)
  const tempInDegree = new Map()

  // 初始化入度
  for (const nodeId of executionOrder) {
    // 只统计 remaining 集合内的入度（过滤掉 workflow 外的引用）
    let deg = 0
    for (const src of incomingEdges.get(nodeId) || []) {
      if (remaining.has(src)) deg++
    }
    tempInDegree.set(nodeId, deg)
  }

  while (remaining.size > 0) {
    // 收集当前层：入度为 0 的所有节点
    const layer = []
    for (const nodeId of remaining) {
      if (tempInDegree.get(nodeId) === 0) {
        layer.push(nodeId)
      }
    }

    if (layer.length === 0) {
      // 理论上不会到这里（buildExecutionGraph 已做环路检测），但防御性处理
      throw new Error('Graph contains a cyclical dependency detected during layering.')
    }

    layers.push(layer)

    // 从 remaining 中移除本层节点，并更新下游入度
    for (const nodeId of layer) {
      remaining.delete(nodeId)
      for (const downstream of outgoingEdges.get(nodeId) || []) {
        if (remaining.has(downstream)) {
          tempInDegree.set(downstream, (tempInDegree.get(downstream) || 1) - 1)
        }
      }
    }
  }

  return { layers, incomingEdges, outgoingEdges }
}

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

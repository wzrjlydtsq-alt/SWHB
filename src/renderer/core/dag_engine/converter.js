/**
 * 转换器 (Converter)
 * 负责将前端 UI 使用的 React Flow / Zustand 原始数组连线状态，
 * 同步单向转换为符合有向无环图 (DAG) 执行引擎标准的扁平化键值对 JSON 协议。
 */

export function convertToWorkflowJson(nodes, connections) {
  const workflow = {}

  // 1. 初始化标准节点字典
  nodes.forEach((node) => {
    workflow[node.id] = {
      class_type: node.type,
      // 包含自带的所有静态内容和配置
      inputs: {
        ...(node.settings || {}),
        ...(node.content !== undefined ? { content: node.content } : {})
      },
      // UI 元信息，引擎跳过它
      meta: {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        label: node.data?.label || node.type
      }
    }
  })

  // 2. 注入动态依赖边 (Edges -> Inputs)
  connections.forEach((conn) => {
    const targetNode = workflow[conn.to]
    const sourceNode = workflow[conn.from]

    if (targetNode && sourceNode) {
      // 依据连线的 inputType 决定插入的插槽名。如果没有，默认为 'default_input'
      // 比如 ["source_node_id", "default_output"] 代表此插槽需要等待 source_node 执行完毕。
      const inputSlotName =
        conn.inputType && conn.inputType !== 'default' ? conn.inputType : 'default_input'

      // 注意：标准连线库为了支持并发可能需要数组收集器，在这里我们先简单定义基础关联。
      // 如果有多条线连到一个插槽，这里会被覆盖，或转换为数组，目前视不同节点的定义定。
      // 我们暂定使用标准的单插槽覆盖逻辑。
      targetNode.inputs[inputSlotName] = [conn.from, 'default_output']
    }
  })

  return {
    version: '1.0',
    workflow
  }
}

/**
 * 工作流执行引擎 (Workflow Engine)
 * 调度整个 JSON 树的生命周期，负责分发事件并收集插件的输出。
 */
import { buildExecutionGraph } from './graph.js'

// 简单的事件触发中心
class EventEmitter {
  constructor() {
    this.events = {}
  }
  on(event, listener) {
    if (!this.events[event]) this.events[event] = []
    this.events[event].push(listener)
  }
  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach((listener) => listener(...args))
    }
  }
}

export class WorkflowEngine extends EventEmitter {
  constructor(pluginRegistry = {}) {
    super()
    this.pluginRegistry = pluginRegistry // 注入所有可用的节点插件
    this.status = 'idle' // 'idle', 'running', 'completed', 'error', 'aborted'
    this.nodeOutputs = new Map() // nodeId -> { output_slot: value }
    this.abortController = null
  }

  /**
   * 注册可用插件
   * @param {string} classType - 插件类名 (e.g. 'gen-image')
   * @param {object} plugin - 符合 Plugin 规范的 JS 对象 { execute: async (inputs, ctx) => outputs }
   */
  registerPlugin(classType, plugin) {
    this.pluginRegistry[classType] = plugin
  }

  /**
   * 执行完整的标准 JSON Workflow
   */
  async executeWorkflow(workflowObj) {
    if (this.status === 'running') {
      throw new Error('Engine is already running a workflow.')
    }
    this.status = 'running'
    this.nodeOutputs.clear()
    this.abortController = new AbortController()

    this.emit('workflow:start')

    try {
      // 1. 图依赖分析与排序
      const { executionOrder } = buildExecutionGraph(workflowObj)
      this.emit('workflow:scheduled', { executionOrder })

      // 2. 依次按拓扑顺序调度节点 (这里最基础的形态是串行等待，其实有向图可以实现并行)
      // 未来可以改造为 Promise.all() 并发架构阻塞监听 incomingEdges
      for (const nodeId of executionOrder) {
        if (this.abortController.signal.aborted) {
          throw new Error('Workflow aborted by user.')
        }

        const nodeDef = workflowObj[nodeId]
        // Skip if nodeDef is not a valid object or lacks class_type
        if (!nodeDef || typeof nodeDef !== 'object' || nodeDef === null || !nodeDef.class_type)
          continue

        await this._executeNode(nodeId, nodeDef)
      }

      this.status = 'completed'
      this.emit('workflow:completed', { outputs: this.nodeOutputs })
    } catch (err) {
      this.status = err.message.includes('aborted') ? 'aborted' : 'error'
      this.emit('workflow:error', { error: err })
      throw err
    }
  }

  /**
   * 停止仍在运行的工作流
   */
  abortWorkflow() {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  /**
   * 内部方法：解析输入参数并执行单个节点
   */
  async _executeNode(nodeId, nodeDef) {
    this.emit('node:start', { nodeId, classType: nodeDef.class_type })

    try {
      // 1. 查找此节点对应的真正实现代码 (Plugin)
      const plugin = this.pluginRegistry[nodeDef.class_type]
      if (!plugin) {
        throw new Error(`Plugin implementation not found for class_type: ${nodeDef.class_type}`)
      }

      // 2. 组装输入字典 (解析出上游传下来的引用依赖)
      const resolvedInputs = {}
      for (const [key, rawVal] of Object.entries(nodeDef.inputs || {})) {
        if (Array.isArray(rawVal) && rawVal.length === 2 && typeof rawVal[0] === 'string') {
          // ["source_node_id", "slot_name"]
          const sourceNodeId = rawVal[0]
          const sourceSlotName = rawVal[1]

          const sourceOutputs = this.nodeOutputs.get(sourceNodeId)
          if (!sourceOutputs) {
            throw new Error(`Data missing from upstream node: ${sourceNodeId}`)
          }
          if (sourceOutputs[sourceSlotName] === undefined) {
            // 宽容模式（Fallback）：如果找不到对应 output name 且节点只有一个通用输出：
            // 可以默认把所有 outputs 提取或者直接找 default_output 取其 0 号位
            // 未来可以在 Plugin Spec 里严格定义
            resolvedInputs[key] = sourceOutputs
          } else {
            resolvedInputs[key] = sourceOutputs[sourceSlotName]
          }
        } else {
          // 静态字面量配置
          resolvedInputs[key] = rawVal
        }
      }

      // 3. 执行插件任务
      // 我们把 abortSignal 传给通过上下文，方便底层节点能够及时取消网络请求
      const ctx = {
        nodeId,
        engine: this,
        signal: this.abortController.signal
      }

      const rawOutput = await plugin.execute(resolvedInputs, ctx)

      // 整理输出
      const finalOutput =
        typeof rawOutput === 'object' && rawOutput !== null
          ? rawOutput
          : { default_output: rawOutput }

      this.nodeOutputs.set(nodeId, finalOutput)

      this.emit('node:completed', { nodeId, outputs: finalOutput })
    } catch (err) {
      this.emit('node:failed', { nodeId, error: err })
      throw err
    }
  }
}

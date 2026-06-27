/**
 * 工作流执行引擎 (Workflow Engine) — M1.5 增强版
 *
 * 改进点：
 *   1. 并行执行：同层无依赖节点 Promise.all() 并发调度
 *   2. 断点续跑：失败节点标记，下游自动 skip，支持 resumeWorkflow() 从失败处重跑
 *   3. 节点状态跟踪：每个节点有独立的 pending/running/completed/failed/skipped 状态
 */
import { buildExecutionLayers } from './graph.ts'

// 节点状态常量
export const NODE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
}

// 简单的事件触发中心
class EventEmitter {
  events: Record<string, ((...args: unknown[]) => void)[]> = {}

  on(event: string, listener: (...args: unknown[]) => void) {
    if (!this.events[event]) this.events[event] = []
    this.events[event].push(listener)
  }
  off(event: string, listener: (...args: unknown[]) => void) {
    if (!this.events[event]) return
    this.events[event] = this.events[event].filter((l) => l !== listener)
  }
  emit(event: string, ...args: unknown[]) {
    if (this.events[event]) {
      this.events[event].forEach((listener) => listener(...args))
    }
  }
}

export class WorkflowEngine extends EventEmitter {
  pluginRegistry: Record<string, { execute: (inputs: unknown, ctx: unknown) => Promise<unknown> }>
  status: string
  nodeOutputs: Map<string, Record<string, unknown>>
  nodeStatuses: Map<string, string>
  nodeErrors: Map<string, Error>
  abortController: AbortController | null
  _lastWorkflow: Record<string, unknown> | null

  constructor(pluginRegistry = {}) {
    super()
    this.pluginRegistry = pluginRegistry
    this.status = 'idle'
    this.nodeOutputs = new Map()
    this.nodeStatuses = new Map()
    this.nodeErrors = new Map()
    this.abortController = null
    this._lastWorkflow = null
  }

  /**
   * 注册可用插件
   */
  registerPlugin(classType, plugin) {
    this.pluginRegistry[classType] = plugin
  }

  /**
   * 获取所有节点的状态快照
   */
  getNodeStatuses() {
    return new Map(this.nodeStatuses)
  }

  /**
   * 获取失败节点列表
   */
  getFailedNodes() {
    const failed = []
    for (const [nodeId, status] of this.nodeStatuses) {
      if (status === NODE_STATUS.FAILED) {
        failed.push({ nodeId, error: this.nodeErrors.get(nodeId) })
      }
    }
    return failed
  }

  /**
   * 执行完整的标准 JSON Workflow — 并行版
   */
  async executeWorkflow(workflowObj) {
    if (this.status === 'running') {
      throw new Error('Engine is already running a workflow.')
    }
    this.status = 'running'
    this.nodeOutputs.clear()
    this.nodeStatuses.clear()
    this.nodeErrors.clear()
    this.abortController = new AbortController()
    this._lastWorkflow = workflowObj

    // 初始化所有节点状态为 pending
    for (const nodeId of Object.keys(workflowObj)) {
      this.nodeStatuses.set(nodeId, NODE_STATUS.PENDING)
    }

    this.emit('workflow:start')

    try {
      const { layers, outgoingEdges } = buildExecutionLayers(workflowObj)
      this.emit('workflow:scheduled', { layers })

      let hasFailures = false

      // 按层逐层执行，层内 Promise.allSettled 并发
      for (const layer of layers) {
        if (this.abortController.signal.aborted) {
          throw new Error('Workflow aborted by user.')
        }

        // 过滤掉已被 skip 的节点
        const runnableNodes = layer.filter(
          (nodeId) => this.nodeStatuses.get(nodeId) === NODE_STATUS.PENDING
        )

        if (runnableNodes.length === 0) continue

        // 层内并发执行
        const results = await Promise.allSettled(
          runnableNodes.map((nodeId) => {
            const nodeDef = workflowObj[nodeId]
            if (!nodeDef || typeof nodeDef !== 'object' || !nodeDef.class_type) {
              // 无效节点定义，直接标记完成并跳过
              this.nodeStatuses.set(nodeId, NODE_STATUS.COMPLETED)
              return Promise.resolve()
            }
            return this._executeNode(nodeId, nodeDef)
          })
        )

        // 处理本层执行结果
        for (let i = 0; i < runnableNodes.length; i++) {
          const nodeId = runnableNodes[i]
          const result = results[i]

          if (result.status === 'rejected') {
            hasFailures = true
            this.nodeStatuses.set(nodeId, NODE_STATUS.FAILED)
            this.nodeErrors.set(nodeId, result.reason)
            this.emit('node:failed', { nodeId, error: result.reason })

            // 级联 skip 所有下游节点
            this._skipDownstream(nodeId, outgoingEdges, workflowObj)
          }
          // fulfilled 的节点已在 _executeNode 中标记 completed
        }
      }

      if (hasFailures) {
        this.status = 'partial'
        const failed = this.getFailedNodes()
        this.emit('workflow:partial', {
          outputs: this.nodeOutputs,
          failedNodes: failed
        })
      } else {
        this.status = 'completed'
        this.emit('workflow:completed', { outputs: this.nodeOutputs })
      }
    } catch (err) {
      this.status = err.message.includes('aborted') ? 'aborted' : 'error'
      this.emit('workflow:error', { error: err })
      throw err
    }
  }

  /**
   * 断点续跑：从失败节点重新执行
   * 保留已 completed 节点的输出，只重跑 failed + skipped 节点
   */
  async resumeWorkflow(workflowObj = null) {
    const workflow = workflowObj || this._lastWorkflow
    if (!workflow) {
      throw new Error('No workflow to resume. Call executeWorkflow() first.')
    }

    if (this.status === 'running') {
      throw new Error('Engine is already running.')
    }

    const failedNodes = this.getFailedNodes()
    if (failedNodes.length === 0) {
      console.log('[Engine] No failed nodes to resume.')
      return
    }

    this.status = 'running'
    this.abortController = new AbortController()
    this._lastWorkflow = workflow

    // 重置 failed 和 skipped 节点为 pending
    for (const [nodeId, status] of this.nodeStatuses) {
      if (status === NODE_STATUS.FAILED || status === NODE_STATUS.SKIPPED) {
        this.nodeStatuses.set(nodeId, NODE_STATUS.PENDING)
        this.nodeErrors.delete(nodeId)
        this.nodeOutputs.delete(nodeId)
      }
    }

    this.emit('workflow:resume', { resumingNodes: failedNodes.map((f) => f.nodeId) })

    try {
      const { layers, outgoingEdges } = buildExecutionLayers(workflow)
      let hasFailures = false

      for (const layer of layers) {
        if (this.abortController.signal.aborted) {
          throw new Error('Workflow aborted by user.')
        }

        // 只执行 pending 的节点（completed 的跳过）
        const runnableNodes = layer.filter(
          (nodeId) => this.nodeStatuses.get(nodeId) === NODE_STATUS.PENDING
        )

        if (runnableNodes.length === 0) continue

        const results = await Promise.allSettled(
          runnableNodes.map((nodeId) => {
            const nodeDef = workflow[nodeId]
            if (!nodeDef || typeof nodeDef !== 'object' || !nodeDef.class_type) {
              this.nodeStatuses.set(nodeId, NODE_STATUS.COMPLETED)
              return Promise.resolve()
            }
            return this._executeNode(nodeId, nodeDef)
          })
        )

        for (let i = 0; i < runnableNodes.length; i++) {
          const nodeId = runnableNodes[i]
          const result = results[i]
          if (result.status === 'rejected') {
            hasFailures = true
            this.nodeStatuses.set(nodeId, NODE_STATUS.FAILED)
            this.nodeErrors.set(nodeId, result.reason)
            this.emit('node:failed', { nodeId, error: result.reason })
            this._skipDownstream(nodeId, outgoingEdges, workflow)
          }
        }
      }

      if (hasFailures) {
        this.status = 'partial'
        this.emit('workflow:partial', {
          outputs: this.nodeOutputs,
          failedNodes: this.getFailedNodes()
        })
      } else {
        this.status = 'completed'
        this.emit('workflow:completed', { outputs: this.nodeOutputs })
      }
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
   * 级联标记下游节点为 skipped
   */
  _skipDownstream(failedNodeId, outgoingEdges, workflowObj) {
    const queue = [...(outgoingEdges.get(failedNodeId) || [])]
    const visited = new Set()

    while (queue.length > 0) {
      const nodeId = queue.shift()
      if (visited.has(nodeId) || !workflowObj[nodeId]) continue
      visited.add(nodeId)

      const currentStatus = this.nodeStatuses.get(nodeId)
      // 只 skip 还没执行的节点
      if (currentStatus === NODE_STATUS.PENDING) {
        this.nodeStatuses.set(nodeId, NODE_STATUS.SKIPPED)
        this.emit('node:skipped', { nodeId, reason: `Upstream node ${failedNodeId} failed` })
      }

      // 继续向下传播
      for (const downstream of outgoingEdges.get(nodeId) || []) {
        queue.push(downstream)
      }
    }
  }

  /**
   * 内部方法：解析输入参数并执行单个节点
   */
  async _executeNode(nodeId, nodeDef) {
    this.nodeStatuses.set(nodeId, NODE_STATUS.RUNNING)
    this.emit('node:start', { nodeId, classType: nodeDef.class_type })

    // 1. 查找此节点对应的真正实现代码 (Plugin)
    const plugin = this.pluginRegistry[nodeDef.class_type]
    if (!plugin) {
      throw new Error(`Plugin implementation not found for class_type: ${nodeDef.class_type}`)
    }

    // 2. 组装输入字典 (解析出上游传下来的引用依赖)
    const resolvedInputs = {}
    for (const [key, rawVal] of Object.entries(nodeDef.inputs || {})) {
      if (Array.isArray(rawVal) && rawVal.length === 2 && typeof rawVal[0] === 'string') {
        const sourceNodeId = rawVal[0]
        const sourceSlotName = rawVal[1]

        const sourceOutputs = this.nodeOutputs.get(sourceNodeId)
        if (!sourceOutputs) {
          throw new Error(`Data missing from upstream node: ${sourceNodeId}`)
        }
        if (sourceOutputs[sourceSlotName] === undefined) {
          resolvedInputs[key] = sourceOutputs
        } else {
          resolvedInputs[key] = sourceOutputs[sourceSlotName]
        }
      } else {
        resolvedInputs[key] = rawVal
      }
    }

    // 3. 执行插件任务
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

    this.nodeOutputs.set(nodeId, finalOutput as Record<string, unknown>)
    this.nodeStatuses.set(nodeId, NODE_STATUS.COMPLETED)

    this.emit('node:completed', { nodeId, outputs: finalOutput })
  }
}

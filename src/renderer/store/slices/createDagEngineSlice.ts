import { WorkflowEngine, NODE_STATUS } from '../../core/dag_engine/engine.ts'
import { LLMTextPlugin } from '../../core/dag_engine/plugins/llm_text_plugin.ts'

// 全局单例的执行引擎
const engine = new WorkflowEngine()

// 初始化预装核心插件
engine.registerPlugin('LLMTextPlugin', new LLMTextPlugin())

// Zustand Store Slice for DAG Engine
export const createDagEngineSlice = (set: any) => ({
  engineStatus: 'idle', // idle | running | completed | error | aborted | partial
  nodeStatuses: {}, // { nodeId: 'pending'|'running'|'completed'|'failed'|'skipped' }
  failedNodes: [], // [{ nodeId, error }]

  // 暴露一组简易方法给前端组件调用
  startWorkflow: async (workflowObj: any) => {
    try {
      set({ engineStatus: 'running', nodeStatuses: {}, failedNodes: [] })

      // 绑定节点状态同步
      const statusSync = (_payload: any) => {
        const statuses = Object.fromEntries(engine.getNodeStatuses())
        set({ nodeStatuses: statuses })
      }
      engine.on('node:start', statusSync)
      engine.on('node:completed', statusSync)
      engine.on('node:failed', statusSync)
      engine.on('node:skipped', statusSync)

      await engine.executeWorkflow(workflowObj)

      const finalStatus = engine.status
      const failed = engine.getFailedNodes()
      set({
        engineStatus: finalStatus,
        nodeStatuses: Object.fromEntries(engine.getNodeStatuses()),
        failedNodes: failed.map((f) => ({ nodeId: f.nodeId, error: f.error?.message || '未知错误' }))
      })

      // 清理事件
      engine.off('node:start', statusSync)
      engine.off('node:completed', statusSync)
      engine.off('node:failed', statusSync)
      engine.off('node:skipped', statusSync)
    } catch (err: any) {
      console.error('DAG Workflow Execution Error:', err)
      set({
        engineStatus: err.message.includes('abort') ? 'aborted' : 'error',
        nodeStatuses: Object.fromEntries(engine.getNodeStatuses())
      })
    }
  },

  // 断点续跑：从失败节点重新执行
  resumeWorkflow: async () => {
    try {
      set({ engineStatus: 'running' })

      const statusSync = (_payload: any) => {
        const statuses = Object.fromEntries(engine.getNodeStatuses())
        set({ nodeStatuses: statuses })
      }
      engine.on('node:start', statusSync)
      engine.on('node:completed', statusSync)
      engine.on('node:failed', statusSync)
      engine.on('node:skipped', statusSync)

      await engine.resumeWorkflow()

      const finalStatus = engine.status
      const failed = engine.getFailedNodes()
      set({
        engineStatus: finalStatus,
        nodeStatuses: Object.fromEntries(engine.getNodeStatuses()),
        failedNodes: failed.map((f) => ({ nodeId: f.nodeId, error: f.error?.message || '未知错误' }))
      })

      engine.off('node:start', statusSync)
      engine.off('node:completed', statusSync)
      engine.off('node:failed', statusSync)
      engine.off('node:skipped', statusSync)
    } catch (err: any) {
      console.error('DAG Resume Error:', err)
      set({
        engineStatus: err.message.includes('abort') ? 'aborted' : 'error'
      })
    }
  },

  abortWorkflow: () => {
    engine.abortWorkflow()
    set({ engineStatus: 'aborted' })
  }
})

// 可以通过非 store 的方式直接暴露引擎给特定组件挂载事件监听
export const getDagEngine = () => engine

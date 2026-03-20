import { WorkflowEngine } from '../../core/dag_engine/engine.js'
import { LLMTextPlugin } from '../../core/dag_engine/plugins/llm_text_plugin.js'

// 全局单例的执行引擎
const engine = new WorkflowEngine()

// 初始化预装核心插件
engine.registerPlugin('LLMTextPlugin', new LLMTextPlugin())

// Zustand Store Slice for DAG Engine
export const createDagEngineSlice = (set) => ({
  engineStatus: 'idle', // idle | running | completed | error | aborted

  // 暴露一组简易方法给前端组件调用
  startWorkflow: async (workflowObj) => {
    try {
      set({ engineStatus: 'running' })
      // 事件监听可以绑定或者让 React 组件直接监听 engine
      await engine.executeWorkflow(workflowObj)
      set({ engineStatus: 'completed' })
    } catch (err) {
      console.error('DAG Workflow Execution Error:', err)
      set({ engineStatus: err.message.includes('abort') ? 'aborted' : 'error' })
    }
  },

  abortWorkflow: () => {
    engine.abortWorkflow()
    set({ engineStatus: 'aborted' })
  }
})

// 可以通过非 store 的方式直接暴露引擎给特定组件挂载事件监听
export const getDagEngine = () => engine

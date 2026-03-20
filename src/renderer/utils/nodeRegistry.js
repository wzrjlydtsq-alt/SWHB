import { lazy } from 'react'

// 大型节点组件使用 React.lazy 懒加载
const GenNode = lazy(() =>
  import('../components/nodes/GenNode.jsx').then((m) => ({ default: m.GenNode }))
)

// 较小组件保持静态导入
import { NovelInputNode } from '../components/nodes/NovelInputNode.jsx'
import { AgentNode } from '../components/nodes/AgentNode.jsx'
import { AlchemyNode } from '../components/nodes/AlchemyNode.jsx'

export const NodeRegistry = {
  'gen-image': {
    hasInputs: false,
    hasOutputs: false,
    component: GenNode
  },
  'gen-video': {
    hasInputs: false,
    hasOutputs: false,
    component: GenNode
  },
  'novel-input': {
    hasInputs: false,
    hasOutputs: false,
    component: NovelInputNode
  },
  'agent-node': {
    hasInputs: false,
    hasOutputs: false,
    component: AgentNode
  },
  'alchemy-node': {
    hasInputs: false,
    hasOutputs: false,
    component: AlchemyNode
  }
}

export function getNodeConfig(type) {
  return NodeRegistry[type] || { hasInputs: false, hasOutputs: false, inputCount: 0, component: null }
}

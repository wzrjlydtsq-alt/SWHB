import { lazy } from 'react'

const GenNode = lazy(() =>
  import('../components/nodes/GenNode.tsx').then((module) => ({ default: module.GenNode }))
)
const AgentNode = lazy(() =>
  import('../components/nodes/AgentNode.tsx').then((module) => ({ default: module.AgentNode }))
)
const DirectorNode = lazy(() =>
  import('../components/nodes/DirectorNode.tsx').then((module) => ({
    default: module.DirectorNode
  }))
)
const NovelInputNode = lazy(() =>
  import('../components/nodes/NovelInputNode.tsx').then((module) => ({
    default: module.NovelInputNode
  }))
)
const StickyNoteNode = lazy(() =>
  import('../components/nodes/StickyNoteNode.tsx').then((module) => ({
    default: module.StickyNoteNode
  }))
)
const DirectorStageNode = lazy(() => import('../features/director/DirectorStageNode.tsx'))

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
  'director-node': {
    hasInputs: false,
    hasOutputs: false,
    component: DirectorNode
  },
  'director-stage': {
    hasInputs: false,
    hasOutputs: false,
    component: DirectorStageNode
  },
  'sticky-note': {
    hasInputs: false,
    hasOutputs: false,
    component: StickyNoteNode
  }
}

export function getNodeConfig(type) {
  return (
    NodeRegistry[type] || { hasInputs: false, hasOutputs: false, inputCount: 0, component: null }
  )
}

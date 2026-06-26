/**
 * 星河智绘 — 连接/边类型
 */

/** 画布连接（内部数据模型） */
export interface XhConnection {
  id: string
  /** 源节点 ID */
  from: string
  /** 目标节点 ID */
  to: string
  /** 源节点句柄 */
  sourceHandle?: string
  /** 目标节点句柄 */
  targetHandle?: string
  /** 输入类型 */
  inputType?: string
  /** 兼容字段 */
  source?: string
  target?: string
}

/** ReactFlow 边（渲染用） */
export interface XhEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  type?: string
  selected?: boolean
  hidden?: boolean
  style?: React.CSSProperties
}

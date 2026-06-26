/**
 * 星河智绘 — 节点类型系统
 */

/** 节点类型联合 */
export type NodeType =
  | 'gen-image'
  | 'gen-video'
  | 'input-image'
  | 'video-input'
  | 'novel-input'
  | 'scene-extract'
  | 'character-extract'
  | 'storyboard-node'
  | 'director-node'
  | 'agent-node'
  | 'script-shot-node'

/** 节点位置 */
export interface NodePosition {
  x: number
  y: number
}

/** 节点尺寸 */
export interface NodeDimensions {
  w: number
  h: number
}

/** 视频元数据 */
export interface VideoMeta {
  duration?: number
  width?: number
  height?: number
  fps?: number
  codec?: string
}

/** 关键帧 */
export interface KeyFrame {
  id: string
  url: string
  timestamp?: number
  label?: string
}

/** 节点设置（通用基础） */
export interface NodeSettings {
  model?: string
  ratio?: string
  resolution?: string
  duration?: string
  prompt?: string
  negativePrompt?: string
  seed?: number
  outputCollapsed?: boolean
  /** 导演节点才有的步骤相关设置 */
  shots?: Shot[]
  /** 导演节点才有的字段 */
  [key: string]: any
}

/** 导演节点分镜 */
export interface Shot {
  id: string
  prompt?: string
  imageUrl?: string
  videoUrl?: string
  status?: 'idle' | 'generating' | 'completed' | 'failed'
  [key: string]: any
}

/** 基础节点接口 */
export interface XhNode {
  id: string
  type: NodeType | string
  position: NodePosition
  x: number
  y: number
  data: Record<string, any>
  content?: string
  width?: number
  height?: number
  dimensions?: NodeDimensions
  settings?: NodeSettings
  frames?: KeyFrame[]
  selectedKeyframes?: string[]
  videoMeta?: VideoMeta
}

/** 节点 Map 类型 */
export type NodesMap = Map<string, XhNode>

/** 节点配置注册信息 */
export interface NodeConfig {
  type: string
  label: string
  inputCount: number
  outputCount: number
  category?: string
}

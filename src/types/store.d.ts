/**
 * 星河智绘 — Zustand Store 类型
 */

import type { XhNode, NodesMap, NodeSettings } from './node'
import type { XhConnection, XhEdge } from './connection'
import type { HistoryItem } from './history'
import type { ApiConfig } from './api'
import type { EngineStatus } from './task'
import type { NodeChange, EdgeChange, Connection } from '@xyflow/react'

// ========== 视图状态 ==========
export interface CanvasView {
  x: number
  y: number
  zoom: number
}

// ========== 选择框 ==========
export interface SelectionBox {
  startX: number
  startY: number
  endX: number
  endY: number
}

// ========== 节点编组 ==========
export interface NodeGroup {
  id: string
  name: string
  nodeIds: string[]
  color: string
  tags?: string[]
  collapsed?: boolean
  commonParams?: Record<string, unknown>
}

// ========== 鼠标位置 ==========
export interface MousePosition {
  x: number
  y: number
}

// ========== 角色库条目 ==========
export interface CharacterLibraryItem {
  id: string
  name?: string
  imageUrl?: string
  description?: string
  tags?: string[]
  [key: string]: any
}

// ========== 提示词库条目 ==========
export interface PromptLibraryItem {
  id?: string
  name: string
  prompt: string
}

// ========== 提示词表单 ==========
export interface PromptLibraryForm {
  name: string
  prompt: string
}

// ========== Lightbox 条目 ==========
export interface LightboxItem {
  url: string
  type?: 'image' | 'video'
  title?: string
  [key: string]: unknown
}

// ========== Slice 接口定义 ==========

/** UI Slice */
export interface UiSlice {
  uiScale: number
  setUiScale: (scale: number) => void
  imageSavePath: string
  setImageSavePath: (path: string) => void
  videoSavePath: string
  setVideoSavePath: (path: string) => void
  autoSaveInterval: number
  setAutoSaveInterval: (interval: number) => void
  enableGpu: boolean
  setEnableGpu: (enable: boolean) => void
  enableUpdateCheck: boolean
  setEnableUpdateCheck: (enable: boolean) => void
  showConnectionAnimations: boolean
  setShowConnectionAnimations: (show: boolean) => void
  silenceConfirmations: boolean
  setSilenceConfirmations: (silence: boolean) => void
  theme: string
  setTheme: (theme: string) => void
  themeColor: string
  setThemeColor: (color: string) => void
  isPerformanceMode: boolean
  setPerformanceMode: (mode: boolean) => void
  jimengUseLocalFile: boolean
  setJimengUseLocalFile: (use: boolean) => void
  historyPerformanceMode: string
  setHistoryPerformanceMode: (mode: string) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  historyOpen: boolean
  setHistoryOpen: (open: boolean) => void
  localCacheSettingsOpen: boolean
  setLocalCacheSettingsOpen: (open: boolean) => void
  batchSelectedIds: Set<string>
  setBatchSelectedIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  batchModalOpen: boolean
  setBatchModalOpen: (open: boolean) => void
  activeTool: string
  setActiveTool: (tool: string) => void
  activeDropdown: string | null
  setActiveDropdown: (dropdown: string | null) => void
  projectListOpen: boolean
  setProjectListOpen: (open: boolean) => void
  assetLibraryOpen: boolean
  setAssetLibraryOpen: (open: boolean) => void
  cloudAssetsOpen: boolean
  setCloudAssetsOpen: (open: boolean) => void
  favoriteLibraryOpen: boolean
  setFavoriteLibraryOpen: (open: boolean) => void
  skillPanelOpen: boolean
  setSkillPanelOpen: (open: boolean) => void
  productionDeskOpen: boolean
  setProductionDeskOpen: (open: boolean) => void
  directorStageOpen: boolean
  setDirectorStageOpen: (open: boolean) => void
  activeWorkspacePage: 'assistant' | 'canvas' | 'production' | 'dubbing'
  setActiveWorkspacePage: (page: 'assistant' | 'canvas' | 'production' | 'dubbing') => void
  productionBoardOpen: boolean
  setProductionBoardOpen: (open: boolean) => void
  productionBoardMode: 'image' | 'video'
  setProductionBoardMode: (mode: 'image' | 'video') => void
  productionBoardVideoRows: any[] | null
  setProductionBoardVideoRows: (rows: any[] | null) => void
  productionBoardImageRows: any[] | null
  setProductionBoardImageRows: (rows: any[] | null) => void
  kanbanOpen: boolean
  setKanbanOpen: (open: boolean) => void
  lightboxItem: LightboxItem | null
  setLightboxItem: (item: LightboxItem | null) => void
  closeLightbox: () => void
}

/** Project Slice */
export interface ProjectSlice {
  projectName: string
  setProjectName: (name: string) => void
  currentProject: { id: string; name?: string; [key: string]: any } | null
  setCurrentProject: (project: ProjectSlice['currentProject']) => void
  apiConfigs: ApiConfig[]
  setApiConfigs: (configs: ApiConfig[] | ((prev: ApiConfig[]) => ApiConfig[])) => void
  globalApiKey: string
  globalApiUrl: string
  setGlobalApiKey: (key: string) => void
  setGlobalApiUrl: (url: string) => void
  jimengSessionId: string
  setJimengSessionId: (id: string) => void
  /** 从 globalApiKey 派生的便捷访问器 */
  chatApiKey: string
  chatApiUrl: string
  imageApiKey: string
  imageApiUrl: string
  videoApiKey: string
  videoApiUrl: string
  initializeConfigs: () => void
}

/** History Slice */
export interface HistorySlice {
  history: HistoryItem[]
  setHistory: (history: HistoryItem[] | ((prev: HistoryItem[]) => HistoryItem[])) => void
  savedFolderHistory: string[]
  setSavedFolderHistory: (history: string[]) => void
  addFolderToHistory: (folder: string) => void
}

/** Library Slice */
export interface LibrarySlice {
  characterLibrary: CharacterLibraryItem[]
  setCharacterLibrary: (
    lib: CharacterLibraryItem[] | ((prev: CharacterLibraryItem[]) => CharacterLibraryItem[])
  ) => void
  promptLibrary: PromptLibraryItem[]
  setPromptLibrary: (
    lib: PromptLibraryItem[] | ((prev: PromptLibraryItem[]) => PromptLibraryItem[])
  ) => void
  promptLibraryForm: PromptLibraryForm
  setPromptLibraryForm: (
    form: PromptLibraryForm | ((prev: PromptLibraryForm) => PromptLibraryForm)
  ) => void
  promptLibraryCollapsed: boolean
  setPromptLibraryCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void
  promptLibraryEditorOpen: boolean
  setPromptLibraryEditorOpen: (open: boolean | ((prev: boolean) => boolean)) => void
}

/** Canvas Slice */
export interface CanvasSlice {
  view: CanvasView
  setView: (view: CanvasView | ((prev: CanvasView) => CanvasView)) => void
  nodes: XhNode[]
  nodesMap: NodesMap
  nodeIndexMap: Map<string, number>
  nodesLayoutSignature: string
  nodesLayoutVersion: number
  setNodes: (nodes: XhNode[] | ((prev: XhNode[]) => XhNode[])) => void
  updateNodeSettingsById: (nodeId: string, newSettings: Partial<NodeSettings>) => void
  onNodesChange: (changes: NodeChange[]) => void
  edges: XhEdge[]
  setEdges: (edges: XhEdge[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  connections: XhConnection[]
  setConnections: (connections: XhConnection[] | ((prev: XhConnection[]) => XhConnection[])) => void
  selectedNodeIds: Set<string>
  setSelectedNodeIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  selectedNodeId: string | null
  setSelectedNodeId: (id: string | null) => void
  dragNodeId: string | null
  setDragNodeId: (id: string | null) => void
  hoverTargetId: string | null
  setHoverTargetId: (id: string | null) => void
  connectingSource: string | null
  setConnectingSource: (source: string | null) => void
  connectingTarget: string | null
  setConnectingTarget: (target: string | null) => void
  connectingInputType: string | null
  setConnectingInputType: (type: string | null) => void
  isPanning: boolean
  setIsPanning: (panning: boolean) => void
  isDragging: boolean
  setIsDragging: (dragging: boolean) => void
  resizingNodeId: string | null
  setResizingNodeId: (id: string | null) => void
  mousePos: MousePosition
  setMousePos: (pos: MousePosition) => void
  isSelecting: boolean
  setIsSelecting: (selecting: boolean) => void
  selectionBox: SelectionBox | null
  setSelectionBox: (
    box: SelectionBox | null | ((prev: SelectionBox | null) => SelectionBox | null)
  ) => void
  nodeTimers: Record<string, number>
  setNodeTimers: (timers: Record<string, number>) => void
  nodeGroups: NodeGroup[]
  nodeGroupMap: Map<string, NodeGroup>
  setNodeGroups: (groups: NodeGroup[]) => void
  createGroup: (nodeIds: string[], name?: string) => string | null
  removeGroup: (groupId: string) => void
  renameGroup: (groupId: string, name: string) => void
  getGroupForNode: (nodeId: string) => NodeGroup | null
  toggleGroupCollapse: (groupId: string) => void
  setGroupCollapsed: (groupId: string, collapsed: boolean) => void
  setGroupCommonParams: (groupId: string, params: Record<string, unknown>) => void
  updateGroupNodeIds: (groupId: string, nodeIds: string[]) => void
}

/** DAG Engine Slice */
export interface DagEngineSlice {
  engineStatus: EngineStatus
  startWorkflow: (workflowObj: unknown) => Promise<void>
  abortWorkflow: () => void
}

/** 完整的 App Store 类型 */
export type AppState = UiSlice &
  ProjectSlice &
  HistorySlice &
  LibrarySlice &
  CanvasSlice &
  DagEngineSlice &
  Record<string, any>

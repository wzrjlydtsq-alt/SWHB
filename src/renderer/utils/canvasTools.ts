/**
 * AI 副驾 — 画布工具函数层
 *
 * 每个导出函数对应一个 LLM 可调用的工具。
 * 规则：
 *   1. 纯逻辑，不涉及 React 组件 / JSX
 *   2. 通过 useAppStore.getState() 读写全局状态
 *   3. 返回结构化 JSON 供 LLM 解读后回复用户
 */
import { useAppStore } from '../store/useAppStore'
import { getDefaultDirectorState } from '../features/director/useDirectorStore.ts'

type AnyRecord = Record<string, any>

// ══════════════════════════════════════════════
//  查询类工具（只读）
// ══════════════════════════════════════════════

/** 列出画布上所有节点摘要 */
export function list_nodes() {
  const { nodes } = useAppStore.getState()
  return {
    count: nodes.length,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      prompt: (n.settings?.prompt || n.settings?.videoPrompt || '').slice(0, 80) || '(无提示词)',
      model: n.settings?.model || '(未选模型)',
      ratio: n.settings?.ratio || 'Auto',
      status: n.settings?.isGenerating ? '生成中' : n.settings?.error ? '失败' : '空闲'
    }))
  }
}

/** 获取指定节点详细信息 */
export function get_node({ nodeId }) {
  const node = useAppStore.getState().nodesMap.get(nodeId)
  if (!node) return { error: `节点 ${nodeId} 不存在` }
  return {
    id: node.id,
    type: node.type,
    x: Math.round(node.x || 0),
    y: Math.round(node.y || 0),
    width: node.width,
    height: node.height,
    settings: {
      prompt: node.settings?.prompt || '',
      videoPrompt: node.settings?.videoPrompt || '',
      model: node.settings?.model || '',
      ratio: node.settings?.ratio || 'Auto',
      resolution: node.settings?.resolution || 'Auto',
      duration: node.settings?.duration || '',
      batchSize: node.settings?.batchSize || 1,
      isGenerating: !!node.settings?.isGenerating,
      error: node.settings?.error || null,
      outputResultsCount: (node.settings?.outputResults || []).length,
      manualImagesCount: (node.settings?.manualImages || []).length,
      assetIdsCount: (node.settings?.assetIds || []).length
    }
  }
}

/** 查看已配置的模型列表 */
export function get_model_configs() {
  const configs = useAppStore.getState().apiConfigs || []
  return {
    count: configs.length,
    models: configs.map((c) => ({
      id: c.id,
      name: c.provider,
      modelName: c.modelName,
      type: c.type, // 'Chat' | 'Image' | 'Video'
      hasKey: !!c.key
    }))
  }
}

/** 查看生成历史记录 */
export function get_history({ status, type, limit }: any = {}) {
  let history = useAppStore.getState()?.history || []
  if (status) history = history.filter((h) => h.status === status)
  if (type) history = history.filter((h) => h.type === type)
  const items = history.slice(0, limit || 20)
  return {
    total: history.length,
    showing: items.length,
    items: items.map((h) => ({
      id: h.id,
      type: h.type,
      status: h.status,
      prompt: (h.prompt || '').slice(0, 60),
      model: h.modelName || h.model || '',
      time: h.time,
      error: h.error || null
    }))
  }
}

/** 查看资产库指定分类 */
export function get_assets({ category }: any) {
  const projectId = useAppStore.getState().currentProject?.id
  const key = projectId ? `tapnow_asset_library_${projectId}` : 'tapnow_asset_library'
  try {
    const data = JSON.parse(localStorage.getItem(key) || '{}')
    const cat = data[category]
    if (!cat) return { items: [], folders: [], message: '该分类为空' }
    return {
      items: (cat.items || []).map((a) => ({
        id: a.id,
        name: a.name || '未命名',
        hasImage: !!a.url,
        seedanceId: a.seedanceId || null
      })),
      folders: (cat.folders || []).map((f) => ({
        id: f.id,
        name: f.name,
        itemCount: (f.items || []).length
      }))
    }
  } catch {
    return { items: [], folders: [], message: '读取资产库失败' }
  }
}

// ══════════════════════════════════════════════
//  写入类工具
// ══════════════════════════════════════════════

/** 创建节点 */
export function create_node({ type, prompt, model, ratio, resolution, duration }: any) {
  const state = useAppStore.getState()
  const nodes = state.nodes || []

  // 自动计算位置：放在现有节点右侧
  const maxX =
    nodes.length > 0 ? Math.max(...nodes.map((n) => (n.x || 0) + (n.width || 300))) + 40 : 100
  const y = nodes.length > 0 ? nodes[0]?.y || 100 : 100

  const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
  const isVideo = type === 'gen-video'

  const settings: AnyRecord = {}
  if (prompt) settings[isVideo ? 'videoPrompt' : 'prompt'] = prompt
  if (model) settings.model = model
  if (ratio) settings.ratio = ratio
  if (resolution) settings.resolution = resolution
  if (duration) settings.duration = duration

  const newNode = {
    id: nodeId,
    type,
    x: maxX,
    y,
    position: { x: maxX, y },
    width: type === 'director-node' ? 480 : type === 'director-stage' ? 360 : 300,
    height: type === 'director-node' ? 600 : type === 'director-stage' ? 460 : 400,
    data: {},
    settings:
      type === 'director-stage'
        ? {
            ...settings,
            directorState: getDefaultDirectorState(),
            snapshotPath: '',
            prompt: settings.prompt || ''
          }
        : settings
  }

  state.setNodes((prev) => [...prev, newNode as any])
  return { success: true, nodeId, message: `已创建 ${type} 节点` }
}

/** 更新节点设置 */
export function update_node({
  nodeId,
  prompt,
  videoPrompt,
  model,
  ratio,
  resolution,
  duration,
  batchSize
}: any) {
  const state = useAppStore.getState()
  if (!state.nodesMap.has(nodeId)) return { error: `节点 ${nodeId} 不存在` }

  const updates: AnyRecord = {}
  if (prompt !== undefined) updates.prompt = prompt
  if (videoPrompt !== undefined) updates.videoPrompt = videoPrompt
  if (model !== undefined) updates.model = model
  if (ratio !== undefined) updates.ratio = ratio
  if (resolution !== undefined) updates.resolution = resolution
  if (duration !== undefined) updates.duration = duration
  if (batchSize !== undefined) updates.batchSize = batchSize

  state.updateNodeSettingsById(nodeId, updates)
  return { success: true, message: '节点设置已更新', updates }
}

/** 删除节点 */
export function delete_node({ nodeId }) {
  const state = useAppStore.getState()
  if (!state.nodesMap.has(nodeId)) return { error: `节点 ${nodeId} 不存在` }
  state.setNodes((prev) => prev.filter((n) => n.id !== nodeId))
  return { success: true, message: '节点已删除' }
}

/** 切换主题色 */
export function set_theme({ color }) {
  const THEME_MAP = {
    蓝色: '#2563eb',
    紫色: '#7c3aed',
    红色: '#dc2626',
    绿色: '#059669',
    粉色: '#ec4899',
    橙色: '#ea580c',
    深空: '#33334d',
    晴空: '#87CEEB',
    薄荷: '#2ecc71',
    玫瑰: '#e74c3c',
    琥珀: '#f39c12'
  }
  const hex = THEME_MAP[color] || color
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return { error: `无法识别的颜色: ${color}` }
  }
  useAppStore.getState().setThemeColor(hex)
  return { success: true, message: `已切换主题色为 ${color} (${hex})` }
}

/** 开关面板 */
export function toggle_panel({ panel, open }) {
  const s = useAppStore.getState()
  const map = {
    settings: s.setSettingsOpen,
    history: s.setHistoryOpen,
    assets: s.setAssetLibraryOpen,
    projects: s.setProjectListOpen
  }
  const setter = map[panel]
  if (!setter) return { error: `未知面板: ${panel}，可选: settings/history/assets/projects` }
  setter(open)
  return { success: true, message: `${panel} 面板已${open ? '打开' : '关闭'}` }
}

/** 清理历史记录 */
export function clear_history({ status }: any = {}) {
  const state = useAppStore.getState()
  if (status) {
    const before = state.history.length
    state.setHistory((h) => h.filter((item) => item.status !== status))
    const after = useAppStore.getState().history.length
    return {
      success: true,
      removed: before - after,
      message: `已清理 ${before - after} 条 ${status} 记录`
    }
  }
  const count = state.history.length
  state.setHistory([])
  return { success: true, removed: count, message: '历史已全部清空' }
}

/** 编组 */
export function create_group({ nodeIds, name }) {
  const state = useAppStore.getState()
  // 检查节点是否存在
  const missing = nodeIds.filter((id) => !state.nodesMap.has(id))
  if (missing.length > 0) return { error: `以下节点不存在: ${missing.join(', ')}` }
  const groupId = state.createGroup(nodeIds, name)
  return { success: true, groupId, message: `已创建分组 "${name}"` }
}

/** 自动排列节点 */
export function arrange_nodes() {
  const state = useAppStore.getState()
  const nodes = state.nodes
  if (nodes.length === 0) return { message: '画布上没有节点' }

  const cols = Math.ceil(Math.sqrt(nodes.length))
  const gapX = 340
  const gapY = 460
  const arranged = nodes.map((n, i) => ({
    ...n,
    x: 100 + (i % cols) * gapX,
    y: 100 + Math.floor(i / cols) * gapY,
    position: {
      x: 100 + (i % cols) * gapX,
      y: 100 + Math.floor(i / cols) * gapY
    }
  }))
  state.setNodes(arranged)
  return {
    success: true,
    message: `已将 ${nodes.length} 个节点排列为 ${cols} 列网格`
  }
}

// ══════════════════════════════════════════════
//  生成类工具（需要外部注册 startGeneration）
// ══════════════════════════════════════════════

let _startGeneration = null

/** 由 CanvasFeature / ChatFeature 调用，注入 startGeneration 引用 */
export function registerStartGeneration(fn) {
  _startGeneration = fn
}

/** 获取已注册的 startGeneration 引用（供 ProductionBoard 等组件直接调用） */
export function getStartGeneration() {
  return _startGeneration
}

function getLatestHistoryForSourceNode(nodeId, ignoredIds = new Set()) {
  const history = useAppStore.getState().history || []
  return history.find((item) => {
    if (!item || ignoredIds.has(item.id)) return false
    return (item.sourceNodeId || item.originalPayload?.nodeId) === nodeId
  })
}

function buildTaskTrace(item) {
  if (!item) return null
  return {
    historyId: item.id || null,
    requestId: item.requestId || null,
    taskId: item.taskId || null,
    localTaskId: item.localTaskId || null,
    remoteTaskId: item.remoteTaskId || null,
    status: item.status || null,
    modelId: item.apiConfig?.modelId || item.originalPayload?.modelId || null,
    baseUrl: item.apiConfig?.baseUrl || item.originalPayload?.baseUrl || null
  }
}

/** 触发指定节点生成 */
export async function generate({ nodeId }) {
  if (!_startGeneration) return { error: '生成器未就绪，请稍后重试' }

  const node = useAppStore.getState().nodesMap.get(nodeId)
  if (!node) return { error: `节点 ${nodeId} 不存在` }

  const isVideo = node.type === 'gen-video'
  const prompt = isVideo ? node.settings?.videoPrompt || '' : node.settings?.prompt || ''

  if (!prompt.trim()) return { error: '节点提示词为空，请先填入提示词' }

  const images = [...(node.settings?.manualImages || []), ...(node.settings?.assetIds || [])]

  try {
    await _startGeneration(prompt, isVideo ? 'video' : 'image', images, nodeId, {
      ...node.settings,
      batchSize: 1
    })
    const historyItem = getLatestHistoryForSourceNode(nodeId)
    if (historyItem) {
      return {
        success: true,
        message: '已触发生成，请等待完成',
        historyId: historyItem.id || null,
        requestId: historyItem.requestId || null,
        taskId: historyItem.taskId || null,
        taskTrace: buildTaskTrace(historyItem)
      }
    }
    return { success: true, message: '已触发生成，请等待完成' }
  } catch (err) {
    const historyItem = getLatestHistoryForSourceNode(nodeId)
    if (historyItem) {
      return {
        error: `生成触发失败: ${(err as any).message}`,
        historyId: historyItem.id || null,
        requestId: historyItem.requestId || null,
        taskId: historyItem.taskId || null,
        taskTrace: buildTaskTrace(historyItem)
      }
    }
    return { error: `生成触发失败: ${err.message}` }
  }
}

/** 端到端：创建节点 + 配参数 + 触发生成 */
export async function create_and_generate({ type, prompt, model, ratio, resolution, duration }) {
  // 1. 创建节点
  const createResult = create_node({ type, prompt, model, ratio, resolution, duration })
  if (!createResult.success) return createResult

  // 2. 等 React 完成更新
  await new Promise((r) => setTimeout(r, 300))

  // 3. 触发生成
  const genResult = await generate({ nodeId: createResult.nodeId })
  const historyItem = getLatestHistoryForSourceNode(createResult.nodeId)
  return {
    ...genResult,
    nodeId: createResult.nodeId,
    historyId: genResult.historyId || historyItem?.id || null,
    requestId: genResult.requestId || historyItem?.requestId || null,
    taskId: genResult.taskId || historyItem?.taskId || null,
    taskTrace: genResult.taskTrace || buildTaskTrace(historyItem),
    message: genResult.success
      ? `已创建 ${type} 节点并开始生成`
      : `节点已创建 (${createResult.nodeId})，但生成触发失败: ${genResult.error}`
  }
}

// ══════════════════════════════════════════════
//  第四阶段：资产库写入工具
// ══════════════════════════════════════════════

function _getAssetStorageKey() {
  const projectId = useAppStore.getState().currentProject?.id
  return projectId ? `tapnow_asset_library_${projectId}` : 'tapnow_asset_library'
}

function _getAssetData() {
  try {
    return JSON.parse(localStorage.getItem(_getAssetStorageKey()) || '{}')
  } catch {
    return {}
  }
}

function _saveAssetData(data) {
  localStorage.setItem(_getAssetStorageKey(), JSON.stringify(data))
  window.dispatchEvent(new CustomEvent('asset-library-updated'))
}

/** 添加资产到资产库 */
export function add_to_asset_library({ category, url, name }) {
  try {
    const data = _getAssetData()
    if (!data[category] || typeof data[category] !== 'object') {
      data[category] = { folders: [], items: [] }
    }
    if (Array.isArray(data[category])) {
      data[category] = { folders: [], items: data[category] }
    }
    if (!Array.isArray(data[category].items)) {
      data[category].items = []
    }

    const assetName = name || url.split(/[/\\]/).pop() || `asset-${Date.now()}`
    const ext = assetName.split('.').pop()?.toLowerCase() || ''
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
    const videoExts = ['mp4', 'webm', 'mov']
    let type = 'image/png'
    if (imageExts.includes(ext)) type = `image/${ext === 'jpg' ? 'jpeg' : ext}`
    else if (videoExts.includes(ext)) type = `video/${ext}`

    const assetId = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    data[category].items.push({
      id: assetId,
      name: assetName,
      type,
      path: url,
      url,
      addedAt: Date.now()
    })
    _saveAssetData(data)
    return { success: true, assetId, message: `已添加到 ${category} 资产库` }
  } catch (e) {
    return { error: `添加资产失败: ${e.message}` }
  }
}

/** 在资产库中创建文件夹 */
export function create_asset_folder({ category, folderName }) {
  try {
    const data = _getAssetData()
    if (!data[category] || typeof data[category] !== 'object') {
      data[category] = { folders: [], items: [] }
    }
    if (!Array.isArray(data[category].folders)) {
      data[category].folders = []
    }

    const folderId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    data[category].folders.push({
      id: folderId,
      name: folderName,
      items: [],
      createdAt: Date.now()
    })
    _saveAssetData(data)
    return { success: true, folderId, message: `已在 ${category} 中创建文件夹 "${folderName}"` }
  } catch (e) {
    return { error: `创建文件夹失败: ${e.message}` }
  }
}

/** 把历史记录中的结果存入资产库 */
export function save_history_to_assets({ historyId, category }) {
  const hist = (useAppStore.getState().history || []).find((h) => h.id === historyId)
  if (!hist) return { error: `历史记录 ${historyId} 不存在` }
  const url = hist.resultUrl || hist.localPath || hist.url
  if (!url) return { error: '该记录没有可用的资源 URL' }

  return add_to_asset_library({
    category: category || (hist.type === 'video' ? 'materials' : 'scenes'),
    url,
    name: `${hist.type}_${hist.id}`
  })
}

// ══════════════════════════════════════════════
//  第四阶段：导演分镜工具
// ══════════════════════════════════════════════

/** 配置导演节点 */
export function setup_director({ nodeId, idea, ratio, duration, style, direction }: any) {
  const state = useAppStore.getState()
  const node = state.nodesMap.get(nodeId)
  if (!node) return { error: `节点 ${nodeId} 不存在` }
  if (node.type !== 'director-node')
    return { error: `节点 ${nodeId} 不是导演节点，类型为 ${node.type}` }

  const updates: AnyRecord = {}
  if (idea !== undefined) updates.idea = idea
  if (ratio !== undefined) updates.ratio = ratio
  if (duration !== undefined) updates.duration = duration
  if (style !== undefined) updates.style = style
  if (direction !== undefined) updates.direction = direction

  state.updateNodeSettingsById(nodeId, updates)
  return { success: true, message: '导演节点已配置', updates }
}

/** 读取导演节点的剧本和分镜 */
export function get_director_script({ nodeId }) {
  const node = useAppStore.getState().nodesMap.get(nodeId)
  if (!node) return { error: `节点 ${nodeId} 不存在` }
  if (node.type !== 'director-node') return { error: '不是导演节点' }

  const s = node.settings || {}
  return {
    idea: s.idea || '',
    ratio: s.ratio || '16:9',
    duration: s.duration || '45秒',
    style: s.style || '写实风',
    direction: s.direction || '搞笑',
    hasScript: !!s.scriptData,
    script: s.scriptData
      ? {
          title: s.scriptData.title,
          characterCount: (s.scriptData.characters || []).length,
          sceneCount: (s.scriptData.scenes || []).length,
          shotCount: (s.scriptData.shots || []).length,
          shots: (s.scriptData.shots || []).map((shot) => ({
            id: shot.id,
            scene: shot.scene,
            promptCn: shot.prompt_cn || '',
            prompt: (shot.prompt || '').slice(0, 60),
            duration: shot.duration,
            hasImage: !!(s.shotImages || {})[shot.id],
            hasVideo: !!(s.shotVideos || {})[shot.id]
          }))
        }
      : null
  }
}

/** 修改导演节点的某个分镜 */
export function update_director_shot({ nodeId, shotId, prompt, promptCn, duration }) {
  const state = useAppStore.getState()
  const node = state.nodesMap.get(nodeId)
  if (!node) return { error: `节点 ${nodeId} 不存在` }
  if (!node.settings?.scriptData?.shots) return { error: '该节点没有剧本数据' }

  const shots = [...node.settings.scriptData.shots]
  const idx = shots.findIndex((s) => s.id === shotId)
  if (idx === -1) return { error: `分镜 ${shotId} 不存在` }

  if (prompt !== undefined) shots[idx] = { ...shots[idx], prompt }
  if (promptCn !== undefined) shots[idx] = { ...shots[idx], prompt_cn: promptCn }
  if (duration !== undefined) shots[idx] = { ...shots[idx], duration }

  state.updateNodeSettingsById(nodeId, {
    scriptData: { ...node.settings.scriptData, shots }
  })
  return { success: true, message: `分镜 ${shotId} 已更新` }
}

// ══════════════════════════════════════════════
//  第四阶段：批量操作 & 辅助工具
// ══════════════════════════════════════════════

/** 批量更新多个节点 */
export function batch_update_nodes({ updates }) {
  const state = useAppStore.getState()
  const results = []
  for (const { nodeId, ...settings } of updates) {
    if (!state.nodesMap.has(nodeId)) {
      results.push({ nodeId, success: false, error: '不存在' })
      continue
    }
    state.updateNodeSettingsById(nodeId, settings)
    results.push({ nodeId, success: true })
  }
  const ok = results.filter((r) => r.success).length
  return { success: true, total: updates.length, updated: ok, results }
}

/** 选中节点（让画布聚焦到该节点） */
export function select_node({ nodeId }) {
  const state = useAppStore.getState()
  if (!state.nodesMap.has(nodeId)) return { error: `节点 ${nodeId} 不存在` }
  state.setSelectedNodeId(nodeId)
  state.setSelectedNodeIds(new Set([nodeId]))
  return { success: true, message: `已选中节点 ${nodeId}` }
}

/** 复制节点 */
export function duplicate_node({ nodeId }) {
  const state = useAppStore.getState()
  const node = state.nodesMap.get(nodeId)
  if (!node) return { error: `节点 ${nodeId} 不存在` }

  const newId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
  const newNode = {
    ...node,
    id: newId,
    x: (node.x || 0) + 40,
    y: (node.y || 0) + 40,
    position: { x: (node.x || 0) + 40, y: (node.y || 0) + 40 },
    settings: { ...(node.settings || {}), outputResults: [], isGenerating: false, error: null }
  }

  state.setNodes((prev) => [...prev, newNode])
  return { success: true, newNodeId: newId, message: `已复制节点，新节点 ID: ${newId}` }
}

// ══════════════════════════════════════════════
//  第五波：进阶操作工具
// ══════════════════════════════════════════════

/** 移动节点到指定位置 */
export function move_node({ nodeId, x, y }) {
  const state = useAppStore.getState()
  if (!state.nodesMap.has(nodeId)) return { error: `节点 ${nodeId} 不存在` }
  state.setNodes((prev) =>
    prev.map((n) => (n.id === nodeId ? { ...n, x, y, position: { x, y } } : n))
  )
  return { success: true, message: `节点已移动到 (${x}, ${y})` }
}

/** 调整节点大小 */
export function resize_node({ nodeId, width, height }) {
  const state = useAppStore.getState()
  if (!state.nodesMap.has(nodeId)) return { error: `节点 ${nodeId} 不存在` }
  state.setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, width, height } : n)))
  return { success: true, message: `节点大小已调整为 ${width}x${height}` }
}

/** 移除分组 */
export function remove_group({ groupId }) {
  const state = useAppStore.getState()
  const groups = state.nodeGroups || []
  if (!groups.find((g) => g.id === groupId)) return { error: `分组 ${groupId} 不存在` }
  state.removeGroup(groupId)
  return { success: true, message: '分组已移除（节点保留）' }
}

/** 搜索节点（按提示词关键字） */
export function search_nodes({ keyword }) {
  const nodes = useAppStore.getState().nodes || []
  const kw = keyword.toLowerCase()
  const matched = nodes.filter((n) => {
    const p = (n.settings?.prompt || n.settings?.videoPrompt || '').toLowerCase()
    const t = (n.type || '').toLowerCase()
    const id = (n.id || '').toLowerCase()
    return p.includes(kw) || t.includes(kw) || id.includes(kw)
  })
  return {
    count: matched.length,
    nodes: matched.map((n) => ({
      id: n.id,
      type: n.type,
      prompt: (n.settings?.prompt || n.settings?.videoPrompt || '').slice(0, 60)
    }))
  }
}

/** 获取画布统计摘要 */
export function get_canvas_stats() {
  const state = useAppStore.getState()
  const nodes = state.nodes || []
  const hist = state.history || []
  const groups = state.nodeGroups || []

  const byType = {}
  nodes.forEach((n) => {
    byType[n.type] = (byType[n.type] || 0) + 1
  })

  const generating = nodes.filter((n) => n.settings?.isGenerating).length
  const withErrors = nodes.filter((n) => n.settings?.error).length
  const withPrompt = nodes.filter((n) => n.settings?.prompt || n.settings?.videoPrompt).length

  return {
    nodeCount: nodes.length,
    byType,
    generating,
    withErrors,
    withPrompt,
    emptyNodes: nodes.length - withPrompt,
    groupCount: groups.length,
    historyTotal: hist.length,
    historyCompleted: hist.filter((h) => h.status === 'completed').length,
    historyFailed: hist.filter((h) => h.status === 'failed').length
  }
}

/** 重试所有失败的历史任务（重新创建节点并生成） */
export async function retry_failed_tasks({ limit, confirm = false }) {
  const hist = useAppStore.getState().history || []
  const failed = hist.filter((h) => h.status === 'failed').slice(0, limit || 5)

  if (failed.length === 0) return { message: '没有失败的任务' }

  if (!confirm) {
    return {
      success: false,
      requiresConfirmation: true,
      message: 'Set confirm=true to resubmit failed tasks.',
      candidates: failed.map((item) => ({
        id: item.id,
        type: item.type,
        model: item.modelName || item.apiConfig?.modelId || null,
        prompt: item.prompt || ''
      }))
    }
  }

  const results = []
  for (const item of failed) {
    const type = item.type === 'video' ? 'gen-video' : 'gen-image'
    const prompt = item.prompt || ''
    if (!prompt.trim()) {
      results.push({ id: item.id, success: false, error: '提示词为空' })
      continue
    }

    const res = await create_and_generate({
      type,
      prompt,
      model: item.model || item.modelName || undefined
    } as any)
    results.push({ id: item.id, success: !!res.success, nodeId: res.nodeId })
  }

  const ok = results.filter((r) => r.success).length
  return { success: true, retried: results.length, succeeded: ok, results }
}

export const CANVAS_CLEAR_CONFIRM_TOKEN = 'CLEAR_CANVAS'

/** 清空整个画布 */
export function clear_canvas({ confirm = '' } = {}) {
  const state = useAppStore.getState()
  const count = state.nodes.length
  if (confirm !== CANVAS_CLEAR_CONFIRM_TOKEN) {
    return {
      error: '清空画布是高危操作，必须由用户明确要求，并传入 confirm="CLEAR_CANVAS"'
    }
  }
  if (count === 0) return { message: '画布已经是空的' }
  console.warn(`[CanvasGuard] clear_canvas confirmed, clearing ${count} nodes.`)
  state.setNodes([])
  return { success: true, removed: count, message: `已清空画布（删除了 ${count} 个节点）` }
}

// ══════════════════════════════════════════════
//  Wave 1：本地文件系统工具
// ══════════════════════════════════════════════

const WORKSPACE_ACCESS_POLICY_KEY = 'workspace_home_access_policy_v1'
const WORKSPACE_FOLDERS_KEY = 'workspace_home_folders_v1'
const WORKSPACE_FILES_KEY = 'workspace_home_files_v1'
const WORKSPACE_AUDIT_LOG_KEY = 'workspace_home_audit_log_v1'
const WORKSPACE_PENDING_OPS_KEY = 'workspace_home_pending_operations_v1'
const WORKSPACE_INDEX_KEY = 'workspace_home_index_v1'
const WORKSPACE_APPROVAL_MODE_KEY = 'workspace_home_approval_mode_v1'
const WORKSPACE_TASKS_KEY = 'workspace_home_tasks_v1'
const WORKSPACE_BROWSER_TARGETS_KEY = 'workspace_home_browser_targets_v1'
const WORKSPACE_REVIEW_REPORTS_KEY = 'workspace_home_review_reports_v1'

function normalizeLocalPath(value?: string) {
  return (value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function getWorkspaceAccessPolicy() {
  try {
    return JSON.parse(localStorage.getItem(WORKSPACE_ACCESS_POLICY_KEY) || '{}')
  } catch {
    return {}
  }
}

function getWorkspaceApprovalMode() {
  const policy = getWorkspaceAccessPolicy()
  const mode = policy.approvalMode || localStorage.getItem(WORKSPACE_APPROVAL_MODE_KEY)
  return mode === 'auto' || mode === 'risky' ? mode : 'request'
}

function shouldQueueWorkspaceOperation(kind: 'write' | 'delete' | 'command') {
  const mode = getWorkspaceApprovalMode()
  if (mode === 'auto') return false
  if (mode === 'risky') return kind === 'delete' || kind === 'command'
  return true
}

function readWorkspaceArray(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function writeWorkspaceArray(key: string, value: any[]) {
  localStorage.setItem(key, JSON.stringify(value.slice(0, 200)))
  window.dispatchEvent(new CustomEvent(`${key}:updated`, { detail: value }))
}

function normalizeBrowserUrl(value?: string) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (/^https?:\/\/lingjingxinghe\.top(?::\d+)?(?:[/?#]|$)/i.test(trimmed)) {
    return trimmed.replace(/^https?:\/\/lingjingxinghe\.top/i, 'https://www.lingjingxinghe.top')
  }
  if (/^(https?:|file:)/i.test(trimmed)) return trimmed
  if (/^lingjingxinghe\.top(?::\d+)?(?:[/?#]|$)/i.test(trimmed)) {
    return `https://www.${trimmed}`
  }
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(trimmed)) {
    return `http://${trimmed}`
  }
  return `https://${trimmed}`
}

function recordWorkspaceAudit(entry: Record<string, any>) {
  const next = [
    {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      ...entry
    },
    ...readWorkspaceArray(WORKSPACE_AUDIT_LOG_KEY)
  ].slice(0, 200)
  writeWorkspaceArray(WORKSPACE_AUDIT_LOG_KEY, next)
}

function queueWorkspaceOperation(operation: Record<string, any>) {
  const pending: AnyRecord = {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    status: 'pending',
    ...operation
  }
  const next = [pending, ...readWorkspaceArray(WORKSPACE_PENDING_OPS_KEY)].slice(0, 200)
  writeWorkspaceArray(WORKSPACE_PENDING_OPS_KEY, next)
  recordWorkspaceAudit({
    type: 'approval_requested',
    operation: pending.operation,
    targetPath: pending.targetPath,
    sourcePath: pending.sourcePath,
    command: pending.command
  })
  return {
    success: false,
    requiresApproval: true,
    operation: pending,
    message: '已加入工作台操作审核队列，等待用户确认后执行。'
  }
}

function isLocalPathAllowed(targetPath?: string) {
  if (!targetPath) return false
  const policy = getWorkspaceAccessPolicy()
  if (policy.mode === 'global') return true
  const normalized = normalizeLocalPath(targetPath)
  const roots = Array.isArray(policy.roots) ? policy.roots : []
  return roots.some((root) => {
    const normalizedRoot = normalizeLocalPath(root)
    return (
      normalizedRoot &&
      (normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`))
    )
  })
}

function requireLocalPathAccess(targetPath?: string) {
  if (isLocalPathAllowed(targetPath)) return null
  return {
    error: '当前工作台没有这个本机路径的访问权限。请在输入框下方选择目录，或开启全局电脑访问。'
  }
}

function requireActionPermission(action: 'read' | 'write' | 'delete' | 'command') {
  const policy = getWorkspaceAccessPolicy()
  const permissions = policy.permissions || {}
  if (permissions[action]) return null
  return {
    error: `当前工作台未开启“${action}”权限。请在输入框下方的访问设置里打开对应权限。`
  }
}

function requireCommandAccess(cwd?: string) {
  const permissionDenied = requireActionPermission('command')
  if (permissionDenied) return permissionDenied
  const policy = getWorkspaceAccessPolicy()
  if (policy.mode === 'global') return null
  if (cwd && isLocalPathAllowed(cwd)) return null
  return {
    error:
      '当前工作台未开启全局电脑访问，不能执行命令。请开启全局电脑访问，或把 cwd 设为已授权目录。'
  }
}

export function get_computer_access_status() {
  const policy = getWorkspaceAccessPolicy()
  return {
    success: true,
    mode: policy.mode || 'scoped',
    roots: Array.isArray(policy.roots) ? policy.roots : [],
    permissions: policy.permissions || {},
    approvalMode: getWorkspaceApprovalMode(),
    activeFileId: policy.activeFileId || null
  }
}

export function get_workspace_context({
  includeIndex = true,
  includeMaterials = true,
  includeTasks = true,
  includeBrowser = true,
  includeReviews = true
} = {}) {
  const policy = getWorkspaceAccessPolicy()
  const folders = readWorkspaceArray(WORKSPACE_FOLDERS_KEY)
  const files = readWorkspaceArray(WORKSPACE_FILES_KEY)
  const folderNameById = new Map(folders.map((folder: any) => [folder.id, folder.name]))
  const activeFile = files.find((file: any) => file.id === policy.activeFileId) || null
  const materials = includeMaterials
    ? files
        .slice()
        .sort(
          (left: any, right: any) =>
            new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
        )
        .flatMap((file: any) => {
          const folderId = file.folderId || '__root__'
          return (file.materialRefs || []).map((item: any) => ({
            id: item.id,
            name: item.name,
            type: item.type,
            kind: item.kind,
            path: item.path,
            cachedUrl: item.cachedUrl,
            summary: item.summary,
            sourceFileId: file.id,
            sourceFileName: file.name,
            sourceFolderId: folderId,
            sourceFolderName: folderNameById.get(folderId) || '工作台项目'
          }))
        })
        .slice(0, 30)
    : []
  return {
    success: true,
    access: {
      mode: policy.mode || 'scoped',
      roots: Array.isArray(policy.roots) ? policy.roots : [],
      permissions: policy.permissions || {},
      approvalMode: getWorkspaceApprovalMode()
    },
    activeFile: activeFile
      ? {
          id: activeFile.id,
          name: activeFile.name,
          folderId: activeFile.folderId,
          cacheRoot: activeFile.cacheRoot,
          approvalMode: activeFile.approvalMode || null,
          allowedRoots: activeFile.allowedRoots || [],
          updatedAt: activeFile.updatedAt,
          messageCount: Array.isArray(activeFile.messages) ? activeFile.messages.length : 0,
          materialCount: Array.isArray(activeFile.materialRefs) ? activeFile.materialRefs.length : 0
        }
      : null,
    folders: folders.slice(0, 30).map((folder: any) => ({
      id: folder.id,
      name: folder.name,
      localPath: folder.localPath || null
    })),
    files: files.slice(0, 30).map((file: any) => ({
      id: file.id,
      name: file.name,
      folderId: file.folderId || null,
      cacheRoot: file.cacheRoot || null,
      approvalMode: file.approvalMode || null,
      updatedAt: file.updatedAt,
      materialCount: Array.isArray(file.materialRefs) ? file.materialRefs.length : 0
    })),
    index: includeIndex ? readWorkspaceArray(WORKSPACE_INDEX_KEY).slice(0, 60) : [],
    materials,
    tasks: includeTasks ? readWorkspaceArray(WORKSPACE_TASKS_KEY).slice(0, 20) : [],
    browserTargets: includeBrowser
      ? readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY).slice(0, 12)
      : [],
    reviewReports: includeReviews
      ? readWorkspaceArray(WORKSPACE_REVIEW_REPORTS_KEY).slice(0, 8)
      : []
  }
}

function normalizeDocumentSearchText(value = '') {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim()
}

function scoreDocumentChunk(text: string, query: string, terms: string[]) {
  const normalized = normalizeDocumentSearchText(text)
  if (!normalized || !query) return 0
  let score = normalized.includes(query) ? 10 : 0
  for (const term of terms) {
    if (term && normalized.includes(term)) score += 2
  }
  return score
}

function makeDocumentExcerpt(text: string, query: string, limit = 520) {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized.length <= limit) return normalized
  const lower = normalized.toLowerCase()
  const index = query ? lower.indexOf(query) : -1
  const start = index > 0 ? Math.max(0, index - Math.floor(limit / 3)) : 0
  const end = Math.min(normalized.length, start + limit)
  return `${start > 0 ? '...' : ''}${normalized.slice(start, end)}${end < normalized.length ? '...' : ''}`
}

export function search_workspace_documents({ query, materialId, fileName, limit = 8 }: any = {}) {
  const normalizedQuery = normalizeDocumentSearchText(query)
  if (!normalizedQuery) return { error: '请提供要搜索的关键词。' }
  const terms = normalizedQuery.split(/\s+/).filter(Boolean).slice(0, 8)
  const files = readWorkspaceArray(WORKSPACE_FILES_KEY)
  const folderNameById = new Map(
    readWorkspaceArray(WORKSPACE_FOLDERS_KEY).map((folder: any) => [folder.id, folder.name])
  )
  const results: any[] = []

  for (const file of files) {
    const refs = Array.isArray(file.materialRefs) ? file.materialRefs : []
    for (const material of refs) {
      if (materialId && material.id !== materialId) continue
      if (
        fileName &&
        !String(material.name || '')
          .toLowerCase()
          .includes(String(fileName).toLowerCase())
      )
        continue
      const source = {
        materialId: material.id,
        materialName: material.name,
        materialType: material.type,
        materialPath: material.path || material.cachedUrl || '',
        sourceFileId: file.id,
        sourceFileName: file.name,
        sourceFolderId: file.folderId || '__root__',
        sourceFolderName: folderNameById.get(file.folderId || '__root__') || '工作台项目'
      }
      const index = material.documentIndex
      if (index?.chunks?.length) {
        for (const chunk of index.chunks) {
          const score = scoreDocumentChunk(chunk.text || '', normalizedQuery, terms)
          if (!score) continue
          results.push({
            score,
            ...source,
            indexKind: index.kind,
            chunkId: chunk.id,
            chunkKind: chunk.kind,
            label: chunk.label,
            page: chunk.page,
            sheet: chunk.sheet,
            rowStart: chunk.rowStart,
            rowEnd: chunk.rowEnd,
            excerpt: makeDocumentExcerpt(chunk.text || '', normalizedQuery)
          })
        }
      } else {
        const text =
          material.textContent ||
          (!String(material.content || '').startsWith('data:') ? material.content : '')
        const score = scoreDocumentChunk(text || '', normalizedQuery, terms)
        if (score) {
          results.push({
            score,
            ...source,
            indexKind: 'text',
            chunkKind: 'text',
            label: 'Text',
            excerpt: makeDocumentExcerpt(text || '', normalizedQuery)
          })
        }
      }
    }
  }

  const sorted = results
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(Number(limit) || 8, 20)))
  recordWorkspaceAudit({
    type: sorted.length ? 'workspace_document_search' : 'workspace_document_search_empty',
    targetPath: query,
    success: true
  })
  return {
    success: true,
    query,
    count: sorted.length,
    results: sorted.map(({ score, ...item }) => item)
  }
}

/** 读取本地文本文件 */
export async function read_local_file({ filePath }) {
  const permissionDenied = requireActionPermission('read')
  if (permissionDenied) return permissionDenied
  const denied = requireLocalPathAccess(filePath)
  if (denied) return denied
  const result = (await window.api.fsAPI.readTextFile(filePath)) as any
  recordWorkspaceAudit({
    type: result.error ? 'read_file_failed' : 'read_file',
    targetPath: filePath,
    success: !result.error,
    error: result.error
  })
  if (result.error) return result
  return {
    success: true,
    name: result.name,
    ext: result.ext,
    size: result.size,
    content: result.content.slice(0, 3000),
    truncated: result.content.length > 3000,
    totalLength: result.content.length,
    message: `已读取 ${result.name}（${result.content.length} 字符）`
  }
}

/** 列出本地文件夹内容 */
export async function list_local_directory({ dirPath, filter }) {
  const permissionDenied = requireActionPermission('read')
  if (permissionDenied) return permissionDenied
  const denied = requireLocalPathAccess(dirPath)
  if (denied) return denied
  const result = await window.api.fsAPI.listDirectory(dirPath, filter)
  recordWorkspaceAudit({
    type: result.error ? 'list_directory_failed' : 'list_directory',
    targetPath: dirPath,
    filter,
    success: !result.error,
    error: result.error
  })
  return result
}

/** 把本地文件夹中的图片载入到节点做参考图 */
export async function load_local_images_to_node({ nodeId, dirPath }) {
  const permissionDenied = requireActionPermission('read')
  if (permissionDenied) return permissionDenied
  const denied = requireLocalPathAccess(dirPath)
  if (denied) return denied
  const state = useAppStore.getState()
  if (!state.nodesMap.has(nodeId)) return { error: `节点 ${nodeId} 不存在` }

  const result = (await window.api.fsAPI.readImagesAsPaths(dirPath)) as any
  if (result.error) return result
  if (result.count === 0) return { error: '该目录下没有图片文件' }

  const localPaths = result.images.map((img) => img.path)
  const existing = state.nodesMap.get(nodeId).settings?.manualImages || []
  state.updateNodeSettingsById(nodeId, {
    manualImages: [...existing, ...localPaths]
  })
  return {
    success: true,
    loadedCount: result.count,
    images: result.images.map((i) => i.name),
    message: `已加载 ${result.count} 张本地图片到节点`
  }
}

/** 弹出系统文件选择器 */
export async function pick_file_dialog() {
  const result = await window.api.localCacheAPI.openFiles({
    filters: [
      { name: '文本文件', extensions: ['txt', 'md', 'json', 'csv', 'srt'] },
      { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    multiple: false
  })
  const filePath = result?.paths?.[0]
  if (!result?.success || !filePath) return { cancelled: true, message: '用户取消了选择' }
  return { success: true, filePath, message: `已选择: ${filePath}` }
}

/** 弹出系统文件夹选择器 */
export async function pick_folder_dialog() {
  const result = await window.api.localCacheAPI.openDirectory()
  if (!result?.success || !result.path) return { cancelled: true, message: '用户取消了选择' }
  return { success: true, dirPath: result.path, message: `已选择文件夹: ${result.path}` }
}

export async function write_local_text_file({
  filePath,
  content = '',
  append = false,
  approved = false
}) {
  const permissionDenied = requireActionPermission('write')
  if (permissionDenied) return permissionDenied
  const denied = requireLocalPathAccess(filePath)
  if (denied) return denied
  if (!approved && shouldQueueWorkspaceOperation('write')) {
    return queueWorkspaceOperation({
      operation: 'write_text_file',
      targetPath: filePath,
      content,
      append,
      preview: String(content || '').slice(0, 2000)
    })
  }
  const result = await window.api.fsAPI.writeTextFile({
    filePath,
    content,
    append,
    createDirs: true
  })
  recordWorkspaceAudit({
    type: 'write_text_file',
    targetPath: filePath,
    success: result.success,
    error: result.error
  })
  return result
}

export async function copy_local_path({
  sourcePath,
  targetPath,
  overwrite = false,
  approved = false
}) {
  const permissionDenied = requireActionPermission('write')
  if (permissionDenied) return permissionDenied
  const deniedSource = requireLocalPathAccess(sourcePath)
  if (deniedSource) return deniedSource
  const deniedTarget = requireLocalPathAccess(targetPath)
  if (deniedTarget) return deniedTarget
  if (!approved && shouldQueueWorkspaceOperation('write')) {
    return queueWorkspaceOperation({ operation: 'copy_path', sourcePath, targetPath, overwrite })
  }
  const result = await window.api.fsAPI.copyPath({ sourcePath, targetPath, overwrite })
  recordWorkspaceAudit({
    type: 'copy_path',
    sourcePath,
    targetPath,
    success: result.success,
    error: result.error
  })
  return result
}

export async function move_local_path({
  sourcePath,
  targetPath,
  overwrite = false,
  approved = false
}) {
  const permissionDenied = requireActionPermission('write')
  if (permissionDenied) return permissionDenied
  const deniedSource = requireLocalPathAccess(sourcePath)
  if (deniedSource) return deniedSource
  const deniedTarget = requireLocalPathAccess(targetPath)
  if (deniedTarget) return deniedTarget
  if (!approved && shouldQueueWorkspaceOperation('write')) {
    return queueWorkspaceOperation({ operation: 'move_path', sourcePath, targetPath, overwrite })
  }
  const result = await window.api.fsAPI.movePath({ sourcePath, targetPath, overwrite })
  recordWorkspaceAudit({
    type: 'move_path',
    sourcePath,
    targetPath,
    success: result.success,
    error: result.error
  })
  return result
}

export async function delete_local_path({ targetPath, recursive = false, approved = false }) {
  const permissionDenied = requireActionPermission('delete')
  if (permissionDenied) return permissionDenied
  const denied = requireLocalPathAccess(targetPath)
  if (denied) return denied
  if (!approved && shouldQueueWorkspaceOperation('delete')) {
    return queueWorkspaceOperation({ operation: 'delete_path', targetPath, recursive })
  }
  const result = await window.api.fsAPI.deletePath({ targetPath, recursive })
  recordWorkspaceAudit({
    type: 'delete_path',
    targetPath,
    success: result.success,
    error: result.error
  })
  return result
}

export async function make_local_directory({ dirPath }) {
  const permissionDenied = requireActionPermission('write')
  if (permissionDenied) return permissionDenied
  const denied = requireLocalPathAccess(dirPath)
  if (denied) return denied
  const result = await window.api.fsAPI.makeDirectory({ dirPath })
  recordWorkspaceAudit({
    type: 'make_directory',
    targetPath: dirPath,
    success: result.success,
    error: result.error
  })
  return result
}

export async function open_local_path({ targetPath }) {
  const permissionDenied = requireActionPermission('read')
  if (permissionDenied) return permissionDenied
  const denied = requireLocalPathAccess(targetPath)
  if (denied) return denied
  const result = await window.api.fsAPI.openPath(targetPath)
  recordWorkspaceAudit({
    type: 'open_path',
    targetPath,
    success: result.success,
    error: result.error
  })
  return result
}

export async function run_local_command({ command, cwd, timeoutMs, approved = false }) {
  const denied = requireCommandAccess(cwd)
  if (denied) return denied
  if (!approved && shouldQueueWorkspaceOperation('command')) {
    return queueWorkspaceOperation({ operation: 'run_command', command, cwd, timeoutMs })
  }
  const result = await window.api.fsAPI.runCommand({ command, cwd, timeoutMs })
  recordWorkspaceAudit({
    type: 'run_command',
    command,
    cwd,
    success: result.success,
    error: result.error
  })
  return result
}

export async function start_terminal_session({ command, cwd }) {
  const denied = requireCommandAccess(cwd)
  if (denied) return denied
  if (command && shouldQueueWorkspaceOperation('command')) {
    return queueWorkspaceOperation({ operation: 'start_terminal', command, cwd })
  }
  const result = await window.api.terminalAPI.start({ cwd, command })
  recordWorkspaceAudit({
    type: 'start_terminal',
    cwd,
    success: result.success,
    error: result.error
  })
  return result
}

export async function open_browser_url({ url, note }) {
  const normalized = normalizeBrowserUrl(url)
  if (!normalized) return { error: '缺少 URL' }
  const result = await window.api.windowAPI.openExternal(normalized)
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: normalized,
      note: note || 'AI 打开',
      status: result?.success ? 'opened' : 'ready',
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_opened' : 'browser_open_failed',
    targetPath: normalized,
    success: !!result?.success,
    error: result?.error
  })
  return result?.success
    ? { success: true, url: normalized, message: `已打开浏览器: ${normalized}` }
    : { success: false, url: normalized, error: result?.error || '打开失败' }
}

export function create_browser_review_task({ url, note }) {
  const normalized = normalizeBrowserUrl(url)
  const now = new Date().toISOString()
  const tasks = readWorkspaceArray(WORKSPACE_TASKS_KEY)
  const task = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: normalized ? `浏览器验证：${normalized}` : '浏览器验证任务',
    status: 'waiting',
    channel: 'browser',
    note: note || '',
    updatedAt: now
  }
  writeWorkspaceArray(WORKSPACE_TASKS_KEY, [task, ...tasks])
  recordWorkspaceAudit({
    type: 'browser_review_task_created',
    targetPath: normalized,
    success: true
  })
  return { success: true, task, message: '已创建浏览器验证任务' }
}

export async function inspect_browser_url({ url, note }) {
  const normalized = normalizeBrowserUrl(url)
  if (!normalized) return { error: '缺少 URL' }
  const result = await window.api.windowAPI.inspectUrl(normalized)
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: normalized,
      note: note || 'AI 检查',
      status: result?.success ? 'done' : 'ready',
      httpStatus: result?.status,
      title: result?.title,
      contentType: result?.contentType,
      checkedAt: now,
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_url_inspected' : 'browser_url_inspect_failed',
    targetPath: normalized,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function capture_browser_url_screenshot({ url, note }) {
  const normalized = normalizeBrowserUrl(url)
  if (!normalized) return { error: '缺少 URL' }
  const result = await window.api.windowAPI.captureUrlScreenshot(normalized)
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: normalized,
      note: note || 'AI 截图',
      status: result?.success ? 'done' : 'ready',
      screenshotPath: result?.screenshotPath,
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_screenshot_captured' : 'browser_screenshot_failed',
    targetPath: normalized,
    success: !!result?.success,
    error: result?.error
  })
  return result?.success
    ? { success: true, url: normalized, screenshotPath: result.screenshotPath }
    : { success: false, url: normalized, error: result?.error || '截图失败' }
}

export async function inspect_browser_dom({ url, note }) {
  const normalized = normalizeBrowserUrl(url)
  if (!normalized) return { error: '缺少 URL' }
  const result = await window.api.windowAPI.inspectUrlDom(normalized)
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: normalized,
      note: note || 'AI DOM 检查',
      status: result?.success ? 'done' : 'ready',
      title: result?.title,
      domSummary: result?.success
        ? `${result?.elements?.length || 0} 个可交互元素；${result?.heading || result?.title || ''}`
        : '',
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_dom_inspected' : 'browser_dom_failed',
    targetPath: normalized,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function click_browser_element({ url, selector, text, note }) {
  const normalized = normalizeBrowserUrl(url)
  if (!normalized) return { error: '缺少 URL' }
  if (!selector && !text) return { error: '缺少 selector 或文本' }
  const result = await window.api.windowAPI.clickUrlSelector({ url: normalized, selector, text })
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: normalized,
      note: note || `AI 点击：${selector || text}`,
      status: result?.success ? 'done' : 'ready',
      title: result?.title,
      finalUrl: result?.finalUrl,
      action: selector ? `selector=${selector}` : `text=${text}`,
      screenshotPath: result?.screenshotPath,
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_element_clicked' : 'browser_click_failed',
    targetPath: normalized,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function capture_browser_viewport_matrix({ url, viewports, note }) {
  const normalized = normalizeBrowserUrl(url)
  if (!normalized) return { error: '缺少 URL' }
  const result = await window.api.windowAPI.captureUrlViewportMatrix({
    url: normalized,
    viewports
  })
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: normalized,
      note: note || 'AI 视口矩阵',
      status: result?.success ? 'done' : 'ready',
      title: result?.captures?.[0]?.title,
      screenshotPath: result?.captures?.[0]?.screenshotPath,
      viewportSummary: result?.success
        ? result.captures?.map((item) => `${item.name}:${item.width}x${item.height}`).join('；')
        : '',
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_viewport_matrix' : 'browser_viewport_matrix_failed',
    targetPath: normalized,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function annotate_browser_screenshot({ url, selectors, texts, width, height, note }) {
  const normalized = normalizeBrowserUrl(url)
  if (!normalized) return { error: '缺少 URL' }
  const result = await window.api.windowAPI.annotateUrlScreenshot({
    url: normalized,
    selectors,
    texts,
    width,
    height
  })
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: normalized,
      note: note || 'AI 页面标注',
      status: result?.success ? 'done' : 'ready',
      title: result?.title,
      screenshotPath: result?.screenshotPath,
      annotationSummary: result?.success ? `${result?.annotations?.length || 0} 个标注` : '',
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_screenshot_annotated' : 'browser_annotation_failed',
    targetPath: normalized,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function inspect_browser_console({ url, limit, width, height, note }) {
  const normalized = normalizeBrowserUrl(url)
  if (!normalized) return { error: '缺少 URL' }
  const result = await window.api.windowAPI.inspectUrlConsole({
    url: normalized,
    limit,
    width,
    height
  })
  const now = new Date().toISOString()
  const severeCount = Array.isArray(result?.severeMessages) ? result.severeMessages.length : 0
  const failureCount = Array.isArray(result?.loadFailures) ? result.loadFailures.length : 0
  const pageErrorCount = Array.isArray(result?.pageErrors) ? result.pageErrors.length : 0
  const summary = result?.success
    ? `控制台：${severeCount} 个警告/错误，加载失败 ${failureCount} 个，页面错误 ${pageErrorCount} 个`
    : result?.error || '控制台诊断失败'
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: normalized,
      note: note || 'AI 控制台诊断',
      status: result?.success ? 'done' : 'ready',
      title: result?.title,
      checkedAt: now,
      consoleSummary: summary,
      error: result?.error,
      action: 'console',
      finalUrl: result?.finalUrl,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_console_inspected' : 'browser_console_failed',
    targetPath: normalized,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function fill_browser_form({ url, fields, submit, submitSelector, submitText, note }) {
  const normalized = normalizeBrowserUrl(url)
  if (!normalized) return { error: '缺少 URL' }
  const result = await window.api.windowAPI.fillUrlForm({
    url: normalized,
    fields,
    submit,
    submitSelector,
    submitText
  })
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: normalized,
      note: note || 'AI 表单填写',
      status: result?.success ? 'done' : 'ready',
      title: result?.title,
      finalUrl: result?.finalUrl,
      screenshotPath: result?.screenshotPath,
      formSummary: result?.success
        ? `已填 ${result?.filled?.length || 0} 项，缺失 ${result?.missing?.length || 0} 项${result?.submitted ? '，已提交' : ''}`
        : '',
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_form_filled' : 'browser_form_failed',
    targetPath: normalized,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function start_browser_session({
  url,
  sessionId,
  width,
  height,
  persistProfile = true,
  note
}) {
  const normalized = normalizeBrowserUrl(url)
  if (!normalized) return { error: '缺少 URL' }
  const result = await window.api.windowAPI.startBrowserSession({
    url: normalized,
    sessionId,
    width,
    height,
    persistProfile
  })
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: result?.url || normalized,
      note: note || 'AI 浏览器会话',
      status: result?.success ? 'done' : 'ready',
      title: result?.title,
      sessionId: result?.sessionId,
      sessionProfile: result?.sessionProfile,
      sessionPersisted: result?.sessionPersisted,
      sessionSummary: result?.success
        ? `会话已启动：${result.sessionId}${result.sessionPersisted ? '，登录态会在该工作台复用' : ''}`
        : '',
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_session_started' : 'browser_session_failed',
    targetPath: normalized,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function import_browser_cookies({ sessionId, cookies, note }) {
  const cookieList = Array.isArray(cookies) ? cookies : cookies?.cookies || cookies?.data || []
  if (!cookieList.length) return { success: false, error: '缺少 cookies JSON' }
  const result = await window.api.windowAPI.importBrowserCookies({ sessionId, cookies })
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: `cookies:${result?.sessionId || sessionId || 'workspace'}`,
      note: note || '导入浏览器登录态',
      status: result?.success ? 'done' : 'ready',
      sessionId: result?.sessionId || sessionId,
      sessionProfile: result?.sessionProfile || result?.sessionId || sessionId,
      sessionPersisted: !!result?.success,
      sessionSummary: result?.success
        ? `已导入 ${result.imported || 0} 个 cookie${result.failed ? `，失败 ${result.failed} 个` : ''}`
        : '',
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_cookies_imported' : 'browser_cookies_import_failed',
    targetPath: result?.sessionId || sessionId || 'workspace',
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function list_external_browser_profiles() {
  const result = await window.api.windowAPI.listBrowserProfiles()
  recordWorkspaceAudit({
    type: result?.success ? 'browser_profiles_listed' : 'browser_profiles_list_failed',
    success: !!result?.success,
    error: result?.error
  })
  return {
    success: !!result?.success,
    count: Array.isArray(result?.profiles) ? result.profiles.length : 0,
    profiles: Array.isArray(result?.profiles) ? result.profiles.slice(0, 40) : [],
    error: result?.error
  }
}

export async function import_external_browser_profile_cookies({
  sessionId,
  profilePath,
  domain,
  limit,
  note
}: any = {}) {
  if (!profilePath) return { success: false, error: '缺少 profilePath' }
  const result = await window.api.windowAPI.importBrowserProfileCookies({
    sessionId,
    profilePath,
    domain,
    limit
  })
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: `profile-cookies:${result?.sessionId || sessionId || 'workspace'}`,
      note: note || '直读外部浏览器 Profile 登录态',
      status: result?.success ? 'done' : 'ready',
      sessionId: result?.sessionId || sessionId,
      sessionProfile: result?.sessionProfile || result?.sessionId || sessionId,
      sessionPersisted: !!result?.success,
      sessionSummary: result?.success
        ? `从 ${result.sourceProfile?.browser || '浏览器'} ${result.sourceProfile?.name || ''} 导入 ${result.imported || 0} 个 cookie${result.failed ? `，失败 ${result.failed} 个` : ''}`
        : '',
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success
      ? 'browser_profile_cookies_imported'
      : 'browser_profile_cookies_import_failed',
    targetPath: profilePath,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function inspect_browser_session_dom({ sessionId, limit, note }) {
  const result = await window.api.windowAPI.inspectBrowserSessionDom({ sessionId, limit })
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: result?.url || `session:${sessionId}`,
      note: note || 'AI 会话 DOM',
      status: result?.success ? 'done' : 'ready',
      title: result?.title,
      sessionId: result?.sessionId || sessionId,
      domSummary: result?.success
        ? `${result?.elements?.length || 0} 个可交互元素；${result?.heading || result?.title || ''}`
        : '',
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_session_dom' : 'browser_session_dom_failed',
    targetPath: sessionId,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function inspect_browser_session_console({ sessionId, limit, note }) {
  const result = await window.api.windowAPI.inspectBrowserSessionConsole({ sessionId, limit })
  const now = new Date().toISOString()
  const severeCount = Array.isArray(result?.severeMessages) ? result.severeMessages.length : 0
  const failureCount = Array.isArray(result?.loadFailures) ? result.loadFailures.length : 0
  const crashCount = Array.isArray(result?.crashes) ? result.crashes.length : 0
  const summary = result?.success
    ? `会话控制台：${severeCount} 个警告/错误，加载失败 ${failureCount} 个，崩溃 ${crashCount} 个`
    : result?.error || '会话控制台诊断失败'
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: result?.url || `session:${sessionId}`,
      note: note || 'AI 会话控制台诊断',
      status: result?.success ? 'done' : 'ready',
      title: result?.title,
      sessionId: result?.sessionId || sessionId,
      consoleSummary: summary,
      error: result?.error,
      action: 'session-console',
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_session_console' : 'browser_session_console_failed',
    targetPath: sessionId,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function click_browser_session_element({ sessionId, selector, text, waitMs, note }) {
  if (!selector && !text) return { error: '缺少 selector 或文本' }
  const result = await window.api.windowAPI.clickBrowserSessionElement({
    sessionId,
    selector,
    text,
    waitMs
  })
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: result?.url || `session:${sessionId}`,
      note: note || `AI 会话点击：${selector || text}`,
      status: result?.success ? 'done' : 'ready',
      title: result?.title,
      sessionId: result?.sessionId || sessionId,
      action: selector ? `session selector=${selector}` : `session text=${text}`,
      screenshotPath: result?.screenshotPath,
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_session_clicked' : 'browser_session_click_failed',
    targetPath: sessionId,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function fill_browser_session_form({
  sessionId,
  fields,
  submit,
  submitSelector,
  submitText,
  note
}) {
  const result = await window.api.windowAPI.fillBrowserSessionForm({
    sessionId,
    fields,
    submit,
    submitSelector,
    submitText
  })
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: result?.url || `session:${sessionId}`,
      note: note || 'AI 会话表单',
      status: result?.success ? 'done' : 'ready',
      title: result?.title,
      sessionId: result?.sessionId || sessionId,
      screenshotPath: result?.screenshotPath,
      formSummary: result?.success
        ? `会话已填 ${result?.filled?.length || 0} 项，缺失 ${result?.missing?.length || 0} 项${result?.submitted ? '，已提交' : ''}`
        : '',
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_session_form' : 'browser_session_form_failed',
    targetPath: sessionId,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function capture_browser_session_screenshot({ sessionId, note }) {
  const result = await window.api.windowAPI.captureBrowserSessionScreenshot({ sessionId })
  const now = new Date().toISOString()
  const targets = readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  writeWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY, [
    {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: result?.url || `session:${sessionId}`,
      note: note || 'AI 会话截图',
      status: result?.success ? 'done' : 'ready',
      title: result?.title,
      sessionId: result?.sessionId || sessionId,
      screenshotPath: result?.screenshotPath,
      sessionSummary: result?.success ? `会话截图：${result.sessionId || sessionId}` : '',
      error: result?.error,
      createdAt: now,
      updatedAt: now
    },
    ...targets
  ])
  recordWorkspaceAudit({
    type: result?.success ? 'browser_session_screenshot' : 'browser_session_screenshot_failed',
    targetPath: sessionId,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function close_browser_session({ sessionId }) {
  const result = await window.api.windowAPI.closeBrowserSession({ sessionId })
  recordWorkspaceAudit({
    type: result?.success ? 'browser_session_closed' : 'browser_session_close_failed',
    targetPath: sessionId,
    success: !!result?.success,
    error: result?.error
  })
  return result
}

export async function get_workspace_git_summary({ cwd }: any = {}) {
  const roots = Array.isArray(getWorkspaceAccessPolicy().roots)
    ? getWorkspaceAccessPolicy().roots
    : []
  const workingDir = cwd || roots[0] || undefined
  const denied = requireCommandAccess(workingDir)
  if (denied) return denied
  const status = await window.api.fsAPI.runCommand({
    command: 'git status --short',
    cwd: workingDir,
    timeoutMs: 30000
  })
  const stat = await window.api.fsAPI.runCommand({
    command: 'git diff --stat',
    cwd: workingDir,
    timeoutMs: 30000
  })
  recordWorkspaceAudit({
    type: 'git_summary',
    targetPath: workingDir,
    success: !!status?.success,
    error: status?.error || stat?.error
  })
  return {
    success: !!status?.success,
    cwd: workingDir,
    status: status?.stdout || status?.stderr || '',
    diffStat: stat?.stdout || stat?.stderr || '',
    error: status?.error || stat?.error
  }
}

function quoteCommandArg(value) {
  return `"${String(value || '').replace(/"/g, '\\"')}"`
}

function joinLocalPath(dir, name) {
  const base = String(dir || '').replace(/[\\/]+$/, '')
  return `${base}/${name}`
}

export async function post_github_pr_comment({
  cwd,
  prNumber,
  body,
  path,
  line,
  side = 'RIGHT'
}: any = {}) {
  const roots = Array.isArray(getWorkspaceAccessPolicy().roots)
    ? getWorkspaceAccessPolicy().roots
    : []
  const workingDir = cwd || roots[0] || undefined
  const denied = requireCommandAccess(workingDir)
  if (denied) return denied
  if (!workingDir) return { success: false, error: '缺少工作目录 cwd' }
  if (!body || !String(body).trim()) return { success: false, error: '缺少评论内容 body' }

  const prArg = prNumber ? String(prNumber) : ''
  const auditTarget = [workingDir, prArg ? `PR ${prArg}` : '', path ? `${path}:${line || ''}` : '']
    .filter(Boolean)
    .join(' / ')

  try {
    if (!path || !line) {
      const bodyFile = joinLocalPath(workingDir, `.xinghe-pr-comment-${Date.now()}.md`)
      await window.api.fsAPI.writeTextFile({
        filePath: bodyFile,
        content: String(body),
        createDirs: false
      })
      const command = prArg
        ? `gh pr comment ${quoteCommandArg(prArg)} --body-file ${quoteCommandArg(bodyFile)}`
        : `gh pr comment --body-file ${quoteCommandArg(bodyFile)}`
      const result = await window.api.fsAPI.runCommand({
        command,
        cwd: workingDir,
        timeoutMs: 60000
      })
      await window.api.fsAPI.deletePath?.({ targetPath: bodyFile })
      recordWorkspaceAudit({
        type: result?.success ? 'github_pr_comment_posted' : 'github_pr_comment_failed',
        targetPath: auditTarget,
        success: !!result?.success,
        error: result?.error || result?.stderr
      })
      return {
        success: !!result?.success,
        mode: 'conversation',
        stdout: result?.stdout,
        stderr: result?.stderr,
        error: result?.error
      }
    }

    if (!prArg) return { success: false, error: '行内评论需要传入 prNumber' }
    const prView = await window.api.fsAPI.runCommand({
      command: `gh pr view ${quoteCommandArg(prArg)} --json headRefOid,number -q ".headRefOid"`,
      cwd: workingDir,
      timeoutMs: 30000
    })
    const commitId = String(prView?.stdout || '').trim()
    if (!prView?.success || !commitId) {
      recordWorkspaceAudit({
        type: 'github_pr_comment_failed',
        targetPath: auditTarget,
        success: false,
        error: prView?.error || prView?.stderr || '无法读取 PR headRefOid'
      })
      return { success: false, error: prView?.error || prView?.stderr || '无法读取 PR headRefOid' }
    }

    const payloadFile = joinLocalPath(workingDir, `.xinghe-pr-review-comment-${Date.now()}.json`)
    const payload = {
      body: String(body),
      commit_id: commitId,
      path: String(path),
      line: Number(line),
      side: String(side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT'
    }
    await window.api.fsAPI.writeTextFile({
      filePath: payloadFile,
      content: JSON.stringify(payload, null, 2),
      createDirs: false
    })
    const apiPath = prArg
      ? `repos/{owner}/{repo}/pulls/${prArg}/comments`
      : 'repos/{owner}/{repo}/pulls/{number}/comments'
    const command = `gh api ${quoteCommandArg(apiPath)} --method POST --input ${quoteCommandArg(payloadFile)}`
    const result = await window.api.fsAPI.runCommand({ command, cwd: workingDir, timeoutMs: 60000 })
    await window.api.fsAPI.deletePath?.({ targetPath: payloadFile })
    recordWorkspaceAudit({
      type: result?.success ? 'github_pr_inline_comment_posted' : 'github_pr_comment_failed',
      targetPath: auditTarget,
      success: !!result?.success,
      error: result?.error || result?.stderr
    })
    return {
      success: !!result?.success,
      mode: 'inline',
      commitId,
      stdout: result?.stdout,
      stderr: result?.stderr,
      error: result?.error
    }
  } catch (error) {
    recordWorkspaceAudit({
      type: 'github_pr_comment_failed',
      targetPath: auditTarget,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function submit_github_pr_review({
  cwd,
  prNumber,
  body,
  event = 'COMMENT',
  comments = [],
  commitId
}: any = {}) {
  const roots = Array.isArray(getWorkspaceAccessPolicy().roots)
    ? getWorkspaceAccessPolicy().roots
    : []
  const workingDir = cwd || roots[0] || undefined
  const denied = requireCommandAccess(workingDir)
  if (denied) return denied
  if (!workingDir) return { success: false, error: '缺少工作目录 cwd' }
  if (!prNumber) return { success: false, error: '缺少 PR 编号 prNumber' }
  const prArg = String(prNumber)
  const normalizedEvent = ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(
    String(event).toUpperCase()
  )
    ? String(event).toUpperCase()
    : 'COMMENT'
  const auditTarget = [
    workingDir,
    `PR ${prArg}`,
    `${Array.isArray(comments) ? comments.length : 0} comments`
  ].join(' / ')

  try {
    let headCommit = commitId ? String(commitId).trim() : ''
    if (!headCommit) {
      const prView = await window.api.fsAPI.runCommand({
        command: `gh pr view ${quoteCommandArg(prArg)} --json headRefOid -q ".headRefOid"`,
        cwd: workingDir,
        timeoutMs: 30000
      })
      headCommit = String(prView?.stdout || '').trim()
      if (!prView?.success || !headCommit) {
        recordWorkspaceAudit({
          type: 'github_pr_review_failed',
          targetPath: auditTarget,
          success: false,
          error: prView?.error || prView?.stderr || '无法读取 PR headRefOid'
        })
        return {
          success: false,
          error: prView?.error || prView?.stderr || '无法读取 PR headRefOid'
        }
      }
    }

    const reviewComments = Array.isArray(comments)
      ? comments
          .filter((comment) => comment?.path && comment?.line && comment?.body)
          .slice(0, 80)
          .map((comment) => ({
            path: String(comment.path),
            line: Number(comment.line),
            side: String(comment.side || 'RIGHT').toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT',
            body: String(comment.body)
          }))
      : []
    const payload = {
      commit_id: headCommit,
      event: normalizedEvent,
      body: String(body || ''),
      comments: reviewComments
    }
    const payloadFile = joinLocalPath(workingDir, `.xinghe-pr-review-${Date.now()}.json`)
    await window.api.fsAPI.writeTextFile({
      filePath: payloadFile,
      content: JSON.stringify(payload, null, 2),
      createDirs: false
    })
    const command = `gh api ${quoteCommandArg(`repos/{owner}/{repo}/pulls/${prArg}/reviews`)} --method POST --input ${quoteCommandArg(payloadFile)}`
    const result = await window.api.fsAPI.runCommand({ command, cwd: workingDir, timeoutMs: 60000 })
    await window.api.fsAPI.deletePath?.({ targetPath: payloadFile })
    recordWorkspaceAudit({
      type: result?.success ? 'github_pr_review_submitted' : 'github_pr_review_failed',
      targetPath: auditTarget,
      success: !!result?.success,
      error: result?.error || result?.stderr
    })
    return {
      success: !!result?.success,
      mode: 'review',
      event: normalizedEvent,
      commitId: headCommit,
      commentCount: reviewComments.length,
      stdout: result?.stdout,
      stderr: result?.stderr,
      error: result?.error
    }
  } catch (error) {
    recordWorkspaceAudit({
      type: 'github_pr_review_failed',
      targetPath: auditTarget,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function post_gitlab_mr_comment({ cwd, mrNumber, body, path, line }: any = {}) {
  const roots = Array.isArray(getWorkspaceAccessPolicy().roots)
    ? getWorkspaceAccessPolicy().roots
    : []
  const workingDir = cwd || roots[0] || undefined
  const denied = requireCommandAccess(workingDir)
  if (denied) return denied
  if (!workingDir) return { success: false, error: '缺少工作目录 cwd' }
  if (!mrNumber) return { success: false, error: '缺少 MR 编号 mrNumber' }
  if (!body || !String(body).trim()) return { success: false, error: '缺少评论内容 body' }
  const mrArg = String(mrNumber)
  const auditTarget = [workingDir, `MR ${mrArg}`, path ? `${path}:${line || ''}` : '']
    .filter(Boolean)
    .join(' / ')

  try {
    const safeBody = String(body).slice(0, 7000)
    const fileArgs = path
      ? ` --file ${quoteCommandArg(path)}${line ? ` --line ${quoteCommandArg(line)}` : ''}`
      : ''
    const command = `glab mr note create ${quoteCommandArg(mrArg)}${fileArgs} --message ${quoteCommandArg(safeBody)}`
    const result = await window.api.fsAPI.runCommand({ command, cwd: workingDir, timeoutMs: 60000 })
    recordWorkspaceAudit({
      type: result?.success ? 'gitlab_mr_comment_posted' : 'gitlab_mr_comment_failed',
      targetPath: auditTarget,
      success: !!result?.success,
      error: result?.error || result?.stderr
    })
    return {
      success: !!result?.success,
      mode: 'merge-request',
      stdout: result?.stdout,
      stderr: result?.stderr,
      error: result?.error
    }
  } catch (error) {
    recordWorkspaceAudit({
      type: 'gitlab_mr_comment_failed',
      targetPath: auditTarget,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// ══════════════════════════════════════════════
//  Wave 2：智能创作辅助工具
// ══════════════════════════════════════════════

/**
 * AI 增强提示词
 * 返回指令让 LLM 在下一轮自行生成高质量提示词
 */
export function enhance_prompt({ prompt, style, language }) {
  return {
    success: true,
    instruction: 'ENHANCE_PROMPT',
    originalPrompt: prompt,
    targetStyle: style || 'cinematic',
    targetLanguage: language || 'english',
    message:
      '请将上述简短描述扩写为高质量、专业的生成式AI提示词，包含画面细节、光影、构图、氛围等要素'
  }
}

/** 翻译提示词 */
export function translate_prompt({ prompt, targetLanguage }) {
  return {
    success: true,
    instruction: 'TRANSLATE_PROMPT',
    originalPrompt: prompt,
    targetLanguage: targetLanguage || 'english',
    message: '请翻译以上提示词，保持专业术语准确'
  }
}

/** 生成提示词变体 */
export function suggest_prompt_variants({ prompt, count, styles }) {
  return {
    success: true,
    instruction: 'SUGGEST_VARIANTS',
    originalPrompt: prompt,
    count: count || 5,
    styles: styles || ['写实摄影', '油画', '日系动漫', '水墨', '像素风'],
    message: '请基于原始提示词，为每种风格生成一个完整的变体提示词'
  }
}

/** 分析失败原因 */
export function analyze_failed_reason({ historyId }) {
  const hist = useAppStore.getState().history || []
  const item = historyId
    ? hist.find((h) => h.id === historyId)
    : hist.filter((h) => h.status === 'failed').slice(-1)[0]

  if (!item) return { error: '未找到失败的任务' }

  return {
    success: true,
    instruction: 'ANALYZE_FAILURE',
    task: {
      id: item.id,
      type: item.type,
      prompt: (item.prompt || '').slice(0, 200),
      model: item.modelName || item.model,
      error: item.error,
      time: item.time,
      status: item.status
    },
    message: '请分析失败原因并给出具体的修复建议'
  }
}

/** 推荐模型 */
export function recommend_model({ requirement }) {
  const configs = useAppStore.getState().apiConfigs || []
  const available = configs.map((c) => ({
    id: c.id,
    name: c.provider,
    model: c.modelName,
    type: c.type,
    hasKey: !!c.key
  }))
  return {
    success: true,
    instruction: 'RECOMMEND_MODEL',
    requirement,
    availableModels: available,
    message: '请根据需求从可用模型中推荐最佳选择并说明理由'
  }
}

/** 批量创建并生成 */
export async function batch_create_and_generate({
  type,
  prompts,
  model,
  ratio,
  resolution,
  duration
}) {
  if (!prompts || prompts.length === 0) return { error: '需要提供提示词数组' }
  if (prompts.length > 20) return { error: '单次最多创建 20 个节点' }

  const results = []
  for (const p of prompts) {
    const res = await create_and_generate({
      type: type || 'gen-image',
      prompt: p,
      model,
      ratio,
      resolution,
      duration
    })
    results.push({ prompt: p.slice(0, 40), ...res })
    await new Promise((r) => setTimeout(r, 300))
  }

  const ok = results.filter((r) => r.success).length
  return {
    success: true,
    total: prompts.length,
    succeeded: ok,
    failed: prompts.length - ok,
    results,
    message: `已创建 ${ok}/${prompts.length} 个节点并触发生成`
  }
}

/** 克隆节点并微调 */
export function clone_with_variants({ nodeId, variants }) {
  const state = useAppStore.getState()
  const source = state.nodesMap.get(nodeId)
  if (!source) return { error: `节点 ${nodeId} 不存在` }
  if (!variants || variants.length === 0) return { error: '需要提供变体描述数组' }

  const results = []
  for (let i = 0; i < variants.length; i++) {
    const dupResult = duplicate_node({ nodeId })
    if (!dupResult.success) {
      results.push(dupResult)
      continue
    }

    const newId = dupResult.newNodeId
    const isVideo = source.type === 'gen-video'
    const promptKey = isVideo ? 'videoPrompt' : 'prompt'
    const originalPrompt = source.settings?.[promptKey] || ''

    state.updateNodeSettingsById(newId, {
      [promptKey]: `${originalPrompt}, ${variants[i]}`
    })
    results.push({ success: true, nodeId: newId, variant: variants[i] })
  }

  return {
    success: true,
    count: results.filter((r) => r.success).length,
    results,
    message: `已克隆 ${results.length} 个变体节点`
  }
}

/** 导出画布摘要 */
export function export_canvas_summary() {
  const state = useAppStore.getState()
  const nodes = state.nodes || []
  const hist = state.history || []
  const project = state.currentProject

  const lines = []
  lines.push('# 画布摘要')
  lines.push(`项目：${project?.name || '未命名'}`)
  lines.push(`节点数：${nodes.length}`)
  lines.push(
    `历史记录：${hist.length} 条（完成 ${hist.filter((h) => h.status === 'completed').length}）`
  )
  lines.push('')
  lines.push('## 节点列表')

  nodes.forEach((n, i) => {
    const p = n.settings?.prompt || n.settings?.videoPrompt || '(无提示词)'
    const m = n.settings?.model || '(未选模型)'
    const status = n.settings?.isGenerating ? '⏳生成中' : n.settings?.error ? '❌失败' : '✅就绪'
    lines.push(`${i + 1}. [${n.type}] ${p.slice(0, 50)} | 模型:${m} | ${status}`)
  })

  return {
    success: true,
    summary: lines.join('\n'),
    message: '已生成画布摘要'
  }
}

// ══════════════════════════════════════════════
//  Wave 3：预设系统
// ══════════════════════════════════════════════

function _getPresetsStore(): AnyRecord {
  try {
    return JSON.parse(localStorage.getItem('xinghe_presets') || '{}')
  } catch {
    return {}
  }
}
function _savePresetsStore(data) {
  localStorage.setItem('xinghe_presets', JSON.stringify(data))
}

/** 保存预设 */
export function save_preset({ name, nodeId }) {
  const state = useAppStore.getState()
  const node = nodeId ? state.nodesMap.get(nodeId) : null
  let settings = {}

  if (node) {
    const s = node.settings || {}
    settings = {
      model: s.model,
      ratio: s.ratio,
      resolution: s.resolution,
      duration: s.duration,
      batchSize: s.batchSize,
      nodeType: node.type
    }
  }

  const store = _getPresetsStore()
  const id = `preset-${Date.now()}`
  store[id] = { id, name, settings, createdAt: Date.now() }
  _savePresetsStore(store)
  return { success: true, presetId: id, message: `预设「${name}」已保存` }
}

/** 列出预设 */
export function list_presets() {
  const store = _getPresetsStore()
  const presets = Object.values(store)
  return {
    count: presets.length,
    presets: presets.map((p) => ({
      id: p.id,
      name: p.name,
      model: p.settings?.model,
      ratio: p.settings?.ratio,
      nodeType: p.settings?.nodeType
    }))
  }
}

/** 应用预设到节点 */
export function apply_preset({ presetId, nodeId }) {
  const store = _getPresetsStore()
  const preset = store[presetId] || Object.values(store).find((p) => p.name === presetId)
  if (!preset) return { error: `预设不存在: ${presetId}` }

  const state = useAppStore.getState()
  if (!state.nodesMap.has(nodeId)) return { error: `节点 ${nodeId} 不存在` }

  const updates: AnyRecord = {}
  const s = preset.settings || {}
  if (s.model) updates.model = s.model
  if (s.ratio) updates.ratio = s.ratio
  if (s.resolution) updates.resolution = s.resolution
  if (s.duration) updates.duration = s.duration
  if (s.batchSize) updates.batchSize = s.batchSize

  state.updateNodeSettingsById(nodeId, updates)
  return { success: true, message: `预设「${preset.name}」已应用到节点 ${nodeId}` }
}

/** 删除预设 */
export function delete_preset({ presetId }) {
  const store = _getPresetsStore()
  const preset = store[presetId] || Object.values(store).find((p) => p.name === presetId)
  if (!preset) return { error: '预设不存在' }
  delete store[preset.id]
  _savePresetsStore(store)
  return { success: true, message: '预设已删除' }
}

// ══════════════════════════════════════════════
//  Wave 4：Skill 自动化系统
// ══════════════════════════════════════════════

function _getSkillsStore(): AnyRecord {
  try {
    return JSON.parse(localStorage.getItem('xinghe_skills') || '{}')
  } catch {
    return {}
  }
}
function _saveSkillsStore(data) {
  localStorage.setItem('xinghe_skills', JSON.stringify(data))
}

/** 创建 Skill */
export function create_skill({ name, description, icon, variables, steps }) {
  if (!name) return { error: '需要提供 Skill 名称' }
  const store = _getSkillsStore()

  // 检查重名
  if (Object.values(store).some((s) => s.name === name)) {
    return { error: `已存在同名 Skill「${name}」` }
  }

  const id = `skill-${Date.now()}`
  store[id] = {
    id,
    name,
    description: description || '',
    icon: icon || '🧩',
    variables: variables || [],
    steps: steps || [],
    createdAt: Date.now()
  }
  _saveSkillsStore(store)
  return { success: true, skillId: id, message: `Skill「${name}」已创建` }
}

/** 列出 Skills */
export function list_skills() {
  const store = _getSkillsStore()
  const skills = Object.values(store)
  if (skills.length === 0) return { count: 0, skills: [], message: '暂无 Skill，试试创建一个？' }
  return {
    count: skills.length,
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      description: s.description,
      stepCount: s.steps?.length || 0,
      variables: s.variables?.map((v) => (typeof v === 'string' ? v : v.name)) || []
    }))
  }
}

/** 查看 Skill 详情 */
export function get_skill({ skillId }) {
  const store = _getSkillsStore()
  const skill = store[skillId] || Object.values(store).find((s) => s.name === skillId)
  if (!skill) return { error: '未找到该 Skill' }
  return { success: true, skill }
}

/** 执行 Skill（核心引擎） */
export async function execute_skill({ skillId, variables }) {
  const store = _getSkillsStore()
  const skill = store[skillId] || Object.values(store).find((s) => s.name === skillId)
  if (!skill) return { error: `未找到 Skill: ${skillId}` }
  if (!skill.steps || skill.steps.length === 0) return { error: 'Skill 没有任何步骤' }

  const vars = variables || {}
  const results = []

  // 动态获取所有工具函数
  const toolModule = await import('./canvasTools')

  for (let i = 0; i < skill.steps.length; i++) {
    const step = skill.steps[i]
    const toolName = step.tool

    const fn = toolModule[toolName]
    if (!fn) {
      results.push({ step: i + 1, tool: toolName, error: `工具不存在: ${toolName}` })
      continue
    }

    // 变量替换 {{varName}}
    let params = {}
    if (step.params) {
      const paramStr = JSON.stringify(step.params)
      const replaced = paramStr.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '')
      try {
        params = JSON.parse(replaced)
      } catch {
        params = step.params
      }
    }

    // 支持 repeat
    const repeatCount = step.repeat ? parseInt(vars[step.repeat]) || parseInt(step.repeat) || 1 : 1

    for (let r = 0; r < repeatCount; r++) {
      try {
        let result = fn(params)
        if (result && typeof result.then === 'function') result = await result
        results.push({ step: i + 1, tool: toolName, success: true, result })
      } catch (err) {
        results.push({ step: i + 1, tool: toolName, error: err.message })
      }
    }
  }

  const ok = results.filter((r) => r.success).length
  return {
    success: true,
    skillName: skill.name,
    totalSteps: results.length,
    succeeded: ok,
    failed: results.length - ok,
    results,
    message: `Skill「${skill.name}」执行完成：${ok}/${results.length} 步成功`
  }
}

/** 编辑 Skill */
export function edit_skill({ skillId, name, description, steps, variables, icon }) {
  const store = _getSkillsStore()
  const skill = store[skillId] || Object.values(store).find((s) => s.name === skillId)
  if (!skill) return { error: '未找到该 Skill' }

  if (name) skill.name = name
  if (description) skill.description = description
  if (steps) skill.steps = steps
  if (variables) skill.variables = variables
  if (icon) skill.icon = icon
  skill.updatedAt = Date.now()

  store[skill.id] = skill
  _saveSkillsStore(store)
  return { success: true, message: `Skill「${skill.name}」已更新` }
}

/** 删除 Skill */
export function delete_skill({ skillId }) {
  const store = _getSkillsStore()
  const skill = store[skillId] || Object.values(store).find((s) => s.name === skillId)
  if (!skill) return { error: '未找到该 Skill' }
  const name = skill.name
  delete store[skill.id]
  _saveSkillsStore(store)
  return { success: true, message: `Skill「${name}」已删除` }
}

/** 导出 Skill 为 JSON */
export function export_skill({ skillId }) {
  const store = _getSkillsStore()
  const skill = store[skillId] || Object.values(store).find((s) => s.name === skillId)
  if (!skill) return { error: '未找到该 Skill' }
  return {
    success: true,
    json: JSON.stringify(skill, null, 2),
    message: `Skill「${skill.name}」已导出为 JSON，可分享给他人`
  }
}

/** 导入 Skill JSON */
export function import_skill({ json }) {
  try {
    const skill = typeof json === 'string' ? JSON.parse(json) : json
    if (!skill.name || !skill.steps) return { error: '无效的 Skill 格式，需要 name 和 steps' }
    const store = _getSkillsStore()
    const id = `skill-${Date.now()}`
    skill.id = id
    skill.importedAt = Date.now()
    store[id] = skill
    _saveSkillsStore(store)
    return { success: true, skillId: id, message: `Skill「${skill.name}」已导入` }
  } catch (err) {
    return { error: `导入失败: ${err.message}` }
  }
}

// ══════════════════════════════════════════════
//  Wave 5：项目管理 + 高级画布编排
// ══════════════════════════════════════════════

/** 获取当前项目信息 */
export function get_project_info() {
  const state = useAppStore.getState()
  const project = state.currentProject
  if (!project) return { error: '当前没有打开的项目' }
  return {
    success: true,
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    nodeCount: (state.nodes || []).length,
    historyCount: (state.history || []).length
  }
}

/** 重命名项目 */
export function rename_project({ name }) {
  const state = useAppStore.getState()
  if (!state.currentProject) return { error: '当前没有打开的项目' }
  state.setCurrentProject({ ...state.currentProject, name })
  return { success: true, message: `项目已重命名为「${name}」` }
}

/** 智能推荐下一步 */
export function suggest_next_steps() {
  const state = useAppStore.getState()
  const nodes = state.nodes || []
  const hist = state.history || []
  const suggestions = []

  // 空节点
  const empty = nodes.filter((n) => !n.settings?.prompt && !n.settings?.videoPrompt)
  if (empty.length > 0) {
    suggestions.push(`📝 有 ${empty.length} 个节点还没写提示词`)
  }

  // 失败任务
  const failed = hist.filter((h) => h.status === 'failed')
  if (failed.length > 0) {
    suggestions.push(
      `Failed tasks: ${failed.length}. Inspect diagnostics first, then resubmit manually if needed.`
    )
  }

  // 生成中
  const generating = nodes.filter((n) => n.settings?.isGenerating)
  if (generating.length > 0) {
    suggestions.push(`⏳ 有 ${generating.length} 个节点正在生成，请等待完成`)
  }

  // 完成未入库
  const completed = hist.filter((h) => h.status === 'completed')
  if (completed.length > 5) {
    suggestions.push(`📦 有 ${completed.length} 个完成的结果可以存入资产库`)
  }

  // 导演节点
  const directors = nodes.filter((n) => n.type === 'director-node')
  directors.forEach((d) => {
    const shots = d.settings?.scriptData?.shots || []
    const ungenerated = shots.filter((s) => !s.generatedImage)
    if (ungenerated.length > 0) {
      suggestions.push(`🎬 导演节点还有 ${ungenerated.length} 个分镜未出图`)
    }
  })

  if (suggestions.length === 0) {
    suggestions.push('✅ 一切就绪！画布状态良好，可以继续创作！')
  }

  return { success: true, suggestions, message: '以下是我的建议' }
}

/** 按节点类型分区排列 */
export function arrange_by_type() {
  const state = useAppStore.getState()
  const nodes = state.nodes || []
  if (nodes.length === 0) return { message: '画布为空' }

  const groups = {}
  nodes.forEach((n) => {
    const t = n.type || 'unknown'
    if (!groups[t]) groups[t] = []
    groups[t].push(n)
  })

  const arranged = []
  let regionX = 100
  const typeNames = Object.keys(groups)

  typeNames.forEach((type) => {
    const group = groups[type]
    const cols = Math.ceil(Math.sqrt(group.length))
    group.forEach((n, i) => {
      const x = regionX + (i % cols) * 340
      const y = 100 + Math.floor(i / cols) * 460
      arranged.push({ ...n, x, y, position: { x, y } })
    })
    regionX += cols * 340 + 100
  })

  state.setNodes(arranged)
  return {
    success: true,
    layout: typeNames.map((t) => `${t}: ${groups[t].length}个`),
    message: `已按类型分区排列：${typeNames.join(', ')}`
  }
}

/** 对齐节点 */
export function align_nodes({ nodeIds, direction }) {
  const state = useAppStore.getState()
  const targets = nodeIds
    ? state.nodes.filter((n) => nodeIds.includes(n.id))
    : state.nodes.filter((n) => state.selectedNodeIds?.has(n.id))

  if (targets.length < 2) return { error: '至少选中 2 个节点才能对齐' }

  const dir = direction || 'left'
  let refValue

  if (dir === 'left') refValue = Math.min(...targets.map((n) => n.x || 0))
  else if (dir === 'right')
    refValue = Math.max(...targets.map((n) => (n.x || 0) + (n.width || 300)))
  else if (dir === 'top') refValue = Math.min(...targets.map((n) => n.y || 0))
  else if (dir === 'bottom')
    refValue = Math.max(...targets.map((n) => (n.y || 0) + (n.height || 400)))
  else if (dir === 'center-x')
    refValue = targets.reduce((s, n) => s + (n.x || 0), 0) / targets.length
  else if (dir === 'center-y')
    refValue = targets.reduce((s, n) => s + (n.y || 0), 0) / targets.length
  else return { error: `未知对齐方向: ${dir}，支持 left/right/top/bottom/center-x/center-y` }

  const ids = new Set(targets.map((n) => n.id))
  const updated = state.nodes.map((n) => {
    if (!ids.has(n.id)) return n
    let x = n.x,
      y = n.y
    if (dir === 'left' || dir === 'center-x') x = refValue
    if (dir === 'right') x = refValue - (n.width || 300)
    if (dir === 'top' || dir === 'center-y') y = refValue
    if (dir === 'bottom') y = refValue - (n.height || 400)
    return { ...n, x, y, position: { x, y } }
  })
  state.setNodes(updated)

  return { success: true, message: `${targets.length} 个节点已${dir}对齐` }
}

/** 等距分布节点 */
export function distribute_nodes({ nodeIds, direction }) {
  const state = useAppStore.getState()
  const targets = nodeIds
    ? state.nodes.filter((n) => nodeIds.includes(n.id))
    : state.nodes.filter((n) => state.selectedNodeIds?.has(n.id))

  if (targets.length < 3) return { error: '至少需要 3 个节点才能均匀分布' }

  const dir = direction || 'horizontal'
  const prop = dir === 'horizontal' ? 'x' : 'y'
  const sorted = [...targets].sort((a, b) => (a[prop] || 0) - (b[prop] || 0))

  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const total = (last[prop] || 0) - (first[prop] || 0)
  const gap = total / (sorted.length - 1)

  const posMap: AnyRecord = {}
  sorted.forEach((n, i) => {
    posMap[n.id] = (first[prop] || 0) + gap * i
  })

  const ids = new Set(sorted.map((n) => n.id))
  const updated = state.nodes.map((n) => {
    if (!ids.has(n.id)) return n
    const val = posMap[n.id]
    const x = dir === 'horizontal' ? val : n.x
    const y = dir === 'vertical' ? val : n.y
    return { ...n, x, y, position: { x, y } }
  })
  state.setNodes(updated)

  return {
    success: true,
    message: `${targets.length} 个节点已均匀${dir === 'horizontal' ? '水平' : '垂直'}分布`
  }
}

// ══════════════════════════════════════════════
//  Wave 6：智能感知与分析
// ══════════════════════════════════════════════

/** 👁️ 画布状态快照(供多模态 LLM 分析) */
export function capture_canvas_for_review() {
  const state = useAppStore.getState()
  const nodes = state.nodes || []
  if (nodes.length === 0) return { error: '画布为空' }

  const snapshot = nodes.map((n) => {
    const s = n.settings || {}
    const lastResult = (state.history || [])
      .filter((h) => h.nodeId === n.id && h.status === 'completed')
      .slice(-1)[0]
    return {
      id: n.id,
      type: n.type,
      position: { x: Math.round(n.x || 0), y: Math.round(n.y || 0) },
      prompt: (s.prompt || s.videoPrompt || '').slice(0, 100),
      model: s.model,
      ratio: s.ratio,
      hasResult: !!lastResult,
      resultUrl: lastResult?.resultUrl?.slice(0, 80)
    }
  })

  // 空间布局分析
  const xs = nodes.map((n) => n.x || 0)
  const ys = nodes.map((n) => n.y || 0)
  const layout = {
    bounds: {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys)
    },
    spread: Math.max(...xs) - Math.min(...xs),
    isGridLike: new Set(ys.map((y) => Math.round(y / 50))).size < nodes.length * 0.6
  }

  return {
    success: true,
    instruction: 'REVIEW_CANVAS',
    nodeCount: nodes.length,
    snapshot,
    layout,
    message: '请根据以上画布快照进行分析，评估风格一致性、布局合理性，并给出改进建议'
  }
}

/** 🧬 风格 DNA 提取(从历史结果中) */
export function extract_style_dna({ historyId, nodeId }) {
  const state = useAppStore.getState()
  const hist = state.history || []
  let target

  if (historyId) {
    target = hist.find((h) => h.id === historyId)
  } else if (nodeId) {
    target = hist.filter((h) => h.nodeId === nodeId && h.status === 'completed').slice(-1)[0]
  } else {
    target = hist.filter((h) => h.status === 'completed').slice(-1)[0]
  }

  if (!target) return { error: '未找到可分析的已完成生成结果' }

  return {
    success: true,
    instruction: 'EXTRACT_STYLE_DNA',
    source: {
      id: target.id,
      prompt: (target.prompt || '').slice(0, 300),
      model: target.modelName || target.model,
      resultUrl: target.resultUrl
    },
    message:
      '请分析该作品的风格DNA：画风、配色、光影、构图、氛围。输出一段可直接用作预设后缀的英文风格描述。如果需要可以用 save_preset 保存。'
  }
}

/** 📊 生成结果评分 */
export function score_generation_result({ historyId, nodeId }) {
  const state = useAppStore.getState()
  const hist = state.history || []
  let target

  if (historyId) {
    target = hist.find((h) => h.id === historyId)
  } else if (nodeId) {
    target = hist.filter((h) => h.nodeId === nodeId && h.status === 'completed').slice(-1)[0]
  } else {
    target = hist.filter((h) => h.status === 'completed').slice(-1)[0]
  }

  if (!target) return { error: '未找到可评分的生成结果' }

  return {
    success: true,
    instruction: 'SCORE_RESULT',
    source: {
      id: target.id,
      prompt: (target.prompt || '').slice(0, 300),
      model: target.modelName || target.model,
      resultUrl: target.resultUrl
    },
    message:
      '请为该生成结果打分(1-10)，评估：画面质量、提示词相关度、构图美感、色彩协调、创意度。如果某项低于6分，给出改进建议。'
  }
}

/** 🧠 用户偏好分析 */
export function get_user_preferences() {
  const state = useAppStore.getState()
  const hist = state.history || []
  const nodes = state.nodes || []

  if (hist.length === 0 && nodes.length === 0) {
    return { message: '暂无使用记录，无法分析偏好' }
  }

  // 统计模型使用频率
  const modelStats = {}
  hist.forEach((h) => {
    const m = h.modelName || h.model || 'unknown'
    modelStats[m] = (modelStats[m] || 0) + 1
  })

  // 统计比例偏好
  const ratioStats = {}
  nodes.forEach((n) => {
    const r = n.settings?.ratio || 'unknown'
    ratioStats[r] = (ratioStats[r] || 0) + 1
  })

  // 统计类型偏好
  const typeStats = { image: 0, video: 0 }
  nodes.forEach((n) => {
    if (n.type === 'gen-image') typeStats.image++
    else if (n.type === 'gen-video') typeStats.video++
  })

  // 提取高频关键词
  const allPrompts = hist
    .map((h) => h.prompt || '')
    .filter(Boolean)
    .join(' ')
  const words = allPrompts
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 3)
  const wordFreq = {}
  words.forEach((w) => {
    wordFreq[w] = (wordFreq[w] || 0) + 1
  })
  const topKeywords = Object.entries(wordFreq)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 10)
    .map(([w, c]) => `${w}(${c})`)

  // 成功率
  const success = hist.filter((h) => h.status === 'completed').length
  const failed = hist.filter((h) => h.status === 'failed').length

  return {
    success: true,
    preferences: {
      topModels: Object.entries(modelStats)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 3),
      topRatios: Object.entries(ratioStats)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 3),
      typePreference: typeStats,
      topKeywords,
      totalGenerations: hist.length,
      successRate: hist.length > 0 ? `${Math.round((success / hist.length) * 100)}%` : 'N/A',
      failedCount: failed
    },
    message: '以上是用户的创作偏好分析，请据此在后续建议中优先推荐用户喜欢的风格和模型'
  }
}

/** 🎮 获取选中节点详细信息（增强画布互动） */
export function get_selected_nodes_detail() {
  const state = useAppStore.getState()
  const selectedIds = Array.from(state.selectedNodeIds || [])
  if (selectedIds.length === 0) return { error: '当前没有选中任何节点' }

  const details = selectedIds
    .map((id) => {
      const n = state.nodesMap.get(id)
      if (!n) return null
      const s = n.settings || {}
      const lastResult = (state.history || [])
        .filter((h) => h.nodeId === id && h.status === 'completed')
        .slice(-1)[0]
      return {
        id: n.id,
        type: n.type,
        prompt: (s.prompt || s.videoPrompt || '').slice(0, 200),
        model: s.model,
        ratio: s.ratio,
        resolution: s.resolution,
        isGenerating: !!s.isGenerating,
        hasResult: !!lastResult,
        resultUrl: lastResult?.resultUrl?.slice(0, 80)
      }
    })
    .filter(Boolean)

  return {
    success: true,
    count: details.length,
    nodes: details,
    message: `当前选中 ${details.length} 个节点`
  }
}

/** 🎮 批量操作选中节点 */
export function batch_update_selected({ updates }) {
  const state = useAppStore.getState()
  const selectedIds = Array.from(state.selectedNodeIds || [])
  if (selectedIds.length === 0) return { error: '当前没有选中任何节点' }
  if (!updates) return { error: '需要提供 updates 对象' }

  let count = 0
  selectedIds.forEach((id) => {
    if (state.nodesMap.has(id)) {
      state.updateNodeSettingsById(id, updates)
      count++
    }
  })

  return {
    success: true,
    updatedCount: count,
    message: `已批量更新 ${count} 个选中节点`
  }
}

// ══════════════════════════════════════════════
//  Wave 7：链式反应 + 多 Agent
// ══════════════════════════════════════════════

function _getPipelinesStore(): AnyRecord {
  try {
    return JSON.parse(localStorage.getItem('xinghe_pipelines') || '{}')
  } catch {
    return {}
  }
}
function _savePipelinesStore(data) {
  localStorage.setItem('xinghe_pipelines', JSON.stringify(data))
}

/**
 * 🔗 设置自动流水线
 * 定义：当某节点生成完成后，自动触发下一个动作
 */
export function setup_auto_pipeline({ name, trigger, steps }) {
  if (!name) return { error: '需要提供流水线名称' }
  if (!steps || steps.length === 0) return { error: '需要提供至少一个步骤' }

  const store = _getPipelinesStore()
  const id = `pipeline-${Date.now()}`
  store[id] = {
    id,
    name,
    trigger: trigger || 'on_any_complete',
    steps,
    enabled: true,
    createdAt: Date.now()
  }
  _savePipelinesStore(store)
  return {
    success: true,
    pipelineId: id,
    message: `流水线「${name}」已创建。当生成完成时将自动执行后续步骤。`
  }
}

/** 🔗 列出流水线 */
export function list_pipelines() {
  const store = _getPipelinesStore()
  const pipelines = Object.values(store)
  return {
    count: pipelines.length,
    pipelines: pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      trigger: p.trigger,
      enabled: p.enabled,
      stepCount: p.steps?.length || 0
    }))
  }
}

/** 🔗 启用/禁用流水线 */
export function toggle_pipeline({ pipelineId, enabled }) {
  const store = _getPipelinesStore()
  const p = store[pipelineId] || Object.values(store).find((x) => x.name === pipelineId)
  if (!p) return { error: '流水线不存在' }
  p.enabled = enabled !== undefined ? enabled : !p.enabled
  store[p.id] = p
  _savePipelinesStore(store)
  return { success: true, message: `流水线「${p.name}」已${p.enabled ? '启用' : '禁用'}` }
}

/** 🔗 删除流水线 */
export function delete_pipeline({ pipelineId }) {
  const store = _getPipelinesStore()
  const p = store[pipelineId] || Object.values(store).find((x) => x.name === pipelineId)
  if (!p) return { error: '流水线不存在' }
  delete store[p.id]
  _savePipelinesStore(store)
  return { success: true, message: `流水线「${p.name}」已删除` }
}

/**
 * 🤖 多 Agent 模式
 * 预定义多个专业 Agent 角色
 */
const AGENT_MODES = {
  default: {
    name: '通用助手',
    icon: '🤖',
    description: '全能型 AI 助手，处理各种创作需求',
    systemSuffix: ''
  },
  art_director: {
    name: '美术总监',
    icon: '🎨',
    description: '专注画面质量、风格一致性、色彩搭配',
    systemSuffix:
      '你现在是一位资深美术总监。请专注于：画面质量评估、风格一致性审核、色彩搭配建议、构图优化。所有回复围绕视觉美感展开。'
  },
  screenwriter: {
    name: '编剧',
    icon: '📝',
    description: '专注剧本创作、台词、分镜脚本',
    systemSuffix:
      '你现在是一位专业编剧。请专注于：故事结构、角色刻画、台词编写、分镜脚本、叙事节奏。所有回复围绕叙事创作展开。'
  },
  director: {
    name: '导演',
    icon: '🎬',
    description: '专注分镜编排、镜头语言、节奏把控',
    systemSuffix:
      '你现在是一位资深导演。请专注于：分镜编排、镜头语言、运镜设计、剪辑节奏、画面叙事。所有回复围绕影视制作展开。'
  },
  qa_reviewer: {
    name: '质量审核',
    icon: '🔍',
    description: '专注生成结果检查、质量评分、一致性审核',
    systemSuffix:
      '你现在是一位严格的质量审核员。请专注于：检查生成结果是否符合提示词要求、标记不合格作品、提出改进建议、评估风格一致性。'
  },
  prompt_master: {
    name: '提示词大师',
    icon: '✍️',
    description: '专注提示词优化、风格关键词、参数调优',
    systemSuffix:
      '你现在是一位提示词工程大师。请专注于：撰写高质量提示词、优化关键词选择、调整生成参数、研究不同模型的最佳提示词策略。'
  },
  producer: {
    name: '制片人',
    icon: '💼',
    description: '统筹项目进度、资源分配、成本控制',
    systemSuffix:
      '你现在是一位资深制片人。请专注于：项目时间线管理、资源分配优化、成本效益分析、团队协作建议。所有回复围绕项目管理和制片流程展开。'
  },
  music_director: {
    name: '配乐师',
    icon: '🎵',
    description: '专注背景音乐、音效设计、情绪渲染',
    systemSuffix:
      '你现在是一位专业配乐师。请专注于：为场景推荐合适的音乐风格、情绪铺排、音效设计建议、音画同步节奏。所有回复围绕声音设计展开。'
  },
  storyboard_artist: {
    name: '分镜师',
    icon: '📐',
    description: '专注分镜设计、画面构图、视觉叙事',
    systemSuffix:
      '你现在是一位专业分镜师。请专注于：分镜稿设计、画面构图规则、景别运用、视觉动线规划、留白与节奏。所有回复围绕视觉叙事展开。'
  },
  translator: {
    name: '翻译官',
    icon: '🌍',
    description: '中英双语翻译、提示词本地化',
    systemSuffix:
      '你现在是一位影视领域的专业翻译官。请专注于：中英文提示词互译、本地化表达优化、跨文化创意表达。确保翻译后的提示词仍能被 AI 模型准确理解。'
  }
}

// 当前 Agent 模式存储
let _currentAgentMode = 'default'

/** 🤖 列出 Agent 模式 */
export function list_agent_modes() {
  return {
    success: true,
    currentMode: _currentAgentMode,
    modes: Object.entries(AGENT_MODES).map(([key, m]) => ({
      id: key,
      name: m.name,
      icon: m.icon,
      description: m.description,
      active: key === _currentAgentMode
    }))
  }
}

/** 🤖 切换 Agent 模式 */
export function switch_agent_mode({ mode }) {
  if (!AGENT_MODES[mode]) {
    return {
      error: `未知模式: ${mode}。可用: ${Object.keys(AGENT_MODES).join(', ')}`
    }
  }
  _currentAgentMode = mode
  const agent = AGENT_MODES[mode]
  return {
    success: true,
    mode,
    name: agent.name,
    icon: agent.icon,
    systemSuffix: agent.systemSuffix,
    message: `已切换为 ${agent.icon} ${agent.name} 模式`
  }
}

/** 🤖 获取当前 Agent 模式（供 useChatManager 使用） */
export function get_current_agent_suffix() {
  return AGENT_MODES[_currentAgentMode]?.systemSuffix || ''
}

// ══════════════════════════════════════════════
//  Wave 8：定时任务 + 联网搜索
// ══════════════════════════════════════════════

function _getTimersStore(): AnyRecord {
  try {
    return JSON.parse(localStorage.getItem('xinghe_timers') || '{}')
  } catch {
    return {}
  }
}
function _saveTimersStore(data) {
  localStorage.setItem('xinghe_timers', JSON.stringify(data))
}

// 内存中的 interval 引用
const _activeTimers = new Map()

/** 🕐 创建定时任务 */
export function create_timer_task({ name, intervalMinutes, skillId, variables }) {
  if (!name) return { error: '需要提供任务名称' }
  if (!intervalMinutes || intervalMinutes < 1) return { error: '间隔时间至少 1 分钟' }
  if (intervalMinutes > 1440) return { error: '间隔时间不能超过 24 小时' }

  const store = _getTimersStore()
  const id = `timer-${Date.now()}`

  store[id] = {
    id,
    name,
    intervalMinutes,
    skillId: skillId || null,
    variables: variables || {},
    enabled: true,
    createdAt: Date.now(),
    lastRun: null,
    runCount: 0
  }
  _saveTimersStore(store)

  // 启动定时器
  const intervalMs = intervalMinutes * 60 * 1000
  const handle = setInterval(async () => {
    const current = _getTimersStore()
    const task = current[id]
    if (!task || !task.enabled) {
      clearInterval(handle)
      _activeTimers.delete(id)
      return
    }
    // 如果有关联 skill，执行它
    if (task.skillId) {
      try {
        await execute_skill({ skillId: task.skillId, variables: task.variables })
      } catch (err) {
        console.error(`[Timer] ${name} 执行失败:`, err)
      }
    }
    task.lastRun = Date.now()
    task.runCount++
    current[id] = task
    _saveTimersStore(current)
  }, intervalMs)
  _activeTimers.set(id, handle)

  return {
    success: true,
    timerId: id,
    message: `定时任务「${name}」已创建，每 ${intervalMinutes} 分钟执行一次`
  }
}

/** 🕐 列出定时任务 */
export function list_timer_tasks() {
  const store = _getTimersStore()
  const timers = Object.values(store)
  return {
    count: timers.length,
    timers: timers.map((t) => ({
      id: t.id,
      name: t.name,
      intervalMinutes: t.intervalMinutes,
      enabled: t.enabled,
      skillId: t.skillId,
      runCount: t.runCount,
      lastRun: t.lastRun ? new Date(t.lastRun).toLocaleString() : '从未执行'
    }))
  }
}

/** 🕐 取消定时任务 */
export function cancel_timer_task({ timerId }) {
  const store = _getTimersStore()
  const t = store[timerId] || Object.values(store).find((x) => x.name === timerId)
  if (!t) return { error: '定时任务不存在' }

  // 清除内存中的 interval
  if (_activeTimers.has(t.id)) {
    clearInterval(_activeTimers.get(t.id))
    _activeTimers.delete(t.id)
  }
  const name = t.name
  delete store[t.id]
  _saveTimersStore(store)
  return { success: true, message: `定时任务「${name}」已取消` }
}

/** 🌐 联网搜索（通过主进程 HTTP） */
export async function web_search({ query, type }: any) {
  try {
    const result = await (window.api.fsAPI as any).webSearch?.(query, type)
    if (!result || result.error) {
      // 降级：返回指令让 AI 用自身知识回答
      return {
        success: true,
        instruction: 'WEB_SEARCH_FALLBACK',
        query,
        message: `联网搜索暂不可用。请用你自身的知识回答关于「${query}」的问题。`
      }
    }
    return result
  } catch {
    return {
      success: true,
      instruction: 'WEB_SEARCH_FALLBACK',
      query,
      message: `联网搜索暂不可用。请用你自身的知识回答关于「${query}」的问题。`
    }
  }
}

// ══════════════════════════════════════════════
//  Sprint 1：截图 + 便签 + 标签
// ══════════════════════════════════════════════

/** 截取画布 */
export function capture_canvas({ mode }: any = {}) {
  const store = useAppStore.getState()
  if (mode === 'selection' || !mode) {
    store.setScreenshotMode('selection')
    return { success: true, message: '已打开框选截图模式，请在画布上拖拽选择截图区域' }
  }
  if (mode === 'viewport') {
    store.setScreenshotMode('viewport')
    // 触发可视区域截图（异步，结果会显示在弹窗中）
    import('./canvasCapture').then(({ captureViewport }) => {
      captureViewport().then((result) => {
        if (result) store.setScreenshotResult(result)
      })
    })
    return { success: true, message: '正在截取可视区域...' }
  }
  return { error: '不支持的截图模式' }
}

/** 创建便签节点 */
export function create_sticky_note({ text, color, x, y }: any = {}) {
  const store = useAppStore.getState()
  const nodeId = `sticky_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

  // 默认位置：画布中心
  const view = store.view
  const centerX = x ?? -view.x / view.zoom + window.innerWidth / 2 / view.zoom
  const centerY = y ?? -view.y / view.zoom + window.innerHeight / 2 / view.zoom

  const newNode = {
    id: nodeId,
    type: 'sticky-note',
    position: { x: centerX, y: centerY },
    x: centerX,
    y: centerY,
    width: 200,
    height: 150,
    data: {},
    settings: {
      text: text || '',
      stickyColor: color || 'yellow'
    }
  }

  store.setNodes((prev) => [...prev, newNode])
  return { success: true, nodeId, message: `已创建${color || '黄色'}便签` }
}

/** 设置分组通用参数 */
export function set_group_params({ groupId, model, promptPrefix, ratio, resolution }: any) {
  const store = useAppStore.getState()
  const group = (store.nodeGroups || []).find((g) => g.id === groupId)
  if (!group) return { error: `分组 ${groupId} 不存在` }

  const params: AnyRecord = {}
  if (model) params.model = model
  if (promptPrefix) params.promptPrefix = promptPrefix
  if (ratio) params.ratio = ratio
  if (resolution) params.resolution = resolution

  store.setGroupCommonParams(groupId, params)
  return { success: true, message: `已更新分组「${group.name}」的通用参数`, params }
}

/** 折叠/展开分组 */
export function collapse_group({ groupId }) {
  const store = useAppStore.getState()
  const group = (store.nodeGroups || []).find((g) => g.id === groupId)
  if (!group) return { error: `分组 ${groupId} 不存在` }

  store.toggleGroupCollapse(groupId)
  const newState = !group.collapsed
  return { success: true, message: `分组「${group.name}」已${newState ? '折叠' : '展开'}` }
}

/** 添加全局标签 */
export function add_tag({ name }) {
  if (!name?.trim()) return { error: '标签名不能为空' }
  const store = useAppStore.getState()
  store.addTag(name.trim())
  const tags = useAppStore.getState().tags
  const newTag = tags.find((t) => t.name === name.trim())
  return { success: true, tag: newTag, message: `已添加标签「${name}」` }
}

/** 删除全局标签 */
export function remove_tag({ tagId }) {
  const store = useAppStore.getState()
  const tag = (store.tags || []).find((t) => t.id === tagId)
  if (!tag) return { error: `标签 ${tagId} 不存在` }
  store.removeTag(tagId)
  return { success: true, message: `已删除标签「${tag.name}」` }
}

/** 给节点打标签 */
export function tag_node({ nodeId, tagId }) {
  const store = useAppStore.getState()
  const node = store.nodesMap.get(nodeId)
  if (!node) return { error: `节点 ${nodeId} 不存在` }
  const tag = (store.tags || []).find((t) => t.id === tagId)
  if (!tag) return { error: `标签 ${tagId} 不存在` }
  store.addNodeTag(nodeId, tagId)
  return { success: true, message: `已为节点打上标签「${tag.name}」` }
}

/** 按标签筛选 */
export function filter_by_tag({ tagId }) {
  const store = useAppStore.getState()
  if (!tagId) {
    store.setActiveTagFilter(null)
    return { success: true, message: '已清除标签筛选' }
  }
  const tag = (store.tags || []).find((t) => t.id === tagId)
  if (!tag) return { error: `标签 ${tagId} 不存在` }
  store.setActiveTagFilter(tagId)
  return { success: true, message: `已筛选标签「${tag.name}」，非匹配节点已半透明化` }
}

/** AI 自动建议标签 */
export function auto_suggest_tags({ nodeId }) {
  const store = useAppStore.getState()
  const node = store.nodesMap.get(nodeId)
  if (!node) return { error: `节点 ${nodeId} 不存在` }

  const prompt = (node.settings?.prompt || node.settings?.videoPrompt || '').toLowerCase()
  const suggestions = []

  // 基于关键词的规则匹配
  const rules = [
    {
      keywords: [
        'girl',
        'boy',
        'woman',
        'man',
        'character',
        '人物',
        '角色',
        '少女',
        '男孩',
        '女孩'
      ],
      tag: '人物'
    },
    {
      keywords: ['landscape', 'city', 'building', 'scene', '风景', '城市', '建筑', '场景', '背景'],
      tag: '场景'
    },
    { keywords: ['action', 'fight', 'run', '动作', '战斗', '奔跑'], tag: '动作' },
    { keywords: ['close-up', 'portrait', '特写', '肖像'], tag: '特写' },
    { keywords: ['第一幕', 'act 1', 'opening', '开场'], tag: '第一幕' },
    { keywords: ['第二幕', 'act 2', 'middle'], tag: '第二幕' },
    { keywords: ['第三幕', 'act 3', 'ending', 'climax', '高潮', '结尾'], tag: '第三幕' },
    { keywords: ['cyberpunk', '赛博朋克'], tag: '赛博朋克' },
    { keywords: ['anime', '动漫', '二次元'], tag: '动漫风' },
    { keywords: ['realistic', 'photorealistic', '写实', '真实'], tag: '写实风' }
  ]

  for (const rule of rules) {
    if (rule.keywords.some((kw) => prompt.includes(kw))) {
      suggestions.push(rule.tag)
    }
  }

  if (node.type === 'gen-video') suggestions.push('视频')
  if (node.type === 'gen-image') suggestions.push('图片')

  return {
    success: true,
    nodeId,
    suggestions: [...new Set(suggestions)],
    message: suggestions.length > 0 ? `建议标签：${suggestions.join('、')}` : '暂无匹配的标签建议'
  }
}

// ══════════════════════════════════════════════
//  Sprint 2：项目管理 + AI 气泡
// ══════════════════════════════════════════════

/** 打开项目管理画廊 */
export function open_project_manager() {
  useAppStore.getState().setProjectGalleryOpen(true)
  return { success: true, message: '已打开项目管理画廊' }
}

/** 列出所有项目 */
export async function list_projects() {
  try {
    if (window.dbAPI?.projects?.list) {
      const projects = await window.dbAPI.projects.list()
      return {
        success: true,
        count: projects?.length || 0,
        projects: (projects || []).map((p) => ({
          id: p.id,
          name: p.name,
          updatedAt: p.updated_at || p.created_at
        }))
      }
    }
    return { error: '项目数据库不可用' }
  } catch (err) {
    return { error: `列出项目失败: ${err.message}` }
  }
}

// ══════════════════════════════════════════════
//  Sprint 3：批量生产板
// ══════════════════════════════════════════════

/** 打开批量生产板 */
export function open_production_board({ mode }: any = {}) {
  const store = useAppStore.getState()
  if (mode) store.setProductionBoardMode(mode)
  store.setProductionBoardOpen(true)
  return { success: true, message: `已打开${mode === 'image' ? '图片' : '视频'}批量生产板` }
}

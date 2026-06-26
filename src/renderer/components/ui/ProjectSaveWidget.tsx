/**
 * ProjectSaveWidget — 快速保存 / 导入导出 组件
 *
 * 功能：
 * 1. 点击保存按钮 → 保存当前项目到 SQLite + 弹窗显示保存详情
 * 2. 导出 JSON → 包含节点、连线、视图、名称、生成历史（本地使用时）
 * 3. 导入 JSON → 恢复节点、连线；本地使用可恢复历史，他人画布仅恢复节点
 */
import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { useOptionalProjectContext } from '../../contexts/ProjectContext.tsx'
import { useAppStore } from '../../store/useAppStore.ts'

export const ProjectSaveWidget = memo(function ProjectSaveWidget() {
  const projectContext = useOptionalProjectContext()
  const [showMenu, setShowMenu] = useState(false)
  const [saveResult, setSaveResult] = useState<any>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const handleSaveToHistory = projectContext?.handleSaveToHistory
  const handleSaveProject = projectContext?.handleSaveProject
  const handleLoadProject = projectContext?.handleLoadProject

  const buildProductionBoardSnapshot = useCallback(
    (state: any) => ({
      rows: state.productionBoardRows || [],
      commonValues: state.productionBoardCommonValues || null,
      mode: state.productionBoardMode || 'video',
      videoRows: state.productionBoardVideoRows || null,
      videoCommonValues: state.productionBoardVideoCommonValues || null,
      imageRows: state.productionBoardImageRows || null,
      imageCommonValues: state.productionBoardImageCommonValues || null,
      sharedRefs: state.productionBoardSharedRefs || null
    }),
    []
  )

  const restoreProductionBoardSnapshot = useCallback((state: any, snapshot: any) => {
    if (!snapshot || typeof snapshot !== 'object') return
    state.setProductionBoardRows?.(Array.isArray(snapshot.rows) ? snapshot.rows : null)
    state.setProductionBoardCommonValues?.(snapshot.commonValues || null)
    state.setProductionBoardMode?.(snapshot.mode === 'image' ? 'image' : 'video')
    state.setProductionBoardVideoRows?.(
      Array.isArray(snapshot.videoRows) ? snapshot.videoRows : null
    )
    state.setProductionBoardVideoCommonValues?.(snapshot.videoCommonValues || null)
    state.setProductionBoardImageRows?.(
      Array.isArray(snapshot.imageRows) ? snapshot.imageRows : null
    )
    state.setProductionBoardImageCommonValues?.(snapshot.imageCommonValues || null)
    state.setProductionBoardSharedRefs?.(snapshot.sharedRefs || null)
  }, [])

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  // 自动隐藏保存结果
  useEffect(() => {
    if (saveResult) {
      const timer = setTimeout(() => setSaveResult(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [saveResult])

  // 快速保存
  const handleQuickSave = useCallback(async () => {
    const state = useAppStore.getState()
    const nodesCount = state.nodes.length
    const connectionsCount = state.connections.length
    const projectName = state.projectName || '未命名项目'
    const historyCount = state.history?.length || 0

    try {
      if (!handleSaveToHistory) return
      await handleSaveToHistory()
      setSaveResult({
        success: true,
        projectName,
        nodesCount,
        connectionsCount,
        historyCount,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false })
      })
      setShowMenu(false)
    } catch (err: any) {
      setSaveResult({ success: false, error: err.message })
    }
  }, [handleSaveToHistory])

  // 导出增强版 JSON（包含更多信息供本地使用）
  const handleExportJSON = useCallback(async () => {
    const state = useAppStore.getState()
    const nodes = state.nodes
    const connections = state.connections
    const projectName = state.projectName || '未命名项目'
    const view = state.view
    const history = state.history || []
    const currentProject = state.currentProject

    const exportData = {
      version: '3.0',
      type: 'project',
      projectName,
      projectId: currentProject?.id || null,
      exportedAt: new Date().toISOString(),
      exportedFrom: 'local', // 标记本机导出
      view,
      nodes,
      connections,
      history, // 包含生成历史
      productionBoard: buildProductionBoardSnapshot(state),
      meta: {
        nodesCount: nodes.length,
        connectionsCount: connections.length,
        historyCount: history.length,
        nodeTypes: Object.entries(
          nodes.reduce((acc: Record<string, number>, n: any) => {
            acc[n.type] = (acc[n.type] || 0) + 1
            return acc
          }, {})
        ).map(([type, count]) => ({ type, count }))
      }
    }

    const jsonStr = JSON.stringify(
      exportData,
      (key, value) => (value === undefined ? null : value),
      2
    )
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const defaultName = `${projectName}_${ts}.json`

    try {
      if (window.api?.fsAPI?.saveTextFileAs) {
        const result = await window.api.fsAPI.saveTextFileAs({
          content: jsonStr,
          defaultName,
          filters: [
            { name: 'JSON Project File', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        })
        if (result?.canceled) {
          setShowMenu(false)
          return
        }
        if (!result?.success) {
          throw new Error(result?.error || 'Export failed')
        }
      } else if ((window as any).showSaveFilePicker) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: defaultName,
          types: [{ description: 'JSON Project File', accept: { 'application/json': ['.json'] } }]
        })
        const blob = new Blob([jsonStr], { type: 'application/json' })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
      } else {
        const blob = new Blob([jsonStr], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = defaultName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
      setSaveResult({
        success: true,
        action: 'export',
        projectName,
        nodesCount: nodes.length,
        connectionsCount: connections.length,
        historyCount: history.length,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false })
      })
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setSaveResult({ success: false, error: e.message })
      }
    }
    setShowMenu(false)
  }, [buildProductionBoardSnapshot])

  // 导入 JSON
  const handleImportJSON = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)

        const state = useAppStore.getState()

        // 如果没有当前项目，自动创建一个新项目
        let projId = state.currentProject?.id
        if (!projId) {
          projId = `proj-${Date.now()}`
          const newProject = {
            id: projId,
            name: data.projectName || '导入项目',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
          state.setCurrentProject(newProject)
          state.setProjectName(newProject.name)
          console.log(`[Import] 自动创建项目: ${newProject.name} (${projId})`)
        }

        // 判断是否是本机导出（有 projectId 且与当前相同）
        const isLocal = data.projectId && data.projectId === projId

        // 恢复节点和连线
        if (data.nodes) state.setNodes(data.nodes)
        if (data.connections) state.setConnections(data.connections)
        if (data.projectName) state.setProjectName(data.projectName)
        if (data.view) state.setView(data.view)
        restoreProductionBoardSnapshot(state, data.productionBoard)

        // 本机使用：恢复生成历史
        if (isLocal && data.history && Array.isArray(data.history)) {
          state.setHistory(data.history)
        }

        // 持久化到 SQLite
        if (projId && data.nodes?.length > 0 && window.dbAPI?.nodes?.saveBatch) {
          await window.dbAPI.nodes.saveBatch(data.nodes, projId)
        }
        if (projId && data.connections?.length > 0 && window.dbAPI?.connections?.saveBatch) {
          await window.dbAPI.connections.saveBatch(data.connections, projId)
        }

        setSaveResult({
          success: true,
          action: 'import',
          projectName: data.projectName || file.name,
          nodesCount: data.nodes?.length || 0,
          connectionsCount: data.connections?.length || 0,
          historyCount: isLocal ? data.history?.length || 0 : 0,
          isLocal,
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false })
        })
      } catch (err: any) {
        setSaveResult({ success: false, error: `导入失败: ${err.message}` })
      }
    }
    input.click()
    setShowMenu(false)
  }, [restoreProductionBoardSnapshot])

  if (!projectContext) {
    return null
  }

  return (
    <div ref={menuRef} className="relative z-50 flex items-center justify-center">
      {/* 保存结果弹窗 */}
      {saveResult && (
        <div
          className={`absolute bottom-full mb-2 right-0 px-4 py-3 rounded-xl border backdrop-blur-md shadow-lg text-xs font-mono min-w-[220px] max-w-[320px] animate-[slideUp_0.3s_ease-out] ${
            saveResult.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
          style={{ animation: 'slideUp 0.3s ease-out' }}
        >
          {saveResult.success ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-sm">
                {saveResult.action === 'export'
                  ? '📤 导出完成'
                  : saveResult.action === 'import'
                    ? '📥 导入完成'
                    : '💾 保存成功'}
              </div>
              <div className="text-[10px] space-y-0.5 text-[var(--text-secondary)]">
                <div>📂 {saveResult.projectName}</div>
                <div>🧩 节点: {saveResult.nodesCount} 个</div>
                <div>🔗 连线: {saveResult.connectionsCount} 条</div>
                {saveResult.historyCount > 0 && <div>📜 历史: {saveResult.historyCount} 条</div>}
                {saveResult.action === 'import' &&
                  !saveResult.isLocal &&
                  saveResult.historyCount === 0 && (
                    <div className="text-yellow-400/70">⚠ 非本机画布，历史/资产未恢复</div>
                  )}
                <div className="text-[var(--text-muted)]">⏰ {saveResult.time}</div>
              </div>
            </div>
          ) : (
            <div>❌ {saveResult.error}</div>
          )}
          <button
            onClick={() => setSaveResult(null)}
            className="absolute top-1 right-2 text-[var(--text-muted)] hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {/* 操作菜单 */}
      {showMenu && (
        <div
          className="absolute bottom-full mb-2 right-0 flex flex-col gap-1 px-1.5 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-color)] shadow-lg backdrop-blur-md min-w-[140px]"
          style={{ animation: 'slideUp 0.2s ease-out' }}
        >
          <button
            onClick={handleQuickSave}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--primary-color)]/10 hover:text-[var(--primary-color)] transition-all"
          >
            💾 快速保存
          </button>
          <div className="w-full h-px bg-[var(--border-color)]" />
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-blue-500/10 hover:text-blue-400 transition-all"
          >
            📤 导出项目 JSON
          </button>
          <button
            onClick={handleImportJSON}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-green-500/10 hover:text-green-400 transition-all"
          >
            📥 导入项目 JSON
          </button>
          <div className="w-full h-px bg-[var(--border-color)]" />
          <button
            onClick={() => {
              handleSaveProject()
              setShowMenu(false)
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-orange-500/10 hover:text-orange-400 transition-all"
          >
            📁 另存为...（旧版）
          </button>
          <button
            onClick={() => {
              handleLoadProject()
              setShowMenu(false)
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-purple-500/10 hover:text-purple-400 transition-all"
          >
            📂 加载旧版 JSON
          </button>
        </div>
      )}

      {/* 保存按钮 */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`p-2.5 rounded-xl transition-all duration-150 ${
          showMenu ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)]' : 'btn-ghost'
        }`}
        title="保存 / 导入导出"
      >
        <span className="text-base leading-none text-[var(--text-secondary)]">💾</span>
      </button>
    </div>
  )
})

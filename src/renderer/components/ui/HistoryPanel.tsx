import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import {
  FolderCog,
  LayoutGrid,
  X,
  RefreshCw,
  Loader2,
  Trash2,
  Image,
  Film
} from '../../utils/icons.tsx'
import { HistoryItem } from './HistoryItem.tsx'
import { useAppStore } from '../../store/useAppStore.ts'
import { getProjectCacheContext } from '../../utils/projectCache.ts'
import { withCurrentProjectTaskPayload } from '../../utils/engineTaskPayload.ts'
import { friendlyError } from '../../utils/friendlyError.ts'
import { FloatingPanel } from './FloatingPanel.tsx'
import { getPreferredMediaUrl } from '../../utils/fileHelpers.ts'

export function HistoryPanel({
  historyOpen,
  setHistoryOpen,
  historyPerformanceMode,
  localCacheServerConnected,
  localCacheSettingsOpen,
  setLocalCacheSettingsOpen,
  setBatchModalOpen,
  setBatchSelectedIds,
  history,
  setHistory,
  lightboxItem,
  setLightboxItem,
  deleteHistoryItem,
  handleHistoryRightClick,
  onShowPrompt,
  onRegenerate
}: any) {
  const [activeTab, setActiveTab] = useState('image')
  const currentProject = useAppStore((state) => state.currentProject)
  const setCurrentProject = useAppStore((state) => state.setCurrentProject)

  const updateProjectCacheRoot = useCallback(
    async (cacheRoot) => {
      if (!currentProject?.id) return
      if (window.api?.invoke) {
        const result = await window.api.invoke('cache:config', {
          projectId: currentProject.id,
          cacheRoot: cacheRoot || null,
          persist: true
        })
        if (result?.success === false) throw new Error(result.error || 'Failed to save cache folder')
      }
      const nextProject = { ...currentProject, cacheRoot: cacheRoot || null }
      setCurrentProject(nextProject)
      if (window.dbAPI?.settings) {
        window.dbAPI.settings
          .set('tapnow_current_project', JSON.stringify(nextProject))
          .catch(() => {})
      }
    },
    [currentProject, setCurrentProject]
  )

  if (!historyOpen) return null

  const imageHistory = history.filter((item) => item.type === 'image')
  const videoHistory = history.filter((item) => item.type !== 'image')
  const filteredHistory = activeTab === 'image' ? imageHistory : videoHistory

  return (
    <FloatingPanel
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
      title="生成历史"
      icon="📜"
      defaultX={20}
      defaultY={60}
      width={300}
      maxHeight="75vh"
    >
      <div
        className={`p-2 border-b flex justify-between items-center border-[var(--border-color)]`}
      >
        <div />
        <div className="flex items-center gap-2">
          {/* 本地缓存设置 */}
          {localCacheServerConnected && (
            <button
              onClick={() => setLocalCacheSettingsOpen(!localCacheSettingsOpen)}
              className={`p-1.5 rounded transition-colors ${
                localCacheSettingsOpen
                  ? 'text-blue-400 bg-blue-500/20 hover:bg-blue-500/30'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]'
              }`}
              title="本地缓存设置"
            >
              <FolderCog size={14} />
            </button>
          )}
          <button
            onClick={async () => {
              if (
                !confirm(
                  '确定要清除所有生成历史的本地缓存吗？\n\n这将删除：\n• 本地缓存的图片文件\n• 本地缓存的视频文件\n• 缩略图缓存\n• 历史记录数据\n\n（不会影响 API 配置和资产库）'
                )
              )
                return
              try {
                const result = await window.api.localCacheAPI.clearGenerated(getProjectCacheContext())
                if (result.success) {
                  // 同步清除数据库历史记录
                  setHistory([])
                  const mb = (result.freedBytes / 1024 / 1024).toFixed(1)
                  alert(`清理完成！\n删除文件: ${result.deletedFiles} 个\n释放空间: ${mb} MB`)
                } else {
                  alert('清理失败: ' + (result.error || '未知错误'))
                }
              } catch (e) {
                alert('清理失败: ' + e.message)
              }
            }}
            className="p-1.5 rounded transition-colors text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10"
            title="清除缓存数据"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => {
              setBatchModalOpen(true)
              setBatchSelectedIds(new Set())
            }}
            className={`p-1.5 rounded transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]`}
            title="批量管理"
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>
      {/* 本地缓存状态提示 */}
      {localCacheServerConnected && (
        <div
          className={`px-3 py-1.5 text-[10px] flex items-center gap-1.5 border-b bg-green-500/10 border-[var(--border-color)] text-green-400`}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
          本地缓存已连接 - 图片将优先从本地读取
        </div>
      )}
      {/* 本地缓存设置面板 */}
      {localCacheSettingsOpen && localCacheServerConnected && (
        <ProjectCacheSettingsPanel
          currentProject={currentProject}
          updateProjectCacheRoot={updateProjectCacheRoot}
        />
      )}
      {/* Tab 切换 */}
      <div className="flex border-b border-[var(--border-color)]">
        <button
          onClick={() => setActiveTab('image')}
          className={`flex-1 py-2 px-3 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'image'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/30'
          }`}
        >
          <Image size={13} />
          图片
          <span
            className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
              activeTab === 'image'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-[var(--border-color)] text-[var(--text-muted)]'
            }`}
          >
            {imageHistory.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('video')}
          className={`flex-1 py-2 px-3 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'video'
              ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/5'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]/30'
          }`}
        >
          <Film size={13} />
          视频
          <span
            className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
              activeTab === 'video'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-[var(--border-color)] text-[var(--text-muted)]'
            }`}
          >
            {videoHistory.length}
          </span>
        </button>
      </div>
      <VirtualHistoryList
        filteredHistory={filteredHistory}
        activeTab={activeTab}
        lightboxItem={lightboxItem}
        setLightboxItem={setLightboxItem}
        deleteHistoryItem={deleteHistoryItem}
        handleHistoryRightClick={handleHistoryRightClick}
        setHistory={setHistory}
        onShowPrompt={onShowPrompt}
        onRegenerate={onRegenerate}
        historyPerformanceMode={historyPerformanceMode}
        Loader2={Loader2}
        Trash2={Trash2}
        RefreshCw={RefreshCw}
      />
    </FloatingPanel>
  )
}

function ProjectCacheSettingsPanel({ currentProject, updateProjectCacheRoot }) {
  const cacheRoot = currentProject?.cacheRoot || ''
  const [draftCacheRoot, setDraftCacheRoot] = useState(cacheRoot)
  const [saveStatus, setSaveStatus] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraftCacheRoot(cacheRoot)
  }, [cacheRoot])

  const applyCacheRoot = useCallback(
    async (nextRoot = draftCacheRoot) => {
      if (!currentProject?.id) return
      setSaving(true)
      setSaveStatus('')
      try {
        await updateProjectCacheRoot(String(nextRoot || '').trim())
        setSaveStatus('Saved')
      } catch (error) {
        setSaveStatus(error?.message || 'Save failed. Check folder access.')
      } finally {
        setSaving(false)
      }
    },
    [currentProject?.id, draftCacheRoot, updateProjectCacheRoot]
  )

  const chooseDirectory = useCallback(async () => {
    if (!currentProject?.id || !window.api?.localCacheAPI?.openDirectory) return
    setSaving(true)
    setSaveStatus('')
    const result = await window.api.localCacheAPI.openDirectory(draftCacheRoot || cacheRoot)
    if (result?.success && result.path) {
      setDraftCacheRoot(result.path)
      await applyCacheRoot(result.path)
    } else if (result?.error) {
      setSaveStatus(result.error)
    }
    setSaving(false)
  }, [applyCacheRoot, cacheRoot, currentProject?.id, draftCacheRoot])

  return (
    <div className="p-3 border-b space-y-3 bg-[var(--bg-base)] border-[var(--border-color)]">
      <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
        项目缓存目录
      </div>
      <div className="space-y-1">
        <label className="text-[10px] text-[var(--text-secondary)]">
          当前项目缓存文件夹
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={draftCacheRoot}
            onChange={(event) => {
              setDraftCacheRoot(event.target.value)
              setSaveStatus('')
            }}
            onBlur={() => applyCacheRoot()}
            disabled={!currentProject?.id || saving}
            placeholder="使用默认项目缓存目录"
            className="min-w-0 flex-1 px-2 py-1.5 text-[11px] rounded border bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={chooseDirectory}
            disabled={!currentProject?.id || saving}
            className="px-2 py-1.5 text-[11px] rounded border bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-60"
          >
            浏览
          </button>
        </div>
        {saveStatus && <div className="text-[9px] text-[var(--text-muted)]">{saveStatus}</div>}
      </div>
      <div className="text-[9px] p-2 rounded bg-blue-500/10 text-blue-400">
        历史、节点、缩略图和托管素材按项目隔离；这里不设置全局缓存和容量上限。
      </div>
    </div>
  )
}

// 紧凑网格历史列表
function VirtualHistoryList({
  filteredHistory,
  activeTab,
  lightboxItem,
  setLightboxItem,
  deleteHistoryItem,
  handleHistoryRightClick,
  setHistory,
  onShowPrompt,
  onRegenerate,
  historyPerformanceMode,
  Loader2,
  Trash2,
  RefreshCw
}) {
  const scrollRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportSize, setViewportSize] = useState({ width: 276, height: 320 })

  const ITEM_WIDTH = 120
  const ITEM_HEIGHT = 160
  const GAP = 8
  const OVERSCAN_ROWS = 2

  useEffect(() => {
    setScrollTop(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [activeTab])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const updateSize = () => {
      setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight
      })
    }

    updateSize()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSize)
      observer.observe(element)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  useEffect(() => {
    if (!scrollRef.current) return
    const innerWidth = Math.max(ITEM_WIDTH, viewportSize.width - 24)
    const columns = Math.max(1, Math.floor((innerWidth + GAP) / (ITEM_WIDTH + GAP)))
    const rowCount = Math.ceil(filteredHistory.length / columns)
    const maxScrollTop = Math.max(0, rowCount * ITEM_HEIGHT - viewportSize.height)
    if (scrollRef.current.scrollTop > maxScrollTop) {
      scrollRef.current.scrollTop = maxScrollTop
      setScrollTop(maxScrollTop)
    }
  }, [filteredHistory.length, viewportSize])

  const { columns, visibleItems, offsetY, totalHeight } = useMemo(() => {
    const innerWidth = Math.max(ITEM_WIDTH, viewportSize.width - 24)
    const computedColumns = Math.max(1, Math.floor((innerWidth + GAP) / (ITEM_WIDTH + GAP)))
    const rowCount = Math.ceil(filteredHistory.length / computedColumns)
    const maxScrollTop = Math.max(0, rowCount * ITEM_HEIGHT - (viewportSize.height || ITEM_HEIGHT))
    const effectiveScrollTop = Math.min(scrollTop, maxScrollTop)
    const startRow = Math.max(0, Math.floor(effectiveScrollTop / ITEM_HEIGHT) - OVERSCAN_ROWS)
    const visibleRowCount =
      Math.ceil((viewportSize.height || ITEM_HEIGHT) / ITEM_HEIGHT) + OVERSCAN_ROWS * 2
    const endRow = Math.min(rowCount, startRow + visibleRowCount)
    const startIndex = startRow * computedColumns
    const endIndex = Math.min(filteredHistory.length, endRow * computedColumns)

    return {
      columns: computedColumns,
      visibleItems: filteredHistory.slice(startIndex, endIndex),
      offsetY: startRow * ITEM_HEIGHT,
      totalHeight: rowCount * ITEM_HEIGHT
    }
  }, [filteredHistory, scrollTop, viewportSize])

  const buildHistoryTaskPayload = useCallback((item, historyTaskId, extra = {}) => {
    const originalPayload = item.originalPayload || {}
    const state = useAppStore.getState()
    const modelId =
      originalPayload.modelId ||
      item.apiConfig?.modelId ||
      item.modelId ||
      item.modelName ||
      ''
    const modelConfig = (state.apiConfigs || []).find(
      (config) => config.id === modelId || config.modelName === modelId || config.modelName === item.modelName
    )
    const valueOrEmpty = (value) => (value && value !== '[REDACTED]' ? value : '')
    return {
      ...originalPayload,
      historyTaskId,
      nodeId: originalPayload.nodeId || item.sourceNodeId || null,
      type: originalPayload.type || item.type || 'video',
      prompt: originalPayload.prompt || item.prompt || '',
      modelId,
      configName:
        originalPayload.configName ||
        item.apiConfig?.modelName ||
        item.apiConfig?.modelId ||
        modelConfig?.modelName ||
        originalPayload.modelId ||
        modelId,
      baseUrl:
        valueOrEmpty(originalPayload.baseUrl) ||
        valueOrEmpty(item.apiConfig?.baseUrl) ||
        valueOrEmpty(item.apiConfig?.url) ||
        valueOrEmpty(modelConfig?.url),
      apiKey:
        valueOrEmpty(originalPayload.apiKey) ||
        valueOrEmpty(item.apiConfig?.apiKey) ||
        valueOrEmpty(item.apiConfig?.key) ||
        valueOrEmpty(modelConfig?.key),
      ratio: originalPayload.ratio || item.ratio,
      resolution: originalPayload.resolution || item.resolution,
      duration: originalPayload.duration || item.duration,
      w: originalPayload.w || item.width,
      h: originalPayload.h || item.height,
      ...extra
    }
  }, [])

  const refreshHistoryResult = useCallback((refreshItem) => {
    const retryRemoteTaskId = refreshItem.remoteTaskId || refreshItem.taskId
    if (!refreshItem.apiConfig || !retryRemoteTaskId || !window.api?.engineAPI?.submitTask) return

    setHistory((prev) =>
      prev.map((h) =>
        h.id === refreshItem.id
          ? { ...h, status: 'generating', errorMsg: null, rawErrorMsg: null, progress: 5 }
          : h
      )
    )

    const retryPayload = buildHistoryTaskPayload(refreshItem, refreshItem.id, { retryRemoteTaskId })
    window.api.engineAPI
      .submitTask(withCurrentProjectTaskPayload(retryPayload as any) as any)
      .then((response) => {
        if (response?.success === false) {
          throw new Error(response.error || '重新获取结果失败')
        }
      })
      .catch((err) => {
        console.error('[HistoryPanel] Refresh result failed:', err)
        const rawError = '刷新结果失败: ' + (err.message || err)
        setHistory((prev) =>
          prev.map((h) =>
            h.id === refreshItem.id
              ? {
                  ...h,
                  status: 'failed',
                  errorMsg: friendlyError(rawError),
                  rawErrorMsg: rawError
                }
              : h
          )
        )
      })
  }, [buildHistoryTaskPayload, setHistory])

  const resubmitHistoryTask = useCallback((item) => {
    if (!window.api?.engineAPI?.submitTask) return
    const historyTaskId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const payload = buildHistoryTaskPayload(item, historyTaskId)
    delete (payload as any).retryRemoteTaskId

    const now = Date.now()
    setHistory((prev) => [
      {
        id: historyTaskId,
        type: payload.type || item.type || 'video',
        url: '',
        prompt: payload.prompt || item.prompt || '',
        time: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'generating',
        progress: 0,
        modelName: payload.configName || payload.modelId || item.modelName,
        width: payload.w || item.width || null,
        height: payload.h || item.height || null,
        requestId: historyTaskId,
        taskId: null,
        remoteTaskId: null,
        sourceNodeId: payload.nodeId || item.sourceNodeId || null,
        sourceMeta: item.sourceMeta || null,
        apiConfig: { modelId: payload.modelId, baseUrl: payload.baseUrl, apiKey: payload.apiKey },
        originalPayload: payload,
        startTime: now,
        durationMs: null,
        ratio: payload.ratio || item.ratio,
        cacheStatus: 'idle',
        resubmittedFrom: item.id
      },
      ...prev
    ])

    window.api.engineAPI
      .submitTask(withCurrentProjectTaskPayload(payload as any) as any)
      .then((response) => {
        if (!response || response.success === false) {
          throw new Error(response?.error || '重新提交失败')
        }
        if (response.taskId) {
          setHistory((prev) =>
            prev.map((h) =>
              h.id === historyTaskId
                ? { ...h, taskId: response.taskId, localTaskId: response.taskId }
                : h
            )
          )
        }
      })
      .catch((err) => {
        const rawError = '重新提交失败: ' + (err.message || err)
        setHistory((prev) =>
          prev.map((h) =>
            h.id === historyTaskId
              ? { ...h, status: 'failed', errorMsg: friendlyError(rawError), rawErrorMsg: rawError }
              : h
          )
        )
      })
  }, [buildHistoryTaskPayload, setHistory])

  if (filteredHistory.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
          {activeTab === 'image' ? (
            <Image size={32} className="mb-2 opacity-30" />
          ) : (
            <Film size={32} className="mb-2 opacity-30" />
          )}
          <span className="text-[11px]">暂无{activeTab === 'image' ? '图片' : '视频'}生成历史</span>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto custom-scrollbar p-3"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: `${Math.max(totalHeight, ITEM_HEIGHT)}px`, position: 'relative' }}>
        <div
          className="grid justify-start gap-2"
          style={{
            position: 'absolute',
            top: `${offsetY}px`,
            left: 0,
            right: 0,
            gridTemplateColumns: `repeat(${columns}, ${ITEM_WIDTH}px)`
          }}
        >
          {visibleItems.map((item) => (
          <HistoryItem
            key={item.id}
            item={item}
            lightboxItem={lightboxItem}
            onDelete={deleteHistoryItem}
            onClick={() => {
              const displayUrl = getPreferredMediaUrl(item)
              if (displayUrl || item.errorMsg) {
                const currentIndex =
                  item.mjImages && item.mjImages.length > 1
                    ? item.selectedMjImageIndex !== undefined
                      ? item.selectedMjImageIndex
                      : 0
                    : 0
                setLightboxItem({
                  ...item,
                  url:
                    item.mjImages && item.mjImages.length > 1
                      ? item.mjImages[currentIndex]
                      : displayUrl || '',
                  selectedMjImageIndex: currentIndex
                })
              }
            }}
            onContextMenu={(e) => handleHistoryRightClick(e, item)}
            onImageClick={(e, item2, imgUrl, idx) => {
              e.stopPropagation()
              setHistory((prev) =>
                prev.map((hItem) =>
                  hItem.id === item2.id
                    ? { ...hItem, url: imgUrl, selectedMjImageIndex: idx }
                    : hItem
                )
              )
              setLightboxItem({
                ...item2,
                url: imgUrl,
                selectedMjImageIndex: idx
              })
            }}
            onImageContextMenu={(e, item2, imgUrl, idx) =>
              handleHistoryRightClick(e, item2, imgUrl, idx)
            }
            onShowPrompt={onShowPrompt}
            onRegenerate={onRegenerate}
            onRefresh={refreshHistoryResult}
            onResubmit={resubmitHistoryTask}
            Loader2={Loader2}
            Trash2={Trash2}
            RefreshCw={RefreshCw}
            performanceMode={historyPerformanceMode}
            thumbnailUrl={item.thumbnailUrl}
            localCacheUrl={item.localCacheUrl}
            compact={true}
          />
          ))}
        </div>
      </div>
    </div>
  )
}

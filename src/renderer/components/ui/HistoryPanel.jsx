import { useState, useRef, useCallback, useMemo } from 'react'
import { FolderCog, LayoutGrid, X, RefreshCw, Loader2, Trash2, Image, Film } from '../../utils/icons.jsx'
import { HistoryItem } from './HistoryItem.jsx'
import { useAppStore } from '../../store/useAppStore.js'

export function HistoryPanel({
  historyOpen,
  setHistoryOpen,
  historyPerformanceMode,
  localCacheServerConnected,
  localCacheSettingsOpen,
  setLocalCacheSettingsOpen,
  localServerConfig,
  setLocalServerConfig,
  updateLocalServerConfig,
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
}) {
  const [activeTab, setActiveTab] = useState('image')
  const assetLibraryOpen = useAppStore((s) => s.assetLibraryOpen)

  if (!historyOpen) return null

  const imageHistory = history.filter((item) => item.type === 'image')
  const videoHistory = history.filter((item) => item.type !== 'image')
  const filteredHistory = activeTab === 'image' ? imageHistory : videoHistory

  return (
    <div
      className={`w-72 z-30 flex flex-col animate-in slide-in-from-left border-r transition-all duration-300 bg-[var(--bg-secondary)] border-[var(--border-color)]`}
      style={{ marginTop: assetLibraryOpen ? '18vh' : 0 }}
    >
      <div
        className={`p-3 border-b flex justify-between items-center border-[var(--border-color)]`}
      >
        <h3 className={`font-bold text-xs text-[var(--text-primary)]`}>生成历史</h3>
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
              if (!confirm('确定要清除所有生成历史的本地缓存吗？\n\n这将删除：\n• 本地缓存的图片文件\n• 本地缓存的视频文件\n• 缩略图缓存\n• 历史记录数据\n\n（不会影响 API 配置和资产库）')) return
              try {
                const result = await window.api.localCacheAPI.clearGenerated()
                if (result.success) {
                  // 同步清除数据库历史记录
                  await window.api.localCacheAPI.clearHistory()
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
          <button onClick={() => setHistoryOpen(false)}>
            <X size={12} className={'text-[var(--text-secondary)]'} />
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
        <div className={`p-3 border-b space-y-3 bg-[var(--bg-base)] border-[var(--border-color)]`}>
          <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
            本地缓存设置
          </div>
          {/* 图片保存路径 */}
          <div className="space-y-1">
            <label className={`text-[10px] text-[var(--text-secondary)]`}>图片保存路径</label>
            <input
              type="text"
              value={localServerConfig.imageSavePath}
              onChange={(e) =>
                setLocalServerConfig((prev) => ({ ...prev, imageSavePath: e.target.value }))
              }
              onBlur={(e) => updateLocalServerConfig({ image_save_path: e.target.value })}
              placeholder="例如: D:/Pictures/TapnowImages"
              className={`w-full px-2 py-1.5 text-[11px] rounded border bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)]`}
            />
          </div>
          {/* 视频保存路径 */}
          <div className="space-y-1">
            <label className={`text-[10px] text-[var(--text-secondary)]`}>视频保存路径</label>
            <input
              type="text"
              value={localServerConfig.videoSavePath}
              onChange={(e) =>
                setLocalServerConfig((prev) => ({ ...prev, videoSavePath: e.target.value }))
              }
              onBlur={(e) => updateLocalServerConfig({ video_save_path: e.target.value })}
              placeholder="例如: D:/Videos/TapnowVideos"
              className={`w-full px-2 py-1.5 text-[11px] rounded border bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)]`}
            />
          </div>
          {/* PNG转JPG开关 */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className={`text-[10px] text-[var(--text-primary)]`}>PNG转高质量JPG</div>
              <div className={`text-[9px] text-[var(--text-secondary)]`}>
                {localServerConfig.pilAvailable
                  ? '自动转换PNG为JPG节省空间'
                  : 'PIL未安装，功能不可用'}
              </div>
            </div>
            <button
              onClick={() => {
                const newValue = !localServerConfig.convertPngToJpg
                setLocalServerConfig((prev) => ({ ...prev, convertPngToJpg: newValue }))
                updateLocalServerConfig({ convert_png_to_jpg: newValue })
              }}
              disabled={!localServerConfig.pilAvailable}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                !localServerConfig.pilAvailable
                  ? 'bg-zinc-700 cursor-not-allowed opacity-50'
                  : localServerConfig.convertPngToJpg
                    ? 'bg-green-500'
                    : 'bg-zinc-700'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  localServerConfig.convertPngToJpg ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              ></div>
            </button>
          </div>
          {/* 刷新缓存按钮 */}
          <div className="pt-2 border-t border-[var(--border-color)]">
            <button
              onClick={async () => {
                if (!confirm('确定要重新缓存所有素材吗？这将清除本地缓存记录并重新下载到新路径。'))
                  return

                // 清除所有历史记录的本地缓存URL
                setHistory((prev) =>
                  prev.map((item) => ({
                    ...item,
                    localCacheUrl: null,
                    mjLocalUrls: null,
                    thumbnailUrl: null,
                    mjThumbnails: null
                  }))
                )

                // 提示用户
                alert('缓存记录已清除，素材将在下次访问时重新缓存到新路径。')
              }}
              className={`w-full py-2 px-3 text-[11px] rounded flex items-center justify-center gap-2 transition-colors bg-orange-500/20 text-orange-400 hover:bg-orange-500/30`}
            >
              <RefreshCw size={12} />
              刷新缓存（重新下载到新路径）
            </button>
          </div>
          {/* 提示信息 */}
          <div className={`text-[9px] p-2 rounded bg-blue-500/10 text-blue-400`}>
            提示：设置路径后，点击刷新缓存可将素材重新保存到新文件夹
          </div>
        </div>
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
          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
            activeTab === 'image'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-[var(--border-color)] text-[var(--text-muted)]'
          }`}>{imageHistory.length}</span>
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
          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
            activeTab === 'video'
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-[var(--border-color)] text-[var(--text-muted)]'
          }`}>{videoHistory.length}</span>
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
    </div>
  )
}

// 虚拟滚动历史列表
const ITEM_HEIGHT = 300
const BUFFER_COUNT = 5

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

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollTop(scrollRef.current.scrollTop)
    }
  }, [])

  const containerHeight = scrollRef.current?.clientHeight || 600
  const totalHeight = filteredHistory.length * ITEM_HEIGHT

  const { startIdx, endIdx } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_COUNT)
    const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT)
    const end = Math.min(filteredHistory.length, start + visibleCount + BUFFER_COUNT * 2)
    return { startIdx: start, endIdx: end }
  }, [scrollTop, containerHeight, filteredHistory.length])

  const visibleItems = filteredHistory.slice(startIdx, endIdx)

  if (filteredHistory.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
          {activeTab === 'image' ? (
            <Image size={32} className="mb-2 opacity-30" />
          ) : (
            <Film size={32} className="mb-2 opacity-30" />
          )}
          <span className="text-[11px]">
            暂无{activeTab === 'image' ? '图片' : '视频'}生成历史
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto custom-scrollbar p-3"
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: startIdx * ITEM_HEIGHT,
            left: 0,
            right: 0
          }}
          className="space-y-3"
        >
          {visibleItems.map((item) => (
            <HistoryItem
              key={item.id}
              item={item}
              lightboxItem={lightboxItem}
              onDelete={deleteHistoryItem}
              onClick={() => {
                const displayUrl = item.localCacheUrl || item.url || item.originalUrl
                if (displayUrl) {
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
                        : displayUrl,
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
              onRefresh={(refreshItem) => {
                if (refreshItem.apiConfig && refreshItem.remoteTaskId) {
                  setHistory((prev) =>
                    prev.map((h) =>
                      h.id === refreshItem.id
                        ? { ...h, status: 'generating', errorMsg: null, progress: 5 }
                        : h
                    )
                  )
                  if (window.api?.engineAPI?.submitTask) {
                    window.api.engineAPI.submitTask({
                      ...refreshItem.originalPayload,
                      historyTaskId: refreshItem.id,
                      retryRemoteTaskId: refreshItem.remoteTaskId
                    }).catch((err) => {
                      console.error('[HistoryPanel] Retry failed:', err)
                      setHistory((prev) =>
                        prev.map((h) =>
                          h.id === refreshItem.id
                            ? {
                                ...h,
                                status: 'failed',
                                errorMsg: '重试失败: ' + (err.message || err)
                              }
                            : h
                        )
                      )
                    })
                  }
                }
              }}
              Loader2={Loader2}
              Trash2={Trash2}
              RefreshCw={RefreshCw}
              performanceMode={historyPerformanceMode}
              thumbnailUrl={item.thumbnailUrl}
              localCacheUrl={item.localCacheUrl}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

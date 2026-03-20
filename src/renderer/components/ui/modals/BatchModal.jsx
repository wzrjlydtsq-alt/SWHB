import {
  X,
  FileImage,
  Loader2,
  Maximize2,
  Check,
  Trash2,
  HardDrive,
  ArrowRightSquare
} from '../../../utils/icons.jsx'
import { getXingheMediaSrc } from '../../../utils/fileHelpers.js'
import { setSettingJSON } from '../../../services/dbService.js'

export function BatchModal({
  batchModalOpen,
  setBatchModalOpen,
  batchSelectedIds,
  setBatchSelectedIds,
  history,
  setHistory,
  addNode,
  getImageDimensions,
  isVideoUrl,
  screenToWorld,
  setLightboxItem
}) {
  if (!batchModalOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          setBatchModalOpen(false)
          setBatchSelectedIds(new Set())
        }}
      />
      <div
        className={`relative w-[90vw] h-[85vh] max-w-7xl rounded-lg shadow-2xl flex flex-col ${'bg-[#121214] border border-zinc-800'}`}
      >
        {/* 顶部栏 */}
        <div className={`p-4 border-b flex items-center justify-between ${'border-zinc-800'}`}>
          <div className="flex items-center gap-4">
            <h2 className={`text-lg font-bold ${'text-zinc-100'}`}>批量素材管理</h2>
            <span className={`text-sm ${'text-zinc-400'}`}>已选中 {batchSelectedIds.size} 项</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (batchSelectedIds.size === history.length) {
                  setBatchSelectedIds(new Set())
                } else {
                  setBatchSelectedIds(new Set(history.map((item) => item.id)))
                }
              }}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
            >
              {batchSelectedIds.size === history.length ? '取消全选' : '全选'}
            </button>
            <button
              onClick={async () => {
                if (batchSelectedIds.size === 0) return
                const selectedItems = history.filter((item) => batchSelectedIds.has(item.id))
                const hasLocalFiles = selectedItems.some(
                  (item) => item.localCacheUrl || item.localFilePath
                )

                const confirmMsg = hasLocalFiles
                  ? `确定要删除选中的 ${batchSelectedIds.size} 项吗？\n\n注意：将同时删除本地文件！`
                  : `确定要删除选中的 ${batchSelectedIds.size} 项吗？`

                if (confirm(confirmMsg)) {
                  if (hasLocalFiles) {
                    try {
                      const filesToDelete = selectedItems
                        .filter((item) => item.localCacheUrl || item.localFilePath)
                        .map((item) => ({ url: item.localCacheUrl, path: item.localFilePath }))

                      if (filesToDelete.length > 0) {
                        console.log('[批量删除] 删除本地文件:', filesToDelete)
                        const result = await window.api.localCacheAPI.deleteBatch({
                          files: filesToDelete
                        })
                        console.log('[批量删除] 服务器响应:', result)
                      }
                    } catch (e) {
                      console.error('[批量删除] 删除本地文件失败:', e)
                    }
                  }

                  setHistory((prev) => {
                    const filtered = prev.filter((item) => !batchSelectedIds.has(item.id))
                    try {
                      setSettingJSON('tapnow_history', filtered)
                    } catch (e) {
                      console.error('立即保存历史记录失败:', e)
                    }
                    return filtered
                  })
                  setBatchSelectedIds(new Set())
                }
              }}
              disabled={batchSelectedIds.size === 0}
              className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                batchSelectedIds.size === 0
                  ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              <Trash2 size={14} />
              批量删除
            </button>
            <button
              onClick={async () => {
                if (batchSelectedIds.size === 0) return
                const selectedItems = history.filter((item) => batchSelectedIds.has(item.id))
                const itemsWithRemoteCache = selectedItems.filter(
                  (item) => item.url && !item.url.startsWith('file:///')
                )
                const itemsWithLocalCache = selectedItems.filter(
                  (item) => item.localCacheUrl || item.localFilePath
                )

                const hasRemoteCache = itemsWithRemoteCache.length > 0
                const hasLocalCache = itemsWithLocalCache.length > 0

                if (!hasRemoteCache && !hasLocalCache) {
                  alert('选中的项目中没有可清理的缓存')
                  return
                }

                let clearRemote = false
                let deleteLocalFiles = false

                if (hasRemoteCache && hasLocalCache) {
                  const choice = confirm(
                    `选中的项目包含：\n- 后端缓存: ${itemsWithRemoteCache.length} 项\n- 本地素材: ${itemsWithLocalCache.length} 项\n\n点击"确定"清理后端缓存\n点击"取消"删除本地素材`
                  )
                  if (choice) {
                    clearRemote = true
                  } else {
                    deleteLocalFiles = true
                  }
                } else if (hasRemoteCache) {
                  clearRemote = true
                } else {
                  deleteLocalFiles = true
                }

                const cacheType = clearRemote ? '后端缓存' : '本地素材'
                const itemsToClear = clearRemote ? itemsWithRemoteCache : itemsWithLocalCache

                const confirmMsg = deleteLocalFiles
                  ? `将删除 ${itemsToClear.length} 项本地素材文件（同时删除本地文件和历史记录引用）。\n\n确定继续？`
                  : `将清理 ${itemsToClear.length} 项${cacheType}的URL引用（不删除历史记录）。\n\n确定继续？`

                if (confirm(confirmMsg)) {
                  if (deleteLocalFiles) {
                    try {
                      const filesToDelete = itemsToClear
                        .filter((item) => item.localCacheUrl || item.localFilePath)
                        .map((item) => ({ url: item.localCacheUrl, path: item.localFilePath }))

                      if (filesToDelete.length > 0) {
                        const result = await window.api.localCacheAPI.deleteBatch({
                          files: filesToDelete
                        })
                        console.log('[删除] 服务器响应:', result)
                        if (result.results) {
                          const failed = result.results.filter((r) => !r.success)
                          if (failed.length > 0) {
                            console.warn('[删除] 部分文件删除失败:', failed)
                          }
                        }
                      }
                    } catch (e) {
                      console.error('[删除] 删除本地文件失败:', e)
                    }
                  }

                  setHistory((prev) => {
                    const updated = prev.map((item) => {
                      if (!batchSelectedIds.has(item.id)) return item
                      if (clearRemote && item.url && !item.url.startsWith('file:///')) {
                        return { ...item, originalUrl: item.url, url: null, mjImages: null }
                      } else if (!clearRemote && (item.localCacheUrl || item.localFilePath)) {
                        return {
                          ...item,
                          localCacheUrl: null,
                          localFilePath: null,
                          mjLocalUrls: null
                        }
                      }
                      return item
                    })
                    try {
                      setSettingJSON('tapnow_history', updated)
                    } catch (e) {
                      console.error('保存历史记录失败:', e)
                    }
                    return updated
                  })
                  setBatchSelectedIds(new Set())
                  alert(`已清理 ${itemsToClear.length} 项${cacheType}`)
                }
              }}
              disabled={batchSelectedIds.size === 0}
              className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                batchSelectedIds.size === 0
                  ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                  : 'bg-orange-600 text-white hover:bg-orange-700'
              }`}
            >
              <HardDrive size={14} />
              清理缓存
            </button>
            <button
              onClick={async () => {
                if (batchSelectedIds.size === 0) return
                const selectedItems = history.filter(
                  (item) =>
                    batchSelectedIds.has(item.id) &&
                    (item.url || item.originalUrl || item.localCacheUrl)
                )
                if (selectedItems.length === 0) {
                  alert('选中的项目中没有有效的素材')
                  return
                }

                const world = screenToWorld(window.innerWidth / 2, window.innerHeight / 2)
                const startX = world.x
                const startY = world.y

                selectedItems.forEach((item, index) => {
                  const offsetX = (index % 5) * 20
                  const offsetY = Math.floor(index / 5) * 20

                  let content = item.url || item.originalUrl || item.localCacheUrl
                  if (item.type === 'video' && !isVideoUrl(content)) {
                    content += (content.includes('?') ? '&' : '?') + 'force_video_display=true'
                  }

                  if (item.type === 'image') {
                    ;(async () => {
                      try {
                        const dims = await getImageDimensions(content)
                        addNode(
                          'input-image',
                          startX + offsetX,
                          startY + offsetY,
                          null,
                          content,
                          dims
                        )
                      } catch {
                        addNode('input-image', startX + offsetX, startY + offsetY, null, content)
                      }
                    })()
                  } else if (item.type === 'video') {
                    addNode('video-input', startX + offsetX, startY + offsetY, null, content)
                  }
                })

                setBatchModalOpen(false)
                setBatchSelectedIds(new Set())
              }}
              disabled={batchSelectedIds.size === 0}
              className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                batchSelectedIds.size === 0
                  ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <ArrowRightSquare size={14} />
              发送到画布
            </button>
            <button
              onClick={() => {
                setBatchModalOpen(false)
                setBatchSelectedIds(new Set())
              }}
              className={`p-1.5 rounded transition-colors ${'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 内容区 - 网格布局 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <div className="grid grid-cols-4 gap-4">
            {history.map((item) => {
              const isSelected = batchSelectedIds.has(item.id)
              const hasFourImages = item.mjImages && item.mjImages.length === 4
              const getLocalUrl = (url) => {
                if (item.localCacheUrl) return item.localCacheUrl
                if (!url) return url
                if (item.mjLocalUrls && item.mjImages) {
                  const idx = item.mjImages.indexOf(url)
                  if (idx !== -1 && item.mjLocalUrls[idx]) {
                    return item.mjLocalUrls[idx]
                  }
                }
                return url
              }
              const displayUrl = hasFourImages
                ? null
                : item.mjImages && item.mjImages.length > 1
                  ? getLocalUrl(item.mjImages[item.selectedMjImageIndex || 0] || item.mjImages[0])
                  : item.localCacheUrl || item.url || item.originalUrl

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    const newSet = new Set(batchSelectedIds)
                    if (isSelected) {
                      newSet.delete(item.id)
                    } else {
                      newSet.add(item.id)
                    }
                    setBatchSelectedIds(newSet)
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    const displayItem = {
                      ...item,
                      url: hasFourImages
                        ? getLocalUrl(item.mjImages[item.selectedMjImageIndex || 0])
                        : displayUrl,
                      selectedMjImageIndex:
                        item.mjImages && item.mjImages.length > 1
                          ? item.selectedMjImageIndex || 0
                          : undefined
                    }
                    setLightboxItem(displayItem)
                  }}
                  className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                      : 'border-zinc-800 hover-border-zinc-700'
                  }`}
                >
                  {/* 缓存标识 */}
                  {item.status === 'completed' && (
                    <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                      {item.url && !item.url.startsWith('file:///') && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-orange-500/90 text-white backdrop-blur-sm">
                          后端缓存
                        </span>
                      )}
                      {(item.localCacheUrl || item.localFilePath) && (
                        <span
                          className="px-1.5 py-0.5 text-[10px] rounded bg-green-500/90 text-white backdrop-blur-sm cursor-help"
                          title={item.localFilePath || (item.localCacheUrl ? '本地缓存' : '')}
                        >
                          本地素材
                        </span>
                      )}
                    </div>
                  )}

                  {/* 选中标记和查看按钮 */}
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
                    {isSelected && (
                      <div className="bg-blue-500 rounded-full p-1">
                        <Check size={16} className="text-white" />
                      </div>
                    )}
                    {item.status === 'completed' && (displayUrl || hasFourImages) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const displayItem = {
                            ...item,
                            url: hasFourImages
                              ? getLocalUrl(item.mjImages[item.selectedMjImageIndex || 0])
                              : displayUrl,
                            selectedMjImageIndex:
                              item.mjImages && item.mjImages.length > 1
                                ? item.selectedMjImageIndex || 0
                                : undefined
                          }
                          setLightboxItem(displayItem)
                        }}
                        className={`p-1.5 rounded-full transition-colors backdrop-blur-sm ${'bg-black/60 text-white hover:bg-black/80'}`}
                        title="查看大图 (双击也可查看)"
                      >
                        <Maximize2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* 缩略图 */}
                  <div
                    className={`relative ${
                      hasFourImages
                        ? 'aspect-square'
                        : (item.mjImages && item.mjImages.length > 1) ||
                            (item.mjNeedsSplit && item.apiConfig?.modelId?.includes('mj'))
                          ? (() => {
                              const ratio = item.mjRatio || '1:1'
                              if (ratio === '16:9') return 'aspect-video'
                              if (ratio === '9:16') return 'aspect-[9/16]'
                              if (ratio === '4:3') return 'aspect-[4/3]'
                              if (ratio === '3:4') return 'aspect-[3/4]'
                              if (ratio === '21:9') return 'aspect-[21/9]'
                              return 'aspect-square'
                            })()
                          : 'aspect-video'
                    } ${'bg-zinc-900'}`}
                  >
                    {item.status === 'completed' ? (
                      hasFourImages ? (
                        <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5">
                          {item.mjImages.map((imgUrl, idx) => {
                            const localImgUrl = getLocalUrl(imgUrl)
                            return (
                              <div
                                key={idx}
                                className={`relative overflow-hidden cursor-pointer transition-all ${
                                  item.selectedMjImageIndex === idx
                                    ? 'ring-2 ring-blue-500 ring-inset'
                                    : 'hover:brightness-110'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setHistory((prev) =>
                                    prev.map((h) =>
                                      h.id === item.id
                                        ? { ...h, selectedMjImageIndex: idx, url: imgUrl }
                                        : h
                                    )
                                  )
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  setLightboxItem({
                                    ...item,
                                    url: localImgUrl,
                                    selectedMjImageIndex: idx
                                  })
                                }}
                              >
                                <img
                                  src={getXingheMediaSrc(localImgUrl)}
                                  className="w-full h-full object-cover"
                                  alt={`生成图 ${idx + 1}`}
                                  onError={(e) => {
                                    if (e.target.src !== imgUrl) {
                                      e.target.src = imgUrl
                                    } else {
                                      e.target.style.display = 'none'
                                    }
                                  }}
                                />
                                <div
                                  className={`absolute bottom-0.5 left-0.5 text-[9px] px-1 rounded ${'bg-black/60 text-white'}`}
                                >
                                  {idx + 1}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : displayUrl ? (
                        item.type === 'video' || isVideoUrl(displayUrl) ? (
                          <video
                            src={getXingheMediaSrc(displayUrl)}
                            className="w-full h-full object-contain"
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={getXingheMediaSrc(displayUrl)}
                            className="w-full h-full object-contain"
                            alt="生成图"
                            onError={(e) => {
                              const originalUrl =
                                item.mjImages && item.mjImages.length > 1
                                  ? item.mjImages[item.selectedMjImageIndex || 0] ||
                                    item.mjImages[0]
                                  : item.url
                              if (e.target.src !== originalUrl && originalUrl) {
                                e.target.src = originalUrl
                              } else {
                                e.target.style.display = 'none'
                              }
                            }}
                          />
                        )
                      ) : (
                        <div
                          className={`w-full h-full flex items-center justify-center ${'text-zinc-600'}`}
                        >
                          <FileImage size={24} />
                        </div>
                      )
                    ) : (
                      <div
                        className={`w-full h-full flex items-center justify-center ${'text-zinc-600'}`}
                      >
                        {item.status === 'generating' ? (
                          <Loader2 size={24} className="animate-spin" />
                        ) : (
                          <FileImage size={24} />
                        )}
                      </div>
                    )}
                  </div>

                  {/* 底部信息 */}
                  <div className={`p-2 text-xs ${'bg-zinc-900 text-zinc-300'}`}>
                    <div className="truncate font-medium">{item.prompt || '未命名'}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">
                      {item.modelName || '未知模型'} • {item.time}
                    </div>
                    {item.localFilePath && (
                      <div
                        className="text-[9px] opacity-50 mt-0.5 truncate cursor-help"
                        title={item.localFilePath}
                      >
                        📁 {item.localFilePath.split(/[/\\]/).pop()}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

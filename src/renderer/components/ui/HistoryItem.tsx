import { memo, useState } from 'react'
import { LazyBase64Image } from './LazyBase64Image.tsx'
import { VideoThumbnail } from './VideoThumbnail.tsx'
import { getPreferredMediaUrls, getXingheMediaSrc } from '../../utils/fileHelpers.ts'
import { friendlyError } from '../../utils/friendlyError.ts'
import { buildGenerationTaskDebugCode } from '../../utils/historyDiagnostics.ts'
import { Check, ClipboardCopy, RotateCw } from '../../utils/icons.tsx'

export const HistoryItem = memo(
  ({
    item,
    lightboxItem,
    onDelete,
    onClick,
    onContextMenu,
    onImageClick,
    onImageContextMenu,
    onRefresh,
    onShowPrompt,
    onRegenerate,
    onResubmit,
    Loader2,
    Trash2,
    RefreshCw,
    performanceMode = 'off',
    thumbnailUrl = null,
    localCacheUrl = null,
    compact = false
  }: any) => {
    const [copiedTaskCode, setCopiedTaskCode] = useState(false)
    const canCopyTaskCode = ['failed', 'generating', 'completed'].includes(item.status)
    const canRefreshResult =
      item.type === 'video' &&
      item.status === 'completed' &&
      onRefresh &&
      (item.remoteTaskId || item.taskId)
    const canResubmit = Boolean(onResubmit && item.originalPayload)
    const rawProgress = Number.isFinite(Number(item.progress)) ? Number(item.progress) : 0
    const displayProgress =
      item.status === 'generating'
        ? Math.max(12, Math.min(96, rawProgress || 18))
        : Math.max(0, Math.min(100, rawProgress))
    const getDisplayUrls = (...originalUrls) => {
      const candidates = []
      if (item.localFilePath) candidates.push(item.localFilePath)
      if (localCacheUrl) candidates.push(localCacheUrl)
      if (performanceMode !== 'off' && thumbnailUrl) candidates.push(thumbnailUrl)
      candidates.push(...originalUrls)

      const seen = new Set()
      return candidates
        .filter(Boolean)
        .map(getXingheMediaSrc)
        .filter((url) => {
          if (!url || seen.has(url)) return false
          seen.add(url)
          return true
        })
    }
    const copyTaskCode = async (event) => {
      event.stopPropagation()
      const taskDebugCode = buildGenerationTaskDebugCode(item)
      const markCopied = () => {
        setCopiedTaskCode(true)
        window.setTimeout(() => setCopiedTaskCode(false), 1400)
      }

      const desktopWriters = [
        () => window.api?.invoke?.('system:clipboard-write-text', taskDebugCode),
        () => window.api?.localCacheAPI?.writeClipboardText?.(taskDebugCode),
        () => window.api?.windowAPI?.writeClipboardText?.(taskDebugCode)
      ]

      let copyError = null
      for (const writeClipboardText of desktopWriters) {
        try {
          const result = await writeClipboardText()
          if (result?.success) {
            markCopied()
            return
          }
          if (result?.error) copyError = result.error
        } catch (error) {
          copyError = error
        }
      }

      try {
        if (!navigator.clipboard?.writeText) throw new Error('navigator.clipboard.writeText unavailable')
        await navigator.clipboard.writeText(taskDebugCode)
        markCopied()
      } catch (error) {
        console.warn('[HistoryItem] copy task debug code failed:', copyError, error)
        alert('复制失败，请检查剪贴板权限')
      }
    }

    if (compact) {
      return (
        <div
          className={`group rounded-lg overflow-hidden border relative cursor-pointer hover:border-blue-500/50 transition-colors bg-zinc-900 border-zinc-800 flex-shrink-0 flex flex-col`}
          style={{ width: '120px', minHeight: '150px' }}
          onClick={onClick}
          onContextMenu={onContextMenu}
        >
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(item.id)
              }}
              className="absolute right-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-md bg-[var(--bg-panel)]/90 text-[var(--text-secondary)] opacity-90 transition-colors hover:bg-red-500/20 hover:text-red-400"
              title="删除"
            >
              <Trash2 size={12} />
            </button>
          )}
          <div className="aspect-square relative">
            {canRefreshResult && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRefresh(item)
                }}
                className="absolute left-8 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-cyan-100 transition-colors hover:bg-cyan-500/25 hover:text-white"
                title="重新获取结果"
              >
                <RefreshCw size={12} />
              </button>
            )}
            {canCopyTaskCode && (
              <button
                onClick={copyTaskCode}
                className="absolute left-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-red-200 transition-colors hover:bg-red-500/25 hover:text-white"
                title={copiedTaskCode ? '已复制任务诊断' : '复制任务诊断'}
              >
                {copiedTaskCode ? <Check size={12} /> : <ClipboardCopy size={12} />}
              </button>
            )}
            {canResubmit && item.status !== 'generating' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onResubmit(item)
                }}
                className="absolute left-[3.75rem] top-1 z-20 flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-emerald-100 transition-colors hover:bg-emerald-500/25 hover:text-white"
                title="重新提交此任务"
              >
                <RotateCw size={12} />
              </button>
            )}
            {item.status === 'completed' ? (
              item.mjImages && item.mjImages.length > 0 ? (
                <LazyBase64Image
                  key={getXingheMediaSrc(item.mjImages[0])}
                  src={getXingheMediaSrc(item.mjImages[0])}
                  loading="lazy"
                  className="w-full h-full object-cover"
                  draggable={false}
                  alt={item.prompt || '生成的图片'}
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
              ) : item.type === 'image' ? (
                <LazyBase64Image
                  key={getDisplayUrls(item.url, item.originalUrl, item.mjOriginalUrl).join('|')}
                  src={getDisplayUrls(item.url, item.originalUrl, item.mjOriginalUrl)[0]}
                  fallbackSrcs={getDisplayUrls(item.url, item.originalUrl, item.mjOriginalUrl).slice(1)}
                  loading="lazy"
                  className="w-full h-full object-cover"
                  draggable={false}
                  alt={item.prompt || '生成的图片'}
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
              ) : (
                (() => {
                  return (
                    <VideoThumbnail
                      src={getPreferredMediaUrls(item)[0]}
                      fallbackSrcs={getPreferredMediaUrls(item).slice(1)}
                      className="w-full h-full object-cover pointer-events-none"
                      allowCapture
                    />
                  )
                })()
              )
            ) : item.status === 'failed' ? (
              <div className="w-full h-full flex items-center justify-center bg-red-950/40 p-1.5">
                <span className="text-[8px] text-red-400 leading-tight line-clamp-4 text-center break-all">
                  {friendlyError(item.errorMsg || '生成失败')}
                </span>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-3">
                <Loader2 className="animate-spin text-zinc-500" />
                <div className="w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-1 rounded-full bg-[var(--primary-color)] transition-all duration-500"
                    style={{ width: `${displayProgress}%` }}
                  />
                </div>
                <span className="text-[8px] font-mono text-zinc-500">
                  {Math.round(displayProgress)}%
                </span>
              </div>
            )}
            {item.type === 'video' && item.status === 'completed' && (
              <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="white"
                >
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </div>
            )}
          </div>
          <div className="p-1.5 flex-1 flex flex-col justify-center">
            <div className="text-[9px] text-zinc-300 truncate font-medium">
              {item.modelName === 'New Model'
                ? item.apiConfig?.modelId || 'New Model'
                : item.modelName || item.apiConfig?.modelId || 'Unknown Model'}
            </div>
            {(item.remoteTaskId || item.id) && (
              <div className="text-[8px] text-zinc-500 truncate mt-0.5">
                {item.remoteTaskId && item.remoteTaskId.startsWith('cgt')
                  ? item.remoteTaskId
                  : item.id.startsWith('cgt')
                    ? item.id
                    : item.remoteTaskId || item.id}
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div
        className={`group rounded-lg overflow-hidden border relative cursor-pointer hover:border-blue-500/50 transition-colors bg-zinc-900 border-zinc-800`}
        style={{
          contentVisibility: 'auto',
          containIntrinsicSize: '1px 300px'
        }}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {/* 性能模式标识 */}
        {performanceMode !== 'off' && (localCacheUrl || thumbnailUrl) && (
          <div
            className={`absolute top-1 left-1 z-10 px-1 py-0.5 rounded text-[8px] bg-black/60 ${
              performanceMode === 'ultra' ? 'text-orange-400' : 'text-zinc-400'
            }`}
          >
            {localCacheUrl ? '本地' : performanceMode === 'ultra' ? '极速' : '缩略'}
          </div>
        )}
        <div
          draggable={item.status === 'completed' && item.type === 'image'}
          onDragStart={(e) => {
            if (item.type !== 'image') return
            e.stopPropagation()
            // 获取原始图片 URL（MJ 格子图使用第一张图）
            const originalUrl =
              item.mjImages?.[0] || item.url || item.originalUrl || item.mjOriginalUrl
            if (originalUrl) {
              e.dataTransfer.setData('asset-path', originalUrl)
              e.dataTransfer.setData('asset-type', 'image/png')
              e.dataTransfer.effectAllowed = 'copy'
            }
          }}
          className={`bg-black relative ${
            (item.mjImages && (item.mjImages.length === 4 || item.mjImages.length > 1)) ||
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
          }`}
        >
          {canCopyTaskCode && (
            <button
              onClick={copyTaskCode}
              className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded-md border border-white/10 bg-black/65 px-1.5 py-1 text-[9px] font-medium text-zinc-100 transition-colors hover:bg-blue-500/25 hover:text-white"
              title={copiedTaskCode ? '已复制任务诊断' : '复制任务诊断'}
            >
              {copiedTaskCode ? <Check size={11} /> : <ClipboardCopy size={11} />}
              <span>{copiedTaskCode ? '已复制' : '复制'}</span>
            </button>
          )}
          {item.status === 'completed' ? (
            item.mjImages && (item.mjImages.length === 4 || item.mjImages.length > 1) ? (
              <div
                className={`w-full h-full grid gap-0.5 p-0.5 ${item.mjImages.length === 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-2'}`}
              >
                {item.mjImages.map((imgUrl, idx) => {
                  // 性能模式下MJ图片也使用缩略图
                  const displayImgUrl =
                    performanceMode !== 'off' && item.mjThumbnails && item.mjThumbnails[idx]
                      ? item.mjThumbnails[idx]
                      : imgUrl
                  const displayImgUrls = getDisplayUrls(displayImgUrl, imgUrl)
                  return (
                    <div
                      key={idx}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation()
                        e.dataTransfer.setData('asset-path', imgUrl)
                        e.dataTransfer.setData('asset-type', 'image/png')
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={(e) => onImageClick && onImageClick(e, item, imgUrl, idx)}
                      onContextMenu={(e) =>
                        onImageContextMenu && onImageContextMenu(e, item, imgUrl, idx)
                      }
                      className={`relative w-full h-full cursor-pointer border-2 transition-all overflow-hidden ${
                        item.selectedMjImageIndex === idx &&
                        lightboxItem &&
                        lightboxItem.id === item.id
                          ? 'border-blue-500 scale-95'
                          : 'border-transparent hover:border-blue-500/50'
                      }`}
                    >
                      <LazyBase64Image
                        key={displayImgUrls.join('|')}
                        src={displayImgUrls[0]}
                        fallbackSrcs={displayImgUrls.slice(1)}
                        loading="lazy"
                        className="w-full h-full object-contain"
                        draggable={false}
                        alt={`生成图 ${idx + 1}`}
                        onError={(e) => {
                          console.error(`图片 ${idx + 1} 加载失败`)
                          e.target.style.display = 'none'
                        }}
                      />
                      {item.selectedMjImageIndex === idx &&
                        lightboxItem &&
                        lightboxItem.id === item.id && (
                          <div className="absolute top-1 right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center z-10">
                            <svg
                              className="w-2 h-2 text-white"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                        )}
                    </div>
                  )
                })}
              </div>
            ) : item.type === 'image' ? (
              <LazyBase64Image
                key={getDisplayUrls(item.url, item.originalUrl, item.mjOriginalUrl).join('|')}
                src={getDisplayUrls(item.url, item.originalUrl, item.mjOriginalUrl)[0]}
                fallbackSrcs={getDisplayUrls(item.url, item.originalUrl, item.mjOriginalUrl).slice(1)}
                loading="lazy"
                className="w-full h-full object-cover cursor-grab active:cursor-grabbing"
                draggable={false}
                alt={item.prompt || '生成的图片'}
                onError={(e) => {
                  console.error('图片加载失败:', item.url || item.originalUrl || item.mjOriginalUrl)
                  e.target.style.display = 'none'
                }}
              />
            ) : (
              (() => {
                return (
                  <VideoThumbnail
                    src={getPreferredMediaUrls(item)[0]}
                    fallbackSrcs={getPreferredMediaUrls(item).slice(1)}
                    className="w-full h-full object-cover pointer-events-none"
                    allowCapture
                  />
                )
              })()
            )
          ) : item.status === 'failed' ? (
            <div className="w-full h-full flex items-center justify-center bg-red-950/30 p-3">
              <span className="text-[10px] text-red-400 leading-relaxed line-clamp-5 text-center break-all">
                {friendlyError(item.errorMsg || '生成失败')}
              </span>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-4">
              <Loader2 className="animate-spin text-zinc-500" />
              <div className="w-full max-w-[160px] overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-1 rounded-full bg-[var(--primary-color)] transition-all duration-500"
                  style={{ width: `${displayProgress}%` }}
                />
              </div>
              <span className="text-[9px] font-mono text-zinc-500">
                {Math.round(displayProgress)}%
              </span>
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${displayProgress}%` }}
            ></div>
          </div>
        </div>
        <div className="p-2">
          <div className="flex justify-between items-start gap-2">
            <p className={`text-[10px] line-clamp-1 flex-1 text-zinc-400`}>{item.prompt}</p>
            {onShowPrompt && item.prompt && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onShowPrompt(item)
                }}
                className="shrink-0 p-0.5 text-zinc-500 hover:text-blue-400"
                title="查看完整提示词"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="4 7 4 4 20 4 20 7"></polyline>
                  <line x1="9" y1="20" x2="15" y2="20"></line>
                  <line x1="12" y1="4" x2="12" y2="20"></line>
                </svg>
              </button>
            )}
            {onRegenerate && item.originalPayload && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRegenerate(item)
                }}
                className="shrink-0 p-0.5 text-zinc-500 hover:text-green-400"
                title="提取到画布复原节点"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
            )}
            {canResubmit && item.status !== 'generating' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onResubmit(item)
                }}
                className="shrink-0 p-0.5 text-zinc-500 hover:text-emerald-400"
                title="重新提交此任务"
              >
                <RotateCw size={12} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete && onDelete(item.id)
              }}
              className="shrink-0 p-0.5 mr-1 text-zinc-500 hover:text-red-500"
              title="删除"
            >
              <Trash2 size={12} />
            </button>
            {item.type === 'video' && (item.status === 'generating' || canRefreshResult) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRefresh && onRefresh(item)
                }}
                className="shrink-0 p-0.5 text-zinc-500 hover:text-white"
                title={canRefreshResult ? '重新获取结果' : '刷新状态'}
              >
                <RefreshCw size={12} />
              </button>
            )}
          </div>
          {item.status === 'failed' && item.errorMsg && (
            <p className="text-[9px] text-red-500 mt-1 break-words whitespace-pre-wrap">
              {friendlyError(item.errorMsg)
                .split('\n')
                .map((line, idx, arr) => (
                  <span key={idx}>
                    {line}
                    {idx < arr.length - 1 && <br />}
                  </span>
                ))}
            </p>
          )}
          {item.status === 'generating' && (
            <p className="text-[9px] text-blue-500 mt-1">{item.errorMsg || '生成中...'}</p>
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-2 text-[11px]">
          <div className="flex flex-col">
            <span className="text-zinc-300">
              {item.prompt?.slice(0, 40) || 'Untitled'}
              {item.prompt && item.prompt.length > 40 ? '…' : ''}
            </span>
            <span className="text-zinc-500">
              {item.time} ·{' '}
              {item.modelName === 'New Model'
                ? item.apiConfig?.modelId || 'New Model'
                : item.modelName}
              {typeof item.durationMs === 'number' && item.durationMs > 0 && (
                <> · 用时 {(item.durationMs / 1000).toFixed(1)}s</>
              )}
            </span>
          </div>
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.item === nextProps.item &&
      prevProps.lightboxItem?.id === nextProps.lightboxItem?.id &&
      prevProps.compact === nextProps.compact &&
      prevProps.performanceMode === nextProps.performanceMode &&
      prevProps.thumbnailUrl === nextProps.thumbnailUrl &&
      prevProps.localCacheUrl === nextProps.localCacheUrl
    )
  }
)

HistoryItem.displayName = 'HistoryItem'

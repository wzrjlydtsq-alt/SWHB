import { memo } from 'react'
import { LazyBase64Image } from './LazyBase64Image.jsx'
import { getXingheMediaSrc } from '../../utils/fileHelpers.js'

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
    Loader2,
    Trash2,
    RefreshCw,
    performanceMode = 'off',
    thumbnailUrl = null,
    localCacheUrl = null
  }) => {
    // 获取显示URL：优先本地缓存，其次性能模式缩略图，最后原始URL
    const getDisplayUrl = (originalUrl) => {
      let finalUrl = originalUrl
      // 如果有本地缓存，优先使用（无论性能模式）
      if (localCacheUrl) finalUrl = localCacheUrl
      // 性能模式下使用缩略图
      else if (performanceMode !== 'off' && thumbnailUrl) finalUrl = thumbnailUrl
      // 最后使用原始URL
      return getXingheMediaSrc(finalUrl)
    }

    return (
      <div
        className={`group rounded-lg overflow-hidden border relative cursor-pointer hover:border-blue-500/50 transition-colors ${'bg-zinc-900 border-zinc-800'}`}
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
            const originalUrl = item.mjImages?.[0] || item.url || item.originalUrl || item.mjOriginalUrl
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
                        src={getXingheMediaSrc(displayImgUrl)}
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
                src={getDisplayUrl(item.url || item.originalUrl || item.mjOriginalUrl)}
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
                const absolutePath = getDisplayUrl(item.url || item.originalUrl)
                const videoSrc = getXingheMediaSrc(absolutePath)
                return (
                  <video
                    src={videoSrc}
                    className="w-full h-full object-cover pointer-events-none"
                    muted
                    loop
                    playsInline
                    onError={() => {
                      console.error('视频加载失败:', videoSrc, item.url)
                    }}
                  />
                )
              })()
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="animate-spin text-zinc-600" />
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${item.progress}%` }}
            ></div>
          </div>
        </div>
        <div className="p-2">
          <div className="flex justify-between items-start gap-2">
            <p className={`text-[10px] line-clamp-1 flex-1 ${'text-zinc-400'}`}>{item.prompt}</p>
            {/* 查看提示词按钮 */}
            {onShowPrompt && item.prompt && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onShowPrompt(item)
                }}
                className={`shrink-0 p-0.5 ${'text-zinc-500 hover:text-blue-400'}`}
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
            {/* 再次生成/载入画布按钮 */}
            {onRegenerate && item.originalPayload && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRegenerate(item)
                }}
                className={`shrink-0 p-0.5 ${'text-zinc-500 hover:text-green-400'}`}
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
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete && onDelete(item.id)
              }}
              className={`shrink-0 p-0.5 mr-1 ${'text-zinc-500 hover:text-red-500'}`}
              title="删除"
            >
              <Trash2 size={12} />
            </button>
            {item.type === 'video' && item.status === 'generating' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRefresh && onRefresh(item)
                }}
                className={`shrink-0 p-0.5 ${'text-zinc-500 hover:text-white'}`}
                title="刷新状态"
              >
                <RefreshCw size={12} />
              </button>
            )}
          </div>
          {item.status === 'failed' && item.errorMsg && (
            <p className="text-[9px] text-red-500 mt-1 break-words whitespace-pre-wrap">
              {item.errorMsg.split('\n').map((line, idx) => (
                <span key={idx}>
                  {line}
                  {idx < item.errorMsg.split('\n').length - 1 && <br />}
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
            <span className={'text-zinc-300'}>
              {item.prompt?.slice(0, 40) || 'Untitled'}
              {item.prompt && item.prompt.length > 40 ? '…' : ''}
            </span>
            <span className={'text-zinc-500'}>
              {item.time} · {item.modelName}
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
    // 自定义对比函数：只检查关键属性变化
    return (
      prevProps.item === nextProps.item && prevProps.lightboxItem?.id === nextProps.lightboxItem?.id
    )
  }
)

HistoryItem.displayName = 'HistoryItem'

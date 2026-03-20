import { X, ChevronDown } from '../../../utils/icons.jsx'
import { DEFAULT_BASE_URL } from '../../../utils/constants.js'
import { getXingheMediaSrc } from '../../../utils/fileHelpers.js'

export function CreateCharacterModal({
  createCharacterOpen,
  setCreateCharacterOpen,
  createCharacterVideoSourceType,
  setCreateCharacterVideoSourceType,
  createCharacterVideoUrl,
  setCreateCharacterVideoUrl,
  createCharacterSelectedTaskId,
  setCreateCharacterSelectedTaskId,
  createCharacterHistoryDropdownOpen,
  setCreateCharacterHistoryDropdownOpen,
  createCharacterStartSecond,
  setCreateCharacterStartSecond,
  createCharacterEndSecond,
  setCreateCharacterEndSecond,
  createCharacterEndpoint,
  setCreateCharacterEndpoint,
  createCharacterSubmitting,
  setCreateCharacterSubmitting,
  createCharacterVideoError,
  setCreateCharacterVideoError,
  createCharacter,
  historyMap,
  history,
  apiConfigs
}) {
  if (!createCharacterOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center"
      onClick={() => setCreateCharacterOpen(false)}
    >
      <div
        className={`w-[500px] max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl flex flex-col ${'bg-[#121214] border-zinc-800'} border`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`p-4 border-b flex justify-between items-center ${'border-zinc-800'}`}>
          <h3 className={`font-bold text-sm ${'text-zinc-300'}`}>新建角色</h3>
          <button onClick={() => setCreateCharacterOpen(false)}>
            <X size={16} className={'text-zinc-500'} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* 视频源选择 */}
          <div>
            <label className={`block text-xs mb-2 ${'text-zinc-300'}`}>视频源</label>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => {
                  setCreateCharacterVideoSourceType('url')
                  setCreateCharacterSelectedTaskId('')
                }}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  createCharacterVideoSourceType === 'url'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                输入视频 URL
              </button>
              <button
                onClick={() => {
                  setCreateCharacterVideoSourceType('history')
                  setCreateCharacterVideoUrl('')
                  setCreateCharacterVideoError(null)
                }}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  createCharacterVideoSourceType === 'history'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                从历史记录选择
              </button>
            </div>

            {createCharacterVideoSourceType === 'url' ? (
              <input
                type="text"
                value={createCharacterVideoUrl}
                onChange={(e) => setCreateCharacterVideoUrl(e.target.value)}
                placeholder="输入视频 URL..."
                className={`w-full px-3 py-2 text-xs rounded border outline-none ${'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder-zinc-600'}`}
              />
            ) : (
              <div className="relative">
                <div
                  onClick={() =>
                    setCreateCharacterHistoryDropdownOpen(!createCharacterHistoryDropdownOpen)
                  }
                  className={`w-full px-3 py-2 text-xs rounded border outline-none cursor-pointer flex items-center justify-between ${'bg-zinc-900 border-zinc-700 text-zinc-200'}`}
                >
                  <span className={createCharacterSelectedTaskId ? '' : 'opacity-60'}>
                    {createCharacterSelectedTaskId
                      ? (() => {
                          const item = historyMap.get(createCharacterSelectedTaskId)
                          return item
                            ? `${item.prompt?.slice(0, 40) || '未命名'} - ${item.time}`
                            : '选择历史记录中的视频...'
                        })()
                      : '选择历史记录中的视频...'}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${createCharacterHistoryDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </div>

                {createCharacterHistoryDropdownOpen && (
                  <div
                    className={`absolute z-50 w-full mt-1 rounded-lg border shadow-xl max-h-80 overflow-y-auto custom-scrollbar ${'bg-zinc-900 border-zinc-700'}`}
                  >
                    {history.filter((h) => h.type === 'video' && h.status === 'completed' && h.url)
                      .length === 0 ? (
                      <div className={`p-4 text-xs text-center ${'text-zinc-500'}`}>
                        暂无已完成的视频
                      </div>
                    ) : (
                      history
                        .filter((h) => h.type === 'video' && h.status === 'completed' && h.url)
                        .map((item) => (
                          <div
                            key={item.id}
                            onClick={() => {
                              setCreateCharacterSelectedTaskId(item.id)
                              setCreateCharacterHistoryDropdownOpen(false)
                              if (item.url) {
                                setCreateCharacterVideoSourceType('url')
                                setCreateCharacterVideoUrl(item.url)
                                setCreateCharacterSelectedTaskId('')
                              }
                            }}
                            className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${'hover:bg-zinc-800'}`}
                          >
                            <div
                              className={`w-20 h-12 flex-shrink-0 rounded overflow-hidden ${'bg-zinc-800'}`}
                            >
                              <video
                                src={getXingheMediaSrc(
                                  item.localCacheUrl || item.url || item.originalUrl
                                )}
                                className="w-full h-full object-cover"
                                muted
                                preload="metadata"
                                onLoadedMetadata={(e) => {
                                  e.target.currentTime = 0.1
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`text-xs font-medium truncate ${'text-zinc-200'}`}>
                                {item.prompt?.slice(0, 50) || '未命名视频'}
                              </div>
                              <div
                                className={`text-[10px] mt-0.5 flex items-center gap-2 ${'text-zinc-500'}`}
                              >
                                <span>{item.modelName || '未知模型'}</span>
                                <span>•</span>
                                <span>{item.time}</span>
                                {item.localCacheUrl && (
                                  <>
                                    <span>•</span>
                                    <span className="text-green-500">本地缓存</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}

                {createCharacterHistoryDropdownOpen && (
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setCreateCharacterHistoryDropdownOpen(false)}
                  />
                )}
              </div>
            )}

            {/* 视频预览区域 */}
            {(() => {
              let currentVideoUrl = null
              if (createCharacterVideoSourceType === 'url' && createCharacterVideoUrl.trim()) {
                currentVideoUrl = createCharacterVideoUrl.trim()
              } else if (
                createCharacterVideoSourceType === 'history' &&
                createCharacterSelectedTaskId
              ) {
                const selectedHistoryItem = historyMap.get(createCharacterSelectedTaskId)
                if (selectedHistoryItem && selectedHistoryItem.url) {
                  currentVideoUrl = selectedHistoryItem.url
                }
              }

              return currentVideoUrl ? (
                <div className="mt-2 mb-2">
                  <video
                    key={currentVideoUrl}
                    controls
                    crossOrigin="anonymous"
                    className="w-full h-40 object-contain bg-black rounded-lg"
                    src={getXingheMediaSrc(currentVideoUrl)}
                    onError={(e) => {
                      console.error('视频加载失败:', currentVideoUrl, e)
                      setCreateCharacterVideoError('无法加载视频预览，请检查链接有效性或跨域限制')
                    }}
                    onLoadStart={() => setCreateCharacterVideoError(null)}
                    onLoadedData={() => setCreateCharacterVideoError(null)}
                  />
                  {createCharacterVideoError && (
                    <div className="text-red-500 text-xs mt-1 text-center">
                      {createCharacterVideoError}
                    </div>
                  )}
                </div>
              ) : null
            })()}
          </div>

          {/* 时间范围 */}
          <div>
            <label className={`block text-xs mb-2 ${'text-zinc-300'}`}>
              时间范围（秒，间隔需在 1-3 秒之间）
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="0"
                step="0.1"
                value={createCharacterStartSecond}
                onChange={(e) => setCreateCharacterStartSecond(parseFloat(e.target.value) || 0)}
                className={`w-20 px-2 py-1.5 text-xs rounded border outline-none ${'bg-zinc-900 border-zinc-700 text-zinc-200'}`}
              />
              <span className={`text-xs ${'text-zinc-400'}`}>到</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={createCharacterEndSecond}
                onChange={(e) => setCreateCharacterEndSecond(parseFloat(e.target.value) || 0)}
                className={`w-20 px-2 py-1.5 text-xs rounded border outline-none ${'bg-zinc-900 border-zinc-700 text-zinc-200'}`}
              />
              <span className={`text-xs ${'text-zinc-400'}`}>
                秒（间隔: {(createCharacterEndSecond - createCharacterStartSecond).toFixed(1)}
                s）
              </span>
            </div>
          </div>

          {/* 高级设置：API 接口地址 */}
          <div>
            <label className={`block text-xs mb-2 ${'text-zinc-300'}`}>
              API 接口地址 (API Endpoint)
            </label>
            <input
              type="text"
              value={createCharacterEndpoint}
              onChange={(e) => setCreateCharacterEndpoint(e.target.value)}
              placeholder="例如: https://your-domain.com/sora/v1/characters"
              className={`w-full px-3 py-2 text-xs rounded border outline-none font-mono ${'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder-zinc-600'}`}
              onFocus={(e) => {
                if (!e.target.value) {
                  const soraConfig = apiConfigs.find(
                    (c) => c.type === 'Video' && (c.id === 'sora-2' || c.id === 'sora-2-pro')
                  )
                  const baseUrl = soraConfig
                    ? (soraConfig.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
                    : DEFAULT_BASE_URL.replace(/\/+$/, '')
                  setCreateCharacterEndpoint(`${baseUrl}/sora/v1/characters`)
                }
              }}
            />
            <p className={`text-[10px] mt-1 ${'text-zinc-500'}`}>
              默认自动填充，可根据服务商要求修改路径
            </p>
          </div>

          {/* 提交按钮 */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setCreateCharacterOpen(false)}
              className={`px-4 py-2 text-xs rounded transition-colors ${'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
            >
              取消
            </button>
            <button
              onClick={async () => {
                if (createCharacterVideoSourceType === 'url' && !createCharacterVideoUrl.trim()) {
                  alert('请输入视频 URL')
                  return
                }
                if (
                  createCharacterVideoSourceType === 'history' &&
                  !createCharacterSelectedTaskId
                ) {
                  alert('请选择历史记录中的视频')
                  return
                }
                if (
                  createCharacterEndSecond - createCharacterStartSecond < 1 ||
                  createCharacterEndSecond - createCharacterStartSecond > 3
                ) {
                  alert('时间范围必须在 1-3 秒之间')
                  return
                }
                setCreateCharacterSubmitting(true)
                try {
                  const endpointToUse = createCharacterEndpoint.trim() || null
                  if (createCharacterVideoSourceType === 'url') {
                    await createCharacter(
                      createCharacterVideoUrl,
                      createCharacterStartSecond,
                      createCharacterEndSecond,
                      null,
                      endpointToUse
                    )
                  } else {
                    await createCharacter(
                      '',
                      createCharacterStartSecond,
                      createCharacterEndSecond,
                      createCharacterSelectedTaskId,
                      endpointToUse
                    )
                  }
                } finally {
                  setCreateCharacterSubmitting(false)
                }
              }}
              disabled={createCharacterSubmitting}
              className={`px-4 py-2 text-xs rounded transition-colors ${
                createCharacterSubmitting
                  ? 'bg-zinc-400 text-zinc-200 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-500'
              }`}
            >
              {createCharacterSubmitting ? '创建中...' : '创建角色'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

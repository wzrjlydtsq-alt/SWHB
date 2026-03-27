import { useState, useEffect } from 'react'

export function UpdaterDialog() {
  const [updaterState, setUpdaterState] = useState({
    visible: false,
    text: '',
    type: '',
    progress: null, // { percent, bytesPerSecond, total, transferred }
    errorMessage: '',
    canDownload: false,
    canInstall: false
  })

  useEffect(() => {
    // Escalate window.api.updater to listen to messages
    if (window.api && window.api.updater) {
      const cleanup = window.api.updater.onMessage((msg) => {
        setUpdaterState((prev) => {
          let nextState = { ...prev, visible: true, text: msg.text, type: msg.type }

          if (msg.type === 'checking') {
            nextState.progress = null
            nextState.canDownload = false
            nextState.canInstall = false
          } else if (msg.type === 'update-available') {
            nextState.canDownload = true
          } else if (msg.type === 'update-not-available') {
            nextState.visible = false
          } else if (msg.type === 'download-progress' && msg.data) {
            nextState.progress = msg.data
            nextState.canDownload = false
          } else if (msg.type === 'update-downloaded') {
            nextState.progress = null
            nextState.canDownload = false
            nextState.canInstall = true
          } else if (msg.type === 'error') {
            nextState.errorMessage = msg.data ? msg.data.message || msg.data : '未知错误'
          }

          return nextState
        })
      })

      // We proactively check for updates on startup
      setTimeout(() => {
        window.api.updater.checkForUpdates()
      }, 3000)

      return cleanup
    }
  }, [])

  if (!updaterState.visible) return null

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden z-[9999] text-sm animate-in slide-in-from-bottom-5">
      <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-700/50 flex justify-between items-center">
        <span className="font-semibold text-zinc-200">应用更新</span>
        <button
          onClick={() => setUpdaterState((p) => ({ ...p, visible: false }))}
          className="text-zinc-500 hover:text-white transition-colors"
        >
          ×
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3 text-zinc-300">
        <div className="text-xs break-all leading-relaxed">
          {updaterState.text}
          {updaterState.errorMessage && (
            <div className="text-red-400 mt-1">错误: {updaterState.errorMessage}</div>
          )}
        </div>

        {updaterState.progress && (
          <div className="flex flex-col gap-1.5 mt-2">
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${updaterState.progress.percent}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>
                {(updaterState.progress.transferred / 1024 / 1024).toFixed(1)} MB /{' '}
                {(updaterState.progress.total / 1024 / 1024).toFixed(1)} MB
              </span>
              <span>{updaterState.progress.percent.toFixed(1)}%</span>
            </div>
          </div>
        )}

        {updaterState.canDownload && (
          <button
            onClick={() => {
              window.api.updater.downloadUpdate()
              setUpdaterState((p) => ({ ...p, canDownload: false, text: '准备下载...' }))
            }}
            className="w-full mt-2 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors"
          >
            现在下载
          </button>
        )}

        {updaterState.canInstall && (
          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={() => {
                window.api.updater.quitAndInstall()
              }}
              className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
            >
              重启并安装（保留数据）
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    '确定要清除所有本地数据吗？\n\n这将删除：\n• 所有项目数据\n• 生成的图片/视频缓存\n• 历史记录\n• 设置和配置\n\n此操作不可撤销！'
                  )
                ) {
                  window.api.updater.clearAndInstall()
                }
              }}
              className="w-full py-2 px-4 bg-red-600/80 hover:bg-red-500 text-white rounded font-medium transition-colors text-xs"
            >
              清除所有数据并安装
            </button>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              「清除数据」将删除本地缓存、项目、历史记录等所有数据，适用于修复异常或全新开始。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

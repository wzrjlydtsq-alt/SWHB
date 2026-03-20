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
          <button
            onClick={() => {
              window.api.updater.quitAndInstall()
            }}
            className="w-full mt-2 py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
          >
            重启并立即安装
          </button>
        )}
      </div>
    </div>
  )
}

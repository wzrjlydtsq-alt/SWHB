import { useState, useEffect } from 'react'

export function UpdaterDialog() {
  const [preflightStatus, setPreflightStatus] = useState('')
  const [preflightChecking, setPreflightChecking] = useState(false)
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
      const cleanup = window.api.updater.onMessage((msg: any) => {
        const message = msg || {}
        const messageType = message.type || ''
        const isManualCheck = Boolean(message.manual)

        setUpdaterState((prev) => {
          const shouldShow =
            isManualCheck ||
            prev.visible ||
            messageType === 'update-available' ||
            messageType === 'download-progress' ||
            messageType === 'update-downloaded'
          let nextState = {
            ...prev,
            visible: shouldShow,
            text: message.text || '',
            type: messageType,
            errorMessage: ''
          }

          if (messageType === 'checking') {
            nextState.visible = isManualCheck || prev.visible
            nextState.progress = null
            nextState.canDownload = false
            nextState.canInstall = false
          } else if (messageType === 'update-available') {
            nextState.visible = true
            nextState.progress = null
            nextState.canDownload = true
            nextState.canInstall = false
          } else if (messageType === 'update-not-available') {
            nextState.visible = isManualCheck
            nextState.progress = null
            nextState.canDownload = false
            nextState.canInstall = false
          } else if (messageType === 'download-progress' && message.data) {
            nextState.visible = true
            nextState.progress = message.data
            nextState.canDownload = false
          } else if (messageType === 'update-downloaded') {
            nextState.visible = true
            nextState.progress = null
            nextState.canDownload = false
            nextState.canInstall = true
          } else if (messageType === 'error') {
            nextState.visible = isManualCheck || prev.visible
            nextState.progress = null
            nextState.canDownload = false
            nextState.errorMessage = message.data ? message.data.message || message.data : '未知错误'
          }

          return nextState
        })

        // 手动检查结果必须停留到用户主动关闭，避免提示一闪而过。
      })

      // We proactively check for updates on startup
      const startupTimer = window.setTimeout(async () => {
        const enabled = await window.dbAPI?.settings?.get('tapnow_enableUpdateCheck')
        if (enabled !== 'false') {
          window.api.updater.checkForUpdates({ manual: false })
        }
      }, 3000)

      return () => {
        window.clearTimeout(startupTimer)
        cleanup()
      }
    }
  }, [])

  if (!updaterState.visible) return null

  const runPreflight = async (repair = true) => {
    if (!window.api?.updater?.preflightCheck) return { ok: true }
    setPreflightChecking(true)
    setPreflightStatus(repair ? '正在执行更新前自检与自动修复...' : '正在执行更新前自检...')
    try {
      const result = await window.api.updater.preflightCheck({ repair })
      const failed = Array.isArray(result?.checks) ? result.checks.filter((item: any) => !item.ok) : []
      if (!result?.success || result.ok === false) {
        setPreflightStatus(`自检未通过：${failed.map((item: any) => item.id || item.label).join(', ')}`)
        return { ok: false, result }
      }
      setPreflightStatus(
        result.repairs?.length ? `自检通过，已修复 ${result.repairs.length} 项` : '自检通过'
      )
      return { ok: true, result }
    } catch (error: any) {
      setPreflightStatus(`自检失败：${error?.message || error}`)
      return { ok: false, error }
    } finally {
      setPreflightChecking(false)
    }
  }

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
              onClick={() => runPreflight(true)}
              disabled={preflightChecking}
              className="w-full py-2 px-4 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-60 text-white rounded font-medium transition-colors"
            >
              {preflightChecking ? '自检中...' : '更新前自检'}
            </button>
            {preflightStatus && (
              <div className="text-[10px] text-zinc-400 leading-relaxed">{preflightStatus}</div>
            )}
            <button
              onClick={async () => {
                const preflight = await runPreflight(true)
                if (!preflight.ok) return
                const result = await window.api.updater.quitAndInstall()
                if (result?.success === false) {
                  setPreflightStatus(`安装失败：${result.error || '请重新下载更新后再试'}`)
                }
              }}
              disabled={preflightChecking}
              className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors"
            >
              重启并安装（保留数据）
            </button>
            <button
              onClick={async () => {
                if (
                  confirm(
                    '确定要清除所有本地数据吗？\n\n这将删除：\n• 所有项目数据\n• 生成的图片/视频缓存\n• 历史记录\n• 设置和配置\n\n此操作不可撤销！'
                  )
                ) {
                  const preflight = await runPreflight(true)
                  if (!preflight.ok) return
                  const result = await window.api.updater.clearAndInstall()
                  if (result?.success === false) {
                    setPreflightStatus(`安装失败：${result.error || '请重新下载更新后再试'}`)
                  }
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

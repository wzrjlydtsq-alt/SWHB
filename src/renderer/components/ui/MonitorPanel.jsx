import { useState } from 'react'
import { useSystemMonitor } from '../../hooks/useSystemMonitor.js'
import { X, Activity } from '../../utils/icons.jsx'

// ========== 工具函数 ==========

function formatBytes(bytes) {
  if (bytes === 0 || bytes == null) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ========== 子组件 ==========

function StatCard({ label, value, sub, color = 'blue' }) {
  const colorMap = {
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/30',
    green: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/30',
    amber: 'from-amber-500/20 to-amber-600/5 border-amber-500/30',
    red: 'from-red-500/20 to-red-600/5 border-red-500/30',
    cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/30'
  }
  const textColorMap = {
    blue: 'text-blue-400',
    green: 'text-emerald-400',
    purple: 'text-purple-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    cyan: 'text-cyan-400'
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br p-3 transition-all duration-300 hover:scale-[1.02] ${colorMap[color]}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className={`text-lg font-bold font-mono ${textColorMap[color]}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{sub}</div>}
    </div>
  )
}

function ProgressBar({ value, max, color = '#3b82f6', label }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
          <span>{label}</span>
          <span className="font-mono">{pct.toFixed(1)}%</span>
        </div>
      )}
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, ${color}88)`
          }}
        />
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 mt-4 first:mt-0 flex items-center gap-2">
      <span className="w-1 h-3.5 rounded-full bg-[var(--primary-color)]" />
      {children}
    </h3>
  )
}

function TableRow({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <span className="text-[11px] font-mono text-[var(--text-secondary)]">{value}</span>
    </div>
  )
}

function CleanupButton({ onClick, loading, label, result }) {
  return (
    <div>
      <button
        onClick={onClick}
        disabled={loading}
        className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 border ${
          loading
            ? 'bg-white/5 text-[var(--text-muted)] border-white/10 cursor-wait'
            : 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/30 active:scale-[0.98]'
        }`}
      >
        {loading ? '清理中...' : label}
      </button>
      {result && (
        <div
          className={`mt-1.5 p-2 rounded-lg text-[11px] ${
            result.error
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }`}
        >
          {result.error ? `失败: ${result.error}` : result.message}
        </div>
      )}
    </div>
  )
}

// ========== 主面板 ==========

export function MonitorPanel({ open, onClose }) {
  const { stats, loading, error } = useSystemMonitor(open)
  const [showDev, setShowDev] = useState(false)

  // 清理状态
  const [cleaningCache, setCleaningCache] = useState(false)
  const [cacheResult, setCacheResult] = useState(null)
  const [cleaningDb, setCleaningDb] = useState(false)
  const [dbResult, setDbResult] = useState(null)
  const [cleaningHistory, setCleaningHistory] = useState(false)
  const [historyResult, setHistoryResult] = useState(null)

  const handleClearCache = async () => {
    if (cleaningCache) return
    setCleaningCache(true)
    setCacheResult(null)
    try {
      const result = await window.api.clearGenerated()
      setCacheResult({
        message: `✅ 已清理 ${result.deletedFiles} 个文件，释放 ${formatBytes(result.freedBytes)}`
      })
      setTimeout(() => setCacheResult(null), 5000)
    } catch (e) {
      setCacheResult({ error: e.message })
    } finally {
      setCleaningCache(false)
    }
  }

  const handleCleanupDb = async () => {
    if (cleaningDb) return
    setCleaningDb(true)
    setDbResult(null)
    try {
      const result = await window.dbAPI.maintenance.cleanup()
      setDbResult({
        message: `✅ 已清理 ${result.deletedNodes} 个孤儿节点，${result.deletedConnections} 个孤儿连接`
      })
      setTimeout(() => setDbResult(null), 5000)
    } catch (e) {
      setDbResult({ error: e.message })
    } finally {
      setCleaningDb(false)
    }
  }

  const handleClearHistory = async () => {
    if (cleaningHistory) return
    if (!confirm('确认清除所有生成历史记录？此操作不可恢复。')) return
    setCleaningHistory(true)
    setHistoryResult(null)
    try {
      const result = await window.api.clearHistory()
      setHistoryResult({
        message: `✅ 已清除 ${result.changes || 0} 条历史记录`
      })
      setTimeout(() => setHistoryResult(null), 5000)
    } catch (e) {
      setHistoryResult({ error: e.message })
    } finally {
      setCleaningHistory(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[998]" onClick={onClose} />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-[380px] z-[999] transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full glass-panel rounded-r-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Activity size={18} className="text-emerald-400" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">系统监控</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                监控数据获取失败: {error}
              </div>
            )}

            {loading && !stats && (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              </div>
            )}

            {stats && (
              <>
                {/* 应用状态 */}
                <SectionTitle>应用状态</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    label="运行时长"
                    value={formatUptime(stats.process?.uptime)}
                    color="green"
                  />
                  <StatCard
                    label="内存占用"
                    value={formatBytes(stats.process?.rss)}
                    sub={`系统 ${(
                      ((stats.system?.totalMemory - stats.system?.freeMemory) /
                        stats.system?.totalMemory) *
                      100
                    ).toFixed(0)}% 已用`}
                    color="purple"
                  />
                </div>

                <div className="mt-2">
                  <ProgressBar
                    label="内存使用率"
                    value={stats.process?.heapUsed}
                    max={stats.process?.heapTotal}
                    color="#06b6d4"
                  />
                </div>

                {/* 任务引擎 */}
                <SectionTitle>任务引擎</SectionTitle>
                <div className="grid grid-cols-4 gap-2">
                  <StatCard label="活跃" value={stats.engine?.active} color="blue" />
                  <StatCard label="等待" value={stats.engine?.waiting} color="amber" />
                  <StatCard label="完成" value={stats.engine?.completed} color="green" />
                  <StatCard label="失败" value={stats.engine?.failed} color="red" />
                </div>

                {/* 存储空间 */}
                <SectionTitle>存储空间</SectionTitle>
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <TableRow
                    label="数据库"
                    value={formatBytes(stats.database?.dbFileSize)}
                  />
                  <TableRow
                    label="图片缓存"
                    value={`${stats.cache?.images?.count || 0} 个 · ${formatBytes(stats.cache?.images?.size)}`}
                  />
                  <TableRow
                    label="视频缓存"
                    value={`${stats.cache?.videos?.count || 0} 个 · ${formatBytes(stats.cache?.videos?.size)}`}
                  />
                  {stats.database?.tableCounts && (
                    <TableRow
                      label="历史记录"
                      value={`${stats.database.tableCounts.history || 0} 条`}
                    />
                  )}
                </div>

                {/* 清理操作 */}
                <SectionTitle>空间清理</SectionTitle>
                <div className="space-y-2">
                  <CleanupButton
                    onClick={handleClearCache}
                    loading={cleaningCache}
                    label="🗑️ 清理图片/视频缓存"
                    result={cacheResult}
                  />
                  <CleanupButton
                    onClick={handleCleanupDb}
                    loading={cleaningDb}
                    label="🧹 清理数据库孤儿数据"
                    result={dbResult}
                  />
                  <CleanupButton
                    onClick={handleClearHistory}
                    loading={cleaningHistory}
                    label="📋 清除所有生成历史"
                    result={historyResult}
                  />
                </div>

                {/* 开发者信息（折叠） */}
                <div className="mt-4">
                  <button
                    onClick={() => setShowDev(!showDev)}
                    className="w-full text-center text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors py-1"
                  >
                    {showDev ? '▲ 收起开发者信息' : '▼ 开发者信息'}
                  </button>

                  {showDev && (
                    <div className="mt-2 space-y-2 animate-in fade-in duration-200">
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <TableRow label="Electron" value={`v${stats.system?.electronVersion}`} />
                        <TableRow label="Node.js" value={`v${stats.system?.nodeVersion}`} />
                        <TableRow label="Chromium" value={`v${stats.system?.chromeVersion}`} />
                        <TableRow label="V8" value={`v${stats.system?.v8Version}`} />
                        <TableRow
                          label="CPU"
                          value={`${stats.system?.cpuModel?.split('@')[0]?.trim()}`}
                        />
                        <TableRow label="CPU 核心" value={`${stats.system?.cpuCores} 核`} />
                        <TableRow label="PID" value={stats.process?.pid} />
                      </div>

                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                        <TableRow label="堆内存" value={`${formatBytes(stats.process?.heapUsed)} / ${formatBytes(stats.process?.heapTotal)}`} />
                        <TableRow label="WAL 日志" value={formatBytes(stats.database?.walFileSize)} />
                        <TableRow label="IPC 通道" value={stats.ipc?.registeredChannels} />
                        <TableRow label="IPC 调用" value={stats.ipc?.totalCalls?.toLocaleString()} />
                      </div>

                      {stats.database?.tableCounts && (
                        <div className="grid grid-cols-3 gap-2">
                          {Object.entries(stats.database.tableCounts).map(([table, count]) => {
                            const nameMap = {
                              projects: '项目',
                              nodes: '节点',
                              connections: '连接',
                              history: '历史',
                              assets: '资源',
                              settings: '设置'
                            }
                            return (
                              <StatCard
                                key={table}
                                label={nameMap[table] || table}
                                value={count >= 0 ? count : '—'}
                                color={
                                  table === 'nodes'
                                    ? 'green'
                                    : table === 'connections'
                                      ? 'purple'
                                      : 'blue'
                                }
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 底部时间戳 */}
                <div className="text-center text-[10px] text-[var(--text-muted)] mt-3 pb-4">
                  最后更新: {new Date(stats.timestamp).toLocaleTimeString()} · 每 2s 自动刷新
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

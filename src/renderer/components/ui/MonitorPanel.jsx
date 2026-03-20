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

function formatPlatform(platform) {
  const map = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }
  return map[platform] || platform
}

// ========== 子组件 ==========

function StatCard({ label, value, sub, color = 'blue', icon }) {
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
        {icon && <span className={`${textColorMap[color]} opacity-60`}>{icon}</span>}
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

// ========== 主面板 ==========

export function MonitorPanel({ open, onClose }) {
  const { stats, loading, error } = useSystemMonitor(open)

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
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">系统监控仪表盘</h2>
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
                {/* 系统概览 */}
                <SectionTitle>系统概览</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    label="操作系统"
                    value={formatPlatform(stats.system?.platform)}
                    sub={`${stats.system?.arch} · ${stats.system?.osVersion}`}
                    color="blue"
                  />
                  <StatCard
                    label="运行时长"
                    value={formatUptime(stats.process?.uptime)}
                    sub={`PID: ${stats.process?.pid}`}
                    color="green"
                  />
                </div>

                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 mt-2">
                  <TableRow label="Electron" value={`v${stats.system?.electronVersion}`} />
                  <TableRow label="Node.js" value={`v${stats.system?.nodeVersion}`} />
                  <TableRow label="Chromium" value={`v${stats.system?.chromeVersion}`} />
                  <TableRow label="V8" value={`v${stats.system?.v8Version}`} />
                  <TableRow
                    label="CPU"
                    value={`${stats.system?.cpuModel?.split('@')[0]?.trim()}`}
                  />
                  <TableRow label="CPU 核心" value={`${stats.system?.cpuCores} 核`} />
                </div>

                {/* 资源监控 */}
                <SectionTitle>进程资源</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    label="内存 (RSS)"
                    value={formatBytes(stats.process?.rss)}
                    sub={`总计 ${formatBytes(stats.system?.totalMemory)}`}
                    color="purple"
                  />
                  <StatCard
                    label="堆内存"
                    value={formatBytes(stats.process?.heapUsed)}
                    sub={`/ ${formatBytes(stats.process?.heapTotal)}`}
                    color="cyan"
                  />
                </div>

                <div className="space-y-2 mt-2">
                  <ProgressBar
                    label="系统内存使用率"
                    value={stats.system?.totalMemory - stats.system?.freeMemory}
                    max={stats.system?.totalMemory}
                    color="#a855f7"
                  />
                  <ProgressBar
                    label="堆内存使用率"
                    value={stats.process?.heapUsed}
                    max={stats.process?.heapTotal}
                    color="#06b6d4"
                  />
                </div>

                {/* 数据库 */}
                <SectionTitle>SQLite 数据库</SectionTitle>
                {stats.database?.error ? (
                  <div className="text-xs text-red-400">{stats.database.error}</div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {stats.database?.tableCounts &&
                        Object.entries(stats.database.tableCounts).map(([table, count]) => {
                          const tableNameMap = {
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
                              label={tableNameMap[table] || table}
                              value={count >= 0 ? count : '—'}
                              color={
                                table === 'projects'
                                  ? 'blue'
                                  : table === 'nodes'
                                    ? 'green'
                                    : table === 'connections'
                                      ? 'purple'
                                      : table === 'history'
                                        ? 'amber'
                                        : table === 'assets'
                                          ? 'cyan'
                                          : 'red'
                              }
                            />
                          )
                        })}
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 mt-2">
                      <TableRow
                        label="数据库文件"
                        value={formatBytes(stats.database?.dbFileSize)}
                      />
                      <TableRow label="WAL 日志" value={formatBytes(stats.database?.walFileSize)} />
                    </div>
                  </>
                )}

                {/* 任务引擎 */}
                <SectionTitle>任务引擎</SectionTitle>
                <div className="grid grid-cols-4 gap-2">
                  <StatCard label="活跃" value={stats.engine?.active} color="blue" />
                  <StatCard label="等待" value={stats.engine?.waiting} color="amber" />
                  <StatCard label="完成" value={stats.engine?.completed} color="green" />
                  <StatCard label="失败" value={stats.engine?.failed} color="red" />
                </div>

                {/* IPC 通信 */}
                <SectionTitle>IPC 通信层</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    label="注册通道"
                    value={stats.ipc?.registeredChannels}
                    sub="安全白名单通道"
                    color="cyan"
                  />
                  <StatCard
                    label="累计调用"
                    value={stats.ipc?.totalCalls?.toLocaleString()}
                    sub="自启动以来"
                    color="purple"
                  />
                </div>

                {/* 磁盘缓存 */}
                <SectionTitle>本地资源缓存</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    label="图片缓存"
                    value={`${stats.cache?.images?.count} 个`}
                    sub={formatBytes(stats.cache?.images?.size)}
                    color="green"
                  />
                  <StatCard
                    label="视频缓存"
                    value={`${stats.cache?.videos?.count} 个`}
                    sub={formatBytes(stats.cache?.videos?.size)}
                    color="amber"
                  />
                </div>

                {/* 底部时间戳 */}
                <div className="text-center text-[10px] text-[var(--text-muted)] mt-4 pb-4">
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

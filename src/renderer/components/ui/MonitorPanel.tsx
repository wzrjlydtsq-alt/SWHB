import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ClipboardCopy,
  Database,
  FolderOpen,
  HardDrive,
  RefreshCw,
  Trash2,
  X
} from '../../utils/icons.tsx'
import { getProjectCacheContext } from '../../utils/projectCache.ts'
import { useAppStore } from '../../store/useAppStore.ts'

function formatBytes(bytes) {
  if (bytes === 0 || bytes == null) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
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
    <div className="flex justify-between items-center gap-3 py-1 border-b border-white/5 last:border-0">
      <span className="text-[11px] text-[var(--text-muted)] shrink-0">{label}</span>
      <span className="text-[11px] font-mono text-[var(--text-secondary)] text-right break-all">
        {value ?? '-'}
      </span>
    </div>
  )
}

function ActionButton({ onClick, loading, label, icon: Icon, tone = 'cyan', disabled = false }) {
  const tones = {
    cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20 hover:bg-cyan-500/20 hover:border-cyan-500/30',
    orange:
      'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/30',
    neutral:
      'bg-white/5 text-[var(--text-secondary)] border-white/10 hover:bg-white/10 hover:text-[var(--text-primary)]'
  }

  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 border disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center gap-2 ${tones[tone]}`}
    >
      {loading ? <RefreshCw size={13} className="animate-spin" /> : <Icon size={13} />}
      {loading ? '处理中...' : label}
    </button>
  )
}

function ResultNotice({ result }) {
  if (!result) return null
  return (
    <div
      className={`mt-1.5 p-2 rounded-lg text-[11px] ${
        result.error
          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
      }`}
    >
      {result.error ? `失败：${result.error}` : result.message}
    </div>
  )
}

async function copyTextWithFallback(text) {
  try {
    await navigator.clipboard?.writeText(text)
    return { success: true }
  } catch (browserError) {
    const fallback = await window.api?.windowAPI?.writeClipboardText?.(text)
    if (fallback?.success) return { success: true }
    return {
      success: false,
      error: fallback?.error || browserError?.message || String(browserError)
    }
  }
}

export function MonitorPanel({ open, onClose }) {
  const currentProject = useAppStore((state) => state.currentProject)
  const [storageStats, setStorageStats] = useState(null)
  const [queryingStorage, setQueryingStorage] = useState(false)
  const [storageError, setStorageError] = useState(null)

  const [migrationStatus, setMigrationStatus] = useState(null)
  const [queryingMigration, setQueryingMigration] = useState(false)
  const [migrationResult, setMigrationResult] = useState(null)

  const [cleaningCache, setCleaningCache] = useState(false)
  const [cacheResult, setCacheResult] = useState(null)
  const [cleaningDb, setCleaningDb] = useState(false)
  const [dbResult, setDbResult] = useState(null)
  const [cleaningHistory, setCleaningHistory] = useState(false)
  const [historyResult, setHistoryResult] = useState(null)
  const [repairingProject, setRepairingProject] = useState(false)
  const [repairResult, setRepairResult] = useState(null)

  const handleQueryStorage = async () => {
    if (queryingStorage) return
    setQueryingStorage(true)
    setStorageError(null)
    try {
      const result = await window.api.monitorAPI.getStats()
      setStorageStats(result)
    } catch (e) {
      setStorageError(e.message)
    } finally {
      setQueryingStorage(false)
    }
  }

  const handleQueryMigration = async () => {
    if (queryingMigration) return
    setQueryingMigration(true)
    setMigrationResult(null)
    try {
      const result = await window.api.diagnosticsAPI.migrationStatus()
      setMigrationStatus(result)
    } catch (e) {
      setMigrationResult({ error: e.message })
    } finally {
      setQueryingMigration(false)
    }
  }

  useEffect(() => {
    if (open) {
      handleQueryMigration()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const clearDisplayedStorage = () => {
    setStorageStats(null)
    setStorageError(null)
  }

  const handleClearCache = async () => {
    if (cleaningCache) return
    setCleaningCache(true)
    setCacheResult(null)
    try {
      const result = await window.api.localCacheAPI.clearGenerated(getProjectCacheContext())
      if (result?.success === false) throw new Error(result.error || '清理失败')
      setCacheResult({
        message: `已清理 ${result.deletedFiles || 0} 个文件，释放 ${formatBytes(result.freedBytes)}`
      })
      clearDisplayedStorage()
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
      const result: any = await window.dbAPI.maintenance.cleanup()
      setDbResult({
        message: `已清理 ${result.deletedNodes || 0} 个孤立节点，${result.deletedConnections || 0} 个孤立连接`
      })
      clearDisplayedStorage()
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
      const result = await window.api.localCacheAPI.clearHistory()
      if (result?.success === false) throw new Error(result.error || '清理失败')
      setHistoryResult({
        message: `已清除 ${result.changes || 0} 条历史记录`
      })
      clearDisplayedStorage()
    } catch (e) {
      setHistoryResult({ error: e.message })
    } finally {
      setCleaningHistory(false)
    }
  }

  const handleRepairProject = async () => {
    if (!currentProject?.id || repairingProject) return
    if (
      !confirm(
        `确定修复「${currentProject.name || '当前项目'}」吗？\n\n会补齐项目结构，并把旧 LocalCache 软件缓存引用复制到当前项目缓存目录；不会删除用户原始素材。`
      )
    ) {
      return
    }

    setRepairingProject(true)
    setRepairResult(null)
    try {
      const result = await window.api.projectFileAPI.repair(currentProject.id)
      if (!result?.success) throw new Error(result?.error || '修复失败')
      setRepairResult({
        message: `修复完成：迁移引用 ${result.rewrittenLegacyCacheRefs || 0} 个，复制缓存文件 ${result.copiedLegacyCacheFiles || 0} 个`
      })
      setRepairResult({
        message: `修复完成：重写引用 ${result.rewrittenLegacyCacheRefs || 0} 个，复制缓存文件 ${result.copiedLegacyCacheFiles || 0} 个，保留旧视频引用 ${result.preservedLegacyVideoRefs || 0} 个`
      })
      await handleQueryMigration()
      clearDisplayedStorage()
    } catch (e) {
      setRepairResult({ error: e.message })
    } finally {
      setRepairingProject(false)
    }
  }

  const handleOpenBackupDir = async () => {
    const dir = migrationStatus?.latestBackupDir
    if (!dir) return
    await window.api.localCacheAPI.showItemInFolder(dir)
  }

  const handleCopySupportInfo = async () => {
    const payload = {
      createdAt: new Date().toISOString(),
      currentProject: currentProject
        ? {
            id: currentProject.id,
            name: currentProject.name,
            cacheRoot: currentProject.cacheRoot || null
          }
        : null,
      migrationStatus,
      storageStats
    }

    try {
      const copyResult = await copyTextWithFallback(JSON.stringify(payload, null, 2))
      if (!copyResult.success) throw new Error(copyResult.error || '复制失败')
      setMigrationResult({ message: '客服诊断信息已复制到剪贴板' })
    } catch (e) {
      setMigrationResult({ error: e.message })
    }
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[998]" onClick={onClose} />
      )}

      <div
        className={`fixed top-0 left-0 h-full w-[380px] z-[999] transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full glass-panel rounded-r-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <HardDrive size={18} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">诊断与空间</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            <SectionTitle>迁移状态</SectionTitle>
            <ActionButton
              onClick={handleQueryMigration}
              loading={queryingMigration}
              label="刷新迁移状态"
              icon={RefreshCw}
            />
            {migrationStatus && (
              <div className="mt-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <TableRow label="当前数据版本" value={migrationStatus.currentDataVersion} />
                <TableRow label="目标数据版本" value={migrationStatus.targetDataVersion} />
                <TableRow
                  label="最近迁移"
                  value={migrationStatus.lastResult?.success === false ? '失败' : '正常'}
                />
                <TableRow label="备份目录" value={migrationStatus.latestBackupDir || '无'} />
              </div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ActionButton
                onClick={handleOpenBackupDir}
                loading={false}
                disabled={!migrationStatus?.latestBackupDir}
                label="打开备份"
                icon={FolderOpen}
                tone="neutral"
              />
              <ActionButton
                onClick={handleCopySupportInfo}
                loading={false}
                label="复制诊断"
                icon={ClipboardCopy}
                tone="neutral"
              />
            </div>
            <ResultNotice result={migrationResult} />

            <SectionTitle>当前项目修复</SectionTitle>
            <ActionButton
              onClick={handleRepairProject}
              loading={repairingProject}
              disabled={!currentProject?.id}
              label="修复当前项目"
              icon={AlertCircle}
              tone="cyan"
            />
            <ResultNotice result={repairResult} />

            <SectionTitle>存储空间</SectionTitle>
            <ActionButton
              onClick={handleQueryStorage}
              loading={queryingStorage}
              label="查询存储占用"
              icon={Database}
            />

            {storageError && (
              <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                查询失败：{storageError}
              </div>
            )}

            {storageStats && (
              <div className="mt-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <TableRow label="数据库" value={formatBytes(storageStats.database?.dbFileSize)} />
                <TableRow
                  label="图片缓存"
                  value={`${storageStats.cache?.images?.count || 0} 个 / ${formatBytes(
                    storageStats.cache?.images?.size
                  )}`}
                />
                <TableRow
                  label="视频缓存"
                  value={`${storageStats.cache?.videos?.count || 0} 个 / ${formatBytes(
                    storageStats.cache?.videos?.size
                  )}`}
                />
                <TableRow
                  label="历史记录"
                  value={`${storageStats.database?.tableCounts?.history || 0} 条`}
                />
              </div>
            )}

            <SectionTitle>空间清理</SectionTitle>
            <div className="space-y-2">
              <div>
                <ActionButton
                  onClick={handleClearCache}
                  loading={cleaningCache}
                  label="清理当前项目托管缓存"
                  icon={Trash2}
                  tone="orange"
                />
                <ResultNotice result={cacheResult} />
              </div>
              <div>
                <ActionButton
                  onClick={handleCleanupDb}
                  loading={cleaningDb}
                  label="清理数据库孤立数据"
                  icon={Trash2}
                  tone="orange"
                />
                <ResultNotice result={dbResult} />
              </div>
              <div>
                <ActionButton
                  onClick={handleClearHistory}
                  loading={cleaningHistory}
                  label="清除所有生成历史"
                  icon={Trash2}
                  tone="orange"
                />
                <ResultNotice result={historyResult} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

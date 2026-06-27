import { memo, useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useShallow } from 'zustand/react/shallow'
import { X, LayoutGrid, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

/**
 * 任务看板面板 — 按状态分桶显示历史任务
 */
export const KanbanPanel = memo(function KanbanPanel() {
  const { kanbanOpen, setKanbanOpen, history } = useAppStore(
    useShallow((s) => ({
      kanbanOpen: s.kanbanOpen,
      setKanbanOpen: s.setKanbanOpen,
      history: s.history || []
    }))
  )

  // 按状态分桶
  const columns = useMemo(() => {
    const queued = []
    const generating = []
    const completed = []
    const failed = []

    for (const item of history) {
      const status = item.status || item.state || 'completed'
      if (status === 'queued' || status === 'waiting' || status === 'pending') queued.push(item)
      else if (status === 'generating' || status === 'processing' || status === 'running')
        generating.push(item)
      else if (status === 'completed' || status === 'done' || status === 'success')
        completed.push(item)
      else if (status === 'failed' || status === 'error') failed.push(item)
      else completed.push(item)
    }

    return [
      { id: 'queued', title: '排队中', icon: Clock, color: '#f59e0b', items: queued },
      { id: 'generating', title: '生成中', icon: Loader2, color: '#3b82f6', items: generating },
      { id: 'completed', title: '已完成', icon: CheckCircle, color: '#10b981', items: completed },
      { id: 'failed', title: '失败', icon: AlertCircle, color: '#ef4444', items: failed }
    ]
  }, [history])

  // 统计
  const stats = useMemo(() => {
    const total = history.length
    const successCount = columns.find((c) => c.id === 'completed')?.items.length || 0
    const failCount = columns.find((c) => c.id === 'failed')?.items.length || 0
    const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0

    // 模型使用分布
    const modelMap: Record<string, number> = {}
    for (const item of history) {
      const model = item.model || item.settings?.model || 'unknown'
      modelMap[model] = (modelMap[model] || 0) + 1
    }
    const modelEntries = Object.entries(modelMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    return { total, successCount, failCount, successRate, modelEntries }
  }, [history, columns])

  if (!kanbanOpen) return null

  return (
    <div
      className="fixed right-0 top-0 bottom-0 z-[80] flex flex-col"
      style={{
        width: 400,
        backgroundColor: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-default)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        animation: 'kanbanSlideIn 0.3s var(--ease-out) forwards'
      }}
    >
      <style>{`
        @keyframes kanbanSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {/* 头部 */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <LayoutGrid size={15} style={{ color: 'var(--primary-color)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            任务看板
          </span>
        </div>
        <button
          onClick={() => setKanbanOpen(false)}
          className="p-1.5 rounded-md"
          style={{ color: 'var(--text-muted)' }}
        >
          <X size={15} />
        </button>
      </div>

      {/* 统计栏 */}
      <div
        className="grid grid-cols-4 gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="text-center">
          <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {stats.total}
          </div>
          <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            总任务
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold" style={{ color: '#10b981' }}>
            {stats.successCount}
          </div>
          <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            成功
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold" style={{ color: '#ef4444' }}>
            {stats.failCount}
          </div>
          <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            失败
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold" style={{ color: 'var(--primary-color)' }}>
            {stats.successRate}%
          </div>
          <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            成功率
          </div>
        </div>
      </div>

      {/* 模型使用分布（CSS 饼图） */}
      {stats.modelEntries.length > 0 && (
        <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
            模型分布
          </div>
          <div className="flex gap-1 flex-wrap">
            {stats.modelEntries.map(([model, count], i) => {
              const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
              return (
                <span
                  key={model}
                  className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${colors[i]}20`, color: colors[i] }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: colors[i] }}
                  />
                  {model.replace(/^(.*?)(?:-\d+.*)?$/, '$1').slice(0, 12)} ({count})
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* 看板列 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {columns.map((col) => (
          <div key={col.id}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <col.icon
                size={12}
                style={{ color: col.color }}
                className={col.id === 'generating' ? 'animate-spin' : ''}
              />
              <span className="text-[11px] font-semibold" style={{ color: col.color }}>
                {col.title}
              </span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full ml-auto"
                style={{ backgroundColor: `${col.color}20`, color: col.color }}
              >
                {col.items.length}
              </span>
            </div>

            {col.items.length === 0 ? (
              <div
                className="py-2 text-center text-[10px] rounded-lg"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
              >
                暂无任务
              </div>
            ) : (
              <div className="space-y-1">
                {col.items.slice(0, 20).map((item) => (
                  <div
                    key={item.id || item.taskId}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    {/* 缩略图 */}
                    {item.thumbnail || item.imageUrl ? (
                      <img
                        src={item.thumbnail || item.imageUrl}
                        className="w-8 h-8 rounded object-cover flex-shrink-0"
                        alt=""
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: 'var(--bg-secondary)' }}
                      >
                        <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>
                          {item.type === 'video' ? '🎬' : '🖼'}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[10px] truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {item.prompt ||
                          item.settings?.prompt ||
                          item.settings?.videoPrompt ||
                          '(无提示词)'}
                      </div>
                      <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                        {item.model || item.settings?.model || '-'}
                      </div>
                    </div>
                  </div>
                ))}
                {col.items.length > 20 && (
                  <div
                    className="text-center text-[9px] py-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    还有 {col.items.length - 20} 项...
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})

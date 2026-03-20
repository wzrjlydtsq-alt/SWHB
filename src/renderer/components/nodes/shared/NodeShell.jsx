/**
 * NodeShell — 节点公共外壳组件
 *
 * 提取所有节点组件的公共 UI 骨架：
 * - 外层容器 + 圆角 + 阴影
 * - 顶部标题栏（图标 + 标题 + 删除按钮）
 * - 底部操作栏（slot）
 * - 进度条
 * - 错误提示
 *
 * 用于替代各节点组件中重复的外壳代码。
 */

import { Trash2 } from '../../utils/icons.jsx'

/**
 * 节点外壳容器
 * @param {Object} props
 * @param {React.ReactNode} props.icon - 标题栏图标
 * @param {string} props.title - 标题文本
 * @param {Function} props.onDelete - 删除回调
 * @param {React.ReactNode} props.children - 主体内容
 * @param {React.ReactNode} [props.footer] - 底部操作栏
 * @param {string} [props.className] - 额外 CSS 类名
 * @param {number} [props.width] - 容器宽度 (px), 默认 300
 */
export function NodeShell({
  icon,
  title,
  onDelete,
  children,
  footer,
  className = '',
  width = 300
}) {
  return (
    <div
      className={`relative h-full flex flex-col transition-colors pointer-events-auto bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] overflow-hidden shadow-xl animate-in zoom-in-95 duration-200 ${className}`}
      style={{ width: `${width}px` }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)] text-xs font-semibold shrink-0 text-[var(--text-primary)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-1.5 truncate pr-2">
          {icon}
          <span className="truncate">{title}</span>
        </div>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="p-1 rounded flex-shrink-0 hover:bg-red-500/10 text-[var(--text-secondary)] hover:text-red-500 transition-colors"
            title="删除节点"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* 主体内容 */}
      <div className="flex-1 flex flex-col gap-3 p-3 overflow-y-auto min-h-0 bg-[var(--bg-panel)] rounded-b-xl custom-scrollbar">
        {children}
      </div>

      {/* 底部操作栏 */}
      {footer && (
        <div className="px-3 py-2 border-t border-[var(--border-color)] shrink-0 flex items-center gap-2 bg-[var(--bg-panel)] rounded-b-xl">
          {footer}
        </div>
      )}
    </div>
  )
}

/**
 * 节点进度条
 * @param {Object} props
 * @param {string} props.label - 加载提示文字
 * @param {number} props.progress - 进度值 (0-100)
 */
export function NodeProgressBar({ label = '正在处理...', progress = 0 }) {
  return (
    <div className="my-1">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-medium text-[var(--text-primary)]">{label}</span>
        <span className="text-[10px] text-[var(--text-secondary)] font-mono">{progress}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden bg-[var(--border-color)]">
        <div
          className="h-full bg-[var(--primary-color)] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

/**
 * 节点错误提示
 * @param {Object} props
 * @param {string} props.message - 错误信息
 */
export function NodeError({ message }) {
  if (!message) return null
  return (
    <div className="text-[10px] text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded mt-1">
      ❌ {message}
    </div>
  )
}

/**
 * 节点生成按钮
 * @param {Object} props
 * @param {boolean} props.isGenerating - 是否正在生成
 * @param {string} props.label - 按钮文字
 * @param {string} [props.generatingLabel] - 生成中文字
 * @param {Function} props.onClick - 点击回调
 */
export function NodeGenerateButton({
  isGenerating,
  label = 'GENERATE',
  generatingLabel = 'GENERATING...',
  onClick
}) {
  return (
    <button
      className={`flex-1 py-1.5 rounded text-xs font-mono font-bold transition-all border ${
        isGenerating
          ? 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-muted)] cursor-not-allowed opacity-70'
          : 'bg-[var(--primary-color)] border-[var(--primary-color)] text-white hover:brightness-110 hover:shadow-lg shadow-[var(--primary-color)]/30 active:scale-[0.98]'
      }`}
      disabled={isGenerating}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      [ &gt; {isGenerating ? generatingLabel : label}]
    </button>
  )
}

/**
 * 节点空状态占位
 * @param {Object} props
 * @param {string} props.label - 占位文字
 */
export function NodeEmptyState({ label = '生成等待区' }) {
  return (
    <div className="w-full aspect-video rounded-lg border-2 border-dashed flex items-center justify-center border-[var(--border-color)] bg-[var(--bg-base)] mt-1">
      <span className="text-xs text-[var(--text-muted)] font-medium">{label}</span>
    </div>
  )
}

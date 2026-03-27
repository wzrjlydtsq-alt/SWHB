import React from 'react'
import { Film, ImageIcon } from '../../utils/icons.jsx'

/**
 * ScriptShotNode - 剧本镜头节点
 *
 * 展示从剧本中解析出的单个镜头文本内容。
 * 支持两种类型：script-shot-video（视频镜头）和 script-shot-image（图片镜头）
 */
export const ScriptShotNode = React.memo(function ScriptShotNode({ node }) {
  const isVideo = node.type === 'script-shot-video'
  const settings = node.settings || {}
  const shotTitle = settings.shotTitle || '镜头'
  const shotContent = settings.scriptContent || ''
  const shotIndex = settings.shotIndex || 0

  return (
    <div
      className="flex flex-col h-full pointer-events-auto overflow-hidden"
      style={{
        background: 'var(--bg-secondary)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        filter: 'brightness(1.15)'
      }}
    >
      {/* 顶部标识栏 */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
        style={{
          borderColor: 'var(--border-color)',
          background: isVideo
            ? 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.10))'
            : 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.10))'
        }}
      >
        {isVideo ? (
          <Film size={14} className="text-purple-400 shrink-0" />
        ) : (
          <ImageIcon size={14} className="text-emerald-400 shrink-0" />
        )}
        <span
          className="text-[11px] font-semibold truncate"
          style={{ color: isVideo ? '#a78bfa' : '#6ee7b7' }}
        >
          {shotTitle}
        </span>
        <span className="ml-auto text-[10px] font-mono text-[var(--text-muted)]">#{shotIndex}</span>
        <span
          className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
          style={{
            background: isVideo ? 'rgba(139,92,246,0.2)' : 'rgba(16,185,129,0.2)',
            color: isVideo ? '#c4b5fd' : '#a7f3d0'
          }}
        >
          {isVideo ? '视频' : '图片'}
        </span>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2.5">
        <div
          className="text-[12px] leading-relaxed whitespace-pre-wrap break-words"
          style={{ color: 'var(--text-primary)' }}
        >
          {shotContent}
        </div>
      </div>

      {/* 底部状态栏 */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-t shrink-0"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <span className="text-[10px] text-[var(--text-muted)]">📝 剧本镜头</span>
        <span className="text-[10px] text-[var(--text-muted)]">{shotContent.length} 字</span>
      </div>
    </div>
  )
})

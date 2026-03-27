import { useEffect, useRef } from 'react'
import { Zap, FileText, Users, Crosshair, Film } from '../../utils/icons.jsx'

/**
 * AutomationMenu - 自动化操作菜单
 * 从底部栏"自动化"按钮上方弹出的菜单面板
 */
export function AutomationMenu({
  open,
  onClose,
  onSelectDirector,
  onSelectScript,
  onSelectCharacter,
  onSelectScene
}) {
  const menuRef = useRef(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, onClose])

  if (!open) return null

  const items = [
    {
      id: 'director',
      icon: Film,
      label: 'AI 导演',
      description: '输入想法，AI 自动生成剧本、分镜图、视频',
      color: '#f59e0b',
      onClick: () => {
        onSelectDirector()
        onClose()
      }
    },
    {
      id: 'script',
      icon: FileText,
      label: '剧本导入',
      description: '导入TXT剧本，自动解析镜头并生成节点',
      color: '#a78bfa',
      onClick: () => {
        onSelectScript()
        onClose()
      }
    },
    {
      id: 'character-import',
      icon: Users,
      label: '角色导入',
      description: '导入或粘贴文本，按角色1、角色2解析',
      color: '#34d399',
      onClick: () => {
        onSelectCharacter()
        onClose()
      }
    },
    {
      id: 'scene-import',
      icon: Crosshair,
      label: '场景导入',
      description: '导入或粘贴文本，按场景1、场景2解析',
      color: '#60a5fa',
      onClick: () => {
        onSelectScene()
        onClose()
      }
    }
  ]

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-64 rounded-xl shadow-2xl border animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{
        bottom: '72px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--bg-panel)',
        borderColor: 'var(--border-color)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)'
      }}
    >
      {/* 标题 */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <Zap size={14} className="text-amber-400" />
        <span className="text-xs font-semibold text-[var(--text-primary)]">自动化操作</span>
      </div>

      {/* 操作列表 */}
      <div className="p-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            className="w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 group hover:bg-[var(--bg-hover)]"
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                style={{ background: `${item.color}20` }}
              >
                <item.icon size={16} style={{ color: item.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                  {item.label}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                  {item.description}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

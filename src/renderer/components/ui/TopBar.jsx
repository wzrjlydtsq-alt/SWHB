import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore.js'
import { setSetting } from '../../services/dbService.js'

export function TopBar() {
  const projectName = useAppStore((state) => state.projectName)
  const setProjectName = useAppStore((state) => state.setProjectName)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const historyOpen = useAppStore((state) => state.historyOpen)
  const projectListOpen = useAppStore((state) => state.projectListOpen)

  const [isEditingProjectName, setIsEditingProjectName] = useState(false)

  if (historyOpen || projectListOpen) return null

  return (
    <div className="fixed bottom-4 left-4 flex items-center gap-0 z-50 rounded-full bg-[var(--bg-panel)]/80 shadow-sm transition-all duration-300 hover:shadow-md pl-1 pr-4 py-1 backdrop-blur-sm">
      {/* 可爱表情头像 - 点击打开设置 */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="w-9 h-9 rounded-full bg-[var(--bg-base)] border border-[var(--border-color)] flex items-center justify-center text-lg hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer shrink-0"
        title="打开设置"
      >
        <span role="img" aria-label="logo" style={{ fontSize: '18px', lineHeight: 1 }}>
          🪐
        </span>
      </button>

      {/* 项目名称 */}
      {isEditingProjectName ? (
        <input
          autoFocus
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          onBlur={() => {
            setIsEditingProjectName(false)
            try {
              setSetting('tapnow_project_name', projectName)
            } catch (e) {
              console.error(e)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setIsEditingProjectName(false)
              try {
                setSetting('tapnow_project_name', projectName)
              } catch (e) {
                console.error(e)
              }
            }
          }}
          className="ml-2 px-2 py-0.5 text-sm rounded-lg outline-none border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:border-[var(--primary-color)] transition-colors"
          style={{ minWidth: '80px', maxWidth: '180px' }}
        />
      ) : (
        <span
          onClick={() => setIsEditingProjectName(true)}
          className="ml-2 text-sm font-medium cursor-pointer hover:text-[var(--primary-color)] text-[var(--text-primary)] transition-colors"
          title="点击编辑项目名称"
        >
          {projectName}
        </span>
      )}
    </div>
  )
}

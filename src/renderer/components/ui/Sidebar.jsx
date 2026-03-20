import { useState } from 'react'
import { History, FolderOpen, Activity, MessageSquare, Database, Settings } from '../../utils/icons.jsx'

import { useAppStore } from '../../store/useAppStore.js'
import { useShallow } from 'zustand/react/shallow'
import { setSetting } from '../../services/dbService.js'

export function Sidebar({ monitorOpen, setMonitorOpen, chatFeatureRef }) {
  const {
    activeTool,
    setActiveTool,
    historyOpen,
    setHistoryOpen,
    projectListOpen,
    setProjectListOpen,
    assetLibraryOpen,
    setAssetLibraryOpen,
    projectName,
    setProjectName,
    setSettingsOpen
  } = useAppStore(
    useShallow((state) => ({
      activeTool: state.activeTool,
      setActiveTool: state.setActiveTool,
      historyOpen: state.historyOpen,
      setHistoryOpen: state.setHistoryOpen,
      projectListOpen: state.projectListOpen,
      setProjectListOpen: state.setProjectListOpen,
      assetLibraryOpen: state.assetLibraryOpen,
      setAssetLibraryOpen: state.setAssetLibraryOpen,
      projectName: state.projectName,
      setProjectName: state.setProjectName,
      setSettingsOpen: state.setSettingsOpen
    }))
  )

  const [isEditingProjectName, setIsEditingProjectName] = useState(false)

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 h-12 rounded-2xl flex flex-row items-center px-2.5 gap-2.5 z-40 bg-[var(--bg-panel)]/80 shadow-sm transition-colors duration-300 backdrop-blur-sm">
      {[
        { id: 'history', icon: History },
        { id: 'projects', icon: FolderOpen }
      ].map((tool) => (
        <button
          key={tool.id}
          onClick={() => {
            setActiveTool(tool.id)
            if (tool.id === 'history') setHistoryOpen(!historyOpen)
            if (tool.id === 'projects') setProjectListOpen(!projectListOpen)
          }}
          className={`p-2.5 rounded-xl transition-all ${
            activeTool === tool.id
              ? 'bg-[var(--primary-color)] text-white shadow-[0_0_15px_var(--primary-color)] shadow-black/20'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]'
          }`}
        >
          <tool.icon size={18} />
        </button>
      ))}
      <div className="flex-1"></div>
      {/* 资产库按钮 */}
      <button
        onClick={() => setAssetLibraryOpen(!assetLibraryOpen)}
        className={`p-2.5 rounded-xl transition-all ${
          assetLibraryOpen
            ? 'bg-[var(--primary-color)] text-white shadow-[0_0_15px_var(--primary-color)] shadow-black/20'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]'
        }`}
        title="资产库"
      >
        <Database size={18} />
      </button>
      {/* AI 对话按钮 */}
      <button
        onClick={() => {
          if (chatFeatureRef?.current?.setIsChatOpen) {
            chatFeatureRef.current.setIsChatOpen(!chatFeatureRef.current?.isChatOpen)
          }
        }}
        className={`p-2.5 rounded-xl transition-all ${
          chatFeatureRef?.current?.isChatOpen
            ? 'bg-[var(--primary-color)] text-white shadow-[0_0_15px_var(--primary-color)] shadow-black/20'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]'
        }`}
        title="AI 对话"
      >
        <MessageSquare size={18} />
      </button>
      {/* 系统监控按钮 */}
      <button
        onClick={() => setMonitorOpen(!monitorOpen)}
        className={`p-2.5 rounded-xl transition-all relative ${
          monitorOpen
            ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
            : 'text-[var(--text-secondary)] hover:text-emerald-400 hover:bg-[var(--border-color)]'
        }`}
        title="系统监控"
      >
        <Activity size={18} />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      </button>

      {/* 分隔线 */}
      <div className="w-px h-6 bg-[var(--border-color)]"></div>

      {/* 设置按钮 */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="p-2.5 rounded-xl transition-all text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]"
        title="打开设置"
      >
        <Settings size={18} />
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
              } catch (err) {
                console.error(err)
              }
            }
          }}
          className="px-2 py-0.5 text-xs rounded-lg outline-none border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:border-[var(--primary-color)] transition-colors"
          style={{ minWidth: '60px', maxWidth: '120px' }}
        />
      ) : (
        <span
          onClick={() => setIsEditingProjectName(true)}
          className="text-xs font-medium cursor-pointer hover:text-[var(--primary-color)] text-[var(--text-secondary)] transition-colors max-w-[100px] truncate"
          title="点击编辑项目名称"
        >
          {projectName}
        </span>
      )}
    </div>
  )
}

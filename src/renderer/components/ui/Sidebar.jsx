import { useState, useCallback } from 'react'
import {
  History,
  FolderOpen,
  Activity,
  MessageSquare,
  Database,
  Settings,
  Zap,
  Home
} from '../../utils/icons.jsx'

import { useAppStore } from '../../store/useAppStore.js'
import { useShallow } from 'zustand/react/shallow'
import { setSetting } from '../../services/dbService.js'
import { AutomationMenu } from './AutomationMenu.jsx'
import { ScriptImportModal } from './modals/ScriptImportModal.jsx'
import { CharacterImportModal } from './modals/CharacterImportModal.jsx'
import { SceneImportModal } from './modals/SceneImportModal.jsx'

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
    setSettingsOpen,
    setCurrentProject
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
      setSettingsOpen: state.setSettingsOpen,
      setCurrentProject: state.setCurrentProject
    }))
  )

  const [isEditingProjectName, setIsEditingProjectName] = useState(false)
  const [automationMenuOpen, setAutomationMenuOpen] = useState(false)
  const [scriptImportOpen, setScriptImportOpen] = useState(false)
  const [characterImportOpen, setCharacterImportOpen] = useState(false)
  const [sceneImportOpen, setSceneImportOpen] = useState(false)

  // 批量创建 AI 绘图/视频节点，将镜头文本填入提示词
  const handleCreateScriptNodes = useCallback((nodeType, shots) => {
    if (!shots?.length) return

    const isVideo = nodeType === 'gen-video'

    // 布局参数
    const COLS = 4
    const NODE_W = isVideo ? 420 : 360
    const NODE_H = isVideo ? 360 : 340
    const GAP = 40
    const startX = 200
    const startY = 200

    const baseTs = Date.now()

    // 构造所有节点对象
    const newNodes = shots.map((shot, i) => {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const x = startX + col * (NODE_W + GAP)
      const y = startY + row * (NODE_H + GAP)

      // 去掉标题行，只保留正文作为提示词
      const promptText = shot.content.replace(shot.title, '').trim()

      return {
        id: `node-${baseTs}-${i}`,
        type: nodeType,
        x,
        y,
        position: { x, y },
        width: NODE_W,
        height: NODE_H,
        content: undefined,
        settings: isVideo
          ? {
              model: 'sora-2',
              duration: '5s',
              ratio: '16:9',
              videoPrompt: promptText
            }
          : {
              model: 'nano-banana',
              ratio: 'Auto',
              resolution: 'Auto',
              prompt: promptText
            }
      }
    })

    // 一次性添加所有节点
    const store = useAppStore.getState()
    store.setNodes((prev) => [...prev, ...newNodes])

    // 批量持久化到 SQLite
    if (window.dbAPI?.nodes?.save) {
      newNodes.forEach((node) => {
        window.dbAPI.nodes
          .save({
            id: node.id,
            type: node.type,
            content: node.content || null,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            settings: JSON.stringify(node.settings),
            data: null,
            frames: null,
            selected_keyframes: null,
            video_meta: null
          })
          .catch((e) => console.error('保存节点到 SQLite 失败', e))
      })
    }
  }, [])

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 h-12 rounded-2xl flex flex-row items-center px-2.5 gap-2.5 z-40 bg-[var(--bg-panel)]/80 shadow-sm transition-colors duration-300 backdrop-blur-sm">
        {/* 返回首页 */}
        <button
          onClick={() => {
            setCurrentProject(null)
            setProjectListOpen(true)
          }}
          className="p-2.5 rounded-xl transition-all text-[var(--text-secondary)] hover:text-amber-400 hover:bg-amber-500/10"
          title="返回首页"
        >
          <Home size={18} />
        </button>

        <div className="w-px h-6 bg-[var(--border-color)]"></div>

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

        {/* 自动化按钮 */}
        <button
          onClick={() => setAutomationMenuOpen(!automationMenuOpen)}
          className={`p-2.5 rounded-xl transition-all ${
            automationMenuOpen
              ? 'bg-amber-500/20 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
              : 'text-[var(--text-secondary)] hover:text-amber-400 hover:bg-[var(--border-color)]'
          }`}
          title="自动化"
        >
          <Zap size={18} />
        </button>

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

      {/* 自动化菜单 */}
      <AutomationMenu
        open={automationMenuOpen}
        onClose={() => setAutomationMenuOpen(false)}
        onSelectDirector={() => {
          // 在画布中心创建 AI 导演节点
          const store = useAppStore.getState()
          const W = 580, H = 520
          const newNode = {
            id: `node-${Date.now()}`,
            type: 'director-node',
            x: 300, y: 200,
            position: { x: 300, y: 200 },
            width: W, height: H,
            content: null,
            settings: {}
          }
          store.setNodes((prev) => [...prev, newNode])
          if (window.dbAPI?.nodes?.save) {
            window.dbAPI.nodes.save(newNode, store.currentProject?.id || store.currentProject)
              .catch((e) => console.error('保存 director 节点到 SQLite 失败', e))
          }
        }}
        onSelectScript={() => setScriptImportOpen(true)}
        onSelectCharacter={() => setCharacterImportOpen(true)}
        onSelectScene={() => setSceneImportOpen(true)}
      />

      {/* 剧本导入弹窗 */}
      <ScriptImportModal
        open={scriptImportOpen}
        onClose={() => setScriptImportOpen(false)}
        onCreateNodes={handleCreateScriptNodes}
      />

      {/* 角色导入弹窗 */}
      <CharacterImportModal
        open={characterImportOpen}
        onClose={() => setCharacterImportOpen(false)}
        onCreateNodes={handleCreateScriptNodes}
      />

      {/* 场景导入弹窗 */}
      <SceneImportModal
        open={sceneImportOpen}
        onClose={() => setSceneImportOpen(false)}
        onCreateNodes={handleCreateScriptNodes}
      />
    </>
  )
}

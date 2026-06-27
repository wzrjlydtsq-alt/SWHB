import { useState, useCallback, useEffect, memo } from 'react'
import { Star, UserRound } from 'lucide-react'
import {
  History,
  FolderOpen,
  Activity,
  Database,
  Settings,
  Home,
  Camera
} from '../../utils/icons.tsx'

import { useAppStore } from '../../store/useAppStore.ts'
import { useShallow } from 'zustand/react/shallow'
import { setSetting } from '../../services/dbService.ts'
import { ScriptImportModal } from './modals/ScriptImportModal.tsx'
import { CharacterImportModal } from './modals/CharacterImportModal.tsx'
import { SceneImportModal } from './modals/SceneImportModal.tsx'
import { ProjectSaveWidget } from './ProjectSaveWidget.tsx'
import { PersonalCenterModal } from './PersonalCenterModal.tsx'
import { CLOUD_AUTH_CHANGE_EVENT, getUserInfo } from '../../services/cloud'

interface SidebarProps {
  monitorOpen: boolean
  setMonitorOpen: (open: boolean) => void
  chatFeatureRef?: any
}

export const Sidebar = memo(function Sidebar({
  monitorOpen,
  setMonitorOpen,
  chatFeatureRef
}: SidebarProps) {
  const {
    activeTool,
    setActiveTool,
    historyOpen,
    setHistoryOpen,
    projectListOpen,
    setProjectListOpen,
    setProjectGalleryOpen,
    assetLibraryOpen,
    setAssetLibraryOpen,
    favoriteLibraryOpen,
    setFavoriteLibraryOpen,
    cloudAssetsOpen,
    setCloudAssetsOpen,
    skillPanelOpen,
    setSkillPanelOpen,
    projectName,
    setProjectName,
    setSettingsOpen,
    setCurrentProject,
    scriptImportOpen,
    setScriptImportOpen,
    characterImportOpen,
    setCharacterImportOpen,
    sceneImportOpen,
    setSceneImportOpen,
    setDirectorStageOpen
  } = useAppStore(
    useShallow((state) => ({
      activeTool: state.activeTool,
      setActiveTool: state.setActiveTool,
      historyOpen: state.historyOpen,
      setHistoryOpen: state.setHistoryOpen,
      projectListOpen: state.projectListOpen,
      setProjectListOpen: state.setProjectListOpen,
      setProjectGalleryOpen: state.setProjectGalleryOpen,
      assetLibraryOpen: state.assetLibraryOpen,
      setAssetLibraryOpen: state.setAssetLibraryOpen,
      favoriteLibraryOpen: state.favoriteLibraryOpen,
      setFavoriteLibraryOpen: state.setFavoriteLibraryOpen,
      cloudAssetsOpen: state.cloudAssetsOpen,
      setCloudAssetsOpen: state.setCloudAssetsOpen,
      skillPanelOpen: state.skillPanelOpen,
      setSkillPanelOpen: state.setSkillPanelOpen,
      projectName: state.projectName,
      setProjectName: state.setProjectName,
      setSettingsOpen: state.setSettingsOpen,
      setCurrentProject: state.setCurrentProject,
      scriptImportOpen: state.scriptImportOpen,
      setScriptImportOpen: state.setScriptImportOpen,
      characterImportOpen: state.characterImportOpen,
      setCharacterImportOpen: state.setCharacterImportOpen,
      sceneImportOpen: state.sceneImportOpen,
      setSceneImportOpen: state.setSceneImportOpen,
      setDirectorStageOpen: state.setDirectorStageOpen
    }))
  )

  const [isEditingProjectName, setIsEditingProjectName] = useState(false)
  const [personalCenterOpen, setPersonalCenterOpen] = useState(false)
  const [, setAccountRefreshKey] = useState(0)
  const cloudUser = getUserInfo()

  useEffect(() => {
    const openPersonalCenter = () => setPersonalCenterOpen(true)
    const refreshAccount = () => setAccountRefreshKey((key) => key + 1)
    window.addEventListener('open-personal-center', openPersonalCenter)
    window.addEventListener(CLOUD_AUTH_CHANGE_EVENT, refreshAccount)
    return () => {
      window.removeEventListener('open-personal-center', openPersonalCenter)
      window.removeEventListener(CLOUD_AUTH_CHANGE_EVENT, refreshAccount)
    }
  }, [])

  const handleOpenDirectorStage = useCallback(() => {
    setDirectorStageOpen(true)
  }, [setDirectorStageOpen])

  // Create image/video nodes from parsed shots.
  const handleCreateScriptNodes = useCallback((nodeType, shots) => {
    if (!shots?.length) return

    const isVideo = nodeType === 'gen-video'

    // 甯冨眬鍙傛暟
    const COLS = 4
    const NODE_W = isVideo ? 420 : 360
    const NODE_H = isVideo ? 360 : 340
    const GAP = 40
    const startX = 200
    const startY = 200

    const baseTs = Date.now()

    const newNodes = shots.map((shot, i) => {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const x = startX + col * (NODE_W + GAP)
      const y = startY + row * (NODE_H + GAP)

      // 鍘绘帀鏍囬琛岋紝鍙繚鐣欐鏂囦綔涓烘彁绀鸿瘝
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

    const store = useAppStore.getState()
    store.setNodes((prev) => [...prev, ...newNodes])

    // 鎵归噺鎸佷箙鍖栧埌 SQLite
    const currentProjectId = useAppStore.getState().currentProject?.id
    if (window.dbAPI?.nodes?.save && currentProjectId) {
      newNodes.forEach((node) => {
        window.dbAPI.nodes
          .save(
            {
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
            },
            currentProjectId
          )
          .catch((e) => console.error('淇濆瓨鑺傜偣鍒?SQLite 澶辫触', e))
      })
    }
  }, [])

  return (
    <>
      <div
        data-onboarding="dock"
        className="bottom-dock fixed bottom-4 left-1/2 -translate-x-1/2 h-12 flex flex-row items-center gap-1.5 z-40 transition-colors duration-300"
      >
        {[
          { id: 'history', icon: History },
          { id: 'projects', icon: FolderOpen }
        ].map((tool) => (
          <button
            key={tool.id}
            onClick={() => {
              setActiveTool(tool.id)
              if (tool.id === 'history') setHistoryOpen(!historyOpen)
              if (tool.id === 'projects') setProjectGalleryOpen(true)
            }}
            className={`p-2.5 rounded-xl transition-all duration-150 ${
              activeTool === tool.id
                ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)]'
                : 'btn-ghost'
            }`}
            data-onboarding={
              tool.id === 'history'
                ? 'btn-history'
                : tool.id === 'projects'
                  ? 'btn-home'
                  : undefined
            }
          >
            <tool.icon size={18} />
          </button>
        ))}
        <div className="flex-1"></div>

        <button
          onClick={handleOpenDirectorStage}
          className="btn-ghost p-2.5 rounded-xl"
          title="Open 3D Director Stage"
          data-onboarding="btn-director-stage"
        >
          <span className="text-base leading-none">3D</span>
        </button>

        {/* Skill / automation console button */}
        <button
          onClick={() => setSkillPanelOpen(!skillPanelOpen)}
          className={`hidden p-2.5 rounded-xl transition-all duration-150 ${
            skillPanelOpen ? 'bg-violet-500/10 text-violet-400' : 'btn-ghost'
          }`}
          title="Automation Console"
          data-onboarding="btn-automation"
        >
          <span className="text-base leading-none">*</span>
        </button>

        {/* Asset library button */}
        <button
          onClick={() => setAssetLibraryOpen(!assetLibraryOpen)}
          className={`p-2.5 rounded-xl transition-all duration-150 ${
            assetLibraryOpen
              ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)]'
              : 'btn-ghost'
          }`}
          title="Asset Library"
          data-onboarding="btn-asset"
        >
          <Database size={18} />
        </button>
        <button
          onClick={() => setFavoriteLibraryOpen(!favoriteLibraryOpen)}
          className={`p-2.5 rounded-xl transition-all duration-150 ${
            favoriteLibraryOpen
              ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)]'
              : 'btn-ghost'
          }`}
          title="Favorites"
          data-onboarding="btn-favorites"
        >
          <Star size={18} />
        </button>
        <button
          onClick={() => {
            setActiveTool('cloud-assets')
            setCloudAssetsOpen(!cloudAssetsOpen)
          }}
          className={`p-2.5 rounded-xl transition-all duration-150 ${
            cloudAssetsOpen
              ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)]'
              : 'btn-ghost'
          }`}
          title="Team Cloud Assets"
          data-onboarding="btn-cloud-assets"
        >
          <span className="text-base leading-none">CL</span>
        </button>
        {/* AI chat button */}
        <button
          className={`p-2.5 rounded-xl transition-all duration-150 ${
            chatFeatureRef?.current?.isChatOpen
              ? 'bg-[var(--primary-color)]/10 text-[var(--primary-color)]'
              : 'btn-ghost'
          }`}
          title="AI Chat"
          data-onboarding="btn-chat-removed"
        >
          <span />
        </button>
        {/* Monitor button */}
        <button
          onClick={() => setMonitorOpen(!monitorOpen)}
          className={`p-2.5 rounded-xl transition-all duration-150 relative ${
            monitorOpen ? 'bg-emerald-500/10 text-emerald-400' : 'btn-ghost'
          }`}
          title="System Monitor"
          data-onboarding="btn-monitor"
        >
          <Activity size={18} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </button>

        {/* Screenshot button */}
        <button
          onClick={() => {
            const s = useAppStore.getState()
            s.setScreenshotMode('selection')
          }}
          className="btn-ghost p-2.5 rounded-xl"
          title="画布截图 (Ctrl+Shift+S)"
          data-onboarding="btn-screenshot"
        >
          <Camera size={18} />
        </button>

        {/* 鍒嗛殧绾?*/}
        <div className="w-px h-6 bg-[var(--border-subtle)]"></div>

        <ProjectSaveWidget />

        {/* 鍏ㄥ眬璐﹀彿 / 涓汉涓績 */}
        <button
          onClick={() => setPersonalCenterOpen(true)}
          className="btn-ghost p-2.5 rounded-xl overflow-hidden"
          title="个人中心"
          data-onboarding="btn-personal-center"
        >
          {cloudUser?.avatar_url ? (
            <img src={cloudUser.avatar_url} alt="" className="w-[18px] h-[18px] rounded-full object-cover" />
          ) : (
            <UserRound size={18} />
          )}
        </button>

        {/* 璁剧疆鎸夐挳 */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="btn-ghost p-2.5 rounded-xl"
          title="打开设置"
          data-onboarding="btn-settings"
        >
          <Settings size={18} />
        </button>

        {/* 椤圭洰鍚嶇О */}
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
            className="input-field px-2 py-0.5 text-xs"
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

      {/* 鍓ф湰瀵煎叆寮圭獥 */}
      <ScriptImportModal
        open={scriptImportOpen}
        onClose={() => setScriptImportOpen(false)}
        onCreateNodes={handleCreateScriptNodes}
      />

      {/* 瑙掕壊瀵煎叆寮圭獥 */}
      <CharacterImportModal
        open={characterImportOpen}
        onClose={() => setCharacterImportOpen(false)}
        onCreateNodes={handleCreateScriptNodes}
      />

      {/* 鍦烘櫙瀵煎叆寮圭獥 */}
      <SceneImportModal
        open={sceneImportOpen}
        onClose={() => setSceneImportOpen(false)}
        onCreateNodes={handleCreateScriptNodes}
      />

      {personalCenterOpen && (
        <PersonalCenterModal
          onClose={() => setPersonalCenterOpen(false)}
          onChanged={() => setAccountRefreshKey((key) => key + 1)}
        />
      )}
    </>
  )
})

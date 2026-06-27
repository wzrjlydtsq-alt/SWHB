/**
 * AppLayout 闂?婵炴垶鎹侀褏绮╂搴濇勃闁逞屽墰缁辨帡宕熼鍜佸仺
 *
 * 闂?App.jsx 闂?JSX 濠电偞鎸稿鍫曟偂鐎ｎ喗鐒婚柡鍕箳鐢棝鏌? * 闂佸湱顣介崑鎾绘煛閸繍妲归柡鍡欏枛楠炴垿顢欓懡銈囩厾 Context + Store 闂佸吋鍎抽崲鑼躲亹閸ヮ剚鏅悘鐐跺亹閻熸繈鏌熼幁鎺戝姕闁?props闂? */
import { lazy, Suspense, useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore.ts'
import { useShallow } from 'zustand/react/shallow'
import { Bot, Brush, Languages, Table2 } from 'lucide-react'

import { useProjectContext } from '../contexts/ProjectContext.tsx'
import { useCanvasOperations } from '../contexts/CanvasOperationsContext.tsx'
import { useCharacterLibrary } from '../hooks/useCharacterLibrary.ts'
import { useLocalCacheManager } from '../hooks/useLocalCacheManager.ts'
import { isVideoUrl } from '../utils/projectUtils.ts'
import { DEFAULT_BASE_URL } from '../utils/constants.ts'

// --- Feature 缂傚倷绀佺€氼亜鈻?---
import { CanvasFeature } from '../features/canvas/CanvasFeature.tsx'
import { GenerationFeature } from '../features/generation/GenerationFeature.tsx'
import { HistoryFeature } from '../features/history/HistoryFeature.tsx'
import { ChatFeature } from '../features/chat/ChatFeature.tsx'
import { SettingsFeature } from '../features/settings/SettingsFeature.tsx'

// --- UI 缂傚倷绀佺€氼亜鈻?---
import { ArtisticProgress } from '../components/ui/ArtisticProgress.tsx'
import { Sidebar } from '../components/ui/Sidebar.tsx'
import { UpdaterDialog } from '../components/ui/UpdaterDialog.tsx'
import { UpdateAnnouncement } from '../components/ui/UpdateAnnouncement.tsx'
import { ContextMenuManager } from '../components/ui/ContextMenuManager.tsx'
import { MonitorPanel } from '../components/ui/MonitorPanel.tsx'
import { AssetLibrary } from '../components/ui/AssetLibrary.tsx'
import { SkillPanel } from '../components/ui/SkillPanel.tsx'
import { ProjectSaveWidget } from '../components/ui/ProjectSaveWidget.tsx'
import { WelcomeScreen } from '../components/ui/WelcomeScreen.tsx'
import { ProjectGallery } from '../features/projects/ProjectGallery.tsx'
import { ProductionBoard } from '../features/production/ProductionBoard.tsx'
import { WorkspaceHome } from '../features/workspace/WorkspaceHome.tsx'
import { OverseasDubbingPanel } from '../features/dubbing/OverseasDubbingPanel.tsx'
import { CloudAssetsPanel } from '../features/cloud-assets'
import { FavoriteLibraryPanel } from '../features/cloud-assets/FavoriteLibraryPanel'
import { FeatureErrorBoundary } from './FeatureErrorBoundary'
import { getDefaultDirectorState, useDirectorStore } from '../features/director/useDirectorStore.ts'
import { KanbanPanel } from '../features/kanban/KanbanPanel.tsx'

const Director3DModal = lazy(() => import('../features/director/Director3DModal.tsx'))
const GLOBAL_DIRECTOR_STAGE_ID = 'global-director-stage'
const LEGAL_CONSENT_KEY = 'xinghe_legal_consent_v2_0_27'

export function AppLayout() {
  // ========== Context ==========
  const {
    progressState,
    chatFeatureRef,
    projects,
    setProjects,
    handleLoadFromHistory,
    handleDeleteHistoryProject,
    handleSaveAndCreateNew
  } = useProjectContext()

  const {
    nodesMap,
    nodeConnectedStatus,
    adjacentNodesCache,
    addNode,
    deleteNode,
    updateNodeSettings,
    scheduleNodeUpdate,
    scheduleMultiNodeUpdate,
    flushNodeUpdate,
    handleVideoFileUpload,
    canvasRef,
    nodesRef,
    selectedNodeIdsRef,
    connectionsRef,
    apiConfigsMap,
    screenToWorld,
    contextMenu,
    setContextMenu,
    historyContextMenu,
    setHistoryContextMenu,
    nodeContextMenu,
    setNodeContextMenu,
    frameContextMenu,
    setFrameContextMenu,
    inputImageContextMenu,
    closeInputImageContextMenu,
    sendFrameToChat,
    sendFrameToCanvas,
    applyFrameToSelectedNode,
    applyHistoryToSelectedNode,
    sendHistoryToCanvas,
    sendHistoryToChat,
    sendInputImageToChat,
    handleFileUpload,
    handleAudioFileUpload,
    handleSplitGridFromUrl,
    handleAutoExtractKeyframes,
    handleSmartExtractKeyframes,
    handleCanvasDragOver,
    handleGlobalDrop
  } = useCanvasOperations()

  // ========== Store ==========
  const setHistory = useAppStore((state) => state.setHistory)
  const {
    theme,
    nodes,
    setNodes,
    connections,
    setConnections,
    view,
    setView,
    edges,
    setEdges,
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
    activeDropdown,
    setActiveDropdown,
    historyOpen,
    setHistoryOpen,
    historyPerformanceMode,
    settingsOpen,
    setSettingsOpen,
    localCacheSettingsOpen,
    setLocalCacheSettingsOpen,
    batchSelectedIds,
    setBatchSelectedIds,
    batchModalOpen,
    setBatchModalOpen,
    projectListOpen,
    setProjectListOpen,
    setProjectGalleryOpen,
    currentProject,
    cloudAssetsOpen,
    setCloudAssetsOpen,
    directorStageOpen,
    setDirectorStageOpen,
    activeWorkspacePage,
    setActiveWorkspacePage,
    apiConfigs,
    setApiConfigs,
    globalApiKey,
    globalApiUrl,
    groupApiKeys,
    groupApiUrls,
    isPerformanceMode,
    jimengSessionId,
    setJimengSessionId,
    jimengUseLocalFile,
    setJimengUseLocalFile
  } = useAppStore(
    useShallow((state) => ({
      theme: state.theme,
      nodes: state.nodes,
      setNodes: state.setNodes,
      connections: state.connections,
      setConnections: state.setConnections,
      view: state.view,
      setView: state.setView,
      edges: state.edges,
      setEdges: state.setEdges,
      selectedNodeId: state.selectedNodeId,
      setSelectedNodeId: state.setSelectedNodeId,
      selectedNodeIds: state.selectedNodeIds,
      setSelectedNodeIds: state.setSelectedNodeIds,
      activeDropdown: state.activeDropdown,
      setActiveDropdown: state.setActiveDropdown,
      historyOpen: state.historyOpen,
      setHistoryOpen: state.setHistoryOpen,
      historyPerformanceMode: state.historyPerformanceMode,
      settingsOpen: state.settingsOpen,
      setSettingsOpen: state.setSettingsOpen,
      localCacheSettingsOpen: state.localCacheSettingsOpen,
      setLocalCacheSettingsOpen: state.setLocalCacheSettingsOpen,
      batchSelectedIds: state.batchSelectedIds,
      setBatchSelectedIds: state.setBatchSelectedIds,
      batchModalOpen: state.batchModalOpen,
      setBatchModalOpen: state.setBatchModalOpen,
      projectListOpen: state.projectListOpen,
      setProjectListOpen: state.setProjectListOpen,
      setProjectGalleryOpen: state.setProjectGalleryOpen,
      currentProject: state.currentProject,
      cloudAssetsOpen: state.cloudAssetsOpen,
      setCloudAssetsOpen: state.setCloudAssetsOpen,
      directorStageOpen: state.directorStageOpen,
      setDirectorStageOpen: state.setDirectorStageOpen,
      activeWorkspacePage: state.activeWorkspacePage,
      setActiveWorkspacePage: state.setActiveWorkspacePage,
      apiConfigs: state.apiConfigs || [],
      setApiConfigs: state.setApiConfigs,
      globalApiKey: state.globalApiKey || '',
      globalApiUrl: state.globalApiUrl || '',
      groupApiKeys: state.groupApiKeys || {},
      groupApiUrls: state.groupApiUrls || {},
      isPerformanceMode: state.isPerformanceMode,
      jimengSessionId: state.jimengSessionId,
      setJimengSessionId: state.setJimengSessionId,
      jimengUseLocalFile: state.jimengUseLocalFile,
      setJimengUseLocalFile: state.setJimengUseLocalFile
    }))
  )

  const resolvedChatApiKey = groupApiKeys?.Chat || globalApiKey || ''
  const resolvedImageApiKey = groupApiKeys?.Image || globalApiKey || ''
  const resolvedVideoApiKey = groupApiKeys?.Video || globalApiKey || ''
  const resolvedChatApiUrl = groupApiUrls?.Chat || globalApiUrl || ''
  const resolvedVideoApiUrl = groupApiUrls?.Video || globalApiUrl || DEFAULT_BASE_URL

  // ========== Character Library Hook ==========
  const characterLibraryResult = useCharacterLibrary({
    apiConfigs,
    videoApiKey: resolvedVideoApiKey,
    videoApiUrl: resolvedVideoApiUrl,
    DEFAULT_BASE_URL
  } as any)

  const { setCharactersOpen, characterReferenceBarExpanded, setCharacterReferenceBarExpanded } =
    characterLibraryResult

  // ========== Local Cache Manager Hook ==========
  const { localCacheServerConnected } = useLocalCacheManager(historyPerformanceMode)

  // ========== 闂佸搫鐗滈崜娆忥耿閹绢喗鍋愰柤鍝ヮ暯閸?==========
  const [monitorOpen, setMonitorOpen] = useState(false)
  const [legalConsentAccepted, setLegalConsentAccepted] = useState(true)
  const ensureDirectorNode = useDirectorStore((state) => state.ensureNode)

  const isPerfMode = isPerformanceMode || nodes.length > 20
  const lowEffectsMode = true
  const showEmptyCanvasActions = Boolean(currentProject && nodes.length === 0)
  const showMissingProjectPrompt = activeWorkspacePage === 'canvas' && !currentProject
  const workspaceLayerClass = (page: typeof activeWorkspacePage) =>
    `absolute inset-0 overflow-hidden transition-opacity duration-150 ${
      activeWorkspacePage === page
        ? 'z-10 opacity-100 pointer-events-auto'
        : 'z-0 opacity-0 pointer-events-none'
    }`
  const workspaceNavItems = [
    { page: 'assistant', label: 'Workspace', icon: Bot },
    { page: 'canvas', label: 'Canvas', icon: Brush },
    { page: 'production', label: 'Production', icon: Table2, onboarding: 'btn-production' },
    { page: 'dubbing', label: '海外译制', icon: Languages, onboarding: 'btn-dubbing' }
  ]

  useEffect(() => {
    ensureDirectorNode(GLOBAL_DIRECTOR_STAGE_ID, getDefaultDirectorState())
  }, [ensureDirectorNode])

  useEffect(() => {
    document.documentElement.classList.toggle('low-effects', lowEffectsMode)
    document.body?.classList.toggle('low-effects', lowEffectsMode)
    return () => {
      document.documentElement.classList.remove('low-effects')
      document.body?.classList.remove('low-effects')
    }
  }, [lowEffectsMode])

  useEffect(() => {
    let cancelled = false
    const loadConsent = async () => {
      const localValue = window.localStorage.getItem(LEGAL_CONSENT_KEY)
      if (localValue === 'accepted') {
        if (!cancelled) setLegalConsentAccepted(true)
        return
      }
      try {
        const dbValue = await window.dbAPI?.settings?.get(LEGAL_CONSENT_KEY)
        if (!cancelled) setLegalConsentAccepted(dbValue === 'accepted')
      } catch {
        if (!cancelled) setLegalConsentAccepted(false)
      }
    }
    setLegalConsentAccepted(false)
    loadConsent()
    return () => {
      cancelled = true
    }
  }, [])

  const acceptLegalConsent = async () => {
    window.localStorage.setItem(LEGAL_CONSENT_KEY, 'accepted')
    try {
      await window.dbAPI?.settings?.set(LEGAL_CONSENT_KEY, 'accepted')
    } catch {
      // Keep startup unblocked if the local settings database is unavailable.
    }
    setLegalConsentAccepted(true)
  }

  return (
    <>
      {/* 闂佸搫顑勯懗鍫曟偩濠靛鍤岄柣鎴炆戦柦鈺呭级閳哄倻鈽夐悗瑙勫▕瀵?*/}
      <ArtisticProgress
        visible={progressState.visible}
        progress={progressState.progress}
        status={progressState.status}
        type={progressState.type}
      />
      <div
        className={`w-full h-screen font-sans overflow-hidden select-none flex flex-col bg-transparent text-white ${isPerfMode ? 'perf-mode' : ''} ${lowEffectsMode ? 'low-effects' : ''}`}
        onDragOver={handleCanvasDragOver}
        onDrop={handleGlobalDrop}
        onClick={() => {
          if (historyContextMenu.visible)
            setHistoryContextMenu((prev) => ({ ...prev, visible: false }))
          if (frameContextMenu.visible) setFrameContextMenu((prev) => ({ ...prev, visible: false }))
        }}
      >
        <div className="flex-1 relative overflow-hidden flex transition-colors duration-300 bg-transparent">
          {/* 闁荤姍鍐仹濡ょ姴娲﹂幆鏃堝箻缂佹ɑ銆冮梺?*/}
          <AssetLibrary />

          {/* Sidebar */}
          {activeWorkspacePage !== 'assistant' && (
            <Sidebar
              monitorOpen={monitorOpen}
              setMonitorOpen={setMonitorOpen}
              chatFeatureRef={chatFeatureRef}
            />
          )}

          {/* Generation Feature (闂傚倸鎳忛崝妯何涘畝鍕櫖閻忕偠鍋愰惌宀勬煙缂佹ê濮冪紒鍓佹暬閺屽懘寮拌箛鏇炵) */}
          <GenerationFeature />

          {/* History Feature */}
          <HistoryFeature
            theme={theme}
            historyOpen={historyOpen}
            setHistoryOpen={setHistoryOpen}
            historyPerformanceMode={historyPerformanceMode}
            localCacheServerConnected={localCacheServerConnected}
            localCacheSettingsOpen={localCacheSettingsOpen}
            setLocalCacheSettingsOpen={setLocalCacheSettingsOpen}
            setBatchModalOpen={setBatchModalOpen}
            setBatchSelectedIds={setBatchSelectedIds}
            screenToWorld={screenToWorld}
            setHistoryContextMenu={setHistoryContextMenu}
            historyContextMenu={historyContextMenu}
            nodes={nodes}
            setNodes={setNodes}
            setEdges={setEdges}
            setConnections={setConnections}
            view={view}
          />

          <div className="absolute inset-0 z-0 overflow-hidden isolate">
            <div className="relative h-full w-full">
              <div
                className={workspaceLayerClass('assistant')}
                aria-hidden={activeWorkspacePage !== 'assistant'}
              >
                <FeatureErrorBoundary name="WorkspaceHome">
                  <WorkspaceHome
                    chatFeatureRef={chatFeatureRef}
                    addNode={addNode}
                    screenToWorld={screenToWorld}
                    projects={projects}
                    setProjects={setProjects}
                    handleLoadFromHistory={handleLoadFromHistory}
                  />
                </FeatureErrorBoundary>
              </div>

              <div
                className={workspaceLayerClass('canvas')}
                aria-hidden={activeWorkspacePage !== 'canvas'}
              >
                {/* Canvas Feature (Main Area) */}
                {activeWorkspacePage === 'canvas' && (
                  <>
                    <FeatureErrorBoundary name="CanvasFeature">
                      <CanvasFeature
                        canvasRef={canvasRef}
                        nodesRef={nodesRef}
                        selectedNodeIdsRef={selectedNodeIdsRef}
                        connectionsRef={connectionsRef}
                        view={view}
                        setView={setView}
                        nodesMap={nodesMap}
                        nodes={nodes}
                        setNodes={setNodes}
                        connections={connections}
                        setConnections={setConnections}
                        adjacentNodesCache={adjacentNodesCache}
                        nodeConnectedStatus={nodeConnectedStatus}
                        scheduleNodeUpdate={scheduleNodeUpdate}
                        scheduleMultiNodeUpdate={scheduleMultiNodeUpdate}
                        flushNodeUpdate={flushNodeUpdate}
                        addNode={addNode}
                        deleteNode={deleteNode}
                        updateNodeSettings={updateNodeSettings}
                        setSelectedNodeId={setSelectedNodeId}
                        setSelectedNodeIds={setSelectedNodeIds}
                        apiConfigsMap={apiConfigsMap}
                        screenToWorld={screenToWorld}
                        handleFileUpload={handleFileUpload}
                        handleAudioFileUpload={handleAudioFileUpload}
                        handleVideoFileUpload={handleVideoFileUpload}
                        handleAutoExtractKeyframes={handleAutoExtractKeyframes}
                        handleSmartExtractKeyframes={handleSmartExtractKeyframes}
                        handleCanvasDragOver={handleCanvasDragOver}
                        setContextMenu={setContextMenu}
                        setActiveDropdown={setActiveDropdown}
                        setHistoryContextMenu={setHistoryContextMenu}
                        setNodeContextMenu={setNodeContextMenu}
                        nodeContextMenu={nodeContextMenu}
                        frameContextMenu={frameContextMenu}
                        setFrameContextMenu={setFrameContextMenu}
                        setHistory={setHistory}
                        activeDropdown={activeDropdown}
                        characterReferenceBarExpanded={characterReferenceBarExpanded}
                        setCharacterReferenceBarExpanded={setCharacterReferenceBarExpanded}
                        setCharactersOpen={setCharactersOpen}
                        setResizingNodeId={useAppStore.getState().setResizingNodeId}
                        chatFeatureRef={chatFeatureRef}
                      />
                    </FeatureErrorBoundary>

                    {showEmptyCanvasActions && (
                      <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                        <div className="pointer-events-auto rounded-2xl border border-white/12 bg-black/20 px-5 py-4 text-center shadow-2xl backdrop-blur-md">
                          <div className="mb-3 text-sm font-semibold text-white/85">空白画布</div>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setDirectorStageOpen(true)}
                              className="rounded-xl border border-cyan-300/25 bg-cyan-300/12 px-3 py-2 text-xs font-medium text-cyan-50 transition-all hover:bg-cyan-300/20"
                            >
                              3D 导演台
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const center = screenToWorld(
                                  window.innerWidth / 2,
                                  window.innerHeight / 2
                                )
                                addNode('gen-image', center.x, center.y)
                              }}
                              className="rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs font-medium text-white/75 transition-all hover:bg-white/[0.1]"
                            >
                              生图节点
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {showMissingProjectPrompt && (
                      <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                        <div className="pointer-events-auto rounded-2xl border border-white/12 bg-black/20 px-5 py-4 text-center shadow-2xl backdrop-blur-md">
                          <div className="mb-3 text-sm font-semibold text-white/85">
                            请选择或新建项目
                          </div>
                          <button
                            type="button"
                            onClick={() => setProjectGalleryOpen(true)}
                            className="rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs font-medium text-white/75 transition-all hover:bg-white/[0.1]"
                          >
                            打开项目管理
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div
                className={`${workspaceLayerClass('production')} bg-[var(--bg-panel)]`}
                aria-hidden={activeWorkspacePage !== 'production'}
              >
                {activeWorkspacePage === 'production' && <ProductionBoard embedded />}
              </div>

              <div
                className={`${workspaceLayerClass('dubbing')} bg-[var(--bg-panel)]`}
                aria-hidden={activeWorkspacePage !== 'dubbing'}
              >
                {activeWorkspacePage === 'dubbing' && (
                  <FeatureErrorBoundary name="OverseasDubbingPanel">
                    <OverseasDubbingPanel />
                  </FeatureErrorBoundary>
                )}
              </div>
            </div>
          </div>

          <div className="absolute right-6 top-1/2 z-[100000] flex -translate-y-1/2 flex-col items-center gap-1 rounded-[22px] border border-white/10 bg-[#536d49]/72 p-1.5 shadow-2xl backdrop-blur-md">
            {workspaceNavItems.map(({ page, label, icon: Icon, onboarding }) => (
              <button
                key={page}
                type="button"
                aria-label={`Switch to ${label}`}
                title={label}
                onClick={() => setActiveWorkspacePage(page as any)}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                  activeWorkspacePage === page
                    ? 'bg-white/20 text-white shadow-inner'
                    : 'text-white/68 hover:bg-white/12 hover:text-white'
                }`}
                data-onboarding={onboarding}
              >
                <Icon size={18} strokeWidth={1.9} />
              </button>
            ))}
          </div>

          {/* Chat Feature */}
          <FeatureErrorBoundary name="ChatFeature">
            <ChatFeature
              ref={chatFeatureRef}
              theme={theme}
              apiConfigs={apiConfigs}
              apiConfigsMap={apiConfigsMap}
              globalApiKey={resolvedChatApiKey}
              globalApiUrl={resolvedChatApiUrl}
            />
          </FeatureErrorBoundary>

          {/* Context Menus */}
          <ContextMenuManager
            theme={theme}
            contextMenu={contextMenu}
            setContextMenu={setContextMenu}
            addNode={addNode}
            historyContextMenu={historyContextMenu}
            sendHistoryToChat={sendHistoryToChat}
            sendHistoryToCanvas={sendHistoryToCanvas}
            setNodes={setNodes}
            setHistoryContextMenu={setHistoryContextMenu}
            applyHistoryToSelectedNode={applyHistoryToSelectedNode}
            activeShot={useAppStore.getState().activeShot}
            updateShot={() => {}}
            handleSplitGridFromUrl={handleSplitGridFromUrl}
            frameContextMenu={frameContextMenu}
            sendFrameToChat={sendFrameToChat}
            sendFrameToCanvas={sendFrameToCanvas}
            applyFrameToSelectedNode={applyFrameToSelectedNode}
            selectedNodeIdsRef={selectedNodeIdsRef}
            selectedNodeId={selectedNodeId}
            inputImageContextMenu={inputImageContextMenu}
            closeInputImageContextMenu={closeInputImageContextMenu}
            sendInputImageToChat={sendInputImageToChat}
            nodesMap={nodesMap}
            nodeContextMenu={nodeContextMenu}
            setNodeContextMenu={setNodeContextMenu}
            deleteNode={deleteNode}
          />

          {/* Settings Feature (Modals) */}
          <FeatureErrorBoundary name="SettingsFeature">
            <SettingsFeature
              theme={theme}
              apiConfigs={apiConfigs}
              setApiConfigs={setApiConfigs}
              settingsOpen={settingsOpen}
              setSettingsOpen={setSettingsOpen}
              chatApiKey={resolvedChatApiKey}
              imageApiKey={resolvedImageApiKey}
              videoApiKey={resolvedVideoApiKey}
              jimengSessionId={jimengSessionId}
              setJimengSessionId={setJimengSessionId}
              jimengUseLocalFile={jimengUseLocalFile}
              setJimengUseLocalFile={setJimengUseLocalFile}
              apiConfigsMap={apiConfigsMap}
              globalApiKey={globalApiKey}
              batchModalOpen={batchModalOpen}
              setBatchModalOpen={setBatchModalOpen}
              batchSelectedIds={batchSelectedIds}
              setBatchSelectedIds={setBatchSelectedIds}
              addNode={addNode}
              isVideoUrl={isVideoUrl}
              screenToWorld={screenToWorld}
              handleSplitGridFromUrl={handleSplitGridFromUrl}
              projectListOpen={projectListOpen}
              setProjectListOpen={setProjectListOpen}
              projects={projects}
              handleLoadFromHistory={handleLoadFromHistory}
              handleDeleteHistoryProject={handleDeleteHistoryProject}
              handleSaveAndCreateNew={handleSaveAndCreateNew}
              createCharacterOpen={characterLibraryResult.createCharacterOpen}
              setCreateCharacterOpen={characterLibraryResult.setCreateCharacterOpen}
              createCharacterVideoSourceType={characterLibraryResult.createCharacterVideoSourceType}
              setCreateCharacterVideoSourceType={
                characterLibraryResult.setCreateCharacterVideoSourceType
              }
              createCharacterVideoUrl={characterLibraryResult.createCharacterVideoUrl}
              setCreateCharacterVideoUrl={characterLibraryResult.setCreateCharacterVideoUrl}
              createCharacterSelectedTaskId={characterLibraryResult.createCharacterSelectedTaskId}
              setCreateCharacterSelectedTaskId={
                characterLibraryResult.setCreateCharacterSelectedTaskId
              }
              createCharacterHistoryDropdownOpen={
                characterLibraryResult.createCharacterHistoryDropdownOpen
              }
              setCreateCharacterHistoryDropdownOpen={
                characterLibraryResult.setCreateCharacterHistoryDropdownOpen
              }
              createCharacterStartSecond={characterLibraryResult.createCharacterStartSecond}
              setCreateCharacterStartSecond={characterLibraryResult.setCreateCharacterStartSecond}
              createCharacterEndSecond={characterLibraryResult.createCharacterEndSecond}
              setCreateCharacterEndSecond={characterLibraryResult.setCreateCharacterEndSecond}
              createCharacterEndpoint={characterLibraryResult.createCharacterEndpoint}
              setCreateCharacterEndpoint={characterLibraryResult.setCreateCharacterEndpoint}
              createCharacterSubmitting={characterLibraryResult.createCharacterSubmitting}
              setCreateCharacterSubmitting={characterLibraryResult.setCreateCharacterSubmitting}
              createCharacterVideoError={characterLibraryResult.createCharacterVideoError}
              setCreateCharacterVideoError={characterLibraryResult.setCreateCharacterVideoError}
              createCharacter={characterLibraryResult.createCharacter}
            />
          </FeatureErrorBoundary>

          {activeWorkspacePage !== 'assistant' && <UpdaterDialog />}
          <UpdateAnnouncement />
          {activeWorkspacePage === 'assistant' && <WelcomeScreen />}
          <MonitorPanel open={monitorOpen} onClose={() => setMonitorOpen(false)} />
          <SkillPanel />
          <FavoriteLibraryPanel />
          <KanbanPanel />
          {cloudAssetsOpen && <CloudAssetsPanel onClose={() => setCloudAssetsOpen(false)} />}
          {directorStageOpen && (
            <Suspense
              fallback={
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90">
                  <div className="animate-pulse text-sm text-white">加载 3D 引擎中...</div>
                </div>
              }
            >
              <Director3DModal
                nodeId={GLOBAL_DIRECTOR_STAGE_ID}
                onClose={() => setDirectorStageOpen(false)}
                onSnapshotSaved={() => {}}
              />
            </Suspense>
          )}
        </div>
      </div>

      {/* Sprint 2-4 闂佸搫鍊规竟鍡欏垝瀹ュ棛顩?*/}
      <ProjectGallery
        projects={projects}
        setProjects={setProjects}
        handleDeleteHistoryProject={handleDeleteHistoryProject}
      />
      {!legalConsentAccepted && (
        <div className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[560px] rounded-lg border border-white/12 bg-[#171b22] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">用户协议、隐私提示与内容权属说明</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-white/72">
              <p>
                使用星河智绘前，请确认您已阅读并同意用户许可协议与隐私提示。软件会在本机保存项目、缓存、日志和诊断信息；使用云端协作、账号登录、素材上传或第三方模型服务时，相关数据可能按您的操作发送至对应服务。
              </p>
              <p>
                在遵守法律法规、本协议及第三方服务条款的前提下，您通过星河智绘输入、上传、编辑、生成、导出或保存的项目、素材和作品，其依法可享有的权益由您或相应权利人享有；星河智绘不会因提供软件功能而主张取得您生成内容的所有权。
              </p>
              <p>
                更新维护过程中，软件可能关闭运行中的相关进程、释放文件锁、刷新缓存或重新注册系统协议，以保证覆盖安装和数据迁移稳定完成。
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() =>
                  window.api?.invoke?.('system:open-external', 'https://www.lingjingxinghe.cn/')
                }
                className="rounded-md border border-white/12 px-4 py-2 text-sm text-white/78 hover:bg-white/8"
              >
                查看官网
              </button>
              <button
                type="button"
                onClick={acceptLegalConsent}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                我已阅读并同意
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

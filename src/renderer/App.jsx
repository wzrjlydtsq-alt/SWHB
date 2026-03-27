/**
 * 星河智绘 (Xinghe Zhihui)
 * Copyright (c) 2025-2026 成都灵境星河动漫科技有限公司
 * 开发者: 郭瑞凡 (Guo Ruifan)
 * All rights reserved.
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'

import { useAppStore } from './store/useAppStore.js'
import { useShallow } from 'zustand/react/shallow'
import { useAppInit } from './hooks/useAppInit.js'

// --- Feature 组件 ---
import { CanvasFeature } from './features/canvas/CanvasFeature.jsx'
import { GenerationFeature } from './features/generation/GenerationFeature.jsx'
import { HistoryFeature } from './features/history/HistoryFeature.jsx'
import { ChatFeature } from './features/chat/ChatFeature.jsx'
import { SettingsFeature } from './features/settings/SettingsFeature.jsx'

// --- UI 组件 ---
import { ArtisticProgress } from './components/ui/ArtisticProgress.jsx'

import { Sidebar } from './components/ui/Sidebar.jsx'
import { WelcomeScreen } from './components/ui/WelcomeScreen.jsx'
import { UpdaterDialog } from './components/ui/UpdaterDialog.jsx'
import { ContextMenuManager } from './components/ui/ContextMenuManager.jsx'
import { MonitorPanel } from './components/ui/MonitorPanel.jsx'
import { AssetLibrary } from './components/ui/AssetLibrary.jsx'

// --- Hooks ---
import { useNodesState } from './hooks/useNodesState.js'
import { useProjectFile } from './hooks/useProjectFile.js'
import { useCharacterLibrary } from './hooks/useCharacterLibrary.js'
import { useMenuManager } from './hooks/useMenuManager.js'
import { useContextMenuActions } from './hooks/useContextMenuActions.js'
import { useLocalCacheManager } from './hooks/useLocalCacheManager.js'
import { useAppShortcuts } from './hooks/useAppShortcuts.js'
import { useMediaHandlers } from './hooks/useMediaHandlers.js'

// --- Utils ---
import { DEFAULT_BASE_URL } from './utils/constants.js'
import { isVideoUrl } from './utils/projectUtils.js'

function App() {
  // ========== 初始化（从 useAppInit hook 执行） ==========
  useAppInit()

  // ========== Store 状态（UI 级别） ==========
  const {
    theme,
    projectName,
    setProjectName,
    apiConfigs,
    setApiConfigs,
    chatApiKey,
    chatApiUrl,
    imageApiKey,
    imageApiUrl,
    videoApiKey,
    videoApiUrl,
    jimengSessionId,
    setJimengSessionId,
    history,
    setHistory,
    jimengUseLocalFile,
    setJimengUseLocalFile,
    historyPerformanceMode,
    edges,
    setEdges,
    setNodes,
    connections,
    setConnections,
    setView,
    initializeConfigs,
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    setSelectedNodeIds,
    settingsOpen,
    setSettingsOpen,
    historyOpen,
    setHistoryOpen,
    localCacheSettingsOpen,
    setLocalCacheSettingsOpen,
    batchSelectedIds,
    setBatchSelectedIds,
    batchModalOpen,
    setBatchModalOpen,
    activeDropdown,
    setActiveDropdown,
    projectListOpen,
    setProjectListOpen
  } = useAppStore(
    useShallow((state) => ({
      theme: state.theme,
      projectName: state.projectName,
      setProjectName: state.setProjectName,
      apiConfigs: state.apiConfigs,
      setApiConfigs: state.setApiConfigs,
      chatApiKey: state.chatApiKey,
      chatApiUrl: state.chatApiUrl,
      imageApiKey: state.imageApiKey,
      imageApiUrl: state.imageApiUrl,
      videoApiKey: state.videoApiKey,
      videoApiUrl: state.videoApiUrl,
      jimengSessionId: state.jimengSessionId,
      setJimengSessionId: state.setJimengSessionId,
      history: state.history,
      setHistory: state.setHistory,
      characterLibrary: state.characterLibrary,
      jimengUseLocalFile: state.jimengUseLocalFile,
      setJimengUseLocalFile: state.setJimengUseLocalFile,
      historyPerformanceMode: state.historyPerformanceMode,
      edges: state.edges,
      setEdges: state.setEdges,
      setNodes: state.setNodes,
      connections: state.connections,
      setConnections: state.setConnections,
      setView: state.setView,
      initializeConfigs: state.initializeConfigs,
      selectedNodeId: state.selectedNodeId,
      setSelectedNodeId: state.setSelectedNodeId,
      selectedNodeIds: state.selectedNodeIds,
      setSelectedNodeIds: state.setSelectedNodeIds,
      settingsOpen: state.settingsOpen,
      setSettingsOpen: state.setSettingsOpen,
      historyOpen: state.historyOpen,
      setHistoryOpen: state.setHistoryOpen,
      localCacheSettingsOpen: state.localCacheSettingsOpen,
      setLocalCacheSettingsOpen: state.setLocalCacheSettingsOpen,
      batchSelectedIds: state.batchSelectedIds,
      setBatchSelectedIds: state.setBatchSelectedIds,
      batchModalOpen: state.batchModalOpen,
      setBatchModalOpen: state.setBatchModalOpen,
      activeDropdown: state.activeDropdown,
      setActiveDropdown: state.setActiveDropdown,
      projectListOpen: state.projectListOpen,
      setProjectListOpen: state.setProjectListOpen
    }))
  )

  // 初始化配置
  useEffect(() => {
    initializeConfigs()
  }, [initializeConfigs])

  // nodes：自定义相等性 — 仅位置变化时跳过重渲染
  const nodes = useAppStore(
    (state) => state.nodes,
    (a, b) => {
      if (a === b) return true
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue
        if (
          a[i].id !== b[i].id ||
          a[i].type !== b[i].type ||
          a[i].content !== b[i].content ||
          a[i].width !== b[i].width ||
          a[i].height !== b[i].height ||
          a[i].settings !== b[i].settings ||
          a[i].frames !== b[i].frames ||
          a[i].selectedKeyframes !== b[i].selectedKeyframes ||
          a[i].videoMeta !== b[i].videoMeta
        ) {
          return false
        }
      }
      return true
    }
  )

  // view：惰性读取
  const view = useAppStore.getState().view

  // 应用主题样式
  useEffect(() => {
    document.documentElement.classList.add('theme-dark')
  }, [])

  // ========== 节点 & 连接状态 ==========
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
    handleVideoFileUpload
  } = useNodesState(apiConfigs)

  // ========== Refs ==========
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 })
  const canvasRef = useRef(null)
  const copiedNodesRef = useRef(null)
  const nodesRef = useRef(nodes)
  const selectedNodeIdRef = useRef(selectedNodeId)
  const selectedNodeIdsRef = useRef(selectedNodeIds)
  const connectionsRef = useRef(connections)

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    nodesRef.current = nodes
    selectedNodeIdRef.current = selectedNodeId
    selectedNodeIdsRef.current = selectedNodeIds
    connectionsRef.current = connections
  }, [nodes, selectedNodeId, selectedNodeIds, connections])

  // 同步 viewRef
  viewRef.current = view

  // ========== 进度状态 ==========
  const [progressState, setProgressState] = useState({
    visible: false,
    progress: 0,
    status: '',
    type: 'import'
  })

  // ========== 监控面板状态 ==========
  const [monitorOpen, setMonitorOpen] = useState(false)

  // ========== 全局亮度调节 ==========
  const [brightness, setBrightness] = useState(100)
  const [showBrightness, setShowBrightness] = useState(false)

  // ========== Memoized Maps ==========
  const apiConfigsMap = useMemo(() => {
    const map = new Map()
    ;(Array.isArray(apiConfigs) ? apiConfigs : []).forEach((config) => map.set(config.id, config))
    return map
  }, [apiConfigs])

  const historyMap = useMemo(() => {
    const map = new Map()
    ;(history || []).forEach((item) => map.set(item.id, item))
    return map
  }, [history])

  // ========== Character Library ==========
  const characterLibraryResult = useCharacterLibrary({
    apiConfigs,
    videoApiKey,
    videoApiUrl,
    DEFAULT_BASE_URL
  })

  const {
    setCharactersOpen,
    createCharacterOpen,
    setCreateCharacterOpen,
    createCharacterVideoSourceType,
    setCreateCharacterVideoSourceType,
    createCharacterVideoUrl,
    setCreateCharacterVideoUrl,
    createCharacterSelectedTaskId,
    setCreateCharacterSelectedTaskId,
    createCharacterHistoryDropdownOpen,
    setCreateCharacterHistoryDropdownOpen,
    createCharacterStartSecond,
    setCreateCharacterStartSecond,
    createCharacterEndSecond,
    setCreateCharacterEndSecond,
    createCharacterEndpoint,
    setCreateCharacterEndpoint,
    createCharacterSubmitting,
    setCreateCharacterSubmitting,
    createCharacterVideoError,
    setCreateCharacterVideoError,
    characterReferenceBarExpanded,
    setCharacterReferenceBarExpanded,
    createCharacter
  } = characterLibraryResult

  // ========== Project File ==========
  const chatFeatureRef = useRef(null)
  const projectFileResult = useProjectFile({
    nodes,
    setNodes,
    connections,
    setConnections,
    view,
    setView,
    projectName,
    setProjectName,
    setHistory,
    setChatSessions: (sessions) => {
      if (chatFeatureRef.current?.setChatSessions) {
        chatFeatureRef.current.setChatSessions(sessions)
      }
    },
    setProgressState
  })

  const {
    projects,
    setProjects,
    loadFromDatabase,
    handleSaveToHistory,
    handleLoadFromHistory,
    handleDeleteHistoryProject,
    handleSaveAndCreateNew
  } = projectFileResult

  // 启动时自动从 SQLite 恢复节点（当 currentProject 可用时）
  const currentProject = useAppStore((s) => s.currentProject)
  useEffect(() => {
    if (currentProject?.id) {
      loadFromDatabase().then(() => {
        console.log(`[App] 自动恢复项目节点: ${currentProject.id}`)
      })
    }
  }, [currentProject?.id, loadFromDatabase])

  // ========== Menu Manager ==========
  const {
    contextMenu,
    setContextMenu,
    historyContextMenu,
    setHistoryContextMenu,
    nodeContextMenu,
    setNodeContextMenu,
    frameContextMenu,
    setFrameContextMenu,
    inputImageContextMenu,
    closeInputImageContextMenu
  } = useMenuManager()

  // ========== screenToWorld ==========
  const screenToWorld = useCallback(
    (screenX, screenY) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      const currentView = viewRef.current || view
      const zoom = currentView.zoom || 1
      const panX = currentView.x || 0
      const panY = currentView.y || 0
      return {
        x: (screenX - rect.left - panX) / zoom,
        y: (screenY - rect.top - panY) / zoom
      }
    },
    [view.zoom, view.x, view.y]
  )

  // ========== Context Menu Actions ==========
  const {
    sendFrameToChat,
    sendFrameToCanvas,
    applyFrameToSelectedNode,
    applyHistoryToSelectedNode,
    sendHistoryToCanvas,
    sendHistoryToChat,
    sendInputImageToChat
  } = useContextMenuActions({
    setFrameContextMenu,
    frameContextMenu,
    setChatFiles: (files) => {
      if (chatFeatureRef.current?.setChatFiles) {
        chatFeatureRef.current.setChatFiles(files)
      }
    },
    setIsChatOpen: (open) => {
      if (chatFeatureRef.current?.setIsChatOpen) {
        chatFeatureRef.current.setIsChatOpen(open)
      }
    },
    screenToWorld,
    addNode,
    selectedNodeId,
    nodesMap,
    setNodes,
    historyContextMenu,
    setHistoryContextMenu,
    isVideoUrl,
    inputImageContextMenu,
    closeInputImageContextMenu
  })

  // ========== Local Cache Manager ==========
  const {
    localCacheServerConnected,
    localServerConfig,
    setLocalServerConfig,
    updateLocalServerConfig
  } = useLocalCacheManager()

  // ========== Media Handlers ==========
  const {
    handleFileUpload,
    handleAudioFileUpload,
    handleSplitGridFromUrl,
    handleAutoExtractKeyframes,
    handleSmartExtractKeyframes
  } = useMediaHandlers({
    setNodes,
    nodesMap,
    selectedNodeIdsRef,
    screenToWorld
  })

  // ========== App Shortcuts ==========
  useAppShortcuts({
    nodesRef,
    selectedNodeIdRef,
    selectedNodeIdsRef,
    connectionsRef,
    copiedNodesRef,
    canvasRef,
    setNodes,
    setConnections,
    view,
    handleSaveToHistory
  })

  // ========== 性能标记 ==========
  const isPerfMode = nodes.length > 50

  // ========== Canvas DragOver handler ==========
  // 注意：只调用 preventDefault 防止浏览器默认打开文件，不能 stopPropagation
  // 否则会拦截资产库面板的外部文件拖入事件
  const handleCanvasDragOver = useCallback((e) => {
    e.preventDefault()
  }, [])

  // 全局 drop 防默认（阻止浏览器直接打开拖入的文件），不拦截冒泡
  const handleGlobalDrop = useCallback((e) => {
    e.preventDefault()
  }, [])

  return (
    <>
      {/* 极简艺术进度条 */}
      <ArtisticProgress
        visible={progressState.visible}
        progress={progressState.progress}
        status={progressState.status}
        type={progressState.type}
      />
      <div
        className={`w-full h-screen font-sans overflow-hidden select-none flex flex-col transition-colors duration-300 bg-transparent text-white ${isPerfMode ? 'perf-mode' : ''}`}
        onDragOver={handleCanvasDragOver}
        onDrop={handleGlobalDrop}
        onClick={() => {
          if (historyContextMenu.visible)
            setHistoryContextMenu((prev) => ({ ...prev, visible: false }))
          if (frameContextMenu.visible) setFrameContextMenu((prev) => ({ ...prev, visible: false }))
        }}
      >
        {/* Top Bar */}

        <div
          className="flex-1 relative overflow-hidden flex transition-colors duration-300 bg-transparent"
          style={brightness !== 100 ? { filter: `brightness(${brightness / 100})` } : undefined}
        >
          {/* 资产库面板 */}
          <AssetLibrary />

          {/* Sidebar */}
          <Sidebar
            monitorOpen={monitorOpen}
            setMonitorOpen={setMonitorOpen}
            chatFeatureRef={chatFeatureRef}
          />

          {/* Generation Feature (隐藏，仅提供逻辑) */}
          <GenerationFeature
            nodes={nodes}
            setNodes={setNodes}
            connections={connections}
            nodesMap={nodesMap}
            setHistory={setHistory}
            historyMap={historyMap}
            apiConfigsMap={apiConfigsMap}
            setSettingsOpen={setSettingsOpen}
            chatApiKey={chatApiKey}
            chatApiUrl={chatApiUrl}
            imageApiKey={imageApiKey}
            imageApiUrl={imageApiUrl}
            videoApiKey={videoApiKey}
            videoApiUrl={videoApiUrl}
            history={history}
            edges={edges}
            setEdges={setEdges}
            updateNodeSettings={updateNodeSettings}
            connectionsRef={connectionsRef}
            setConnections={setConnections}
            view={view}
            selectedNodeId={selectedNodeId}
          />

          {/* History Feature */}
          <HistoryFeature
            theme={theme}
            historyOpen={historyOpen}
            setHistoryOpen={setHistoryOpen}
            historyPerformanceMode={historyPerformanceMode}
            localCacheServerConnected={localCacheServerConnected}
            localCacheSettingsOpen={localCacheSettingsOpen}
            setLocalCacheSettingsOpen={setLocalCacheSettingsOpen}
            localServerConfig={localServerConfig}
            setLocalServerConfig={setLocalServerConfig}
            updateLocalServerConfig={updateLocalServerConfig}
            setBatchModalOpen={setBatchModalOpen}
            setBatchSelectedIds={setBatchSelectedIds}
            history={history}
            setHistory={setHistory}
            screenToWorld={screenToWorld}
            setHistoryContextMenu={setHistoryContextMenu}
            historyContextMenu={historyContextMenu}
            nodes={nodes}
            setNodes={setNodes}
            setEdges={setEdges}
            setConnections={setConnections}
            view={view}
          />

          {/* Canvas Feature (Main Area) */}
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
            history={history}
            setHistory={setHistory}
            activeDropdown={activeDropdown}
            characterReferenceBarExpanded={characterReferenceBarExpanded}
            setCharacterReferenceBarExpanded={setCharacterReferenceBarExpanded}
            setCharactersOpen={setCharactersOpen}
            historyMap={historyMap}
            setResizingNodeId={useAppStore.getState().setResizingNodeId}
            chatFeatureRef={chatFeatureRef}
          />

          {/* Chat Feature (侧边栏) */}
          <ChatFeature
            ref={chatFeatureRef}
            theme={theme}
            apiConfigs={apiConfigs}
            apiConfigsMap={apiConfigsMap}
            globalApiKey={chatApiKey}
          />

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
          <SettingsFeature
            theme={theme}
            apiConfigs={apiConfigs}
            setApiConfigs={setApiConfigs}
            settingsOpen={settingsOpen}
            setSettingsOpen={setSettingsOpen}
            chatApiKey={chatApiKey}
            imageApiKey={imageApiKey}
            videoApiKey={videoApiKey}
            jimengSessionId={jimengSessionId}
            setJimengSessionId={setJimengSessionId}
            jimengUseLocalFile={jimengUseLocalFile}
            setJimengUseLocalFile={setJimengUseLocalFile}
            apiConfigsMap={apiConfigsMap}
            globalApiKey={chatApiKey}
            batchModalOpen={batchModalOpen}
            setBatchModalOpen={setBatchModalOpen}
            batchSelectedIds={batchSelectedIds}
            setBatchSelectedIds={setBatchSelectedIds}
            history={history}
            setHistory={setHistory}
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
            createCharacterOpen={createCharacterOpen}
            setCreateCharacterOpen={setCreateCharacterOpen}
            createCharacterVideoSourceType={createCharacterVideoSourceType}
            setCreateCharacterVideoSourceType={setCreateCharacterVideoSourceType}
            createCharacterVideoUrl={createCharacterVideoUrl}
            setCreateCharacterVideoUrl={setCreateCharacterVideoUrl}
            createCharacterSelectedTaskId={createCharacterSelectedTaskId}
            setCreateCharacterSelectedTaskId={setCreateCharacterSelectedTaskId}
            createCharacterHistoryDropdownOpen={createCharacterHistoryDropdownOpen}
            setCreateCharacterHistoryDropdownOpen={setCreateCharacterHistoryDropdownOpen}
            createCharacterStartSecond={createCharacterStartSecond}
            setCreateCharacterStartSecond={setCreateCharacterStartSecond}
            createCharacterEndSecond={createCharacterEndSecond}
            setCreateCharacterEndSecond={setCreateCharacterEndSecond}
            createCharacterEndpoint={createCharacterEndpoint}
            setCreateCharacterEndpoint={setCreateCharacterEndpoint}
            createCharacterSubmitting={createCharacterSubmitting}
            setCreateCharacterSubmitting={setCreateCharacterSubmitting}
            createCharacterVideoError={createCharacterVideoError}
            setCreateCharacterVideoError={setCreateCharacterVideoError}
            createCharacter={createCharacter}
            historyMap={historyMap}
          />
          <WelcomeScreen
            projects={projects}
            setProjects={setProjects}
            handleDeleteHistoryProject={handleDeleteHistoryProject}
          />
          <UpdaterDialog />
          <MonitorPanel open={monitorOpen} onClose={() => setMonitorOpen(false)} />

          {/* 全局亮度调节器（固定在左下角项目栏上方） */}
          {!historyOpen && !projectListOpen && (
            <div className="fixed bottom-[60px] left-4 z-50 flex flex-col items-center gap-1.5">
              <button
                onClick={() => setShowBrightness(!showBrightness)}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm transition-all duration-200 border ${
                  showBrightness
                    ? 'bg-[var(--primary-color)] text-white border-[var(--primary-color)] shadow-lg scale-110'
                    : 'bg-[var(--bg-panel)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-yellow-400 hover:border-yellow-400/50'
                }`}
                title="全局亮度"
              >
                ☀️
              </button>
              {showBrightness && (
                <div className="flex flex-col items-center gap-1.5 px-1.5 py-3 rounded-full bg-[var(--bg-panel)] border border-[var(--border-color)] shadow-lg">
                  <span className="text-[10px]">☀️</span>
                  <input
                    type="range"
                    min="30"
                    max="150"
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="h-24 accent-[var(--primary-color)] cursor-pointer"
                    title={`亮度: ${brightness}%`}
                    style={{
                      writingMode: 'vertical-lr',
                      direction: 'rtl',
                      WebkitAppearance: 'slider-vertical',
                      width: '16px'
                    }}
                  />
                  <span className="text-[10px]">🌙</span>
                  <span className="text-[9px] font-mono text-[var(--text-secondary)]">
                    {brightness}%
                  </span>
                  {brightness !== 100 && (
                    <button
                      onClick={() => setBrightness(100)}
                      className="text-[10px] text-[var(--text-muted)] hover:text-[var(--primary-color)] transition-colors"
                      title="重置亮度"
                    >
                      ↺
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default App

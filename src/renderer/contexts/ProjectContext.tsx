import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useProjectFile } from '../hooks/useProjectFile.ts'
import { useAppStore } from '../store/useAppStore.ts'

const ProjectContext = createContext(null)

export function ProjectProvider({ children }) {
  const setNodes = useAppStore((s) => s.setNodes)
  const connections = useAppStore((s) => s.connections)
  const setConnections = useAppStore((s) => s.setConnections)
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const projectName = useAppStore((s) => s.projectName)
  const setProjectName = useAppStore((s) => s.setProjectName)
  const setHistory = useAppStore((s) => s.setHistory)
  const setCharacterLibrary = useAppStore((s) => s.setCharacterLibrary)
  const currentProject = useAppStore((s) => s.currentProject)

  const nodes = (useAppStore as any)(
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

  const [progressState, setProgressState] = useState({
    visible: false,
    progress: 0,
    status: '',
    type: 'import'
  })

  const chatFeatureRef = useRef(null)
  const latestLoadFromDatabaseRef = useRef(null)
  const restoredProjectIdRef = useRef(null)

  const projectFileResult = useProjectFile({
    nodes: nodes as any,
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
    setCharacterLibrary,
    setProgressState
  })

  const {
    projects,
    setProjects,
    loadFromDatabase,
    handleSaveToHistory,
    handleLoadFromHistory,
    handleDeleteHistoryProject,
    handleSaveAndCreateNew,
    handleSaveProject,
    handleLoadProject
  } = projectFileResult

  useEffect(() => {
    latestLoadFromDatabaseRef.current = loadFromDatabase
  }, [loadFromDatabase])

  useEffect(() => {
    const projectId = currentProject?.id
    if (!projectId || restoredProjectIdRef.current === projectId) return

    restoredProjectIdRef.current = projectId
    latestLoadFromDatabaseRef.current?.().then(() => {
      console.log(`[ProjectProvider] auto restored project: ${projectId}`)
    })
  }, [currentProject?.id])

  const value = useMemo(
    () => ({
      projects,
      setProjects,
      loadFromDatabase,
      handleSaveToHistory,
      handleLoadFromHistory,
      handleDeleteHistoryProject,
      handleSaveAndCreateNew,
      handleSaveProject,
      handleLoadProject,
      progressState,
      setProgressState,
      chatFeatureRef
    }),
    [
      projects,
      setProjects,
      loadFromDatabase,
      handleSaveToHistory,
      handleLoadFromHistory,
      handleDeleteHistoryProject,
      handleSaveAndCreateNew,
      handleSaveProject,
      handleLoadProject,
      progressState
    ]
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProjectContext() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProjectContext must be used within ProjectProvider')
  return ctx
}

export function useOptionalProjectContext() {
  return useContext(ProjectContext)
}

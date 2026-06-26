import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../store/useAppStore.ts'

import {
  getCSTTimestamp,
  getCSTFilenameTimestamp,
  getBase64FromUrl,
  isVideoUrl
} from '../utils/projectUtils.ts'
import { getSettingJSON, setSettingJSON, setSetting, waitForInit } from '../services/dbService.ts'
import {
  sanitizeHistoryForSave,
  sanitizePersistentValue
} from '../store/slices/createHistorySlice.ts'

/**
 * 管理项目的保存、加载、导入导出及历史记录。
 * v4: 基于 JSON 文件持久化（每个项目一个 .json 文件）
 */
import { apiClient } from '../services/apiClient.ts'
import { registerManagedBlobUrl } from '../utils/blobUrlRegistry.ts'

function restoreProductionBoardSnapshot(snapshot: any) {
  const pb = snapshot && typeof snapshot === 'object' ? snapshot : {}
  const s = useAppStore.getState()
  s.setProductionBoardRows(Array.isArray(pb.rows) ? pb.rows : null)
  s.setProductionBoardCommonValues(pb.commonValues || null)
  s.setProductionBoardMode(pb.mode === 'image' ? 'image' : 'video')
  s.setProductionBoardVideoRows(Array.isArray(pb.videoRows) ? pb.videoRows : null)
  s.setProductionBoardVideoCommonValues(pb.videoCommonValues || null)
  s.setProductionBoardImageRows(Array.isArray(pb.imageRows) ? pb.imageRows : null)
  s.setProductionBoardImageCommonValues(pb.imageCommonValues || null)
  s.setProductionBoardSharedRefs(pb.sharedRefs || null)
}

function sanitizeNodesForProjectSave(nodes: any[] = []) {
  return (nodes || []).map((node) => ({
    ...node,
    data: node?.data,
    content: sanitizePersistentValue(node?.content),
    settings: {
      ...(node?.settings || {}),
      outputResults: sanitizePersistentValue(node?.settings?.outputResults || [])
    }
  }))
}

export const useProjectFile = ({
  nodes,
  setNodes,
  connections,
  setConnections,
  view,
  setView,
  projectName,
  setProjectName,
  setHistory,
  setChatSessions,
  setCharacterLibrary,
  setProgressState
}) => {
  const autoSaveInterval = useAppStore((state) => state.autoSaveInterval)
  const currentProject = useAppStore((state) => state.currentProject)

  // 项目列表状态
  const [projects, setProjects] = useState([])
  const [projectsReady, setProjectsReady] = useState(false)
  const blankCanvasRecoveryRef = useRef(new Set<string>())
  const projectLoadSeqRef = useRef(0)

  // 启动时从文件系统扫描项目列表
  useEffect(() => {
    const loadProjects = async () => {
      try {
        // 优先使用 JSON 文件系统
        if (window.api?.projectFileAPI?.list) {
          const fileProjects = await window.api.projectFileAPI.list()
          if (Array.isArray(fileProjects) && fileProjects.length > 0) {
            setProjects(fileProjects)
            console.log(`[useProjectFile] 从文件系统加载项目列表: ${fileProjects.length} 个`)
            setProjectsReady(true)
            return
          }
        }

        // 回退：从 dbService 加载（兼容旧数据）
        await waitForInit()
        const loaded = getSettingJSON('tapnow_projects', [])
        if (Array.isArray(loaded) && loaded.length > 0) {
          setProjects(loaded)
          console.log(`[useProjectFile] 从 SQLite 加载旧项目列表: ${loaded.length} 个`)
        }
        setProjectsReady(true)
      } catch (err) {
        console.error('[useProjectFile] 加载项目列表失败:', err)
        setProjectsReady(true)
      }
    }
    loadProjects()
  }, [])

  // ========== 构建保存数据的辅助函数 ==========
  const buildProjectData = useCallback((): any => {
    const storeState = useAppStore.getState()
    const projId = storeState.currentProject?.id

    // 从 localStorage 读取资产库数据
    let assetLibraryData = null
    try {
      const assetKey = projId ? `tapnow_asset_library_${projId}` : 'tapnow_asset_library'
      const raw = localStorage.getItem(assetKey)
      if (raw) assetLibraryData = JSON.parse(raw)
    } catch {
      /* ignore */
    }

    return {
      schemaVersion: '2.0.25',
      name: storeState.projectName || '未命名项目',
      folderId: storeState.currentProject?.folderId || null,
      createdAt: storeState.currentProject?.createdAt || new Date().toISOString(),
      cloudSync: storeState.currentProject?.cloudSync || false,
      cloudType: storeState.currentProject?.cloudType || null,
      cloudProjectId: storeState.currentProject?.cloudProjectId || null,
      cloudProjectTitle: storeState.currentProject?.cloudProjectTitle || null,
      cloudEpisodeId: storeState.currentProject?.cloudEpisodeId || null,
      cloudEpisodeNumber: storeState.currentProject?.cloudEpisodeNumber || null,
      cloudEpisodeStatus: storeState.currentProject?.cloudEpisodeStatus || null,
      cloudAssignmentId: storeState.currentProject?.cloudAssignmentId || null,
      cloudAssignmentTitle: storeState.currentProject?.cloudAssignmentTitle || null,
      cloudAssignmentStatus: storeState.currentProject?.cloudAssignmentStatus || null,
      cloudReviewStatus: storeState.currentProject?.cloudReviewStatus || null,
      cloudTeamId: storeState.currentProject?.cloudTeamId || null,
      cloudRole: storeState.currentProject?.cloudRole || null,
      cacheRoot: storeState.currentProject?.cacheRoot || null,
      view: storeState.view,
      nodes: sanitizeNodesForProjectSave(storeState.nodes || []),
      nodeGroups: storeState.nodeGroups || [],
      connections: storeState.connections,
      history: sanitizeHistoryForSave(storeState.history || []),
      assetLibrary: assetLibraryData,
      productionBoard: {
        rows: storeState.productionBoardRows || [],
        commonValues: storeState.productionBoardCommonValues || null,
        mode: storeState.productionBoardMode || 'video',
        videoRows: storeState.productionBoardVideoRows || null,
        videoCommonValues: storeState.productionBoardVideoCommonValues || null,
        imageRows: storeState.productionBoardImageRows || null,
        imageCommonValues: storeState.productionBoardImageCommonValues || null,
        sharedRefs: storeState.productionBoardSharedRefs || null
      }
    }
  }, [])

  // ========== 自动保存 ==========
  useEffect(() => {
    if (!currentProject || !autoSaveInterval) return

    const timer = setInterval(
      async () => {
        try {
          const projId = currentProject.id
          const data = buildProjectData()

          // 自动保存时截图（用户此时在画布上）
          try {
            if (window.api?.windowAPI?.captureThumbnail) {
              const tb = await window.api.windowAPI.captureThumbnail()
              if (tb) data.thumbnail = `data:image/jpeg;base64,${tb}`
            }
          } catch {
            /* ignore */
          }

          if (window.api?.projectFileAPI?.save) {
            const result = await window.api.projectFileAPI.save(projId, data)
            const savedThumbnail = data.thumbnail || null
            console.log('[自动保存] JSON 完成:', result)
            setProjects((prev) =>
              prev.map((p) =>
                p.id === projId
                  ? {
                      ...p,
                      name: data.name || p.name,
                      cacheRoot: data.cacheRoot || p.cacheRoot || null,
                      updatedAt: new Date().toISOString(),
                      nodesCount: data.nodes.length,
                      thumbnail: savedThumbnail || p.thumbnail || null
                    }
                  : p
              )
            )
          }
        } catch (e) {
          console.error('[自动保存] 失败:', e)
        }
      },
      autoSaveInterval * 60 * 1000
    )

    return () => clearInterval(timer)
  }, [currentProject, autoSaveInterval, buildProjectData])

  // ========== beforeunload 同步保存 ==========
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!currentProject) return
      const projId = currentProject.id
      const data = buildProjectData()

      // 同步 IPC 保存（sendSync）
      if (window.api?.projectFileAPI?.saveSync) {
        try {
          window.api.projectFileAPI.saveSync(projId, data)
          console.log('[beforeunload] 同步保存完成')
        } catch (e) {
          console.error('[beforeunload] 同步保存失败:', e)
        }
      }

      // 同步保存项目元数据到 dbService（兼容）
      const storeState = useAppStore.getState()
      const pName = storeState.projectName
      setProjects((prev) => {
        const idx = prev.findIndex((p) => p.id === currentProject.id)
        if (idx === -1) return prev
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          name: pName || next[idx].name,
          updatedAt: new Date().toISOString()
        }
        return next
      })
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentProject, buildProjectData])

  // ========== 从 JSON 文件加载项目数据 ==========

  const loadFromDatabase = useCallback(async () => {
    const activeProject = useAppStore.getState().currentProject
    if (!activeProject) return
    const loadSeq = ++projectLoadSeqRef.current
    const isStaleLoad = () =>
      projectLoadSeqRef.current !== loadSeq ||
      useAppStore.getState().currentProject?.id !== activeProject.id
    try {
      if (window.api?.projectFileAPI?.load) {
        const projectData = (await window.api.projectFileAPI.load(activeProject.id)) as any
        if (isStaleLoad()) return
        if (projectData) {
          if (projectData.cacheRoot && projectData.cacheRoot !== activeProject.cacheRoot) {
            useAppStore.getState().setCurrentProject({ ...activeProject, cacheRoot: projectData.cacheRoot })
          }
          setNodes(projectData.nodes || [])
          setConnections(projectData.connections || [])
          if (projectData.view) setView(projectData.view)
          if (projectData.name) setProjectName(projectData.name)
          restoreProductionBoardSnapshot(projectData.productionBoard)
          if (Array.isArray(projectData.history)) {
            useAppStore.getState().setHistory(projectData.history)
          }
          // 恢复批量生产板数据
          if (projectData.productionBoard) {
            const pb = projectData.productionBoard as any
            const s = useAppStore.getState()
            if (pb.rows) s.setProductionBoardRows(pb.rows)
            if (pb.commonValues) s.setProductionBoardCommonValues(pb.commonValues)
            if (pb.mode) s.setProductionBoardMode(pb.mode)
            if (pb.videoRows) s.setProductionBoardVideoRows(pb.videoRows)
            if (pb.videoCommonValues) s.setProductionBoardVideoCommonValues(pb.videoCommonValues)
            if (pb.imageRows) s.setProductionBoardImageRows(pb.imageRows)
            if (pb.imageCommonValues) s.setProductionBoardImageCommonValues(pb.imageCommonValues)
            if (pb.sharedRefs) s.setProductionBoardSharedRefs(pb.sharedRefs)
            console.log('[loadFromDatabase] 批量生产板数据已恢复')
          }
          // 恢复资产库数据
          if (projectData.assetLibrary) {
            const assetKey = activeProject.id
              ? `tapnow_asset_library_${activeProject.id}`
              : 'tapnow_asset_library'
            localStorage.setItem(assetKey, JSON.stringify(projectData.assetLibrary))
            window.dispatchEvent(new Event('asset-library-updated'))
            console.log('[loadFromDatabase] 资产库数据已恢复')
          }
          console.log(
            `[loadFromDatabase] JSON 加载完成: ${projectData.nodes?.length || 0} 节点, ${projectData.connections?.length || 0} 连接`
          )
          return
        }
      }

      // 回退：从 SQLite 加载（兼容旧数据）
      let mappedNodes = []
      if (window.dbAPI?.nodes?.list) {
        const dbNodes = await window.dbAPI.nodes.list(activeProject.id)
        if (isStaleLoad()) return
        if (dbNodes && dbNodes.length > 0) {
          mappedNodes = dbNodes.map((dbNode) => {
            let parsedContent = dbNode.content
            try {
              if (
                typeof dbNode.content === 'string' &&
                (dbNode.content.startsWith('{') || dbNode.content.startsWith('['))
              ) {
                parsedContent = JSON.parse(dbNode.content)
              }
            } catch {
              // Ignored
            }
            return {
              ...dbNode,
              content: parsedContent
            }
          })
        }
      }
      setNodes(mappedNodes)

      let loadedConnections = []
      if (window.dbAPI?.connections?.list) {
        const dbConnections = await window.dbAPI.connections.list(activeProject.id)
        if (isStaleLoad()) return
        if (dbConnections && dbConnections.length > 0) {
          loadedConnections = dbConnections
        }
      }
      setConnections(loadedConnections)

      // 加载历史
      if (window.dbAPI?.settings) {
        const historyKey = `tapnow_history_v2_${activeProject.id}`
        const historyJson = await window.dbAPI.settings.get(historyKey)
        if (isStaleLoad()) return
        if (historyJson) {
          try {
            const parsed = JSON.parse(historyJson)
            if (Array.isArray(parsed)) {
              useAppStore.getState().setHistory(parsed)
            }
          } catch {
            /* Ignored */
          }
        }
      }

      console.log(`[loadFromDatabase] SQLite回退加载: ${mappedNodes.length} 节点`)

      // 迁移：如果从 SQLite 加载了数据，自动保存为 JSON 文件
      if (mappedNodes.length > 0 && window.api?.projectFileAPI?.save) {
        const data = buildProjectData()
        await window.api.projectFileAPI.save(activeProject.id, data)
        console.log(`[loadFromDatabase] 已将 SQLite 数据迁移到 JSON 文件`)
      }
    } catch (e) {
      console.error('加载项目数据失败:', e)
    }
  }, [setNodes, setConnections, setView, setProjectName, buildProjectData])

  // ========== 保存 ==========

  useEffect(() => {
    if (!currentProject?.id) return
    if ((nodes || []).length > 0) {
      blankCanvasRecoveryRef.current.delete(currentProject.id)
      return
    }
    if (blankCanvasRecoveryRef.current.has(currentProject.id)) return

    if (!window.api?.projectFileAPI?.load) return

    blankCanvasRecoveryRef.current.add(currentProject.id)
    let cancelled = false

    ;(async () => {
      try {
        const projectData = (await window.api.projectFileAPI.load(currentProject.id)) as any
        if (cancelled) return

        const recoveredNodes = Array.isArray(projectData?.nodes) ? projectData.nodes : []
        if (recoveredNodes.length === 0) return

        const latestState = useAppStore.getState()
        if ((latestState.nodes || []).length > 0) return

        console.warn(
          `[ProjectRecovery] Restoring ${recoveredNodes.length} nodes for project ${currentProject.id} after blank canvas state.`
        )
        setNodes(recoveredNodes)
        setConnections(Array.isArray(projectData.connections) ? projectData.connections : [])
        if (projectData.view) setView(projectData.view)
        if (projectData.name) setProjectName(projectData.name)
        if (
          Array.isArray(projectData.history) &&
          (!Array.isArray(latestState.history) || latestState.history.length === 0)
        ) {
          useAppStore.getState().setHistory(projectData.history)
        }
        restoreProductionBoardSnapshot(projectData.productionBoard)
      } catch (err) {
        console.warn('[ProjectRecovery] Failed to restore blank canvas from project file:', err)
        blankCanvasRecoveryRef.current.delete(currentProject.id)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentProject?.id, nodes, setNodes, setConnections, setView, setProjectName])

  const handleSaveToHistory = useCallback(async (options: { skipThumbnail?: boolean } = {}) => {
    const storeState = useAppStore.getState()
    const name = storeState.projectName || '未命名项目'

    // 获取或创建项目 ID
    let projId = storeState.currentProject?.id
    if (!projId) {
      projId = `proj-${Date.now()}`
      const newProject = {
        id: projId,
        name,
        folderId: storeState.currentProject?.folderId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      useAppStore.getState().setCurrentProject(newProject)
      setProjects((prev) => [newProject, ...prev])
      console.log(`[Save] 新项目 "${name}" 已创建，ID: ${projId}`)
    }

    const data = buildProjectData()

    // 截取窗口快照作为缩略图
    try {
      if (!options.skipThumbnail && window.api?.windowAPI?.captureThumbnail) {
        const thumbBase64 = await window.api.windowAPI.captureThumbnail()
        if (thumbBase64) data.thumbnail = `data:image/jpeg;base64,${thumbBase64}`
      }
    } catch {
      /* 截图失败不影响保存 */
    }

    try {
      // 保存到 JSON 文件
      if (window.api?.projectFileAPI?.save) {
        const result = await window.api.projectFileAPI.save(projId, data)
        console.log(`[Save] JSON 保存完成:`, result)
      }

      // 更新项目列表
      setProjects((prev) => {
        const idx = prev.findIndex((p) => p.id === projId)
        if (idx === -1) {
          return [
            {
              id: projId,
              name,
              folderId: data.folderId || null,
              cacheRoot: data.cacheRoot || null,
              updatedAt: new Date().toISOString(),
              nodesCount: data.nodes.length,
              thumbnail: data.thumbnail || null
            },
            ...prev
          ]
        }
        const next = [...prev]
        next[idx] = {
          ...next[idx],
          name,
          folderId: data.folderId || next[idx].folderId || null,
          cacheRoot: data.cacheRoot || next[idx].cacheRoot || null,
          updatedAt: new Date().toISOString(),
          nodesCount: data.nodes.length,
          thumbnail: data.thumbnail || next[idx].thumbnail || null
        }
        return next
      })

      // 持久化 currentProject ID
      const activeProject = useAppStore.getState().currentProject
      if (activeProject) {
        try {
          setSetting('tapnow_current_project', JSON.stringify(activeProject))
        } catch (e) {
          console.warn('[Save] 持久化 currentProject 失败:', e)
        }
      }
    } catch (e) {
      console.error('[Save] 保存失败:', e)
    }
  }, [setProjects, buildProjectData])

  // ========== 加载项目 ==========

  const handleLoadFromHistory = useCallback(
    async (project, setProjectListOpen) => {
      if (!project) return

      if (confirm(`确定要加载项目 "${project.name}" 吗？当前未保存的更改将丢失。`)) {
        try {
          // 先切换 currentProject ID
          const loadSeq = ++projectLoadSeqRef.current
          const targetProjectId = project.id
          const isStaleLoad = () =>
            projectLoadSeqRef.current !== loadSeq ||
            useAppStore.getState().currentProject?.id !== targetProjectId

          useAppStore.getState().setCurrentProject({
            id: project.id,
            name: project.name,
            folderId: project.folderId || project.folder_id || null,
            cacheRoot: project.cacheRoot || null,
            createdAt: project.createdAt || new Date().toISOString()
          })

          // 从 JSON 文件加载
          if (window.api?.projectFileAPI?.load) {
            const projectData = (await window.api.projectFileAPI.load(project.id)) as any
            if (isStaleLoad()) return
            if (projectData) {
              setNodes(projectData.nodes || [])
              useAppStore.getState().setNodeGroups(projectData.nodeGroups || [])
              setConnections(projectData.connections || [])
              if (projectData.view) setView(projectData.view)
              if (projectData.name) setProjectName(projectData.name)
              restoreProductionBoardSnapshot(projectData.productionBoard)
              if (Array.isArray(projectData.history)) {
                useAppStore.getState().setHistory(projectData.history)
              } else {
                useAppStore.getState().setHistory([])
              }
              // 恢复批量生产板数据
              if (projectData.productionBoard) {
                const pb = projectData.productionBoard as any
                const s = useAppStore.getState()
                if (pb.rows) s.setProductionBoardRows(pb.rows)
                if (pb.commonValues) s.setProductionBoardCommonValues(pb.commonValues)
                if (pb.mode) s.setProductionBoardMode(pb.mode)
                if (pb.videoRows) s.setProductionBoardVideoRows(pb.videoRows)
                if (pb.videoCommonValues)
                  s.setProductionBoardVideoCommonValues(pb.videoCommonValues)
                if (pb.imageRows) s.setProductionBoardImageRows(pb.imageRows)
                if (pb.imageCommonValues)
                  s.setProductionBoardImageCommonValues(pb.imageCommonValues)
                if (pb.sharedRefs) s.setProductionBoardSharedRefs(pb.sharedRefs)
                console.log('[Load] 批量生产板数据已恢复')
              }
              // 恢复资产库数据
              if (projectData.assetLibrary) {
                const assetKey = project.id
                  ? `tapnow_asset_library_${project.id}`
                  : 'tapnow_asset_library'
                localStorage.setItem(assetKey, JSON.stringify(projectData.assetLibrary))
                window.dispatchEvent(new Event('asset-library-updated'))
                console.log('[Load] 资产库数据已恢复')
              }

              if (setProjectListOpen) setProjectListOpen(false)
              window.api?.windowAPI?.focusFix()
              console.log('[Load] JSON 加载完成:', {
                nodes: projectData.nodes?.length || 0,
                connections: projectData.connections?.length || 0
              })
              return
            }
          }

          // 回退：从 SQLite 加载
          let savedNodes = []
          let savedConnections = []
          if (window.dbAPI?.nodes?.list) {
            savedNodes = await window.dbAPI.nodes.list(project.id)
            if (isStaleLoad()) return
          }
          if (window.dbAPI?.connections?.list) {
            savedConnections = await window.dbAPI.connections.list(project.id)
            if (isStaleLoad()) return
          }
          if (savedNodes.length === 0 && project.data?.nodes) {
            savedNodes = project.data.nodes
          }
          if (savedConnections.length === 0 && project.data?.connections) {
            savedConnections = project.data.connections
          }

          setNodes(savedNodes || [])
          useAppStore.getState().setNodeGroups(project.data?.nodeGroups || [])
          setConnections(savedConnections || [])
          if (project.data?.view) setView(project.data.view)
          if (project.data?.projectName || project.name)
            setProjectName(project.data?.projectName || project.name)
          restoreProductionBoardSnapshot(project.data?.productionBoard)

          // 加载历史
          if (window.dbAPI?.settings) {
            const historyKey = `tapnow_history_v2_${project.id}`
            const historyJson = await window.dbAPI.settings.get(historyKey)
            if (isStaleLoad()) return
            if (historyJson) {
              try {
                const parsed = JSON.parse(historyJson)
                if (Array.isArray(parsed)) {
                  useAppStore.getState().setHistory(parsed)
                }
              } catch {
                /* Ignored */
              }
            } else {
              useAppStore.getState().setHistory([])
            }
          }

          if (setProjectListOpen) setProjectListOpen(false)
          window.api?.windowAPI?.focusFix()
        } catch (e) {
          console.error('[Load] 失败:', e)
          alert('加载项目失败: ' + e.message)
        }
      }
    },
    [setNodes, setConnections, setView, setProjectName]
  )

  // ========== 删除项目 ==========

  const handleDeleteHistoryProject = useCallback(
    async (id) => {
      const project = projects.find((item) => item.id === id)
      const projectNameForConfirm = project?.name || '当前项目'
      if (!confirm(`确定要删除「${projectNameForConfirm}」吗？`)) return
      if (
        !confirm(
          `再次确认删除「${projectNameForConfirm}」。\n\n这会同时清理该项目在 LocalCache 中生成的缓存文件，但不会删除用户原始本地素材文件。`
        )
      ) {
        return
      }

      try {
        if (window.api?.localCacheAPI?.deleteProject) {
          const cacheResult = await window.api.localCacheAPI.deleteProject(id)
          if (cacheResult?.success === false) {
            console.warn('[ProjectDelete] 项目缓存清理失败:', cacheResult.error)
          }
        }
      } catch (e) {
        console.warn('[ProjectDelete] 项目缓存清理失败:', e)
      }

      setProjects((prev) => prev.filter((p) => p.id !== id))

      // 删除 JSON 文件
      if (window.api?.projectFileAPI?.delete) {
        window.api.projectFileAPI.delete(id).catch((e) => console.error('删除项目文件失败:', e))
      }

      // 兼容：同时清理 SQLite 数据
      if (window.dbAPI?.projects?.delete) {
        window.dbAPI.projects.delete(id).catch(() => {})
      }
      if (window.dbAPI?.nodes?.deleteByProject) {
        window.dbAPI.nodes.deleteByProject(id).catch(() => {})
      }
      if (window.dbAPI?.connections?.deleteByProject) {
        window.dbAPI.connections.deleteByProject(id).catch(() => {})
      }
      if (window.dbAPI?.settings?.delete) {
        window.dbAPI.settings.delete(`tapnow_history_v2_${id}`).catch(() => {})
      }

      // 重置焦点，防止输入框无法输入
      setTimeout(() => {
        window.api?.windowAPI?.focusFix()
      }, 100)
    },
    [projects, setProjects]
  )

  // ========== 保存并新建 ==========

  const handleSaveAndCreateNew = useCallback(
    async (closeFn) => {
      await handleSaveToHistory({ skipThumbnail: true })

      const newProjId = `proj-${Date.now()}`
      const newProjName = '未命名项目'
      const newProject = {
        id: newProjId,
        name: newProjName,
        folderId: useAppStore.getState().currentProject?.folderId || null,
        cacheRoot: null,
        createdAt: new Date().toISOString()
      }

      setNodes([])
      setConnections([])
      setProjectName(newProjName)
      useAppStore.getState().setCurrentProject(newProject)
      useAppStore.getState().setHistory([])

      setProjects((prev) => [
        {
          id: newProjId,
          name: newProjName,
          folderId: newProject.folderId || null,
          updatedAt: new Date().toISOString(),
          nodesCount: 0
        },
        ...prev
      ])

      try {
        setSetting('tapnow_current_project', JSON.stringify(newProject))
      } catch (e) {
        console.warn('[SaveAndNew] 持久化 currentProject 失败:', e)
      }

      console.log(`[SaveAndNew] 新项目 "${newProjName}" (${newProjId}) 已创建`)
      if (closeFn) closeFn(false)
      window.api?.windowAPI?.focusFix()
    },
    [handleSaveToHistory, setNodes, setConnections, setProjectName]
  )

  // ========== 文件导入/导出 (JSON) ==========

  const handleSaveProject = useCallback(async () => {
    try {
      // 读取资产库数据
      let assetLibraryData = null
      try {
        const projId = useAppStore.getState().currentProject?.id
        const assetKey = projId ? `tapnow_asset_library_${projId}` : 'tapnow_asset_library'
        const raw = localStorage.getItem(assetKey)
        if (raw) assetLibraryData = JSON.parse(raw)
      } catch {
        /* ignore */
      }

      const projectData = {
        version: '4.0',
        schemaVersion: '2.0.25',
        type: 'workflow',
        nodes,
        connections,
        projectName,
        view,
        assetLibrary: assetLibraryData,
        timestamp: getCSTTimestamp()
      }

      const jsonStr = JSON.stringify(
        projectData,
        (key, value) => (value === undefined ? null : value),
        2
      )
      const blob = new Blob([jsonStr], { type: 'application/json' })

      if (window.api?.fsAPI?.saveTextFileAs) {
        const timestamp = getCSTFilenameTimestamp()
        const result = await window.api.fsAPI.saveTextFileAs({
          content: jsonStr,
          defaultName: `${projectName || 'project'}_${timestamp}.json`,
          filters: [
            { name: 'JSON File', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        })
        if (result?.canceled) return
        if (!result?.success) {
          throw new Error(result?.error || 'Save failed')
        }
      } else if ((window as any).showSaveFilePicker) {
        const timestamp = getCSTFilenameTimestamp()
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `${projectName || '项目'}_${timestamp}.json`,
          types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }]
        })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const timestamp = getCSTFilenameTimestamp()
        a.download = `${projectName || '项目'}_${timestamp}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
      alert('项目保存成功！')
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('保存项目失败:', e)
        alert('保存项目失败: ' + e.message)
      }
    }
  }, [nodes, connections, projectName, view])

  const handleLoadProject = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.currentTarget as HTMLInputElement).files?.[0]
      if (!file) return

      setProgressState({ visible: true, progress: 0, status: 'INITIALIZING...', type: 'import' })

      const tempState = {
        nodes: [],
        history: [],
        connections: [],
        chatSessions: [],
        characterLibrary: [],
        projectName: '',
        view: null,
        assetLibrary: null
      }

      let currentSection = null
      let buffer = ''
      let objectBuffer = ''
      let braceCount = 0
      let inObject = false
      // assetLibrary 是对象而非数组，需要特殊处理
      let assetLibBuf = ''
      let assetLibBraces = 0
      let collectingAssetLib = false
      let bytesRead = 0
      const totalBytes = file.size

      // --- 尝试获取本地库文件列表 (辅助逻辑) ---
      let localFiles = []
      const localServerUrl = 'http://localhost:9527'
      try {
        const localFilesData = await apiClient('/list-files', {}, { baseUrl: localServerUrl })
        if (localFilesData && localFilesData.success && localFilesData.files) {
          localFiles = localFilesData.files
        }
      } catch {
        // Ignored
      }

      const findLocalFileBySize = (dataUrl) => {
        if (!localFiles.length) return null
        try {
          const base64 = dataUrl.split(',')[1]
          if (!base64) return null
          const estimatedSize = Math.floor(base64.length * 0.75)
          const tolerance = estimatedSize * 0.05
          const match = localFiles.find((f) => Math.abs(f.size - estimatedSize) < tolerance)
          return match ? `${localServerUrl}/file/${encodeURIComponent(match.rel_path)}` : null
        } catch {
          return null
        }
      }

      const convertItemImmediately = async (item) => {
        const stack = [item]
        while (stack.length > 0) {
          const current = stack.pop()
          if (!current || typeof current !== 'object') continue
          for (const key in current) {
            const val = current[key]
            if (
              typeof val === 'string' &&
              (val.startsWith('data:image/') || val.startsWith('data:video/'))
            ) {
              try {
                const localUrl = findLocalFileBySize(val)
                if (localUrl) {
                  const testRes = await fetch(localUrl, { method: 'HEAD' })
                  if (testRes.ok) {
                    current[key] = localUrl
                    continue
                  }
                }
                const res = await fetch(val)
                const blob = await res.blob()
                current[key] = registerManagedBlobUrl(URL.createObjectURL(blob))
              } catch {
                // Ignored
              }
            } else if (typeof val === 'object' && val !== null) {
              stack.push(val)
            }
          }
        }
        return item
      }

      try {
        const stream = file.stream().pipeThrough(new TextDecoderStream())
        const reader = stream.getReader()

        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          bytesRead += value.length
          if (Math.random() > 0.9) {
            const percent = Math.min(99, (bytesRead / totalBytes) * 100)
            setProgressState((prev) => ({
              ...prev,
              progress: percent,
              status: `PROCESSING ${(bytesRead / 1024 / 1024).toFixed(0)}MB`
            }))
          }

          buffer += value
          while (true) {
            const newlineIndex = buffer.indexOf('\n')
            if (newlineIndex === -1) break
            const line = buffer.substring(0, newlineIndex)
            buffer = buffer.substring(newlineIndex + 1)
            const trimmedLine = line.trim()
            if (!trimmedLine) continue

            if (trimmedLine.includes('"nodes": [')) {
              currentSection = 'nodes'
              continue
            }
            if (trimmedLine.includes('"history": [')) {
              currentSection = 'history'
              continue
            }
            if (trimmedLine.includes('"connections": [')) {
              currentSection = 'connections'
              continue
            }
            if (trimmedLine.includes('"chatSessions": [')) {
              currentSection = 'chatSessions'
              continue
            }
            if (trimmedLine.includes('"characterLibrary": [')) {
              currentSection = 'characterLibrary'
              continue
            }

            if ((trimmedLine === '],' || trimmedLine === ']') && braceCount === 0) {
              currentSection = null
              objectBuffer = ''
              inObject = false
              continue
            }

            if (!currentSection) {
              // 检测 assetLibrary 对象开始
              if (trimmedLine.includes('"assetLibrary":') && trimmedLine.includes('{')) {
                collectingAssetLib = true
                const startIdx = trimmedLine.indexOf('{')
                const fragment = trimmedLine.substring(startIdx)
                for (const ch of fragment) {
                  if (ch === '{') assetLibBraces++
                  if (ch === '}') assetLibBraces--
                }
                assetLibBuf += fragment + '\n'
                if (assetLibBraces === 0) {
                  try {
                    tempState.assetLibrary = JSON.parse(assetLibBuf.trim().replace(/,$/, ''))
                  } catch {
                    /* ignore */
                  }
                  collectingAssetLib = false
                  assetLibBuf = ''
                }
                continue
              }
              if (collectingAssetLib) {
                for (const ch of trimmedLine) {
                  if (ch === '{') assetLibBraces++
                  if (ch === '}') assetLibBraces--
                }
                assetLibBuf += line + '\n'
                if (assetLibBraces === 0) {
                  try {
                    tempState.assetLibrary = JSON.parse(assetLibBuf.trim().replace(/,$/, ''))
                  } catch {
                    /* ignore */
                  }
                  collectingAssetLib = false
                  assetLibBuf = ''
                }
                continue
              }
              if (trimmedLine.startsWith('"projectName":') || trimmedLine.startsWith('"name":')) {
                try {
                  const m = trimmedLine.match(/"(?:projectName|name)":\s*(.+)/)
                  if (m) tempState.projectName = JSON.parse(m[1].replace(/,$/, ''))
                } catch {
                  // Ignored
                }
              }
              if (trimmedLine.startsWith('"view":')) {
                try {
                  const m = trimmedLine.match(/"view":\s*(.+)/)
                  if (m && m[1].endsWith('}')) tempState.view = JSON.parse(m[1].replace(/,$/, ''))
                } catch {
                  // Ignored
                }
              }
              continue
            }

            for (let char of line) {
              if (char === '{') {
                braceCount++
                inObject = true
              }
              if (char === '}') {
                braceCount--
              }
            }
            objectBuffer += line + '\n'

            if (inObject && braceCount === 0) {
              let jsonStr = objectBuffer.trim()
              if (jsonStr.endsWith(',')) jsonStr = jsonStr.slice(0, -1)
              try {
                const item = JSON.parse(jsonStr)
                if (
                  currentSection === 'nodes' ||
                  currentSection === 'history' ||
                  currentSection === 'characterLibrary'
                ) {
                  await convertItemImmediately(item)
                }
                if (currentSection === 'nodes' && item.id) {
                  if (!item.settings) item.settings = {}
                  tempState.nodes.push(item)
                } else if (currentSection === 'history') {
                  tempState.history.push(item)
                } else if (currentSection === 'connections') {
                  tempState.connections.push(item)
                } else if (currentSection === 'chatSessions') {
                  tempState.chatSessions.push(item)
                } else if (currentSection === 'characterLibrary') {
                  tempState.characterLibrary.push(item)
                }
              } catch {
                // Ignored
              }
              objectBuffer = ''
              inObject = false
            }
          }
        }

        setProgressState((prev) => ({ ...prev, progress: 100, status: 'FINALIZING...' }))

        setTimeout(() => {
          if (tempState.projectName) setProjectName(tempState.projectName)
          if (tempState.view) setView(tempState.view)
          if (tempState.connections.length > 0) setConnections(tempState.connections)
          if (tempState.chatSessions.length > 0) setChatSessions(tempState.chatSessions)
          if (tempState.characterLibrary.length > 0) setCharacterLibrary(tempState.characterLibrary)
          if (tempState.nodes.length > 0) setNodes(tempState.nodes)
          if (tempState.history.length > 0) setHistory(tempState.history)

          // 恢复资产库数据
          if (tempState.assetLibrary) {
            const projId = useAppStore.getState().currentProject?.id
            const assetKey = projId ? `tapnow_asset_library_${projId}` : 'tapnow_asset_library'
            localStorage.setItem(assetKey, JSON.stringify(tempState.assetLibrary))
            window.dispatchEvent(new Event('asset-library-updated'))
          }

          setProgressState((prev) => ({ ...prev, visible: false }))
          alert(`加载成功！\n${tempState.nodes.length} 个节点`)
        }, 200)
      } catch (error) {
        console.error('加载失败:', error)
        setProgressState((prev) => ({ ...prev, visible: false }))
        alert(`加载失败: ${error.message}`)
      }
    }
    input.click()
  }, [
    setNodes,
    setConnections,
    setProjectName,
    setView,
    setHistory,
    setChatSessions,
    setCharacterLibrary,
    setProgressState
  ])

  /**
   * 保存选中的工作流 (导出部分节点)
   */
  const handleSaveSelectedWorkflow = useCallback(
    async (selectedNodeIds, selectedNodeId) => {
      try {
        const selectedIds =
          selectedNodeIds.size > 0
            ? selectedNodeIds
            : selectedNodeId
              ? new Set([selectedNodeId])
              : new Set()
        if (selectedIds.size === 0) {
          alert('请先选择要保存的节点')
          return
        }

        const selectedNodes = nodes.filter((n) => selectedIds.has(n.id))
        const selectedConnections = connections.filter(
          (conn) =>
            selectedIds.has(conn.source || conn.from) && selectedIds.has(conn.target || conn.to)
        )

        const convertToDataUrls = async (obj) => {
          if (!obj || typeof obj !== 'object') return obj
          if (Array.isArray(obj)) return await Promise.all(obj.map(convertToDataUrls))

          const copy = { ...obj }
          for (const key in copy) {
            const val = copy[key]
            if (typeof val === 'string' && val.startsWith('blob:')) {
              try {
                const b64 = await getBase64FromUrl(val)
                const mime = isVideoUrl(val) ? 'video/mp4' : 'image/png'
                copy[key] = `data:${mime};base64,${b64}`
              } catch {
                // Ignored
              }
            } else if (typeof val === 'object' && val !== null) {
              copy[key] = await convertToDataUrls(val)
            }
          }
          return copy
        }

        const nodesWithDataUrls = await convertToDataUrls(selectedNodes)
        const workflowData = {
          version: '4.0',
          type: 'workflow',
          nodes: nodesWithDataUrls,
          connections: selectedConnections,
          timestamp: getCSTTimestamp()
        }

        const jsonStr = JSON.stringify(workflowData, null, 2)
        const blob = new Blob([jsonStr], { type: 'application/json' })

        const timestamp = getCSTFilenameTimestamp()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `工作流_${timestamp}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        alert('工作流保存成功！')
      } catch (e) {
        console.error('保存工作流失败:', e)
        alert('保存工作流失败: ' + e.message)
      }
    },
    [nodes, connections]
  )

  return {
    projects,
    setProjects,
    loadFromDatabase,
    handleSaveToHistory,
    handleLoadFromHistory,
    handleDeleteHistoryProject,
    handleSaveAndCreateNew,
    handleSaveProject,
    handleLoadProject,
    handleSaveSelectedWorkflow
  }
}

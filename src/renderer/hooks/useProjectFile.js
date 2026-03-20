import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../store/useAppStore.js'

import {
  getCSTTimestamp,
  getCSTFilenameTimestamp,
  getBase64FromUrl,
  isVideoUrl
} from '../utils/projectUtils.js'
import { getSettingJSON, setSettingJSON } from '../services/dbService.js'

/**
 * 管理项目的保存、加载、导入导出及历史记录。
 * 整合了 SQLite (nodes) 和 dbService (projects/config)。
 */
import { apiClient } from '../services/apiClient.js'

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

  const latestDataRef = useRef({ nodes, connections, view, projectName })
  useEffect(() => {
    latestDataRef.current = { nodes, connections, view, projectName }
  }, [nodes, connections, view, projectName])

  // 项目列表状态 (从 dbService 初始化)
  const [projects, setProjects] = useState(() => {
    return getSettingJSON('tapnow_projects', [])
  })

  // 保存项目列表到 dbService
  useEffect(() => {
    try {
      setSettingJSON('tapnow_projects', projects)
    } catch (e) {
      console.error('保存项目列表失败:', e)
    }
  }, [projects])

  // ========== 自动保存机制 (按间隔与应用关闭前) ==========
  useEffect(() => {
    if (!currentProject || !autoSaveInterval) return

    const timer = setInterval(
      async () => {
        try {
          const { nodes: n, connections: c, projectName: pName } = latestDataRef.current
          // 直接通过 SQLite 批量保存，不再塞入 settings
          if (window.dbAPI?.nodes?.saveBatch && n.length > 0) {
            await window.dbAPI.nodes.saveBatch(n, currentProject.id)
          }
          if (window.dbAPI?.connections?.saveBatch && c.length > 0) {
            await window.dbAPI.connections.saveBatch(c, currentProject.id)
          }
          // 只更新项目元数据（不含data）
          setProjects((prev) => {
            const idx = prev.findIndex((p) => p.id === currentProject.id)
            if (idx === -1) return prev
            const next = [...prev]
            next[idx] = { ...next[idx], name: pName || next[idx].name, updatedAt: new Date().toISOString() }
            return next
          })
        } catch (e) {
          console.error('[自动保存] 失败:', e)
        }
      },
      autoSaveInterval * 60 * 1000
    )

    return () => clearInterval(timer)
  }, [currentProject, autoSaveInterval])

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!currentProject) return
      const { projectName: pName } = latestDataRef.current
      // 同步保存项目元数据
      setProjects((prev) => {
        const idx = prev.findIndex((p) => p.id === currentProject.id)
        if (idx === -1) return prev
        const next = [...prev]
        next[idx] = { ...next[idx], name: pName || next[idx].name, updatedAt: new Date().toISOString() }
        try {
          setSettingJSON('tapnow_projects', next)
        } catch (e) {
          console.error('保存项目列表失败:', e)
        }
        return next
      })
      // 注：数据已通过自动保存定期写入 SQLite，beforeUnload 不做全量数据保存
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentProject])

  // ========== SQLite 核心持久化 ==========

  /**
   * 从 SQLite 加载节点
   */
  const loadFromDatabase = useCallback(async () => {
    if (!window.dbAPI?.nodes?.list || !currentProject) return
    try {
      const dbNodes = await window.dbAPI.nodes.list(currentProject.id)
      if (dbNodes && dbNodes.length > 0) {
        const mappedNodes = dbNodes.map((dbNode) => {
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
        setNodes(mappedNodes)
      }
    } catch (e) {
      console.error('从 SQLite 加载节点失败:', e)
    }
  }, [setNodes, currentProject])

  // ========== 历史记录管理 (localStorage 快照) ==========

  /**
   * 保存当前项目快照到历史记录
   */
  const handleSaveToHistory = useCallback(async () => {
    const name = projectName || '未命名项目'

    // 先通过 SQLite 保存实际数据
    const projId = currentProject?.id || `proj-${Date.now()}`
    try {
      if (window.dbAPI?.nodes?.saveBatch && nodes.length > 0) {
        await window.dbAPI.nodes.saveBatch(nodes, projId)
      }
      if (window.dbAPI?.connections?.saveBatch && connections.length > 0) {
        await window.dbAPI.connections.saveBatch(connections, projId)
      }
    } catch (e) {
      console.error('[Save] SQLite 保存失败:', e)
    }

    if (currentProject) {
      setProjects((prev) => {
        const idx = prev.findIndex((p) => p.id === currentProject.id)
        if (idx === -1) {
          return [{ id: currentProject.id, name, updatedAt: new Date().toISOString(), thumbnail: null }, ...prev]
        }
        const next = [...prev]
        next[idx] = { ...next[idx], name, updatedAt: new Date().toISOString() }
        return next
      })
      console.log(`[Save] 项目 "${name}" 已保存到 SQLite`)
    } else {
      setProjects((prev) => [
        { id: projId, name, updatedAt: new Date().toISOString(), thumbnail: null },
        ...prev
      ])
      useAppStore.getState().setCurrentProject({
        id: projId,
        name,
        createdAt: new Date().toISOString()
      })
      console.log(`[Save] 新项目 "${name}" 已创建并保存到 SQLite`)
    }
  }, [nodes, connections, view, projectName, currentProject])

  /**
   * 从历史记录加载项目快照
   */
  const handleLoadFromHistory = useCallback(
    async (project, setProjectListOpen) => {
      console.log('[handleLoadFromHistory] Called with:', {
        project: project?.id,
        projectName: project?.name
      })

      if (!project) {
        console.error('[handleLoadFromHistory] Invalid project')
        return
      }

      if (confirm(`确定要加载项目 "${project.name}" 吗？当前未保存的更改将丢失。`)) {
        try {
          // 优先从 SQLite 读取
          let savedNodes = []
          let savedConnections = []

          if (window.dbAPI?.nodes?.list) {
            savedNodes = await window.dbAPI.nodes.list(project.id)
          }
          if (window.dbAPI?.connections?.list) {
            savedConnections = await window.dbAPI.connections.list(project.id)
          }

          // 如果 SQLite 无数据，回退到旧的 data 字段（兼容历史项目）
          if (savedNodes.length === 0 && project.data?.nodes) {
            savedNodes = project.data.nodes
          }
          if (savedConnections.length === 0 && project.data?.connections) {
            savedConnections = project.data.connections
          }

          const savedView = project.data?.view
          const savedName = project.data?.projectName || project.name

          setNodes(savedNodes || [])
          setConnections(savedConnections || [])
          if (savedView) setView(savedView)
          if (savedName) setProjectName(savedName)

          useAppStore.getState().setCurrentProject({
            id: project.id,
            name: project.name,
            createdAt: project.createdAt || project.updatedAt || new Date().toISOString()
          })

          if (setProjectListOpen) setProjectListOpen(false)

          console.log('[handleLoadFromHistory] Load complete:', {
            nodesCount: savedNodes.length,
            connectionsCount: savedConnections.length
          })
        } catch (e) {
          console.error('[handleLoadFromHistory] Error:', e)
          alert('加载项目失败: ' + e.message)
        }
      }
    },
    [setNodes, setConnections, setView, setProjectName]
  )

  /**
   * 删除历史记录中的项目
   */
  const handleDeleteHistoryProject = useCallback((id) => {
    if (confirm('确定要删除此项目吗？')) {
      setProjects((prev) => prev.filter((p) => p.id !== id))
    }
  }, [])

  // ========== 文件导入/导出 (JSON) ==========

  /**
   * 导出项目为 JSON 文件
   */
  const handleSaveProject = useCallback(async () => {
    try {
      // 准备导出数据
      const projectData = {
        version: '2.8',
        type: 'workflow',
        nodes,
        connections,
        projectName,
        view,
        timestamp: getCSTTimestamp()
      }

      const jsonStr = JSON.stringify(
        projectData,
        (key, value) => (value === undefined ? null : value),
        2
      )
      const blob = new Blob([jsonStr], { type: 'application/json' })

      if (window.showSaveFilePicker) {
        const timestamp = getCSTFilenameTimestamp()
        const handle = await window.showSaveFilePicker({
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

  /**
   * 从 JSON 文件加载项目
   */
  const handleLoadProject = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return

      setProgressState({ visible: true, progress: 0, status: 'INITIALIZING...', type: 'import' })

      const tempState = {
        nodes: [],
        history: [],
        connections: [],
        chatSessions: [],
        characterLibrary: [],
        projectName: '',
        view: null
      }

      let currentSection = null
      let buffer = ''
      let objectBuffer = ''
      let braceCount = 0
      let inObject = false
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
                current[key] = URL.createObjectURL(blob)
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
              if (trimmedLine.startsWith('"projectName":')) {
                try {
                  const m = trimmedLine.match(/"projectName":\s*(.+)/)
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

        // 转换 Blob URL 为 Data URL 以便离线使用
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
          version: '2.8',
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
    handleSaveProject,
    handleLoadProject,
    handleSaveSelectedWorkflow
  }
}

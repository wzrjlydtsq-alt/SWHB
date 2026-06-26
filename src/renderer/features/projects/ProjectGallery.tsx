import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useShallow } from 'zustand/react/shallow'
import {
  Plus,
  Search,
  FolderOpen,
  FolderPlus,
  ArrowLeft,
  Trash2,
  X,
  Clock,
  Film,
  Image as ImageIcon,
  FileText,
  Users,
  Layers,
  Save,
  RotateCcw,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  Grip,
  Upload,
  Minus
} from 'lucide-react'
import {
  parseDocument,
  getParseResultSummary,
  extractTextFromDocx,
  isDocxFile
} from '../../utils/parseDocument.ts'
import { getSettingJSON, setSettingJSON } from '../../services/dbService.ts'
import {
  sanitizeHistoryForSave,
  sanitizePersistentValue
} from '../../store/slices/createHistorySlice.ts'
import {
  CLOUD_AUTH_CHANGE_EVENT,
  assetsApi,
  getCloudContext,
  isLoggedIn,
  writingAssignmentsApi,
  writingEpisodesApi,
  writingProjectsApi
} from '../../services/cloud'

const PROJECT_FOLDERS_KEY = 'project_gallery_folders_v1'
const PROJECT_GALLERY_PANEL_KEY = 'project_gallery_panel_v3'

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
const PROJECT_GALLERY_CARD_KEY = 'project_gallery_cards_v2'
const ROOT_FOLDER_ID = '__root__'
const FOLDERS_UPDATED_EVENT = 'project-folders-updated'
const CLOUD_FOLDER_PREFIX = 'cloud-series-'
const CLOUD_EPISODE_PROJECT_PREFIX = 'cloud-episode-'
const DEFAULT_GALLERY_PANEL = { x: 64, y: 48, width: 1040, height: 600 }
const MIN_GALLERY_PANEL = { width: 620, height: 380 }
const DEFAULT_CARD_LAYOUT = { cardMinWidth: 220, thumbnailHeight: 128, gap: 20 }
const INITIAL_PROJECT_RENDER_LIMIT = 36
const CARD_LAYOUT_CONTROLS = [
  { key: 'cardMinWidth', label: '卡片宽度', min: 160, max: 320, step: 10, unit: 'px' },
  { key: 'thumbnailHeight', label: '缩略图高度', min: 90, max: 190, step: 10, unit: 'px' },
  { key: 'gap', label: '卡片间距', min: 10, max: 32, step: 2, unit: 'px' }
]
const PROJECT_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'local', label: '本地' },
  { value: 'cloud', label: '云同步' },
  { value: 'mine', label: '我负责' },
  { value: 'pending_submit', label: '待提交' },
  { value: 'needs_revision', label: '待修改' },
  { value: 'done', label: '已完成' }
]

const EPISODE_STATUS_LABELS = {
  not_started: '未开始',
  writing: '写作中',
  in_progress: '进行中',
  production: '制作中',
  pending_review: '待审核',
  review: '待审核',
  completed: '已完成',
  done: '已完成',
  archived: '已归档'
}

const ASSIGNMENT_STATUS_LABELS = {
  pending: '待接收',
  accepted: '待制作',
  in_progress: '制作中',
  submitted: '已提交',
  approved: '已通过',
  rejected: '待修改',
  canceled: '已取消'
}

const REVIEW_STATUS_LABELS = {
  not_submitted: '未提交',
  pending_review: '待审核',
  approved: '已通过',
  needs_revision: '待修改'
}

function makeCloudFolderId(projectId) {
  return `${CLOUD_FOLDER_PREFIX}${projectId}`
}

function makeCloudEpisodeProjectId(episodeId) {
  return `${CLOUD_EPISODE_PROJECT_PREFIX}${episodeId}`
}

function buildCurrentProjectMeta(project: any, projectData: any = {}) {
  return {
    id: project.id,
    name: projectData.name || project.name,
    folderId: projectData.folderId || project.folderId || project.folder_id || null,
    createdAt: projectData.createdAt || project.createdAt || new Date().toISOString(),
    cloudSync: projectData.cloudSync ?? project.cloudSync ?? false,
    cloudType: projectData.cloudType || project.cloudType || null,
    cloudProjectId: projectData.cloudProjectId || project.cloudProjectId || null,
    cloudProjectTitle: projectData.cloudProjectTitle || project.cloudProjectTitle || null,
    cloudEpisodeId: projectData.cloudEpisodeId || project.cloudEpisodeId || null,
    cloudEpisodeNumber: projectData.cloudEpisodeNumber || project.cloudEpisodeNumber || null,
    cloudEpisodeStatus: projectData.cloudEpisodeStatus || project.cloudEpisodeStatus || null,
    cloudAssignmentId: projectData.cloudAssignmentId || project.cloudAssignmentId || null,
    cloudAssignmentTitle: projectData.cloudAssignmentTitle || project.cloudAssignmentTitle || null,
    cloudAssignmentStatus:
      projectData.cloudAssignmentStatus || project.cloudAssignmentStatus || null,
    cloudReviewStatus: projectData.cloudReviewStatus || project.cloudReviewStatus || null,
    cloudTeamId: projectData.cloudTeamId || project.cloudTeamId || null,
    cloudRole: projectData.cloudRole || project.cloudRole || null
  }
}

function makeProjectAssetFilename(project: any) {
  const baseName = String(project?.name || project?.id || 'xinghe-project')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'xinghe-project'
  return `${baseName}.xinghe-project.json`
}

function getStatusLabel(labels, status, fallback = '未同步') {
  if (!status) return fallback
  return labels[status] || status
}

function getReviewStatus(project) {
  if (project.cloudReviewStatus) return project.cloudReviewStatus
  if (project.cloudAssignmentStatus === 'approved') return 'approved'
  if (project.cloudAssignmentStatus === 'rejected') return 'needs_revision'
  if (project.cloudAssignmentStatus === 'submitted') return 'pending_review'
  return 'not_submitted'
}

function projectMatchesGalleryFilter(project, filter) {
  if (filter === 'all') return true
  if (filter === 'local') return !project.cloudSync
  if (filter === 'cloud') return Boolean(project.cloudSync)
  if (filter === 'mine') {
    return Boolean(
      project.cloudAssignmentId ||
      (project.cloudSync && project.cloudRole && project.cloudRole !== 'viewer')
    )
  }
  if (filter === 'pending_submit') {
    return ['pending', 'accepted', 'in_progress'].includes(project.cloudAssignmentStatus)
  }
  if (filter === 'needs_revision') {
    return getReviewStatus(project) === 'needs_revision'
  }
  if (filter === 'done') {
    return (
      project.cloudAssignmentStatus === 'approved' || project.cloudEpisodeStatus === 'completed'
    )
  }
  return true
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function getViewportSize() {
  if (typeof window === 'undefined') return { width: 1440, height: 900 }
  return { width: window.innerWidth, height: window.innerHeight }
}

function getInitialGalleryPanel() {
  const saved = getSettingJSON(PROJECT_GALLERY_PANEL_KEY, null) || {}
  const viewport = getViewportSize()
  const width = clampNumber(
    Number(saved.width) || Math.min(DEFAULT_GALLERY_PANEL.width, viewport.width - 96),
    MIN_GALLERY_PANEL.width,
    Math.max(MIN_GALLERY_PANEL.width, viewport.width - 32)
  )
  const height = clampNumber(
    Number(saved.height) || Math.min(DEFAULT_GALLERY_PANEL.height, viewport.height - 92),
    MIN_GALLERY_PANEL.height,
    Math.max(MIN_GALLERY_PANEL.height, viewport.height - 32)
  )
  return {
    x: clampNumber(
      Number(saved.x) || DEFAULT_GALLERY_PANEL.x,
      12,
      Math.max(12, viewport.width - width - 12)
    ),
    y: clampNumber(
      Number(saved.y) || DEFAULT_GALLERY_PANEL.y,
      12,
      Math.max(12, viewport.height - height - 12)
    ),
    width,
    height
  }
}

function getInitialCardLayout() {
  const saved = getSettingJSON(PROJECT_GALLERY_CARD_KEY, null) || {}
  return {
    cardMinWidth: clampNumber(
      Number(saved.cardMinWidth) || DEFAULT_CARD_LAYOUT.cardMinWidth,
      160,
      320
    ),
    thumbnailHeight: clampNumber(
      Number(saved.thumbnailHeight) || DEFAULT_CARD_LAYOUT.thumbnailHeight,
      90,
      190
    ),
    gap: clampNumber(Number(saved.gap) || DEFAULT_CARD_LAYOUT.gap, 10, 32)
  }
}

/**
 * 项目画廊 — 仅在 projectGalleryOpen=true 时显示
 * 首页 WelcomeScreen 的水波纹按钮触发 → 打开此画廊
 */
export const ProjectGallery = memo(function ProjectGallery({
  projects: externalProjects,
  setProjects: setExternalProjects,
  handleDeleteHistoryProject
}: any) {
  const { projectGalleryOpen, setProjectGalleryOpen, setCurrentProject } = useAppStore(
    useShallow((s) => ({
      projectGalleryOpen: s.projectGalleryOpen,
      setProjectGalleryOpen: s.setProjectGalleryOpen,
      setCurrentProject: s.setCurrentProject
    }))
  )

  const projects = externalProjects || []
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('recent')
  const [projectFilter, setProjectFilter] = useState('all')
  const [enteringProjectId, setEnteringProjectId] = useState(null)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [folders, setFolders] = useState(() => {
    const saved = getSettingJSON(PROJECT_FOLDERS_KEY, [])
    return Array.isArray(saved) ? saved : []
  })
  const [activeFolderId, setActiveFolderId] = useState(ROOT_FOLDER_ID)
  const [moveMenuProjectId, setMoveMenuProjectId] = useState(null)
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [cloudSyncing, setCloudSyncing] = useState(false)
  const [cloudSyncError, setCloudSyncError] = useState('')
  const [cloudLoggedIn, setCloudLoggedIn] = useState(() => isLoggedIn())
  const [cloudNeedsResync, setCloudNeedsResync] = useState(false)
  const [newFolderName, setNewFolderName] = useState('新文件夹')
  const [panelFrame, setPanelFrame] = useState(getInitialGalleryPanel)
  const [isMaximized, setIsMaximized] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showLayoutControls, setShowLayoutControls] = useState(false)
  const [cardLayout, setCardLayout] = useState(getInitialCardLayout)
  const [localImporting, setLocalImporting] = useState(false)
  const [localImportMessage, setLocalImportMessage] = useState('')
  const [projectCloudUploadingId, setProjectCloudUploadingId] = useState(null)
  const [projectRenderLimit, setProjectRenderLimit] = useState(INITIAL_PROJECT_RENDER_LIMIT)
  const panelDragRef = useRef(null)
  const panelResizeRef = useRef(null)

  useEffect(() => {
    setSettingJSON(PROJECT_FOLDERS_KEY, folders)
  }, [folders])

  useEffect(() => {
    if (!isMaximized) setSettingJSON(PROJECT_GALLERY_PANEL_KEY, panelFrame)
  }, [isMaximized, panelFrame])

  useEffect(() => {
    setSettingJSON(PROJECT_GALLERY_CARD_KEY, cardLayout)
  }, [cardLayout])

  useEffect(() => {
    if (!projectGalleryOpen) return undefined
    const clampFrameToViewport = () => {
      setPanelFrame((prev) => {
        const viewport = getViewportSize()
        const width = clampNumber(
          prev.width,
          MIN_GALLERY_PANEL.width,
          Math.max(MIN_GALLERY_PANEL.width, viewport.width - 32)
        )
        const height = clampNumber(
          prev.height,
          MIN_GALLERY_PANEL.height,
          Math.max(MIN_GALLERY_PANEL.height, viewport.height - 32)
        )
        return {
          width,
          height,
          x: clampNumber(prev.x, 12, Math.max(12, viewport.width - width - 12)),
          y: clampNumber(prev.y, 12, Math.max(12, viewport.height - height - 12))
        }
      })
    }
    clampFrameToViewport()
    window.addEventListener('resize', clampFrameToViewport)
    return () => window.removeEventListener('resize', clampFrameToViewport)
  }, [projectGalleryOpen])

  useEffect(() => {
    const syncFolders = () => {
      const saved = getSettingJSON(PROJECT_FOLDERS_KEY, [])
      setFolders(Array.isArray(saved) ? saved : [])
    }
    window.addEventListener(FOLDERS_UPDATED_EVENT, syncFolders)
    return () => window.removeEventListener(FOLDERS_UPDATED_EVENT, syncFolders)
  }, [])

  const syncCloudSeriesProjects = useCallback(async () => {
    if (!projectGalleryOpen || !setExternalProjects) return
    if (!isLoggedIn()) {
      setCloudLoggedIn(false)
      setCloudNeedsResync(false)
      setCloudSyncError('请先登录云端账号后再同步剧项目')
      return
    }
    setCloudLoggedIn(true)
    setCloudSyncing(true)
    setCloudSyncError('')
    try {
      const [response, assignmentsResponse] = await Promise.all([
        writingProjectsApi.list({ page: 1, per_page: 100 }),
        writingAssignmentsApi.getMyAssignments({ page: 1, per_page: 200 }).catch(() => null)
      ])
      const cloudProjects = Array.isArray(response?.items) ? response.items : []
      const assignments = Array.isArray(assignmentsResponse?.items) ? assignmentsResponse.items : []
      const assignmentByEpisodeId = new Map()
      assignments.forEach((assignment) => {
        if (!assignment?.episode_id) return
        const existing = assignmentByEpisodeId.get(assignment.episode_id)
        const existingTime = existing?.updated_at || existing?.created_at || ''
        const nextTime = assignment.updated_at || assignment.created_at || ''
        if (!existing || nextTime > existingTime) {
          assignmentByEpisodeId.set(assignment.episode_id, assignment)
        }
      })
      const seriesWithEpisodes = await Promise.all(
        cloudProjects.map(async (series) => {
          const episodes = await writingEpisodesApi.list(series.id).catch(() => [])
          return { series, episodes: Array.isArray(episodes) ? episodes : [] }
        })
      )

      const syncedAt = new Date().toISOString()
      const cloudFolders = seriesWithEpisodes.map(({ series }) => ({
        id: makeCloudFolderId(series.id),
        name: series.title,
        type: 'cloud_series',
        cloudProjectId: series.id,
        cloudTeamId: series.team_id,
        cloudRole: series.my_role || null,
        syncStatus: 'synced',
        lastSyncedAt: syncedAt,
        createdAt: series.created_at || syncedAt
      }))

      setFolders((prev) => [
        ...cloudFolders,
        ...prev.filter((folder) => folder.type !== 'cloud_series')
      ])

      setExternalProjects((prev = []) => {
        const existingById = new Map(prev.map((project) => [project.id, project]))
        const localProjects = prev.filter((project) => !project.cloudSync)
        const cloudEpisodeProjects = seriesWithEpisodes.flatMap(({ series, episodes }) =>
          episodes.map((episode) => {
            const id = makeCloudEpisodeProjectId(episode.id)
            const existing = existingById.get(id) || {}
            const assignment = assignmentByEpisodeId.get(episode.id)
            return {
              ...existing,
              id,
              name: episode.title
                ? `第${episode.episode_number}集 · ${episode.title}`
                : `第${episode.episode_number}集`,
              folderId: makeCloudFolderId(series.id),
              folder_id: makeCloudFolderId(series.id),
              createdAt: episode.created_at || series.created_at || syncedAt,
              updatedAt: episode.updated_at || series.updated_at || syncedAt,
              thumbnail: existing.thumbnail || null,
              nodesCount: existing.nodesCount || 0,
              cloudSync: true,
              cloudType: 'episode',
              cloudProjectId: series.id,
              cloudProjectTitle: series.title,
              cloudEpisodeId: episode.id,
              cloudEpisodeNumber: episode.episode_number,
              cloudEpisodeStatus: episode.status,
              cloudAssignmentId: assignment?.id || null,
              cloudAssignmentStatus: assignment?.status || null,
              cloudAssignmentTitle: assignment?.title || null,
              cloudReviewStatus:
                assignment?.status === 'approved'
                  ? 'approved'
                  : assignment?.status === 'rejected'
                    ? 'needs_revision'
                    : assignment?.status === 'submitted'
                      ? 'pending_review'
                      : 'not_submitted',
              cloudTeamId: series.team_id,
              cloudRole: series.my_role || null,
              syncStatus: 'synced'
            }
          })
        )
        return [...cloudEpisodeProjects, ...localProjects]
      })
      setCloudNeedsResync(false)
    } catch (error) {
      const message = navigator.onLine
        ? error instanceof Error
          ? error.message
          : '云端同步失败'
        : '当前离线，已保留本地副本，网络恢复后会自动同步'
      setCloudSyncError(message)
      setCloudNeedsResync(true)
      console.warn('[ProjectGallery] cloud sync failed:', error)
    } finally {
      setCloudSyncing(false)
    }
  }, [projectGalleryOpen, setExternalProjects])

  useEffect(() => {
    if (!projectGalleryOpen) return
    setCloudLoggedIn(isLoggedIn())
  }, [projectGalleryOpen])

  useEffect(() => {
    const refreshLoginState = () => {
      const nextLoggedIn = isLoggedIn()
      setCloudLoggedIn(nextLoggedIn)
      if (!nextLoggedIn) setCloudSyncError('请先登录云端账号后再同步剧项目')
    }
    const handleOnline = () => {
      if (cloudNeedsResync && projectGalleryOpen) syncCloudSeriesProjects()
    }
    window.addEventListener(CLOUD_AUTH_CHANGE_EVENT, refreshLoginState)
    window.addEventListener('storage', refreshLoginState)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener(CLOUD_AUTH_CHANGE_EVENT, refreshLoginState)
      window.removeEventListener('storage', refreshLoginState)
      window.removeEventListener('online', handleOnline)
    }
  }, [cloudNeedsResync, projectGalleryOpen, syncCloudSeriesProjects])

  const activeFolder = folders.find((folder) => folder.id === activeFolderId) || null
  const projectBelongsToFolder = useCallback((project, folderId) => {
    const projectFolderId = project.folderId || project.folder_id || ROOT_FOLDER_ID
    return folderId === ROOT_FOLDER_ID
      ? projectFolderId === ROOT_FOLDER_ID
      : projectFolderId === folderId
  }, [])

  const folderProjectCounts = useMemo(() => {
    const counts = new Map()
    for (const project of projects) {
      const folderId = project.folderId || project.folder_id || ROOT_FOLDER_ID
      counts.set(folderId, (counts.get(folderId) || 0) + 1)
    }
    return counts
  }, [projects])

  const getFolderProjectCount = useCallback(
    (folderId) => folderProjectCounts.get(folderId) || 0,
    [folderProjectCounts]
  )

  const handleCreateFolder = useCallback(() => {
    setNewFolderName('新文件夹')
    setShowFolderModal(true)
  }, [])

  const handleImportLocalProject = useCallback(async () => {
    if (!window.api?.projectFileAPI?.importLocal) {
      setLocalImportMessage('当前版本不支持导入本地项目')
      return
    }

    setLocalImporting(true)
    setLocalImportMessage('')
    try {
      const result = await window.api.projectFileAPI.importLocal({
        folderId: activeFolder ? activeFolder.id : null
      })
      if (!result?.success) {
        if (!result?.canceled) setLocalImportMessage(result?.error || '导入本地项目失败')
        return
      }

      const importedProject = result.project
      if (!importedProject?.id) {
        setLocalImportMessage('导入成功，但项目摘要缺少 ID，请重新打开项目管理刷新')
        return
      }

      setExternalProjects?.((prev) => [
        importedProject,
        ...prev.filter((project) => project.id !== importedProject.id)
      ])
      if (window.dbAPI?.projects?.save) {
        await window.dbAPI.projects.save(importedProject as any)
      }
      setLocalImportMessage(
        result.duplicatedId ? '已上传本地项目，并生成新的副本 ID，避免覆盖原项目' : '已上传本地项目'
      )
    } catch (error) {
      setLocalImportMessage(error?.message || '导入本地项目失败')
    } finally {
      setLocalImporting(false)
    }
  }, [activeFolder, setExternalProjects])

  const handleUploadProjectToTeamCloud = useCallback(
    async (event, project) => {
      event.stopPropagation()
      if (!project?.id) return
      if (!isLoggedIn()) {
        setLocalImportMessage('请先登录云端账号，再上传项目到小组云空间')
        window.dispatchEvent(new CustomEvent('open-personal-center'))
        return
      }

      const cloudContext = getCloudContext()
      const teamId = Number(project.cloudTeamId || cloudContext?.teamId || 0)
      if (!teamId) {
        setLocalImportMessage('请先在个人中心选择小组云空间，再上传项目')
        return
      }

      setProjectCloudUploadingId(project.id)
      setLocalImportMessage('')
      try {
        const projectData = window.api?.projectFileAPI?.load
          ? ((await window.api.projectFileAPI.load(project.id)) as any)
          : null
        if (!projectData) {
          throw new Error('没有找到项目文件，请先打开或保存一次项目')
        }

        const payload = {
          ...projectData,
          id: project.id,
          name: projectData.name || project.name,
          exportedAt: new Date().toISOString(),
          exportSource: 'project-gallery'
        }
        const content = JSON.stringify(payload, null, 2)
        const filename = makeProjectAssetFilename(project)
        const file = new File([content], filename, { type: 'application/json' })

        const signed = await assetsApi.getUploadUrl(teamId, {
          filename,
          content_type: file.type,
          file_size: file.size
        })
        const uploadRes = await fetch(signed.upload_url, {
          method: signed.method,
          headers: signed.headers,
          body: file
        })
        if (!uploadRes.ok) {
          const detail = await uploadRes.text().catch(() => '')
          throw new Error(`OSS 上传失败：${uploadRes.status}${detail ? ` ${detail.slice(0, 160)}` : ''}`)
        }

        await assetsApi.create(teamId, {
          name: project.name || filename,
          asset_type: 'project',
          mime_type: file.type,
          file_size: file.size,
          oss_key: signed.oss_key,
          tags: ['desktop-project', `project:${project.id}`],
          description: `星河智绘项目文件：${project.name || project.id}`
        })

        setLocalImportMessage(`已上传到小组云空间：${project.name || filename}`)
      } catch (error) {
        setLocalImportMessage(error?.message || '上传项目到小组云空间失败')
      } finally {
        setProjectCloudUploadingId(null)
      }
    },
    []
  )

  const confirmCreateFolder = useCallback(() => {
    const trimmed = newFolderName.trim()
    if (!trimmed) return
    const folder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      createdAt: new Date().toISOString()
    }
    setFolders((prev) => [folder, ...prev])
    setActiveFolderId(folder.id)
    setShowFolderModal(false)
  }, [newFolderName])

  const persistProjectFolder = useCallback(
    async (project, folderId) => {
      const normalizedFolderId = folderId === ROOT_FOLDER_ID ? null : folderId
      const nextProject = {
        ...project,
        folderId: normalizedFolderId,
        folder_id: normalizedFolderId
      }

      setExternalProjects?.((prev) =>
        prev.map((item) => (item.id === project.id ? { ...item, ...nextProject } : item))
      )

      try {
        if (window.api?.projectFileAPI?.load && window.api?.projectFileAPI?.save) {
          const data = (await window.api.projectFileAPI.load(project.id)) || {}
          await window.api.projectFileAPI.save(project.id, {
            ...data,
            id: project.id,
            name: data.name || project.name,
            folderId: normalizedFolderId
          })
        }
        if (window.dbAPI?.projects?.save) {
          await window.dbAPI.projects.save(nextProject)
        }
      } catch (error) {
        console.warn('[ProjectGallery] 保存项目文件夹失败:', error)
      }
    },
    [setExternalProjects]
  )

  const handleMoveProject = useCallback(
    (event, project, folderId) => {
      event.stopPropagation()
      setMoveMenuProjectId(null)
      persistProjectFolder(project, folderId)
    },
    [persistProjectFolder]
  )

  const handleDeleteFolder = useCallback(
    (event, folderId) => {
      event.stopPropagation()
      if (!window.confirm('删除文件夹？文件夹内项目会移回未归档。')) return
      setFolders((prev) => prev.filter((folder) => folder.id !== folderId))
      projects
        .filter((project) => (project.folderId || project.folder_id) === folderId)
        .forEach((project) => persistProjectFolder(project, ROOT_FOLDER_ID))
      if (activeFolderId === folderId) setActiveFolderId(ROOT_FOLDER_ID)
    },
    [activeFolderId, persistProjectFolder, projects]
  )

  // 筛选 + 排序
  const filteredProjects = useMemo(() => {
    let filtered = projects.filter((project) => projectBelongsToFolder(project, activeFolderId))
    filtered = filtered.filter((project) => projectMatchesGalleryFilter(project, projectFilter))
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((p) => (p.name || '').toLowerCase().includes(q))
    }
    if (sortBy === 'recent') {
      filtered.sort(
        (a, b) =>
          new Date(b.updatedAt || b.updated_at || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.updated_at || a.createdAt || 0).getTime()
      )
    } else if (sortBy === 'name') {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }
    return filtered
  }, [projects, searchQuery, sortBy, projectFilter, activeFolderId, projectBelongsToFolder])
  const visibleProjects = useMemo(
    () => filteredProjects.slice(0, projectRenderLimit),
    [filteredProjects, projectRenderLimit]
  )

  useEffect(() => {
    if (!projectGalleryOpen) return
    setProjectRenderLimit(INITIAL_PROJECT_RENDER_LIMIT)
  }, [activeFolderId, projectFilter, projectGalleryOpen, searchQuery, sortBy])

  // ═══ 进入项目（优先 JSON 文件，回退 SQLite）═══
  const handleEnterProject = useCallback(
    async (project) => {
      if (!project?.id) return
      setEnteringProjectId(project.id)
      setIsFadingOut(true)

      await new Promise((r) => setTimeout(r, 60))

      try {
        const store = useAppStore.getState()

        // 优先从 JSON 文件加载
        if (window.api?.projectFileAPI?.load) {
          const projectData = (await window.api.projectFileAPI.load(project.id)) as any
          if (projectData) {
            store.setNodes(projectData.nodes || [])
            store.setConnections(projectData.connections || [])
            if (projectData.view) store.setView(projectData.view)
            store.setProjectName(projectData.name || project.name)
            store.setCurrentProject(buildCurrentProjectMeta(project, projectData))
            if (Array.isArray(projectData.history)) {
              store.setHistory(projectData.history)
            } else {
              store.setHistory([])
            }
            // 恢复批量生产板数据
            if (projectData.productionBoard) {
              const pb = projectData.productionBoard
              if (Array.isArray(pb.rows)) store.setProductionBoardRows(pb.rows)
              if (pb.commonValues) store.setProductionBoardCommonValues(pb.commonValues)
              if (pb.mode) store.setProductionBoardMode(pb.mode)
            } else {
              store.setProductionBoardRows(null)
              store.setProductionBoardCommonValues(null)
            }
            window.api?.windowAPI?.focusFix()
            setProjectGalleryOpen(false)
            setEnteringProjectId(null)
            setIsFadingOut(false)
            return
          }
        }

        // 回退：从 SQLite 加载
        let savedNodes = []
        let savedConnections = []
        if (window.dbAPI?.nodes?.list) savedNodes = await window.dbAPI.nodes.list(project.id)
        if (window.dbAPI?.connections?.list)
          savedConnections = await window.dbAPI.connections.list(project.id)

        if (savedNodes.length > 0) {
          savedNodes = savedNodes.map((dbNode) => {
            let parsedContent = dbNode.content
            try {
              if (
                typeof dbNode.content === 'string' &&
                (dbNode.content.startsWith('{') || dbNode.content.startsWith('['))
              ) {
                parsedContent = JSON.parse(dbNode.content)
              }
            } catch {
              /* ignore */
            }
            return { ...dbNode, content: parsedContent }
          })
        }

        if (savedNodes.length === 0 && project.data?.nodes) savedNodes = project.data.nodes
        if (savedConnections.length === 0 && project.data?.connections)
          savedConnections = project.data.connections

        store.setNodes(savedNodes || [])
        store.setConnections(savedConnections || [])
        if (project.data?.view) store.setView(project.data.view)
        store.setProjectName(project.data?.projectName || project.name)
        store.setCurrentProject(buildCurrentProjectMeta(project))

        if (window.dbAPI?.settings) {
          const historyKey = `tapnow_history_v2_${project.id}`
          const historyJson = await window.dbAPI.settings.get(historyKey)
          if (historyJson) {
            try {
              const parsed = JSON.parse(historyJson)
              if (Array.isArray(parsed)) store.setHistory(parsed)
            } catch {
              /* ignore */
            }
          } else {
            store.setHistory([])
          }
        }
        window.api?.windowAPI?.focusFix()
      } catch (e) {
        console.error('[ProjectGallery] 加载项目失败:', e)
        setIsFadingOut(false)
      }
      setProjectGalleryOpen(false)
      setEnteringProjectId(null)
      setIsFadingOut(false)
    },
    [setCurrentProject, setProjectGalleryOpen]
  )

  // ═══ 删除项目 ═══
  const handleDeleteProject = useCallback(
    (e, projectId) => {
      e.stopPropagation()
      if (handleDeleteHistoryProject) handleDeleteHistoryProject(projectId)
      // 重置 fading 状态，防止 pointer-events-none 卡住
      setIsFadingOut(false)
    },
    [handleDeleteHistoryProject]
  )

  const handlePanelDragStart = useCallback(
    (event) => {
      if (isMaximized || event.target.closest('button,input,select')) return
      event.preventDefault()
      panelDragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: panelFrame.x,
        originY: panelFrame.y
      }
      const handleMove = (moveEvent) => {
        const drag = panelDragRef.current
        if (!drag) return
        const viewport = getViewportSize()
        setPanelFrame((prev) => ({
          ...prev,
          x: clampNumber(
            drag.originX + moveEvent.clientX - drag.startX,
            12,
            Math.max(12, viewport.width - prev.width - 12)
          ),
          y: clampNumber(
            drag.originY + moveEvent.clientY - drag.startY,
            12,
            Math.max(12, viewport.height - prev.height - 12)
          )
        }))
      }
      const handleUp = () => {
        panelDragRef.current = null
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
      }
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [isMaximized, panelFrame]
  )

  const handlePanelResizeStart = useCallback(
    (event) => {
      if (isMaximized) return
      event.preventDefault()
      event.stopPropagation()
      panelResizeRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        width: panelFrame.width,
        height: panelFrame.height
      }
      const handleMove = (moveEvent) => {
        const resize = panelResizeRef.current
        if (!resize) return
        const viewport = getViewportSize()
        setPanelFrame((prev) => ({
          ...prev,
          width: clampNumber(
            resize.width + moveEvent.clientX - resize.startX,
            MIN_GALLERY_PANEL.width,
            Math.max(MIN_GALLERY_PANEL.width, viewport.width - prev.x - 12)
          ),
          height: clampNumber(
            resize.height + moveEvent.clientY - resize.startY,
            MIN_GALLERY_PANEL.height,
            Math.max(MIN_GALLERY_PANEL.height, viewport.height - prev.y - 12)
          )
        }))
      }
      const handleUp = () => {
        panelResizeRef.current = null
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
      }
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'nwse-resize'
      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [isMaximized, panelFrame]
  )

  const updateCardLayout = useCallback((key, value) => {
    setCardLayout((prev) => ({ ...prev, [key]: Number(value) }))
  }, [])

  if (!projectGalleryOpen) return null

  const panelStyle = isMaximized
    ? {
        left: 72,
        top: 24,
        right: 24,
        bottom: 24,
        width: 'auto',
        height: isCollapsed ? 'auto' : 'auto'
      }
    : {
        left: panelFrame.x,
        top: panelFrame.y,
        width: panelFrame.width,
        height: isCollapsed ? 'auto' : panelFrame.height
      }

  return (
    <div
      className={`fixed inset-0 z-[100020] pointer-events-none ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        backgroundColor: 'rgba(4, 8, 14, 0.12)'
      }}
    >
      <style>{`
        @keyframes gallerySlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .gallery-content { animation: none; }
        .project-card {
          transition: border-color 0.08s ease;
        }
        .project-card:hover {
          transform: none;
          box-shadow: none;
          border-color: var(--primary-color) !important;
        }
        .project-card-entering {
          animation: cardEnter 0.5s ease-in-out;
        }
        @keyframes cardEnter {
          0%   { transform: scale(1); }
          50%  { transform: scale(0.95); box-shadow: 0 0 30px var(--primary-glow); }
          100% { transform: scale(1.05); opacity: 0.3; }
        }
      `}</style>

      {/* ═══ 顶部栏 ═══ */}
      <div
        className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{
          ...panelStyle,
          backgroundColor: 'rgba(18, 24, 34, 0.94)',
          borderColor: 'rgba(255,255,255,0.18)',
          boxShadow: '0 18px 48px rgba(0,0,0,0.34)'
        }}
      >
        <div
          className="flex shrink-0 cursor-grab flex-wrap items-center justify-between gap-3 px-5 py-4 gallery-content active:cursor-grabbing"
          onMouseDown={handlePanelDragStart}
          style={{
            backgroundColor: 'rgba(255,255,255,0.055)',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Grip size={15} style={{ color: 'var(--text-muted)' }} />
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              {activeFolder ? activeFolder.name : '项目管理'}
            </h1>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'var(--primary-color)',
                color: 'var(--text-on-primary, #fff)'
              }}
            >
              {filteredProjects.length} 个项目
            </span>
            {activeFolder && (
              <button
                onClick={() => setActiveFolderId(ROOT_FOLDER_ID)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors hover:bg-white/10"
                style={{ color: 'var(--text-secondary)' }}
              >
                <ArrowLeft size={13} /> 返回项目管理
              </button>
            )}
          </div>

          <div
            className="flex min-w-0 flex-wrap items-center justify-end gap-2"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              onClick={handleCreateFolder}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10 ${
                isCollapsed ? 'hidden' : ''
              }`}
              style={{
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
                backgroundColor: 'var(--bg-input, rgba(255,255,255,0.06))'
              }}
            >
              <FolderPlus size={14} /> 新建文件夹
            </button>
            <button
              onClick={handleImportLocalProject}
              disabled={localImporting}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
                backgroundColor: 'var(--bg-input, rgba(255,255,255,0.06))'
              }}
              title="从本机选择项目 JSON 并加入项目管理"
            >
              <Upload size={14} /> {localImporting ? '上传中' : '上传本地项目'}
            </button>
            <button
              onClick={() => setShowLayoutControls((value) => !value)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10 ${
                isCollapsed ? 'hidden' : ''
              }`}
              style={{
                color: showLayoutControls ? 'var(--text-on-primary, #fff)' : 'var(--text-primary)',
                border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
                backgroundColor: showLayoutControls
                  ? 'var(--primary-color)'
                  : 'var(--bg-input, rgba(255,255,255,0.06))'
              }}
              title="调整项目卡片尺寸"
            >
              <SlidersHorizontal size={14} /> 卡片尺寸
            </button>
            {/* 搜索框 */}
            <button
              onClick={() => {
                if (!cloudLoggedIn) {
                  window.dispatchEvent(new CustomEvent('open-personal-center'))
                  return
                }
                syncCloudSeriesProjects()
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/10 ${
                isCollapsed ? 'hidden' : ''
              }`}
              style={{
                color: cloudSyncError ? '#fca5a5' : 'var(--text-primary)',
                border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
                backgroundColor: 'var(--bg-input, rgba(255,255,255,0.06))'
              }}
              title={cloudSyncError || (cloudLoggedIn ? '同步云端剧项目' : '登录后同步云端剧项目')}
              disabled={cloudSyncing}
            >
              <RotateCcw size={14} className={cloudSyncing ? 'animate-spin' : ''} />
              {cloudSyncing ? '同步中' : cloudLoggedIn ? '同步云端' : '登录云端'}
            </button>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className={`text-xs px-2.5 py-1.5 rounded-lg outline-none cursor-pointer ${
                isCollapsed ? 'hidden' : ''
              }`}
              style={{
                backgroundColor: 'var(--bg-input, rgba(255,255,255,0.06))',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default, rgba(255,255,255,0.1))'
              }}
            >
              {PROJECT_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
            <div className={`relative ${isCollapsed ? 'hidden' : ''}`}>
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索项目..."
                className="pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none w-48"
                style={{
                  backgroundColor: 'var(--bg-input, rgba(255,255,255,0.06))',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default, rgba(255,255,255,0.1))'
                }}
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={`text-xs px-2.5 py-1.5 rounded-lg outline-none cursor-pointer ${
                isCollapsed ? 'hidden' : ''
              }`}
              style={{
                backgroundColor: 'var(--bg-input, rgba(255,255,255,0.06))',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default, rgba(255,255,255,0.1))'
              }}
            >
              <option value="recent">最近修改</option>
              <option value="name">名称排序</option>
            </select>
            <button
              onClick={() => {
                setIsCollapsed((value) => !value)
                setShowLayoutControls(false)
              }}
              className="p-2 rounded-lg transition-colors hover:bg-white/10"
              style={{ color: 'var(--text-muted)' }}
              title={isCollapsed ? '展开项目管理' : '收纳项目管理'}
            >
              {isCollapsed ? <Maximize2 size={17} /> : <Minus size={17} />}
            </button>
            <button
              onClick={() => setIsMaximized((value) => !value)}
              className={`p-2 rounded-lg transition-colors hover:bg-white/10 ${
                isCollapsed ? 'hidden' : ''
              }`}
              style={{ color: 'var(--text-muted)' }}
              title={isMaximized ? '还原浮窗' : '放大浮窗'}
            >
              {isMaximized ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button
              onClick={() => setProjectGalleryOpen(false)}
              className="p-2 rounded-lg transition-colors hover:bg-white/10"
              style={{ color: 'var(--text-muted)' }}
              title="关闭项目管理"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {!isCollapsed && showLayoutControls && (
          <div
            className="grid shrink-0 gap-3 px-5 py-3 gallery-content md:grid-cols-3"
            style={{
              backgroundColor: 'rgba(255,255,255,0.035)',
              borderBottom: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            {CARD_LAYOUT_CONTROLS.map((control) => (
              <label key={control.key} className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-3 text-[10px]">
                  <span style={{ color: 'var(--text-secondary)' }}>{control.label}</span>
                  <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
                    {cardLayout[control.key]}
                    {control.unit}
                  </span>
                </div>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={cardLayout[control.key]}
                  onChange={(event) => updateCardLayout(control.key, event.target.value)}
                  className="w-full accent-[var(--primary-color)]"
                />
              </label>
            ))}
          </div>
        )}

        {localImportMessage && (
          <div className="px-5 py-3 gallery-content">
            <div
              className="flex items-center justify-between rounded-xl px-3 py-2 text-xs"
              style={{
                backgroundColor: localImportMessage.includes('失败')
                  ? 'rgba(239,68,68,0.14)'
                  : 'rgba(16,185,129,0.13)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default, rgba(255,255,255,0.1))'
              }}
            >
              <span>{localImportMessage}</span>
              <button
                className="rounded-lg px-2 py-1 hover:bg-white/10"
                onClick={() => setLocalImportMessage('')}
              >
                知道了
              </button>
            </div>
          </div>
        )}

        {!isCollapsed && cloudSyncError && (
          <div className="px-5 py-3 gallery-content">
            <div
              className="flex items-center justify-between rounded-xl px-3 py-2 text-xs"
              style={{
                backgroundColor: cloudLoggedIn ? 'rgba(251,191,36,0.14)' : 'rgba(59,130,246,0.14)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default, rgba(255,255,255,0.1))'
              }}
            >
              <span>{cloudSyncError}</span>
              {!cloudLoggedIn ? (
                <button
                  className="rounded-lg px-2 py-1 hover:bg-white/10"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-personal-center'))}
                >
                  去登录
                </button>
              ) : cloudNeedsResync ? (
                <button
                  className="rounded-lg px-2 py-1 hover:bg-white/10"
                  onClick={syncCloudSeriesProjects}
                  disabled={cloudSyncing}
                >
                  重新同步
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* ═══ 项目网格 ═══ */}
        {!isCollapsed && (
          <div
            className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 gallery-content custom-scrollbar"
            style={{ animationDelay: '0.1s' }}
          >
            {filteredProjects.length === 0 &&
            (activeFolder || folders.length === 0) &&
            !searchQuery ? (
              <div className="flex flex-col items-center justify-center py-24">
                <FolderOpen size={56} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                <p className="text-sm mt-4" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  还没有任何项目
                </p>
                <button
                  onClick={() => setShowNewModal(true)}
                  className="mt-6 flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105"
                  style={{
                    backgroundColor: 'var(--primary-color)',
                    color: 'var(--text-on-primary, #fff)',
                    boxShadow: '0 4px 20px rgba(59,130,246,0.3)'
                  }}
                >
                  <Plus size={16} /> 新建画布
                </button>
              </div>
            ) : (
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${cardLayout.cardMinWidth}px, 1fr))`,
                  gap: cardLayout.gap
                }}
              >
                {!activeFolder &&
                  folders.map((folder) => (
                    <div
                      key={folder.id}
                      className="project-card group cursor-pointer rounded-xl overflow-hidden"
                      style={{
                        backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.02))',
                        border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))'
                      }}
                      onClick={() => setActiveFolderId(folder.id)}
                    >
                      <div
                        className="w-full flex items-center justify-center relative overflow-hidden"
                        style={{
                          height: cardLayout.thumbnailHeight,
                          backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.02))'
                        }}
                      >
                        <FolderOpen
                          size={38}
                          style={{ color: 'var(--text-secondary)', opacity: 0.65 }}
                        />
                        {folder.type !== 'cloud_series' && (
                          <button
                            onClick={(event) => handleDeleteFolder(event, folder.id)}
                            className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200"
                            style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }}
                            title="删除文件夹"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      <div className="px-3.5 py-3">
                        <h3
                          className="text-sm font-medium truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {folder.name}
                        </h3>
                        {folder.type === 'cloud_series' && (
                          <div
                            className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px]"
                            style={{
                              backgroundColor: 'rgba(59,130,246,0.16)',
                              color: '#bfdbfe'
                            }}
                          >
                            云同步
                          </div>
                        )}
                        <div className="mt-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {getFolderProjectCount(folder.id)} 个项目
                        </div>
                      </div>
                    </div>
                  ))}

                {visibleProjects.map((project, i) => (
                  <div
                    key={project.id}
                    className={`project-card group cursor-pointer rounded-xl overflow-hidden ${
                      enteringProjectId === project.id ? 'project-card-entering' : ''
                    }`}
                    style={{
                      backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.02))',
                      border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))'
                    }}
                    onClick={() => handleEnterProject(project)}
                  >
                    <div
                      className="w-full flex items-center justify-center relative overflow-hidden"
                      style={{
                        height: cardLayout.thumbnailHeight,
                        backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.02))'
                      }}
                    >
                      {project.thumbnail ? (
                        <img
                          src={project.thumbnail}
                          alt={project.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                        />
                      ) : (
                        <FolderOpen
                          size={32}
                          style={{ color: 'var(--text-muted)', opacity: 0.15 }}
                        />
                      )}
                      {!project.cloudSync && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setMoveMenuProjectId((id) => (id === project.id ? null : project.id))
                          }}
                          className="absolute top-2 left-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200"
                          style={{
                            backgroundColor: 'rgba(15,23,42,0.45)',
                            color: 'var(--text-secondary)'
                          }}
                          title="归档到文件夹"
                        >
                          <FolderOpen size={13} />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleUploadProjectToTeamCloud(e, project)}
                        disabled={projectCloudUploadingId === project.id}
                        className="absolute top-2 right-10 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
                        style={{
                          backgroundColor: 'rgba(59,130,246,0.16)',
                          color: '#bfdbfe'
                        }}
                        title="上传项目到小组云空间"
                      >
                        <Upload
                          size={13}
                          className={projectCloudUploadingId === project.id ? 'animate-pulse' : ''}
                        />
                      </button>
                      {!project.cloudSync && moveMenuProjectId === project.id && (
                        <div
                          className="absolute left-2 top-10 z-20 min-w-32 rounded-lg border p-1 text-xs shadow-xl backdrop-blur-md"
                          style={{
                            backgroundColor: 'var(--bg-elevated, rgba(15,23,42,0.92))',
                            borderColor: 'var(--border-default, rgba(255,255,255,0.1))',
                            color: 'var(--text-primary)'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                            onClick={(event) => handleMoveProject(event, project, ROOT_FOLDER_ID)}
                          >
                            未归档
                          </button>
                          {folders
                            .filter((folder) => folder.type !== 'cloud_series')
                            .map((folder) => (
                              <button
                                key={folder.id}
                                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                                onClick={(event) => handleMoveProject(event, project, folder.id)}
                              >
                                {folder.name}
                              </button>
                            ))}
                        </div>
                      )}
                      {!project.cloudSync && (
                        <button
                          onClick={(e) => handleDeleteProject(e, project.id)}
                          className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200"
                          style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }}
                          title="删除项目"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="px-3.5 py-3">
                      <h3
                        className="text-sm font-medium truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {project.name || '未命名项目'}
                      </h3>
                      {project.cloudSync && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px]"
                            style={{ backgroundColor: 'rgba(59,130,246,0.16)', color: '#bfdbfe' }}
                          >
                            云端剧集
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            剧集:{' '}
                            {getStatusLabel(EPISODE_STATUS_LABELS, project.cloudEpisodeStatus)}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            任务:{' '}
                            {getStatusLabel(
                              ASSIGNMENT_STATUS_LABELS,
                              project.cloudAssignmentStatus,
                              '未分配'
                            )}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            审核:{' '}
                            {getStatusLabel(
                              REVIEW_STATUS_LABELS,
                              getReviewStatus(project),
                              '未提交'
                            )}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1">
                          <Clock size={10} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {project.updatedAt || project.updated_at || project.createdAt
                              ? new Date(
                                  project.updatedAt || project.updated_at || project.createdAt
                                ).toLocaleDateString('zh-CN', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : '未知'}
                          </span>
                        </div>
                        {project.nodesCount > 0 && (
                          <span
                            className="text-[10px]"
                            style={{ color: 'var(--text-muted)', opacity: 0.6 }}
                          >
                            {project.nodesCount} 节点
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* ═══ 新建画布卡片（虚线框）═══ */}
                {activeFolder?.type !== 'cloud_series' && (
                  <div
                    className="cursor-pointer rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02] flex flex-col items-center justify-center bg-transparent hover:bg-[var(--primary-color)]/10"
                    style={{
                      border: '2px dashed rgba(255, 255, 255, 0.6)',
                      minHeight: cardLayout.thumbnailHeight + 76
                    }}
                    onClick={() => setShowNewModal(true)}
                  >
                    <Plus size={28} style={{ color: 'rgba(255, 255, 255, 0.8)' }} />
                    <span
                      className="text-xs font-medium mt-2"
                      style={{ color: 'rgba(255, 255, 255, 0.8)' }}
                    >
                      新建画布
                    </span>
                  </div>
                )}
                {visibleProjects.length < filteredProjects.length && (
                  <button
                    type="button"
                    className="cursor-pointer rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-8 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    onClick={() =>
                      setProjectRenderLimit((value) =>
                        Math.min(value + INITIAL_PROJECT_RENDER_LIMIT, filteredProjects.length)
                      )
                    }
                  >
                    显示更多项目（{filteredProjects.length - visibleProjects.length}）
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ 新建画布配置弹窗 ═══ */}
        {!isMaximized && !isCollapsed && (
          <div
            className="absolute bottom-1.5 right-1.5 z-20 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white/75"
            onMouseDown={handlePanelResizeStart}
            title="拖动调整项目管理大小"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M12 2L2 12M12 6L6 12M12 10L10 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
      </div>

      {showNewModal && (
        <NewCanvasModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false)
            setProjectGalleryOpen(false)
          }}
          setExternalProjects={setExternalProjects}
          folderId={activeFolder ? activeFolder.id : null}
        />
      )}

      {showFolderModal && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 backdrop-blur-sm pointer-events-auto"
          onClick={() => setShowFolderModal(false)}
        >
          <div
            className="w-[360px] rounded-2xl border p-5 shadow-2xl"
            style={{
              backgroundColor: 'var(--bg-elevated, rgba(15,23,42,0.96))',
              borderColor: 'var(--border-default, rgba(255,255,255,0.12))',
              color: 'var(--text-primary)'
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <FolderPlus size={16} /> 新建文件夹
            </div>
            <input
              autoFocus
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirmCreateFolder()
                if (event.key === 'Escape') setShowFolderModal(false)
              }}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--bg-input, rgba(255,255,255,0.06))',
                borderColor: 'var(--border-default, rgba(255,255,255,0.12))',
                color: 'var(--text-primary)'
              }}
              placeholder="输入文件夹名称"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg px-4 py-2 text-xs transition-colors hover:bg-white/10"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setShowFolderModal(false)}
              >
                取消
              </button>
              <button
                className="rounded-lg px-4 py-2 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--primary-color)',
                  color: 'var(--text-on-primary, #fff)'
                }}
                onClick={confirmCreateFolder}
                disabled={!newFolderName.trim()}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

// ══════════════════════════════════════════════════════
// 新建画布配置弹窗
// ══════════════════════════════════════════════════════

const TEMPLATES = [
  { id: 'blank', icon: '📄', label: '空白画布', desc: '从零开始' },
  { id: 'production', icon: '🎬', label: '批量生产板', desc: '批量创建+管理' }
]

const SAVED_TEMPLATES_KEY = 'newcanvas_saved_templates'
const LAST_CONFIG_KEY = 'newcanvas_last_config'

function NewCanvasModal({ onClose, onCreated, setExternalProjects, folderId = null }) {
  const setCurrentProject = useAppStore((s) => s.setCurrentProject)

  const [name, setName] = useState('我的项目')
  const [cacheRoot, setCacheRoot] = useState('')
  const [cacheRootError, setCacheRootError] = useState('')
  const [isChoosingCacheRoot, setIsChoosingCacheRoot] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('blank')

  // 生产板配置
  const [addProduction, setAddProduction] = useState(false)
  const [prodType, setProdType] = useState('video')
  const [prodCount, setProdCount] = useState(6)
  const [prodModel, setProdModel] = useState('')
  const [prodRatio, setProdRatio] = useState('16:9')

  // 分组配置
  const [addGroups, setAddGroups] = useState(false)
  const [groupCount, setGroupCount] = useState(3)
  const [nodesPerGroup, setNodesPerGroup] = useState(4)

  // 导入文档（统一解析镜头+角色+场景）
  const [docFile, setDocFile] = useState(null)
  const [docParsed, setDocParsed] = useState(null) // { shots, characters, scenes }

  // 已保存模板
  const [savedTemplates, setSavedTemplates] = useState([])
  const [savingName, setSavingName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  const nameInputRef = useRef(null)

  // 加载已保存模板 + 上次配置
  useEffect(() => {
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
    setSavedTemplates(getSettingJSON(SAVED_TEMPLATES_KEY, []))
    // 恢复上次配置
    const last = getSettingJSON(LAST_CONFIG_KEY, null)
    if (last) {
      if (last.addProduction !== undefined) setAddProduction(last.addProduction)
      if (last.prodType) setProdType(last.prodType)
      if (last.prodCount) setProdCount(last.prodCount)
      if (last.prodModel) setProdModel(last.prodModel)
      if (last.prodRatio) setProdRatio(last.prodRatio)
      if (last.addGroups !== undefined) setAddGroups(last.addGroups)
      if (last.groupCount) setGroupCount(last.groupCount)
      if (last.nodesPerGroup) setNodesPerGroup(last.nodesPerGroup)
    }
  }, [])

  // 解析文档（统一提取镜头+角色+道具+场景，支持 .docx）
  useEffect(() => {
    if (!docFile) {
      setDocParsed(null)
      return
    }
    const processText = (text: string) => {
      const result = parseDocument(text)
      setDocParsed(result)

      // 根据当前选择的类型智能设置行数
      const isVid = prodType === 'video'
      const relevantCount = isVid
        ? result.shots.length
        : result.characters.length + result.props.length + result.scenes.length

      if (relevantCount > 0 && selectedTemplate === 'blank') {
        setAddProduction(true)
        setProdCount(relevantCount)
      }
      if (relevantCount > 0 && selectedTemplate === 'production') {
        setProdCount(relevantCount)
      }
    }
    if (isDocxFile(docFile.name)) {
      // Word 文档：读取为 ArrayBuffer 后提取文本
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const text = await extractTextFromDocx(e.target.result as ArrayBuffer)
          processText(text)
        } catch {
          setDocParsed({ shots: [], characters: [], props: [], scenes: [] })
        }
      }
      reader.readAsArrayBuffer(docFile)
    } else {
      // 纯文本格式
      const reader = new FileReader()
      reader.onload = (e) => processText(e.target.result as string)
      reader.readAsText(docFile)
    }
  }, [docFile])

  // 获取当前配置快照
  const getConfigSnapshot = () => ({
    addProduction,
    prodType,
    prodCount,
    prodModel,
    prodRatio,
    addGroups,
    groupCount,
    nodesPerGroup
  })

  // 保存为模板
  const handleSaveTemplate = () => {
    const tplName = savingName.trim()
    if (!tplName) return
    const tpl = { id: `tpl-${Date.now()}`, name: tplName, ...getConfigSnapshot() }
    const updated = [tpl, ...savedTemplates]
    setSavedTemplates(updated)
    setSettingJSON(SAVED_TEMPLATES_KEY, updated)
    setSavingName('')
    setShowSaveInput(false)
  }

  // 加载模板
  const handleLoadTemplate = (tpl) => {
    if (tpl.addProduction !== undefined) setAddProduction(tpl.addProduction)
    if (tpl.prodType) setProdType(tpl.prodType)
    if (tpl.prodCount) setProdCount(tpl.prodCount)
    if (tpl.prodModel !== undefined) setProdModel(tpl.prodModel)
    if (tpl.prodRatio) setProdRatio(tpl.prodRatio)
    if (tpl.addGroups !== undefined) setAddGroups(tpl.addGroups)
    if (tpl.groupCount) setGroupCount(tpl.groupCount)
    if (tpl.nodesPerGroup) setNodesPerGroup(tpl.nodesPerGroup)
    setSelectedTemplate('blank') // 切到自定义状态
  }

  // 删除模板
  const handleDeleteTemplate = (id) => {
    const updated = savedTemplates.filter((t) => t.id !== id)
    setSavedTemplates(updated)
    setSettingJSON(SAVED_TEMPLATES_KEY, updated)
  }

  // 恢复上次配置
  const handleRestoreLast = () => {
    const last = getSettingJSON(LAST_CONFIG_KEY, null)
    if (last) handleLoadTemplate(last)
  }

  // 模板预设
  useEffect(() => {
    switch (selectedTemplate) {
      case 'production':
        // 生产板模板：不创建画布节点，创建后直接打开生产板
        setAddProduction(false)
        setAddGroups(false)
        setProdType('video')
        setProdCount(6)
        break
      default:
        setAddProduction(false)
        setAddGroups(false)
        break
    }
  }, [selectedTemplate])

  const chooseCacheRoot = useCallback(async () => {
    if (!window.api?.localCacheAPI?.openDirectory) {
      setCacheRootError('当前环境无法打开文件夹选择器')
      return
    }

    setIsChoosingCacheRoot(true)
    setCacheRootError('')
    try {
      const result = await window.api.localCacheAPI.openDirectory(cacheRoot || undefined)
      if (result?.success && result.path) {
        setCacheRoot(result.path)
        setCacheRootError('')
      }
    } catch (error) {
      console.warn('[NewCanvasModal] 选择储存文件夹失败:', error)
      setCacheRootError('选择储存文件夹失败，请重试')
    } finally {
      setIsChoosingCacheRoot(false)
    }
  }, [cacheRoot])

  const handleCreate = async () => {
    const projectName = name.trim() || '新建画布'
    const selectedCacheRoot = cacheRoot.trim()
    if (!selectedCacheRoot) {
      setCacheRootError('请先选择储存文件夹')
      return
    }

    const newId = `proj-${Date.now()}`
    const newProject = {
      id: newId,
      name: projectName,
      folderId,
      cacheRoot: selectedCacheRoot,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // 保存当前配置为"上次的配置"
    setSettingJSON(LAST_CONFIG_KEY, getConfigSnapshot())

    try {
      if (window.api?.localCacheAPI?.config) {
        await window.api.localCacheAPI.config({ projectId: newId, cacheRoot: selectedCacheRoot })
      }
    } catch (e) {
      console.warn('[NewCanvasModal] 初始化项目缓存目录失败:', e)
    }

    // 保存到数据库
    try {
      if (window.dbAPI?.projects?.save) {
        await window.dbAPI.projects.save(newProject)
      }
    } catch (e) {
      console.warn('[NewCanvasModal] 保存新项目失败:', e)
    }

    if (setExternalProjects) {
      setExternalProjects((prev) => [{ ...newProject, thumbnail: null }, ...prev])
    }

    const store = useAppStore.getState()

    // 创建预设节点
    const newNodes = []
    const NODE_W = prodType === 'video' ? 420 : 360
    const NODE_H = prodType === 'video' ? 360 : 340
    const GAP = 48
    const COLS = 4

    // 文档解析数据
    const scriptShots = docParsed?.shots || []
    const charShots = docParsed?.characters || []
    const actualProdCount =
      scriptShots.length > 0 ? Math.max(prodCount, scriptShots.length) : prodCount

    if (addProduction && actualProdCount > 0) {
      for (let i = 0; i < actualProdCount; i++) {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        const nodeType = prodType === 'video' ? 'gen-video' : 'gen-image'
        const promptKey = prodType === 'video' ? 'videoPrompt' : 'prompt'

        // 从剧本自动填充提示词
        const shotContent = scriptShots[i]?.content || ''

        newNodes.push({
          id: `${nodeType}_${Date.now()}_${i}`,
          type: nodeType,
          x: 200 + col * (NODE_W + GAP),
          y: 200 + row * (NODE_H + GAP),
          position: { x: 200 + col * (NODE_W + GAP), y: 200 + row * (NODE_H + GAP) },
          width: NODE_W,
          height: NODE_H,
          data: {},
          settings: {
            model: prodModel || '',
            ratio: prodRatio || '16:9',
            ...(shotContent && { [promptKey]: shotContent })
          }
        })
      }
    }

    // 角色本 → 创建角色节点（gen-image 类型，放在生产板下方）
    if (charShots.length > 0) {
      const charStartY = addProduction
        ? 200 + Math.ceil(actualProdCount / COLS) * (NODE_H + GAP) + 80
        : 200
      charShots.forEach((ch, ci) => {
        const col = ci % COLS
        const row = Math.floor(ci / COLS)
        newNodes.push({
          id: `gen-image_char_${Date.now()}_${ci}`,
          type: 'gen-image',
          x: 200 + col * (360 + GAP),
          y: charStartY + row * (340 + GAP),
          position: { x: 200 + col * (360 + GAP), y: charStartY + row * (340 + GAP) },
          width: 360,
          height: 340,
          data: {},
          settings: {
            prompt: ch.content || '',
            model: prodModel || '',
            ratio: '1:1' // 角色通常用 1:1
          }
        })
      })
    }

    if (addGroups && groupCount > 0) {
      const charRowCount = charShots.length > 0 ? Math.ceil(charShots.length / COLS) : 0
      const groupStartY = (() => {
        let y = 200
        if (addProduction) y += Math.ceil(actualProdCount / COLS) * (NODE_H + GAP) + 80
        if (charShots.length > 0) y += charRowCount * (340 + GAP) + 80
        return y
      })()
      const groupColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4']

      for (let g = 0; g < groupCount; g++) {
        const groupId = `group_${Date.now()}_${g}`
        const groupName = `分组 ${g + 1}`
        const groupNodeIds = []

        for (let n = 0; n < nodesPerGroup; n++) {
          const nodeId = `gen-image_${Date.now()}_g${g}_n${n}`
          groupNodeIds.push(nodeId)
          newNodes.push({
            id: nodeId,
            type: 'gen-image',
            x: 200 + n * (360 + GAP),
            y: groupStartY + g * (340 + GAP + 40),
            position: { x: 200 + n * (360 + GAP), y: groupStartY + g * (340 + GAP + 40) },
            width: 360,
            height: 340,
            data: {},
            settings: {}
          })
        }

        const existingGroups = store.nodeGroups || []
        store.setNodeGroups([
          ...existingGroups,
          {
            id: groupId,
            name: groupName,
            nodeIds: groupNodeIds,
            color: groupColors[g % groupColors.length],
            collapsed: false
          }
        ])
      }
    }

    store.setNodes(newNodes)
    store.setConnections([])
    store.setProjectName(projectName)

    // 先把新节点写入 DB，防止 ProjectContext 的 loadFromDatabase 覆盖为空
    if (window.dbAPI?.nodes?.saveBatch && newNodes.length > 0) {
      try {
        await window.dbAPI.nodes.saveBatch(newNodes, newId)
      } catch (e) {
        console.warn('[NewCanvasModal] 保存预设节点到 DB 失败:', e)
      }
    }

    store.setCurrentProject(newProject)
    store.setHistory([])

    // 批量生产板模板：创建后直接打开生产板
    if (selectedTemplate === 'production') {
      const isVideoMode = prodType === 'video'
      store.setProductionBoardMode(isVideoMode ? 'video' : 'image')

      // ═══ 同时初始化两个模式的数据 ═══
      const MAKE_ROW = () => ({
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: '',
        prompt: '',
        assetIds: [],
        refCharacters: [],
        refProps: [],
        refScenes: [],
        refAudios: [],
        refVideos: [],
        ratio: '16:9',
        duration: '5s',
        count: 1,
        model: '',
        status: 'idle',
        previews: []
      })

      // 视频板：镜头
      const scriptShots = docParsed?.shots || []
      if (scriptShots.length > 0) {
        store.setProductionBoardVideoRows(
          scriptShots.map((s, i) => ({
            ...MAKE_ROW(),
            name: s.title || `镜头${i + 1}`,
            prompt: s.content
          }))
        )
      }

      // 图片板：角色 + 道具 + 场景
      const chars = docParsed?.characters || []
      const props = docParsed?.props || []
      const scenes = docParsed?.scenes || []
      const imageItems = [
        ...chars.map((c, i) => ({
          ...MAKE_ROW(),
          name: c.title || `角色${i + 1}`,
          prompt: c.content
        })),
        ...props.map((p, i) => ({
          ...MAKE_ROW(),
          name: p.title || `道具${i + 1}`,
          prompt: p.content
        })),
        ...scenes.map((s, i) => ({
          ...MAKE_ROW(),
          name: s.title || `场景${i + 1}`,
          prompt: s.content
        }))
      ]
      if (imageItems.length > 0) {
        store.setProductionBoardImageRows(imageItems)
      }

      // 设置当前模式的 initCount 来触发 ProductionBoard 初始化
      if (isVideoMode) {
        const initCount = scriptShots.length > 0 ? scriptShots.length : prodCount || 6
        if (scriptShots.length > 0) {
          store.setProductionBoardInitData(
            scriptShots.map((s) => ({ name: s.title, prompt: s.content }))
          )
        }
        store.setProductionBoardInitCount(initCount)
      } else {
        const initCount = imageItems.length > 0 ? imageItems.length : prodCount || 6
        if (imageItems.length > 0) {
          store.setProductionBoardInitData(
            imageItems.map((r) => ({ name: r.name, prompt: r.prompt }))
          )
        }
        store.setProductionBoardInitCount(initCount)
      }

      store.setProductionBoardOpen(true)
    }

    try {
      if (window.api?.projectFileAPI?.save) {
        const latestStore = useAppStore.getState()
        await window.api.projectFileAPI.save(newId, {
          schemaVersion: '2.0.25',
          name: projectName,
          folderId,
          createdAt: newProject.createdAt,
          cacheRoot: selectedCacheRoot,
          view: latestStore.view,
          nodes: sanitizeNodesForProjectSave(latestStore.nodes || []),
          nodeGroups: latestStore.nodeGroups || [],
          connections: latestStore.connections || [],
          history: sanitizeHistoryForSave(latestStore.history || []),
          productionBoard: {
            rows: latestStore.productionBoardRows || [],
            commonValues: latestStore.productionBoardCommonValues || null,
            mode: latestStore.productionBoardMode || 'video',
            videoRows: latestStore.productionBoardVideoRows || null,
            videoCommonValues: latestStore.productionBoardVideoCommonValues || null,
            imageRows: latestStore.productionBoardImageRows || null,
            imageCommonValues: latestStore.productionBoardImageCommonValues || null,
            sharedRefs: latestStore.productionBoardSharedRefs || null
          }
        })
      }
    } catch (e) {
      console.warn('[NewCanvasModal] 保存新项目文件失败:', e)
    }

    window.api?.windowAPI?.focusFix()
    onCreated?.()
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative rounded-2xl overflow-hidden flex"
        style={{
          width: 720,
          maxHeight: '80vh',
          backgroundColor: 'var(--bg-panel, #1a1d24)',
          border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
          boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
          animation: 'gallerySlideUp 0.35s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes gallerySlideUp {
            from { opacity: 0; transform: translateY(20px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        {/* ═══ 左侧：模板选择 ═══ */}
        <div
          className="w-[200px] shrink-0 flex flex-col py-4 px-3"
          style={{
            borderRight: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
            backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.02))'
          }}
        >
          <div className="flex items-center gap-1.5 px-2 mb-3">
            <FolderOpen size={13} style={{ color: 'var(--primary-color)' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              最近模板
            </span>
          </div>

          <div className="flex flex-col gap-1 flex-1 overflow-y-auto">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all"
                style={{
                  backgroundColor:
                    selectedTemplate === t.id ? 'var(--primary-color)' : 'transparent',
                  color:
                    selectedTemplate === t.id
                      ? 'var(--text-on-primary, #fff)'
                      : 'var(--text-secondary)'
                }}
                onClick={() => setSelectedTemplate(t.id)}
              >
                <span className="text-sm">{t.icon}</span>
                <div>
                  <div className="text-[11px] font-medium">{t.label}</div>
                  <div className="text-[9px] opacity-60">{t.desc}</div>
                </div>
              </button>
            ))}
          </div>

          <div
            className="border-t mt-2 pt-2 space-y-0.5"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {/* 上次的配置 */}
            <button
              className="flex items-center gap-1.5 px-2 py-1.5 w-full rounded-md text-[10px] text-left transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onClick={handleRestoreLast}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              title="恢复上次创建时使用的配置"
            >
              <RotateCcw size={10} style={{ color: 'var(--text-muted)' }} /> 上次的配置
            </button>
            {/* 已保存模板 */}
            {savedTemplates.length > 0 && (
              <div className="max-h-[100px] overflow-y-auto">
                {savedTemplates.map((tpl) => (
                  <div key={tpl.id} className="flex items-center group">
                    <button
                      className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] text-left transition-colors truncate"
                      style={{ color: 'var(--text-secondary)' }}
                      onClick={() => handleLoadTemplate(tpl)}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      title={`加载模板: ${tpl.name}`}
                    >
                      <Save size={9} style={{ color: 'var(--text-muted)' }} />
                      <span className="truncate">{tpl.name}</span>
                    </button>
                    <button
                      className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      title="删除模板"
                    >
                      <Trash2 size={9} style={{ color: '#f87171' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* 保存当前配置 */}
            {showSaveInput ? (
              <div className="flex gap-1 px-1">
                <input
                  autoFocus
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') handleSaveTemplate()
                    if (e.key === 'Escape') setShowSaveInput(false)
                  }}
                  placeholder="模板名称"
                  className="flex-1 text-[10px] px-1.5 py-1 rounded outline-none"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)'
                  }}
                />
                <button
                  onClick={handleSaveTemplate}
                  className="px-1.5 py-1 rounded text-[9px] font-medium"
                  style={{
                    backgroundColor: 'var(--primary-color)',
                    color: 'var(--text-on-primary)'
                  }}
                >
                  保存
                </button>
              </div>
            ) : (
              <button
                className="flex items-center gap-1.5 px-2 py-1.5 w-full rounded-md text-[10px] text-left transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => setShowSaveInput(true)}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Save size={10} /> 保存为模板
              </button>
            )}
          </div>
        </div>

        {/* ═══ 右侧：画布配置 ═══ */}
        <div className="flex-1 flex flex-col">
          {/* 标题 */}
          <div
            className="px-5 pt-4 pb-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              ✨ 新建画布
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* 可滚动配置区域 */}
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {/* 名称 */}
            <div>
              <label
                className="text-[10px] font-semibold tracking-wider mb-1 block"
                style={{ color: 'var(--text-muted)' }}
              >
                画布配置
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  名称：
                </span>
                <input
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 text-sm px-2.5 py-1.5 rounded-lg outline-none"
                  style={{
                    backgroundColor: 'var(--bg-input, rgba(255,255,255,0.06))',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)'
                  }}
                  maxLength={30}
                />
              </div>
            </div>

            {/* 储存文件夹 */}
            <div
              className="rounded-xl p-3"
              style={{
                backgroundColor: cacheRootError
                  ? 'rgba(239,68,68,0.08)'
                  : 'var(--bg-secondary, rgba(255,255,255,0.02))',
                border: `1px solid ${
                  cacheRootError ? 'rgba(239,68,68,0.35)' : 'var(--border-subtle)'
                }`
              }}
            >
              <div className="flex items-center gap-2">
                <FolderOpen size={13} style={{ color: 'var(--primary-color)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  储存文件夹
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[9px]"
                  style={{ backgroundColor: 'rgba(239,68,68,0.16)', color: '#fca5a5' }}
                >
                  必选
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={cacheRoot}
                  readOnly
                  placeholder="请选择画布缓存和素材储存位置"
                  className="min-w-0 flex-1 text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                  style={{
                    backgroundColor: 'var(--bg-input, rgba(255,255,255,0.06))',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)'
                  }}
                  title={cacheRoot || '请选择画布缓存和素材储存位置'}
                />
                <button
                  type="button"
                  onClick={chooseCacheRoot}
                  disabled={isChoosingCacheRoot}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all hover:opacity-90 disabled:opacity-60"
                  style={{
                    backgroundColor: 'var(--primary-color)',
                    color: 'var(--text-on-primary, #fff)'
                  }}
                >
                  <FolderOpen size={12} />
                  {isChoosingCacheRoot ? '选择中...' : '选择文件夹'}
                </button>
              </div>
              <p
                className="text-[9px] mt-1.5 leading-relaxed"
                style={{ color: cacheRootError ? '#fca5a5' : 'var(--text-muted)', opacity: 0.75 }}
              >
                {cacheRootError || '生成历史、缩略图和托管素材会保存到这个文件夹。'}
              </p>
            </div>

            {/* ═══ 导入文档（两个模板共享） ═══ */}
            <div
              className="rounded-xl p-3"
              style={{
                backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.02))',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <div className="flex items-center gap-2">
                <FileText size={13} style={{ color: 'var(--text-muted)' }} />
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  导入文档
                </span>
                <button
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    color: docFile ? 'var(--primary-color)' : 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)'
                  }}
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = '.txt,.md,.json,.docx'
                    input.onchange = (e) => setDocFile((e.currentTarget as HTMLInputElement).files?.[0] || null)
                    input.click()
                  }}
                >
                  📎 {docFile ? docFile.name : '选择文件'}
                </button>
                {docFile && (
                  <button
                    onClick={() => {
                      setDocFile(null)
                      setDocParsed(null)
                    }}
                    className="p-0.5 rounded"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
              {docParsed && (
                <div
                  className="mt-2 text-[10px] px-2 py-1.5 rounded-md"
                  style={{
                    backgroundColor: getParseResultSummary(docParsed)
                      ? 'rgba(16,185,129,0.1)'
                      : 'rgba(239,68,68,0.1)',
                    color: getParseResultSummary(docParsed) ? '#34d399' : '#f87171',
                    border: `1px solid ${getParseResultSummary(docParsed) ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
                  }}
                >
                  {getParseResultSummary(docParsed)
                    ? `✅ 解析成功：${getParseResultSummary(docParsed)}`
                    : `⚠️ 未识别到"镜头X/角色X/道具X/场景X"标记`}
                </div>
              )}
              <p
                className="text-[9px] mt-1.5 leading-relaxed"
                style={{ color: 'var(--text-muted)', opacity: 0.5 }}
              >
                支持 .txt / .md / .docx 格式，文档中混合书写 镜头1、角色1、道具1、场景1 等标记
              </p>
            </div>

            {selectedTemplate === 'production' ? (
              /* ═══ 批量生产板模式：配置 + 说明 ═══ */
              <div className="flex-1 flex flex-col items-center justify-center gap-5 py-6">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl"
                  style={{ backgroundColor: 'rgba(99,102,241,0.12)' }}
                >
                  🎬
                </div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  批量生产板
                </h3>

                {/* 类型 + 镜头数 */}
                <div
                  className="w-full max-w-[360px] rounded-xl p-4 flex flex-col gap-3"
                  style={{
                    backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.02))',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-[11px] shrink-0 w-16"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      类型：
                    </span>
                    <select
                      value={prodType}
                      onChange={(e) => setProdType(e.target.value)}
                      className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg outline-none cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)'
                      }}
                    >
                      <option value="video">视频镜头</option>
                      <option value="image">图片镜头</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-[11px] shrink-0 w-16"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      镜头数：
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={prodCount}
                      onChange={(e) => setProdCount(parseInt(e.target.value) || 1)}
                      className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)'
                      }}
                    />
                  </div>
                </div>

                <p
                  className="text-[10px] leading-relaxed max-w-[320px] text-center"
                  style={{ color: 'var(--text-muted)', opacity: 0.6 }}
                >
                  创建后将直接打开批量生产板，支持表格式管理提示词、参考图、Asset ID 等
                </p>
              </div>
            ) : (
              /* ═══ 空白画布模式：完整配置 ═══ */
              <>
                {/* 分割线 */}
                <div
                  className="text-[10px] text-center tracking-wider"
                  style={{ color: 'var(--text-muted)', opacity: 0.4 }}
                >
                  ── 预设内容（可选） ──
                </div>

                {/* 生产板 */}
                <div
                  className="rounded-xl p-3"
                  style={{
                    backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.02))',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={addProduction}
                      onChange={(e) => setAddProduction(e.target.checked)}
                      className="accent-[var(--primary-color)]"
                    />
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      添加生产板
                    </span>
                  </label>

                  {addProduction && (
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 pl-6">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          类型：
                        </span>
                        <select
                          value={prodType}
                          onChange={(e) => setProdType(e.target.value)}
                          className="flex-1 text-[11px] px-2 py-1 rounded outline-none cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)'
                          }}
                        >
                          <option value="video">视频</option>
                          <option value="image">图片</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          镜头数：
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={prodCount}
                          onChange={(e) => setProdCount(parseInt(e.target.value) || 1)}
                          className="flex-1 text-[11px] px-2 py-1 rounded outline-none w-12"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)'
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          模型：
                        </span>
                        <select
                          value={prodModel}
                          onChange={(e) => setProdModel(e.target.value)}
                          className="flex-1 text-[11px] px-2 py-1 rounded outline-none cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)'
                          }}
                        >
                          <option value="">默认</option>
                          <option value="doubao">Doubao</option>
                          <option value="seedance-1.0">Seedance 1.0</option>
                          <option value="jimeng-2.1">即梦 2.1</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          比例：
                        </span>
                        <select
                          value={prodRatio}
                          onChange={(e) => setProdRatio(e.target.value)}
                          className="flex-1 text-[11px] px-2 py-1 rounded outline-none cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)'
                          }}
                        >
                          <option>16:9</option>
                          <option>9:16</option>
                          <option>1:1</option>
                          <option>4:3</option>
                          <option>3:4</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* 分组 */}
                <div
                  className="rounded-xl p-3"
                  style={{
                    backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.02))',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={addGroups}
                      onChange={(e) => setAddGroups(e.target.checked)}
                      className="accent-[var(--primary-color)]"
                    />
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      添加分组
                    </span>
                  </label>

                  {addGroups && (
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 pl-6">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          组数：
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={groupCount}
                          onChange={(e) => setGroupCount(parseInt(e.target.value) || 1)}
                          className="flex-1 text-[11px] px-2 py-1 rounded outline-none w-12"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)'
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          每组节点：
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={nodesPerGroup}
                          onChange={(e) => setNodesPerGroup(parseInt(e.target.value) || 1)}
                          className="flex-1 text-[11px] px-2 py-1 rounded outline-none w-12"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)'
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ═══ 底部按钮 ═══ */}
          <div
            className="px-5 py-3 flex items-center justify-end gap-3"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs transition-all"
              style={{
                color: 'var(--text-muted)',
                border: '1px solid var(--border-default)'
              }}
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={!cacheRoot.trim()}
              className="flex items-center gap-1.5 px-5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: 'var(--primary-color)',
                color: 'var(--text-on-primary, #fff)'
              }}
            >
              ✨ {selectedTemplate === 'production' ? '创建并打开生产板' : '创建画布'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

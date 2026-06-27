import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  Clock,
  Download,
  Eye,
  FileText,
  Filter,
  FolderOpen,
  Image,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Music,
  Package,
  Search,
  Send,
  Upload,
  User,
  Video,
  X,
} from 'lucide-react'
import {
  assetsApi,
  CLOUD_AUTH_CHANGE_EVENT,
  getUserInfo,
  isLoggedIn,
  organizationsApi,
  teamsApi,
  transfersApi,
  writingEpisodesApi,
  writingProjectAssetsApi,
  writingProjectsApi,
  writingShotsApi,
  writingTextAssetsApi
} from '../../services/cloud'
import type {
  AssetType,
  CloudAsset,
  CloudOrganization,
  CloudTeam,
  CloudTransfer,
  TeamMember
} from '../../services/cloud/types'
import { CLOUD_ASSET_MIME, type CloudAssetDragPayload } from '../../utils/cloudAssetDrop'
import { CLOUD_WRITING_SYNC_EVENT } from '../../services/cloud/writingSyncEvents'
import { getStoredCloudTeamId, setStoredCloudTeamId } from '../../services/cloud/teamSelection'
import { EpisodeDetailView } from './EpisodeDetailView'
import { MOCK_SERIES_PROJECTS, findEpisodeById, findSeriesById } from './seriesMockData'
import { SERIES_RESULT_BRIDGE_EVENT } from './seriesResultBridge'
import { SeriesListView } from './SeriesListView'
import type { SeriesProject, SeriesShotAsset, ShotMediaCandidate } from './seriesTypes'
import './CloudAssetsPanel.css'

const TYPE_ICONS: Record<AssetType, typeof Image> = {
  image: Image,
  video: Video,
  audio: Music,
  document: FileText,
  project: Package,
  other: FileText
}

const TYPE_LABELS: Record<AssetType, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  document: '文档',
  project: '工程',
  other: '其他'
}

const MOCK_FOLDERS = ['未分类', '角色', '场景', '参考图', '视频'] as const

type ViewState = 'loading' | 'error' | 'ready'

type CloudAssetsPanelProps = {
  onClose?: () => void
}

function inferAssetType(file: File): AssetType {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.includes('pdf') || file.type.includes('text') || file.name.match(/\.(docx?|md|txt)$/i)) return 'document'
  if (file.name.match(/\.(zip|rar|7z|xhz)$/i)) return 'project'
  return 'other'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  return d.toLocaleDateString('zh-CN')
}

function normalizeListPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

function mapShotStatus(status?: string): SeriesShotAsset['status'] {
  if (status === 'approved') return 'approved'
  if (status === 'rejected') return 'rejected'
  if (status === 'reviewing') return 'review'
  if (status === 'assigned' || status === 'in_progress') return 'in_progress'
  return 'draft'
}

function mapCandidateStatus(status?: string): ShotMediaCandidate['status'] {
  if (status === 'approved') return 'approved'
  if (status === 'needs_revision' || status === 'rejected') return 'rejected'
  return 'pending'
}

function splitMetaList(value: any): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string') {
    return value.split(/[、,，/]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)))
}

function assetCategoryKind(asset: any): string {
  const metaKind = asset?.metadata?.kind || asset?.metadata?.category_kind || asset?.metadata?.categoryKind
  const name = `${asset?.category_name || ''}${asset?.category_code || ''}`.toLowerCase()
  if (metaKind) return String(metaKind)
  if (name.includes('role') || name.includes('角色')) return 'role'
  if (name.includes('scene') || name.includes('场景')) return 'scene'
  if (name.includes('prop') || name.includes('道具')) return 'prop'
  return ''
}

function projectAssetToCandidate(asset: any): ShotMediaCandidate | null {
  if (!asset?.shot_id) return null
  if (asset.asset_type !== 'image' && asset.asset_type !== 'video') return null
  const url = asset.thumb_url || asset.url
  if (!url) return null
  return {
    id: String(asset.id),
    shotId: String(asset.shot_id),
    type: asset.asset_type === 'video' ? 'video' : 'image',
    url,
    thumbUrl: asset.thumb_url || asset.url,
    creator: String(asset.uploader_id || ''),
    createdAt: asset.created_at || new Date().toISOString(),
    updatedAt: asset.updated_at,
    selected: Boolean(asset.is_final),
    status: mapCandidateStatus(asset.status),
    sourceMeta: {
      projectId: asset.project_id,
      episodeId: asset.episode_id,
      shotId: asset.shot_id,
      cloudProjectId: asset.project_id,
      cloudEpisodeId: asset.episode_id,
      cloudShotId: asset.shot_id,
      requestId: asset.request_id,
      taskId: asset.task_id,
      objectKey: asset.object_key,
      prompt: asset.prompt,
      model: asset.model,
      durationMs: asset.duration_ms,
      reviewStatus: asset.status
    }
  }
}

function TeamSelector({
  teams,
  selected,
  onSelect
}: {
  teams: CloudTeam[]
  selected: CloudTeam | null
  onSelect: (team: CloudTeam) => void
}) {
  return (
    <select
      className="ca-org-select"
      value={selected?.id || ''}
      onChange={(event) => {
        const id = Number(event.target.value)
        const team = teams.find((item) => item.id === id)
        if (team) onSelect(team)
      }}
    >
      <option value="">选择小组/团队</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name} · {team.role || 'member'}
        </option>
      ))}
    </select>
  )
}

function OrganizationSelector({
  organizations,
  selected,
  onSelect
}: {
  organizations: CloudOrganization[]
  selected: CloudOrganization | null
  onSelect: (organization: CloudOrganization | null) => void
}) {
  return (
    <select
      className="ca-org-select"
      value={selected?.id || ''}
      onChange={(event) => {
        const id = Number(event.target.value)
        onSelect(organizations.find((organization) => organization.id === id) || null)
      }}
    >
      <option value="">全部团队</option>
      {organizations.map((organization) => (
        <option key={organization.id} value={organization.id}>
          {organization.name} · {organization.role || 'member'}
        </option>
      ))}
    </select>
  )
}

/** 成员头像：有 avatar_url 时显示图片，否则用昵称首字占位 */
function MemberAvatar({ member, size = 24 }: { member: TeamMember; size?: number }) {
  if (member.avatar_url) {
    return (
      <img
        src={member.avatar_url}
        alt={member.nickname}
        className="ca-avatar"
        style={{ width: size, height: size }}
      />
    )
  }
  const initial = (member.nickname || '?')[0].toUpperCase()
  return (
    <span className="ca-avatar ca-avatar-placeholder" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {initial}
    </span>
  )
}

/** 素材预览弹窗 */
function PreviewModal({
  asset,
  teamId,
  onClose
}: {
  asset: CloudAsset
  teamId: number
  onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    assetsApi
      .getDownloadUrl(teamId, asset.id)
      .then((data) => {
        if (!cancelled) {
          setUrl(data.download_url)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载预览失败')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [teamId, asset.id])

  return (
    <div className="ca-modal-overlay" onClick={onClose}>
      <div className="ca-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ca-modal-head">
          <strong>预览：{asset.name}</strong>
          <button onClick={onClose}><X size={14} /></button>
        </div>
        <div className="ca-preview-body">
          {loading && (
            <div className="ca-state">
              <Loader2 size={28} className="ca-spin" />
              <p>加载中...</p>
            </div>
          )}
          {error && (
            <div className="ca-state ca-state-error">
              <AlertCircle size={28} />
              <p>{error}</p>
            </div>
          )}
          {url && !loading && !error && (
            <>
              {asset.asset_type === 'image' && (
                <img src={url} alt={asset.name} className="ca-preview-img" />
              )}
              {asset.asset_type === 'video' && (
                <video src={url} controls autoPlay className="ca-preview-video" />
              )}
              {asset.asset_type === 'audio' && (
                <div className="ca-preview-audio-wrap">
                  <Music size={48} />
                  <p>{asset.name}</p>
                  <audio src={url} controls autoPlay />
                </div>
              )}
              {!['image', 'video', 'audio'].includes(asset.asset_type) && (
                <div className="ca-preview-other">
                  <FileText size={48} />
                  <p>{asset.name}</p>
                  <p className="ca-modal-hint">{formatFileSize(asset.file_size)} · {asset.mime_type}</p>
                  <a href={url} target="_blank" rel="noreferrer" className="ca-modal-send-btn" style={{ textDecoration: 'none', display: 'inline-flex', marginTop: 12 }}>
                    <Download size={13} /> 下载文件
                  </a>
                </div>
              )}
            </>
          )}
        </div>
        <div className="ca-preview-info-bar">
          <span className="ca-asset-type-badge">{TYPE_LABELS[asset.asset_type]}</span>
          <span>{formatFileSize(asset.file_size)}</span>
          {asset.width && asset.height && <span>{asset.width}×{asset.height}</span>}
          {asset.tags && asset.tags.length > 0 && asset.tags.map((t, i) => <span key={i} className="ca-tag">{t}</span>)}
        </div>
      </div>
    </div>
  )
}

function AssetCard({
  asset,
  teamId,
  onSendClick,
  onPreview
}: {
  asset: CloudAsset
  teamId: number
  onSendClick: (asset: CloudAsset) => void
  onPreview: (asset: CloudAsset) => void
}) {
  const Icon = TYPE_ICONS[asset.asset_type] || FileText

  const handleDownload = async () => {
    const data = await assetsApi.getDownloadUrl(teamId, asset.id)
    window.open(data.download_url, '_blank')
  }

  const handleDragStart = (e: React.DragEvent) => {
    const payload: CloudAssetDragPayload = {
      source: 'cloud-assets',
      assetId: asset.id,
      teamId,
      name: asset.name,
      assetType: asset.asset_type,
      mimeType: asset.mime_type || 'application/octet-stream',
      fileSize: asset.file_size,
      tags: asset.tags || [],
      ossKey: asset.oss_key || undefined
    }
    e.dataTransfer.setData(CLOUD_ASSET_MIME, JSON.stringify(payload))
    // 兼容本地拖拽协议
    e.dataTransfer.setData('asset-type', asset.asset_type)
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  return (
    <div className="ca-asset-card" draggable onDragStart={handleDragStart}>
      <div
        className={`ca-asset-preview ca-preview-${asset.asset_type}`}
        onClick={() => onPreview(asset)}
        title="点击预览 · 拖拽到画布/资产库/批量生产板"
      >
        <Icon size={32} />
        {asset.asset_type === 'video' && asset.duration_sec && (
          <span className="ca-asset-duration">{Number(asset.duration_sec).toFixed(1)}s</span>
        )}
        {asset.current_version > 1 && <span className="ca-asset-version">v{asset.current_version}</span>}
        <span className="ca-preview-eye"><Eye size={16} /></span>
      </div>
      <div className="ca-asset-info">
        <div className="ca-asset-name" title={asset.name}>
          {asset.name}
        </div>
        <div className="ca-asset-meta">
          <span>
            <User size={11} /> {asset.uploader_nickname || `用户 ${asset.uploader_id}`}
          </span>
          <span>
            <Clock size={11} /> {formatDate(asset.created_at)}
          </span>
        </div>
        <div className="ca-asset-meta">
          <span className="ca-asset-type-badge">{TYPE_LABELS[asset.asset_type]}</span>
          <span>{formatFileSize(asset.file_size)}</span>
          {asset.width && asset.height && <span>{asset.width}x{asset.height}</span>}
        </div>
      </div>
      <div className="ca-asset-actions">
        <button className="ca-action-btn" title="下载" onClick={handleDownload}>
          <Download size={14} />
        </button>
        <button className="ca-action-btn" title="发送" onClick={() => onSendClick(asset)}>
          <Send size={14} />
        </button>
        <button className="ca-action-btn" title="预览" onClick={() => onPreview(asset)}>
          <Eye size={14} />
        </button>
      </div>
    </div>
  )
}

function openPersonalCenter() {
  window.dispatchEvent(new CustomEvent('open-personal-center'))
}

function LoginRequiredCard() {
  return (
    <div className="ca-login-card">
      <h3>未登录云端账号</h3>
      <p>请先在个人中心登录，独立写作软件和团队云素材库会同步使用同一账号。</p>
      <button className="ca-login-submit" onClick={openPersonalCenter}>
        前往个人中心登录
      </button>
    </div>
  )
}

function SendModal({
  asset,
  teamId,
  members,
  currentUserId,
  onSent,
  onClose
}: {
  asset: CloudAsset
  teamId: number
  members: TeamMember[]
  currentUserId: number
  onSent?: () => void
  onClose: () => void
}) {
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const availableMembers = members.filter((m) => m.user_id !== currentUserId)

  const handleSend = async () => {
    if (!selectedMember) return
    setSending(true)
    setSendError('')
    try {
      await transfersApi.send(teamId, {
        asset_id: asset.id,
        receiver_id: selectedMember.user_id,
        message: message.trim() || undefined
      })
      setSent(true)
      onSent?.()
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="ca-modal-overlay" onClick={onClose}>
      <div className="ca-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="ca-modal-head">
          <strong>发送素材：{asset.name}</strong>
          <button onClick={onClose}><X size={14} /></button>
        </div>
        {sent ? (
          <div className="ca-modal-sent">
            <Check size={28} />
            <p>已发送给 {selectedMember!.nickname}，等待接收</p>
            <button className="ca-modal-ok-btn" onClick={onClose}>确定</button>
          </div>
        ) : (
          <>
            <div className="ca-modal-section">
              <label>选择接收人</label>
              {availableMembers.length === 0 ? (
                <p className="ca-modal-hint">当前团队没有其他成员</p>
              ) : (
                <div className="ca-member-pick-list">
                  {availableMembers.map((m) => (
                    <button
                      key={m.user_id}
                      className={`ca-member-option ${selectedMember?.user_id === m.user_id ? 'ca-member-selected' : ''}`}
                      onClick={() => setSelectedMember(m)}
                    >
                      <MemberAvatar member={m} size={24} />
                      <span>{m.nickname}</span>
                      <small>{m.role}</small>
                      {selectedMember?.user_id === m.user_id && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="ca-modal-section">
              <label>留言（可选）</label>
              <input
                className="ca-modal-input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="给对方留一句话..."
              />
            </div>
            {sendError && <div className="ca-modal-error">{sendError}</div>}
            <div className="ca-modal-footer">
              <button className="ca-modal-cancel-btn" onClick={onClose}>取消</button>
              <button className="ca-modal-send-btn" disabled={!selectedMember || sending} onClick={handleSend}>
                <Send size={13} /> 发送
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function UploadFormModal({
  file,
  onCancel,
  onSubmit
}: {
  file: File
  onCancel: () => void
  onSubmit: (data: { name: string; assetType: AssetType; tags: string[]; folder: string }) => void
}) {
  const [name, setName] = useState(file.name)
  const [assetType, setAssetType] = useState<AssetType>(inferAssetType(file))
  const [tagsInput, setTagsInput] = useState('')
  const [folder, setFolder] = useState<string>('未分类')

  const handleSubmit = () => {
    const tags = tagsInput
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    onSubmit({ name: name.trim() || file.name, assetType, tags, folder })
  }

  return (
    <div className="ca-modal-overlay" onClick={onCancel}>
      <div className="ca-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="ca-modal-head">
          <strong>上传素材</strong>
          <button onClick={onCancel}><X size={14} /></button>
        </div>
        <div className="ca-modal-section">
          <label>文件</label>
          <p className="ca-modal-hint">{file.name}（{formatFileSize(file.size)}）</p>
        </div>
        <div className="ca-modal-section">
          <label>素材名称</label>
          <input className="ca-modal-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="ca-modal-section">
          <label>类型</label>
          <select className="ca-modal-select" value={assetType} onChange={(e) => setAssetType(e.target.value as AssetType)}>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="ca-modal-section">
          <label>标签（逗号分隔）</label>
          <input
            className="ca-modal-input"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="例如：角色, 场景, 第三集"
          />
        </div>
        <div className="ca-modal-section">
          <label>文件夹</label>
          <select className="ca-modal-select" value={folder} onChange={(e) => setFolder(e.target.value)}>
            {MOCK_FOLDERS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="ca-modal-footer">
          <button className="ca-modal-cancel-btn" onClick={onCancel}>取消</button>
          <button className="ca-modal-send-btn" onClick={handleSubmit}>
            <Upload size={13} /> 开始上传
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CloudAssetsPanel({ onClose }: CloudAssetsPanelProps) {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [organizations, setOrganizations] = useState<CloudOrganization[]>([])
  const [selectedOrg, setSelectedOrg] = useState<CloudOrganization | null>(null)
  const [teams, setTeams] = useState<CloudTeam[]>([])
  const [selectedTeam, setSelectedTeam] = useState<CloudTeam | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [incomingTransfers, setIncomingTransfers] = useState<CloudTransfer[]>([])
  const [assets, setAssets] = useState<CloudAsset[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all')
  const [libraryMode, setLibraryMode] = useState<'series' | 'files'>('series')
  const [viewState, setViewState] = useState<ViewState>('loading')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null)
  const [realProjects, setRealProjects] = useState<SeriesProject[]>([])
  const [, setSeriesMockVersion] = useState(0)
  const [sendModalAsset, setSendModalAsset] = useState<CloudAsset | null>(null)
  const [uploadFormFile, setUploadFormFile] = useState<File | null>(null)
  const [previewAsset, setPreviewAsset] = useState<CloudAsset | null>(null)
  const [promptDialog, setPromptDialog] = useState<{ title: string, placeholder: string, onSubmit: (val: string) => void } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const user = getUserInfo()
  const selectedSeries = selectedSeriesId ? realProjects.find((p) => p.id === selectedSeriesId) || null : null
  const selectedEpisode = selectedSeriesId && selectedEpisodeId
    ? selectedSeries?.episodes.find((e) => e.id === selectedEpisodeId) || null
    : null

  useEffect(() => {
    const refreshSeriesMock = () => setSeriesMockVersion((version) => version + 1)
    window.addEventListener(SERIES_RESULT_BRIDGE_EVENT, refreshSeriesMock)
    return () => window.removeEventListener(SERIES_RESULT_BRIDGE_EVENT, refreshSeriesMock)
  }, [])

  useEffect(() => {
    const refreshLoginState = () => setLoggedIn(isLoggedIn())
    window.addEventListener(CLOUD_AUTH_CHANGE_EVENT, refreshLoginState)
    window.addEventListener('storage', refreshLoginState)
    return () => {
      window.removeEventListener(CLOUD_AUTH_CHANGE_EVENT, refreshLoginState)
      window.removeEventListener('storage', refreshLoginState)
    }
  }, [])

  const loadOrganizations = async () => {
    const data = await organizationsApi.list()
    setOrganizations(data)
    setSelectedOrg((current) => current || data[0] || null)
  }

  const loadTeams = async (org?: CloudOrganization | null) => {
    setViewState('loading')
    try {
      const data = org ? await organizationsApi.listTeams(org.id) : await teamsApi.list()
      setTeams(data)
      setSelectedTeam((current) => {
        if (current && data.some((team) => team.id === current.id)) return current
        const storedId = getStoredCloudTeamId()
        return data.find((team) => team.id === storedId) || data[0] || null
      })
      setError('')
      setViewState('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载团队失败')
      setViewState('error')
    }
  }

  const loadIncomingTransfers = async (team?: CloudTeam | null) => {
    if (!team) {
      setIncomingTransfers([])
      return
    }
    const data = await transfersApi.received({ status: 'pending', page: 1, page_size: 50 })
    setIncomingTransfers(data.items.filter((transfer) => transfer.team_id === team.id || transfer.team?.id === team.id))
  }

  const loadAssets = async (teamId: number, teamName = '') => {
    setViewState('loading')
    try {
      const data = await assetsApi.list(teamId, {
        page: 1,
        page_size: 100,
        type: typeFilter === 'all' ? undefined : typeFilter
      })
      setAssets(data.items)

      // Load real projects
      const projsRes = await writingProjectsApi.list({ page: 1, per_page: 100, team_id: teamId })
      const rawProjectsList = (projsRes as any)?.items || (Array.isArray(projsRes) ? projsRes : [])
      const projectsList = rawProjectsList.filter((project: any) => {
        if (project.team_id !== undefined && project.team_id !== null) return Number(project.team_id) === teamId
        if (teamName && project.team_name) return project.team_name === teamName
        return true
      })
      
      // Filter projects by team name if needed, or backend can do it. For now filter in frontend based on teamName if we want
      const parsedProjects: SeriesProject[] = []
      for (const proj of projectsList) {
        // Mock team check - if project.title contains teamName or just show all for the team
        const episodesRaw = await writingEpisodesApi.list(proj.id).catch(() => [])
        const episodesList = (episodesRaw as any)?.items || (Array.isArray(episodesRaw) ? episodesRaw : [])
        const parsedEpisodes = await Promise.all(episodesList.map(async (ep: any) => {
          const [textAssetsRaw, shotsRaw, projectAssetsRaw] = await Promise.all([
            writingTextAssetsApi.list(ep.id).catch(() => []),
            writingShotsApi.list(ep.id).catch(() => []),
            writingProjectAssetsApi.list(proj.id, { episode_id: ep.id }).catch(() => ({ items: [] }))
          ])
          const textAssetsList = normalizeListPayload(textAssetsRaw)
          const shotsList = normalizeListPayload(shotsRaw)
          const projectAssetsList = normalizeListPayload(projectAssetsRaw)
          const activeTextAssets = textAssetsList.filter((asset: any) => asset.status !== 'deleted')
          const candidatesByShot = new Map<string, ShotMediaCandidate[]>()
          for (const asset of projectAssetsList) {
            const candidate = projectAssetToCandidate(asset)
            if (!candidate) continue
            const list = candidatesByShot.get(candidate.shotId) || []
            list.push(candidate)
            candidatesByShot.set(candidate.shotId, list)
          }

          const shots: SeriesShotAsset[] = shotsList.map((shot: any) => {
            const metadata = shot.metadata || {}
            const shotId = String(shot.id)
            return {
              id: shotId,
              episodeId: String(ep.id),
              shotNumber: Number(shot.shot_number || 1),
              description: shot.description || shot.shot_label || '',
              cameraAngle: shot.camera_angle || '',
              cameraMovement: shot.camera_movement || '',
              characters: splitMetaList(metadata.characters),
              scene: String(metadata.scene || metadata.location || ''),
              props: splitMetaList(metadata.props),
              promptDraft: shot.video_prompt_draft || shot.prompt_draft || shot.description || '',
              status: mapShotStatus(shot.status),
              assignee: shot.assignee_name || ep.assignee_name || '',
              lastModified: shot.updated_at || ep.updated_at || new Date().toISOString(),
              mediaCandidates: candidatesByShot.get(shotId) || []
            }
          })

          const characters = uniqueStrings([
            ...shots.flatMap((shot) => shot.characters),
            ...projectAssetsList.filter((asset: any) => assetCategoryKind(asset) === 'role').map((asset: any) => asset.name)
          ])
          const scenes = uniqueStrings([
            ...shots.map((shot) => shot.scene).filter(Boolean),
            ...projectAssetsList.filter((asset: any) => assetCategoryKind(asset) === 'scene').map((asset: any) => asset.name)
          ])
          const props = uniqueStrings([
            ...shots.flatMap((shot) => shot.props),
            ...projectAssetsList.filter((asset: any) => assetCategoryKind(asset) === 'prop').map((asset: any) => asset.name)
          ])

          return {
            id: String(ep.id),
            seriesId: String(proj.id),
            episodeNumber: ep.episode_number,
            title: ep.title || `第${ep.episode_number}集`,
            synopsis: ep.synopsis || '',
            status: ep.status === 'completed' ? 'completed' : ep.status === 'not_started' ? 'not_started' : 'in_progress',
            shots,
            textAssets: activeTextAssets.map((asset: any) => ({
              id: String(asset.id),
              episodeId: String(ep.id),
              type: asset.asset_type === 'note' ? 'notes' : asset.asset_type,
              title: asset.title || '未命名文本',
              content: asset.content || '',
              lastModified: asset.updated_at || ep.updated_at || new Date().toISOString()
            })),
            characters,
            scenes,
            props,
            assignee: ep.assignee_name || '未分配',
            lastModified: ep.updated_at || new Date().toISOString()
          }
        }))

        parsedProjects.push({
          id: String(proj.id),
          title: proj.title,
          synopsis: proj.synopsis || '暂无简介',
          genre: proj.genre || '未分类',
          coverUrl: proj.cover_url || 'https://images.unsplash.com/photo-1515630278258-407f66498911',
          status: proj.status === 'archived' ? 'archived' : 'active',
          totalEpisodes: episodesList.length,
          completedEpisodes: episodesList.filter((ep: any) => ep.status === 'completed').length,
          lastModified: proj.updated_at || new Date().toISOString(),
          characters: uniqueStrings(parsedEpisodes.flatMap((episode: any) => episode.characters || [])),
          scenes: uniqueStrings(parsedEpisodes.flatMap((episode: any) => episode.scenes || [])),
          props: uniqueStrings(parsedEpisodes.flatMap((episode: any) => episode.props || [])),
          episodes: parsedEpisodes
        })
      }
      setRealProjects(parsedProjects)

      setError('')
      setViewState('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载素材失败')
      setViewState('error')
    }
  }

  useEffect(() => {
    if (!loggedIn) return
    loadOrganizations()
      .then(() => loadTeams(null))
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载大组失败')
        setViewState('error')
      })
  }, [loggedIn])

  useEffect(() => {
    if (!loggedIn) return
    loadTeams(selectedOrg)
  }, [selectedOrg?.id])

  useEffect(() => {
    if (selectedTeam) {
      setStoredCloudTeamId(selectedTeam.id)
      loadAssets(selectedTeam.id, selectedTeam.name)
      loadIncomingTransfers(selectedTeam).catch(() => setIncomingTransfers([]))
    } else {
      setIncomingTransfers([])
    }
  }, [selectedTeam?.id, typeFilter])

  useEffect(() => {
    if (!selectedTeam) return undefined
    const refreshWritingAssets = () => {
      loadAssets(selectedTeam.id, selectedTeam.name)
    }
    window.addEventListener(CLOUD_WRITING_SYNC_EVENT, refreshWritingAssets)
    return () => window.removeEventListener(CLOUD_WRITING_SYNC_EVENT, refreshWritingAssets)
  }, [selectedTeam?.id, selectedTeam?.name, typeFilter])

  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return assets
    const q = searchQuery.toLowerCase()
    return assets.filter(
      (asset) =>
        asset.name.toLowerCase().includes(q) ||
        asset.tags?.some((tag) => tag.toLowerCase().includes(q)) ||
        asset.description?.toLowerCase().includes(q)
    )
  }, [assets, searchQuery])

  const respondTransfer = async (transferId: number, action: 'accept' | 'reject') => {
    if (action === 'accept') {
      await transfersApi.accept(transferId)
    } else {
      await transfersApi.reject(transferId)
    }
    await loadIncomingTransfers(selectedTeam)
    if (selectedTeam) await loadAssets(selectedTeam.id)
  }

  const openSendModal = async (asset: CloudAsset) => {
    if (!selectedTeam) return
    const members = await teamsApi.getMembers(selectedTeam.id)
    setTeamMembers(members)
    setSendModalAsset(asset)
  }

  const uploadFile = async (file: File, formData?: { name: string; assetType: AssetType; tags: string[]; folder: string }) => {
    if (!selectedTeam) return
    setUploading(true)
    setUploadFormFile(null)
    try {
      const assetType = formData?.assetType || inferAssetType(file)
      const signed = await assetsApi.getUploadUrl(selectedTeam.id, {
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        file_size: file.size
      })

      const uploadRes = await fetch(signed.upload_url, {
        method: signed.method,
        headers: signed.headers,
        body: file
      })
      if (!uploadRes.ok) {
        const detail = await uploadRes.text().catch(() => '')
        throw new Error(`OSS 上传失败：${uploadRes.status}${detail ? `，${detail.slice(0, 160)}` : ''}`)
      }

      const tags = formData?.tags && formData.tags.length > 0 ? [...formData.tags] : ['desktop-upload']
      if (formData?.folder && formData.folder !== '未分类') {
        tags.push(`folder:${formData.folder}`)
      }

      await assetsApi.create(selectedTeam.id, {
        name: formData?.name || file.name,
        asset_type: assetType,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
        oss_key: signed.oss_key,
        tags
      })

      await loadAssets(selectedTeam.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
      setViewState('error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // W11: 悬浮面板状态 — localStorage 持久化
  const STORAGE_KEY = 'ca-floating-panel'
  const loadSaved = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }
  const saved = loadSaved()
  const [panelPos, setPanelPos] = useState({ x: saved?.x ?? 60, y: saved?.y ?? 40 })
  const [panelSize, setPanelSize] = useState({ w: saved?.w ?? 960, h: saved?.h ?? 620 })
  const [maximized, setMaximized] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)

  // 持久化
  useEffect(() => {
    if (!maximized && !collapsed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: panelPos.x, y: panelPos.y, w: panelSize.w, h: panelSize.h }))
    }
  }, [panelPos, panelSize, maximized, collapsed])

  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if (maximized) return
    e.preventDefault()
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: panelPos.x, oy: panelPos.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      setPanelPos({
        x: Math.max(0, dragRef.current.ox + ev.clientX - dragRef.current.sx),
        y: Math.max(0, dragRef.current.oy + ev.clientY - dragRef.current.sy)
      })
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelPos, maximized])

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    if (maximized) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const startW = panelSize.w, startH = panelSize.h
    const onMove = (ev: MouseEvent) => {
      setPanelSize({
        w: Math.max(480, startW + ev.clientX - startX),
        h: Math.max(320, startH + ev.clientY - startY)
      })
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelSize, maximized])

  const panelStyle: React.CSSProperties = maximized
    ? { position: 'fixed', inset: '32px 8px 8px 52px', width: 'auto', height: 'auto', zIndex: 55 }
    : { position: 'fixed', left: panelPos.x, top: panelPos.y, width: panelSize.w, height: collapsed ? 'auto' : panelSize.h, zIndex: 55 }

  return (
    <div ref={panelRef} className="ca-floating-panel" style={panelStyle}>
      {/* 标题栏 — 可拖拽 */}
      <div className="ca-floating-titlebar" onMouseDown={onTitleMouseDown}>
        <span className="ca-floating-title">☁️ 团队云素材库</span>
        <div className="ca-floating-title-actions">
          <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? '展开' : '收起'}>
            <Minus size={13} />
          </button>
          <button onClick={() => setMaximized(!maximized)} title={maximized ? '还原' : '最大化'}>
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button onClick={onClose} title="关闭">
            <X size={13} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="ca-floating-body">
        {!loggedIn ? (
          <LoginRequiredCard />
        ) : (
          <div className="ca-panel">
            <div className="ca-header">
              <div>
                <h2 className="ca-title">剧集素材库</h2>
                <span className="ca-user-line">
                  {selectedOrg?.name || '全部大组'} · {selectedTeam?.name || '未选择小组'}
                </span>
              </div>
              <div className="ca-header-actions">
                <div className="ca-cloud-status" title="当前云端登录状态">
                  <User size={15} />
                  <span>{user?.nickname || '云端账号'}</span>
                  <small>{selectedTeam?.name || selectedOrg?.name || '未选择小组'}</small>
                </div>
                <OrganizationSelector organizations={organizations} selected={selectedOrg} onSelect={setSelectedOrg} />
                <TeamSelector teams={teams} selected={selectedTeam} onSelect={setSelectedTeam} />
              </div>
            </div>

            <div className="ca-toolbar">
              <div className="ca-library-switch">
                <button
                  className={libraryMode === 'series' ? 'ca-library-active' : ''}
                  onClick={() => setLibraryMode('series')}
                >
                  剧集库
                </button>
              </div>

              {libraryMode === 'files' ? (
                <>
                  <div className="ca-search">
                    <Search size={14} className="ca-search-icon" />
                    <input
                      type="text"
                      placeholder="搜索素材名称、标签..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="ca-search-input"
                    />
                  </div>

                  <div className="ca-filters">
                    <Filter size={14} />
                    {(['all', 'image', 'video', 'audio', 'document'] as const).map((type) => (
                      <button
                        key={type}
                        className={`ca-filter-btn ${typeFilter === type ? 'ca-filter-active' : ''}`}
                        onClick={() => setTypeFilter(type)}
                      >
                        {type === 'all' ? '全部' : TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="ca-series-hint">一部剧 → 每集 → 分镜 → 图片组 / 备选视频 / 导演审核</div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                className="ca-file-input"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) setUploadFormFile(file)
                }}
              />
              <button className="ca-upload-btn" onClick={() => fileInputRef.current?.click()} disabled={!selectedTeam || uploading}>
                <Upload size={14} />
                {uploading ? '上传中...' : '上传素材'}
              </button>
            </div>

            <div className="ca-content">
              {libraryMode === 'series' && viewState === 'ready' && (
                <>
                  {selectedTeam && incomingTransfers.length > 0 && (
                    <section className="ca-transfer-inbox">
                      <div className="ca-transfer-head">
                        <strong>待接收素材</strong>
                        <span>{incomingTransfers.length} 个</span>
                      </div>
                      <div className="ca-transfer-list">
                        {incomingTransfers.map((transfer) => (
                          <div className="ca-transfer-item" key={transfer.id}>
                            <div>
                              <strong>{transfer.asset?.name || transfer.asset_name || `素材 ${transfer.asset_id}`}</strong>
                              <span>
                                来自 {transfer.sender?.nickname || transfer.sender_nickname || `用户 ${transfer.sender_id}`}
                                {transfer.message ? `：${transfer.message}` : ''}
                              </span>
                            </div>
                            <div className="ca-transfer-actions">
                              <button onClick={() => respondTransfer(transfer.id, 'accept')}>接收</button>
                              <button onClick={() => respondTransfer(transfer.id, 'reject')}>拒绝</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {error && <div className="ca-inline-message">{error}</div>}

                  {selectedSeries && selectedEpisode ? (
                    <EpisodeDetailView
                      project={selectedSeries}
                      episode={selectedEpisode}
                      onBack={() => setSelectedEpisodeId(null)}
                      onRefresh={() => selectedTeam ? loadAssets(selectedTeam.id, selectedTeam.name) : undefined}
                      teamId={selectedTeam?.id}
                    />
                  ) : (
                    <SeriesListView
                      projects={realProjects}
                      selectedSeriesId={selectedSeriesId}
                      onSelectSeries={(id) => {
                        setSelectedSeriesId(id)
                        setSelectedEpisodeId(null)
                      }}
                      onBack={() => {
                        setSelectedSeriesId(null)
                        setSelectedEpisodeId(null)
                      }}
                      onSelectEpisode={(seriesId, episodeId) => {
                        setSelectedSeriesId(seriesId)
                        setSelectedEpisodeId(episodeId)
                      }}
                      onCreateProject={() => {
                        setPromptDialog({
                          title: '新建项目',
                          placeholder: '请输入新项目名称',
                          onSubmit: async (title) => {
                            if (title && selectedTeam) {
                              await writingProjectsApi.create({ title, team_id: selectedTeam.id })
                              if (selectedTeam) loadAssets(selectedTeam.id, selectedTeam.name)
                            }
                          }
                        })
                      }}
                      onCreateEpisode={(seriesId) => {
                        setPromptDialog({
                          title: '新建剧集',
                          placeholder: '请输入新剧集名称',
                          onSubmit: async (title) => {
                            if (title) {
                              const project = realProjects.find((p) => p.id === seriesId)
                              const nextNum = project ? (project.episodes?.length || 0) + 1 : 1
                              await writingEpisodesApi.create(Number(seriesId), { title, episode_number: nextNum })
                              if (selectedTeam) loadAssets(selectedTeam.id, selectedTeam.name)
                            }
                          }
                        })
                      }}
                    />
                  )}
                </>
              )}

              {libraryMode === 'files' && teams.length === 0 && viewState === 'ready' && (
                <div className="ca-state">
                  <FolderOpen size={40} />
                  <p>当前账号还没有可用小组，请在个人中心确认账号和所在小组。</p>
                </div>
              )}

              {viewState === 'loading' && (
                <div className="ca-state">
                  <Loader2 size={32} className="ca-spin" />
                  <p>加载中...</p>
                </div>
              )}

              {viewState === 'error' && (
                <div className="ca-state ca-state-error">
                  <AlertCircle size={32} />
                  <p>{error || '加载失败，请检查网络连接'}</p>
                  <button className="ca-retry-btn" onClick={() => (selectedTeam ? loadAssets(selectedTeam.id) : loadTeams(selectedOrg))}>
                    重试
                  </button>
                </div>
              )}

              {libraryMode === 'files' && viewState === 'ready' && selectedTeam && filteredAssets.length === 0 && (
                <div className="ca-state">
                  <FolderOpen size={40} />
                  <p>{searchQuery ? '没有找到匹配的素材' : '还没有素材，点击上方按钮开始上传'}</p>
                </div>
              )}

              {libraryMode === 'files' && viewState === 'ready' && selectedTeam && filteredAssets.length > 0 && (
                <>
                  <div className="ca-count">{filteredAssets.length} 个素材</div>
                  <div className="ca-grid">
                    {filteredAssets.map((asset) => (
                      <AssetCard key={asset.id} asset={asset} teamId={selectedTeam.id} onSendClick={openSendModal} onPreview={setPreviewAsset} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {sendModalAsset && (
          <SendModal
            asset={sendModalAsset}
            teamId={selectedTeam?.id || 0}
            members={teamMembers}
            currentUserId={user?.id || 0}
            onSent={() => {
              setError('素材已发送，等待对方接收')
              setViewState('ready')
            }}
            onClose={() => setSendModalAsset(null)}
          />
        )}
        {uploadFormFile && (
          <UploadFormModal
            file={uploadFormFile}
            onCancel={() => {
              setUploadFormFile(null)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
            onSubmit={(formData) => uploadFile(uploadFormFile, formData)}
          />
        )}
        {previewAsset && selectedTeam && (
          <PreviewModal
            asset={previewAsset}
            teamId={selectedTeam.id}
            onClose={() => setPreviewAsset(null)}
          />
        )}
        {promptDialog && (
          <div className="ca-modal-overlay" onClick={() => setPromptDialog(null)}>
            <div className="ca-modal-card" onClick={e => e.stopPropagation()}>
              <div className="ca-modal-head">
                <strong>{promptDialog.title}</strong>
                <button onClick={() => setPromptDialog(null)}><X size={14} /></button>
              </div>
              <div className="ca-modal-section">
                <input
                  autoFocus
                  className="ca-modal-input"
                  placeholder={promptDialog.placeholder}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      promptDialog.onSubmit(e.currentTarget.value)
                      setPromptDialog(null)
                    } else if (e.key === 'Escape') {
                      setPromptDialog(null)
                    }
                  }}
                />
              </div>
              <div className="ca-modal-footer">
                <button className="ca-modal-cancel-btn" onClick={() => setPromptDialog(null)}>取消</button>
                <button className="ca-modal-send-btn" onClick={(e) => {
                  const input = e.currentTarget.parentElement?.previousElementSibling?.querySelector('input')
                  if (input) {
                    promptDialog.onSubmit(input.value)
                    setPromptDialog(null)
                  }
                }}>确定</button>
              </div>
            </div>
          </div>
        )}
        </div>
      )}

      {/* 右下角 resize 把手 */}
      {!maximized && !collapsed && (
        <div className="ca-floating-resize-handle" onMouseDown={onResizeStart}>
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ opacity: 0.3 }}>
            <path d="M11 1L1 11M11 5L5 11M11 9L9 11" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      )}
    </div>
  )
}

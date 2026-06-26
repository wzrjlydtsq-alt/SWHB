/**
 * W9: 剧集制素材库 — 单集详情
 *
 * 左侧是可折叠文本资产，右侧是每个分镜对应的图片组和备选视频。
 * 这里先做 Mock 可视化结构，后续再把导演审核、分配、修改记录接到真实后端。
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileUp,
  Film,
  Image,
  Loader2,
  Package,
  Plus,
  User,
  Video,
  XCircle
} from 'lucide-react'
import type { SeriesEpisode, SeriesProject, SeriesShotAsset, ShotStatus } from './seriesTypes'
import { useAppStore } from '../../store/useAppStore.ts'
import { assetsApi, writingAssignmentsApi, writingProjectAssetsApi, writingShotsApi } from '../../services/cloud'
import { SERIES_ASSET_MIME } from '../../utils/cloudAssetDrop'
import { extractTextFromDocx, isDocxFile } from '../../utils/parseDocument.ts'
import { notifyDirectorAssetReady } from './seriesResultBridge'
import { VideoThumbnail } from '../../components/ui/VideoThumbnail'

const SHOT_STATUS_LABEL: Record<ShotStatus, string> = {
  draft: '草稿',
  in_progress: '制作中',
  review: '待导演审核',
  approved: '已通过',
  rejected: '需返工'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function EpisodeTextPanel({ episode }: { episode: SeriesEpisode }) {
  const [openIds, setOpenIds] = useState(() => new Set((episode.textAssets || []).map((asset) => asset.id).slice(0, 1)))

  const toggle = (id: string) => {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside className="ed-text-panel">
      <div className="ed-panel-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Film size={14} />
          压缩文本
        </div>
        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '12px' }}>
          写作内容请在独立写作软件维护
        </span>
      </div>
      {(episode.textAssets || []).map((asset) => {
        const open = openIds.has(asset.id)
        return (
          <section className="ed-text-card" key={asset.id}>
            <button className="ed-text-toggle" onClick={() => toggle(asset.id)}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>{asset.title}</span>
              <small>{formatDate(asset.lastModified)}</small>
            </button>
            {open && <pre className="ed-text-content">{asset.content}</pre>}
          </section>
        )
      })}
      {(episode.textAssets || []).length === 0 && (
        <div className="ed-empty">这一集还没有剧本、世界观或分镜文本。</div>
      )}
    </aside>
  )
}

function EpisodeAssetPanel({ project, episode }: { project: SeriesProject; episode: SeriesEpisode }) {
  const sections = [
    { id: 'characters', label: '角色', items: episode.characters || [] },
    { id: 'scenes', label: '场景', items: episode.scenes || [] },
    { id: 'props', label: '道具', items: episode.props || [] }
  ]

  const handleDragStart = (
    event: DragEvent,
    categoryId: string,
    categoryName: string,
    name: string
  ) => {
    const prompt = `${categoryName}：${name}`
    event.dataTransfer.setData(
      SERIES_ASSET_MIME,
      JSON.stringify({
        source: 'series-asset-library',
        projectId: project.id,
        categoryId,
        categoryName,
        name,
        prompt,
        imageUrl: ''
      })
    )
    event.dataTransfer.setData('text/plain', prompt)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <aside className="ed-asset-panel">
      <div className="ed-panel-title">
        <Package size={14} />
        本集资产库
      </div>
      {sections.map((section) => (
        <section className="ed-asset-section" key={section.id}>
          <div className="ed-asset-section-title">
            <strong>{section.label}</strong>
            <span>{section.items.length}</span>
          </div>
          <div className="ed-asset-chip-list">
            {section.items.map((item) => (
              <div
                className="ed-asset-chip"
                key={`${section.id}-${item}`}
                draggable
                onDragStart={(event) => handleDragStart(event, section.id, section.label, item)}
                title="拖到画布节点或批量生产板"
              >
                {item}
              </div>
            ))}
            {section.items.length === 0 && <div className="ed-asset-empty">暂无{section.label}</div>}
          </div>
        </section>
      ))}
      <div className="ed-asset-tip">这些资产跟随本集任务，可直接拖入画布节点或批量生产板作为参考。</div>
    </aside>
  )
}

function ShotCard({
  shot,
  status,
  selected,
  onSelect,
  onApprove,
  onReject,
  onAttach,
  busy
}: {
  shot: SeriesShotAsset
  status: ShotStatus
  selected: boolean
  onSelect: (checked: boolean) => void
  onApprove: () => void
  onReject: () => void
  onAttach: (type: 'image' | 'video') => void
  busy: boolean
}) {
  const imageCandidates = shot.mediaCandidates.filter((item) => item.type === 'image')
  const videoCandidates = shot.mediaCandidates.filter((item) => item.type === 'video')
  const approved = status === 'approved'

  return (
    <article className={`ed-shot-card ed-shot-${status}${selected ? ' ed-shot-selected' : ''}`}>
      <div className="ed-shot-head">
        <div>
          <label className="ed-shot-select">
            <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} />
            <span className="ed-shot-number">镜头 {shot.shotNumber}</span>
          </label>
          <h4>{shot.description}</h4>
        </div>
        <div className="ed-shot-review">
          <span className="ed-shot-status">
            {approved && <CheckCircle2 size={13} />}
            {SHOT_STATUS_LABEL[status]}
          </span>
          {!approved && (
            <button onClick={onApprove} disabled={busy}>
              {busy ? <Loader2 size={13} className="ca-spin" /> : <CheckCircle2 size={13} />}
              导演通过
            </button>
          )}
          {!approved && (
            <button className="ed-shot-reject-btn" onClick={onReject} disabled={busy}>
              <XCircle size={13} />
              退回
            </button>
          )}
        </div>
      </div>

      <div className="ed-shot-meta">
        <span><User size={12} /> {shot.assignee}</span>
        <span><Clock size={12} /> {formatDate(shot.lastModified)}</span>
        <span>{shot.cameraAngle} / {shot.cameraMovement}</span>
      </div>

      <div className="ed-shot-tags">
        {(shot.characters || []).map((item) => <span key={`c-${item}`}>角色：{item}</span>)}
        {shot.scene && <span>场景：{shot.scene}</span>}
        {(shot.props || []).map((item) => <span key={`p-${item}`}>道具：{item}</span>)}
      </div>

      <div className="ed-prompt-box">{shot.promptDraft}</div>

      <div className="ed-media-section">
        <div className="ed-media-title">
          <span><Image size={13} /> 图片组</span>
          <button className="ed-media-add-btn" onClick={() => onAttach('image')}>
            <Plus size={12} /> 添加图片
          </button>
        </div>
        <div className="ed-media-grid">
          {imageCandidates.map((media) => (
            <div className={`ed-media-card ${media.selected ? 'ed-media-selected' : ''}`} key={media.id}>
              <img src={media.thumbUrl || media.url} alt={media.id} />
              <span>{media.creatorName || media.creator}</span>
              {media.selected && <b className="ed-media-selected-badge">已选用</b>}
              {media.status === 'pending' && <b className="ed-media-pending-badge">待审核</b>}
            </div>
          ))}
          {imageCandidates.length === 0 && <div className="ed-media-empty">暂无图片</div>}
        </div>
      </div>

      <div className="ed-media-section">
        <div className="ed-media-title">
          <span><Video size={13} /> 备选视频</span>
          <button className="ed-media-add-btn" onClick={() => onAttach('video')}>
            <Plus size={12} /> 添加视频
          </button>
        </div>
        <div className="ed-media-grid ed-video-grid">
          {videoCandidates.map((media) => (
            <div className={`ed-media-card ${media.selected ? 'ed-media-selected' : ''}`} key={media.id}>
              {media.thumbUrl && media.thumbUrl !== media.url ? (
                <img src={media.thumbUrl} alt={media.id} />
              ) : (
                <VideoThumbnail src={media.url} />
              )}
              <span>{media.creatorName || media.creator}</span>
              {media.selected && <b className="ed-media-selected-badge">已选用</b>}
              {media.status === 'pending' && <b className="ed-media-pending-badge">待审核</b>}
            </div>
          ))}
          {videoCandidates.length === 0 && <div className="ed-media-empty">暂无视频</div>}
        </div>
      </div>
    </article>
  )
}

type EpisodeDetailViewProps = {
  project: SeriesProject
  episode: SeriesEpisode
  onBack: () => void
  onRefresh?: () => void | Promise<void>
  teamId?: number
}

type ShotCreateMode = 'nodes' | 'board'

type AttachMediaDraft = {
  shot: SeriesShotAsset
  type: 'image' | 'video'
}

const DEFAULT_SHOT_PARAMS = {
  mode: 'video' as 'video' | 'image',
  model: 'grok-video-3',
  duration: '5s',
  resolution: '720P',
  ratio: '16:9',
  count: 1,
  includeEpisodeAssets: true
}

type StoryboardImportShot = {
  scene_number?: string
  shot_number?: number
  shot_label?: string
  description?: string
  camera_angle?: string
  camera_movement?: string
  prompt_draft?: string
  video_prompt_draft?: string
}

type StoryboardImportDraft = {
  fileName: string
  shots: StoryboardImportShot[]
  replace: boolean
  lockAfterImport: boolean
}

function normalizeShotValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text || undefined
}

function pickField(source: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = normalizeShotValue(source?.[key])
    if (value) return value
  }
  return undefined
}

function normalizeImportShot(raw: any, index: number): StoryboardImportShot | null {
  if (!raw || typeof raw !== 'object') return null
  const description = pickField(raw, ['description', 'content', '画面描述', '描述', '画面', '内容'])
  const promptDraft = pickField(raw, ['prompt_draft', 'promptDraft', 'image_prompt', '图片提示词', '提示词', 'prompt'])
  const videoPromptDraft = pickField(raw, ['video_prompt_draft', 'videoPromptDraft', '视频提示词', 'video_prompt'])
  const shotNumberRaw = pickField(raw, ['shot_number', 'shotNumber', '镜号', '镜头号', '序号'])
  const shotNumber = Number.parseInt(shotNumberRaw || '', 10)
  const shot: StoryboardImportShot = {
    scene_number: pickField(raw, ['scene_number', 'sceneNumber', '场次', '场号']),
    shot_number: Number.isFinite(shotNumber) && shotNumber > 0 ? shotNumber : index + 1,
    shot_label: pickField(raw, ['shot_label', 'shotLabel', '镜头', '标题']) || `镜头 ${index + 1}`,
    description,
    camera_angle: pickField(raw, ['camera_angle', 'cameraAngle', '景别', '机位']),
    camera_movement: pickField(raw, ['camera_movement', 'cameraMovement', '运镜', '镜头运动']),
    prompt_draft: promptDraft || description,
    video_prompt_draft: videoPromptDraft || promptDraft || description
  }
  if (!shot.description && !shot.prompt_draft && !shot.video_prompt_draft) return null
  return shot
}

function parseDelimitedStoryboard(text: string): StoryboardImportShot[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const headers = lines[0].split(delimiter).map((item) => item.trim())
  if (headers.length < 2) return []
  return lines.slice(1)
    .map((line, index) => {
      const cells = line.split(delimiter).map((item) => item.trim())
      const row = headers.reduce<Record<string, string>>((acc, header, cellIndex) => {
        acc[header] = cells[cellIndex] || ''
        return acc
      }, {})
      return normalizeImportShot(row, index)
    })
    .filter((shot): shot is StoryboardImportShot => Boolean(shot))
}

function parsePlainTextStoryboard(text: string): StoryboardImportShot[] {
  const blocks = text
    .split(/(?=^\s*(?:镜头|分镜|shot)\s*[\d一二三四五六七八九十]+[：:\s])/gim)
    .map((block) => block.trim())
    .filter(Boolean)
  const sourceBlocks = blocks.length > 1 ? blocks : text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
  return sourceBlocks
    .map((block, index) => {
      const firstLine = block.split(/\r?\n/)[0]?.trim() || ''
      return normalizeImportShot({
        shot_label: firstLine.slice(0, 40) || `镜头 ${index + 1}`,
        description: block,
        prompt_draft: block,
        video_prompt_draft: block
      }, index)
    })
    .filter((shot): shot is StoryboardImportShot => Boolean(shot))
}

function parseStoryboardFile(fileName: string, text: string): StoryboardImportShot[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (/\.json$/i.test(fileName) || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed)
    const rawShots = Array.isArray(parsed) ? parsed : parsed.shots || parsed.storyboard || parsed.items || []
    if (!Array.isArray(rawShots)) return []
    return rawShots
      .map((item, index) => normalizeImportShot(item, index))
      .filter((shot): shot is StoryboardImportShot => Boolean(shot))
  }
  const delimited = parseDelimitedStoryboard(trimmed)
  return delimited.length > 0 ? delimited : parsePlainTextStoryboard(trimmed)
}

function createSourceMeta(project: SeriesProject, episode: SeriesEpisode, shot: SeriesShotAsset) {
  const currentProject = (useAppStore.getState().currentProject || {}) as Record<string, any>
  return {
    source: 'cloud-assets',
    sourceType: 'storyboard-shot',
    projectId: project.id,
    episodeId: episode.id,
    shotId: shot.id,
    shotNumber: shot.shotNumber,
    shotTitle: `镜头 ${shot.shotNumber}`,
    episodeTitle: episode.title,
    sceneTitle: shot.scene,
    cameraAngle: shot.cameraAngle,
    cameraMovement: shot.cameraMovement,
    characters: shot.characters,
    props: shot.props,
    cloudProjectId: currentProject.cloudProjectId || project.id,
    cloudEpisodeId: currentProject.cloudEpisodeId || episode.id,
    cloudShotId: shot.id,
    cloudAssignmentId: currentProject.cloudAssignmentId || null
  }
}

function ShotCreateModal({
  action,
  shots,
  params,
  setParams,
  onCancel,
  onConfirm
}: {
  action: ShotCreateMode
  shots: SeriesShotAsset[]
  params: typeof DEFAULT_SHOT_PARAMS
  setParams: (params: typeof DEFAULT_SHOT_PARAMS) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const apiConfigs = useAppStore((state) => state.apiConfigs || [])
  const modelType = params.mode === 'video' ? 'Video' : 'Image'
  const modelOptions = useMemo(
    () => apiConfigs.filter((config: any) => config.type === modelType),
    [apiConfigs, modelType]
  )
  const selectedModelExists = modelOptions.some((config: any) => config.id === params.model)
  const update = (patch: Partial<typeof DEFAULT_SHOT_PARAMS>) => setParams({ ...params, ...patch })

  useEffect(() => {
    if (modelOptions.length > 0 && !selectedModelExists) {
      update({ model: modelOptions[0].id })
    }
  }, [modelOptions, selectedModelExists])

  return (
    <div className="ed-create-mask" onClick={onCancel}>
      <div className="ed-create-modal" onClick={(event) => event.stopPropagation()}>
        <div className="ed-create-head">
          <strong>{action === 'nodes' ? '创建画布节点' : '导入批量生产板'}</strong>
          <span>{shots.length} 个镜头</span>
        </div>
        <div className="ed-create-grid">
          <label>
            生产类型
            <select value={params.mode} onChange={(event) => update({ mode: event.target.value as 'video' | 'image' })}>
              <option value="video">视频</option>
              <option value="image">图片</option>
            </select>
          </label>
          <label>
            模型
            {modelOptions.length > 0 ? (
              <select value={selectedModelExists ? params.model : modelOptions[0].id} onChange={(event) => update({ model: event.target.value })}>
                {modelOptions.map((model: any) => (
                  <option key={model.id} value={model.id}>
                    {model.provider ? `${model.provider} · ` : ''}{model.modelName || model.id}
                  </option>
                ))}
              </select>
            ) : (
              <input value={params.model} onChange={(event) => update({ model: event.target.value })} />
            )}
          </label>
          <label>
            秒数
            <select value={params.duration} onChange={(event) => update({ duration: event.target.value })}>
              <option value="3s">3s</option>
              <option value="5s">5s</option>
              <option value="6s">6s</option>
              <option value="8s">8s</option>
              <option value="10s">10s</option>
            </select>
          </label>
          <label>
            分辨率
            <select value={params.resolution} onChange={(event) => update({ resolution: event.target.value })}>
              <option value="720P">720P</option>
              <option value="1080P">1080P</option>
              <option value="1K">1K</option>
              <option value="2K">2K</option>
            </select>
          </label>
          <label>
            比例
            <select value={params.ratio} onChange={(event) => update({ ratio: event.target.value })}>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
            </select>
          </label>
          <label>
            数量
            <input
              type="number"
              min={1}
              max={8}
              value={params.count}
              onChange={(event) => update({ count: Math.max(1, Number(event.target.value) || 1) })}
            />
          </label>
        </div>
        <label className="ed-create-check">
          <input
            type="checkbox"
            checked={params.includeEpisodeAssets}
            onChange={(event) => update({ includeEpisodeAssets: event.target.checked })}
          />
          带入本集角色、场景、道具作为参考资产
        </label>
        <div className="ed-create-note">
          生成结果先保存在本地，只有手动上传后才会同步到云端素材库。
        </div>
        <div className="ed-create-actions">
          <button onClick={onCancel}>取消</button>
          <button onClick={onConfirm}>
            <Plus size={14} /> 确认创建
          </button>
        </div>
      </div>
    </div>
  )
}

function StoryboardImportModal({
  draft,
  importing,
  error,
  onChange,
  onCancel,
  onConfirm
}: {
  draft: StoryboardImportDraft
  importing: boolean
  error: string
  onChange: (patch: Partial<StoryboardImportDraft>) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="ed-create-mask" onClick={importing ? undefined : onCancel}>
      <div className="ed-create-modal ed-import-modal" onClick={(event) => event.stopPropagation()}>
        <div className="ed-create-head">
          <strong>上传本集分镜</strong>
          <span>{draft.shots.length} 个镜头</span>
        </div>
        <div className="ed-import-file">
          <FileUp size={16} />
          <div>
            <strong>{draft.fileName}</strong>
            <span>Word 正文会被提取为分镜文本，确认后写入当前剧集。</span>
          </div>
        </div>
        <div className="ed-import-preview">
          {draft.shots.slice(0, 5).map((shot, index) => (
            <div className="ed-import-row" key={`${shot.shot_number}-${index}`}>
              <b>{shot.shot_label || `镜头 ${shot.shot_number || index + 1}`}</b>
              <span>{shot.description || shot.prompt_draft || shot.video_prompt_draft}</span>
            </div>
          ))}
          {draft.shots.length > 5 && <div className="ed-import-more">还有 {draft.shots.length - 5} 个镜头</div>}
        </div>
        <label className="ed-create-check">
          <input
            type="checkbox"
            checked={draft.replace}
            disabled={importing}
            onChange={(event) => onChange({ replace: event.target.checked })}
          />
          替换本集未绑定产物的旧分镜
        </label>
        <label className="ed-create-check">
          <input
            type="checkbox"
            checked={draft.lockAfterImport}
            disabled={importing}
            onChange={(event) => onChange({ lockAfterImport: event.target.checked })}
          />
          导入后锁定分镜，进入导演审核口径
        </label>
        {error && <div className="ed-import-error">{error}</div>}
        <div className="ed-create-actions">
          <button onClick={onCancel} disabled={importing}>取消</button>
          <button onClick={onConfirm} disabled={importing || draft.shots.length === 0}>
            {importing ? <Loader2 size={14} className="ca-spin" /> : <FileUp size={14} />}
            确认上传
          </button>
        </div>
      </div>
    </div>
  )
}

function AttachMediaModal({
  draft,
  teamId,
  submitting,
  error,
  onCancel,
  onSubmit
}: {
  draft: AttachMediaDraft
  teamId?: number
  submitting: boolean
  error: string
  onCancel: () => void
  onSubmit: (data: { file?: File | null; url: string; name: string }) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const label = draft.type === 'video' ? '视频' : '图片'

  return (
    <div className="ed-create-mask" onClick={submitting ? undefined : onCancel}>
      <div className="ed-create-modal ed-attach-modal" onClick={(event) => event.stopPropagation()}>
        <div className="ed-create-head">
          <strong>添加{label}到镜头 {draft.shot.shotNumber}</strong>
          <span>待导演审核</span>
        </div>
        <div className="ed-create-note">
          生成结果最顺的放法：从这个镜头创建节点或批量生产板，生成完成后在结果卡片点“上传云素材库”。这里用于手动补上传或登记已有链接。
        </div>
        <div className="ed-attach-form">
          <label>
            本地文件
            <input
              type="file"
              accept={draft.type === 'video' ? 'video/*' : 'image/*'}
              disabled={submitting || !teamId}
              onChange={(event) => {
                const nextFile = event.target.files?.[0] || null
                setFile(nextFile)
                if (nextFile && !name) setName(nextFile.name)
              }}
            />
            {!teamId && <small>未选择团队时只能登记 URL。</small>}
          </label>
          <label>
            或粘贴已有 URL
            <input
              value={url}
              disabled={submitting}
              placeholder={`${label}地址，例如 https://...`}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <label>
            素材名称
            <input
              value={name}
              disabled={submitting}
              placeholder={`镜头 ${draft.shot.shotNumber} ${label}`}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>
        {error && <div className="ed-import-error">{error}</div>}
        <div className="ed-create-actions">
          <button onClick={onCancel} disabled={submitting}>取消</button>
          <button
            onClick={() => onSubmit({ file, url: url.trim(), name: name.trim() })}
            disabled={submitting || (!file && !url.trim())}
          >
            {submitting ? <Loader2 size={14} className="ca-spin" /> : <Plus size={14} />}
            添加到{draft.type === 'video' ? '备选视频' : '图片组'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function EpisodeDetailView({ project, episode, onBack, onRefresh, teamId }: EpisodeDetailViewProps) {
  const storyboardFileInputRef = useRef<HTMLInputElement | null>(null)
  const [shotStatusOverrides, setShotStatusOverrides] = useState<Record<string, ShotStatus>>({})
  const [busyShotId, setBusyShotId] = useState<string | null>(null)
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(() => new Set((episode.shots || []).map((shot) => shot.id).slice(0, 1)))
  const [createAction, setCreateAction] = useState<ShotCreateMode | null>(null)
  const [shotParams, setShotParams] = useState(DEFAULT_SHOT_PARAMS)
  const [notifyMessage, setNotifyMessage] = useState('')
  const [importDraft, setImportDraft] = useState<StoryboardImportDraft | null>(null)
  const [importingStoryboard, setImportingStoryboard] = useState(false)
  const [importError, setImportError] = useState('')
  const [attachDraft, setAttachDraft] = useState<AttachMediaDraft | null>(null)
  const [attachingMedia, setAttachingMedia] = useState(false)
  const [attachError, setAttachError] = useState('')
  const approvedShots = (episode.shots || []).filter((shot) => (shotStatusOverrides[shot.id] || shot.status) === 'approved').length
  const selectedShots = (episode.shots || []).filter((shot) => selectedShotIds.has(shot.id))

  useEffect(() => {
    setShotStatusOverrides({})
    setSelectedShotIds(new Set((episode.shots || []).map((shot) => shot.id).slice(0, 1)))
    setImportDraft(null)
    setImportError('')
  }, [episode.id])

  const setShotSelected = (shotId: string, checked: boolean) => {
    setSelectedShotIds((current) => {
      const next = new Set(current)
      if (checked) next.add(shotId)
      else next.delete(shotId)
      return next
    })
  }

  const selectAllShots = () => {
    setSelectedShotIds(new Set((episode.shots || []).map((shot) => shot.id)))
  }

  const handleStoryboardFile = async (file?: File | null) => {
    if (!file) return
    try {
      setImportError('')
      if (/\.doc$/i.test(file.name) && !isDocxFile(file.name)) {
        throw new Error('暂不支持旧版 .doc，请另存为 .docx 后上传。')
      }
      const text = isDocxFile(file.name)
        ? await extractTextFromDocx(await file.arrayBuffer())
        : await file.text()
      const shots = parseStoryboardFile(file.name, text)
      if (shots.length === 0) {
        throw new Error('没有解析到有效分镜。支持 Word .docx、JSON 数组、带表头 CSV/TSV，或按段落/“镜头 1”分隔的文本。')
      }
      setImportDraft({
        fileName: file.name,
        shots,
        replace: (episode.shots || []).length === 0,
        lockAfterImport: false
      })
    } catch (error) {
      setImportDraft(null)
      setImportError(error instanceof Error ? error.message : '分镜文件解析失败')
    } finally {
      if (storyboardFileInputRef.current) storyboardFileInputRef.current.value = ''
    }
  }

  const confirmImportStoryboard = async () => {
    if (!importDraft) return
    setImportingStoryboard(true)
    setImportError('')
    try {
      await writingShotsApi.importStoryboard(Number(episode.id), {
        shots: importDraft.shots,
        replace: importDraft.replace,
        replace_existing: importDraft.replace,
        lock_after_import: importDraft.lockAfterImport
      })
      setNotifyMessage('分镜已上传，等待导演审核')
      setImportDraft(null)
      await onRefresh?.()
      window.setTimeout(() => setNotifyMessage(''), 1800)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '上传分镜失败')
    } finally {
      setImportingStoryboard(false)
    }
  }

  const reviewShot = async (shot: SeriesShotAsset, action: 'approve' | 'reject') => {
    const feedbackInput = action === 'reject' ? window.prompt('请输入退回意见（可留空）') : ''
    if (action === 'reject' && feedbackInput === null) return
    const feedback = feedbackInput || ''
    setBusyShotId(shot.id)
    try {
      const selectedCandidate = shot.mediaCandidates.find((item) => item.selected) || shot.mediaCandidates[0]
      const selectedCandidateId = Number(selectedCandidate?.id)
      await writingShotsApi.review(Number(shot.id), {
        action,
        selected_candidate_id: Number.isFinite(selectedCandidateId) ? selectedCandidateId : undefined,
        feedback: feedback || undefined
      })
      setShotStatusOverrides((current) => ({
        ...current,
        [shot.id]: action === 'approve' ? 'approved' : 'rejected'
      }))
      setNotifyMessage(action === 'approve' ? '导演已通过分镜' : '已退回给制作成员')
      await onRefresh?.()
    } catch (error) {
      console.warn('[EpisodeDetailView] review shot failed:', error)
      setNotifyMessage(error instanceof Error ? error.message : '审核提交失败')
    } finally {
      setBusyShotId(null)
      window.setTimeout(() => setNotifyMessage(''), 1800)
    }
  }

  const attachMediaToShot = async (data: { file?: File | null; url: string; name: string }) => {
    if (!attachDraft) return
    setAttachingMedia(true)
    setAttachError('')
    try {
      let assetUrl = data.url
      let objectKey = ''
      let fileSize = 0
      if (data.file) {
        if (!teamId) throw new Error('未选择团队，无法上传本地文件')
        const signed = await assetsApi.getUploadUrl(teamId, {
          filename: data.file.name,
          content_type: data.file.type || (attachDraft.type === 'video' ? 'video/mp4' : 'image/png'),
          file_size: data.file.size
        })
        const uploadRes = await fetch(signed.upload_url, {
          method: signed.method,
          headers: signed.headers,
          body: data.file
        })
        if (!uploadRes.ok) {
          const detail = await uploadRes.text().catch(() => '')
          throw new Error(`文件上传失败：${uploadRes.status}${detail ? ` ${detail.slice(0, 120)}` : ''}`)
        }
        objectKey = signed.oss_key
        assetUrl = signed.upload_url.split('?')[0]
        fileSize = data.file.size
      }

      if (!assetUrl) throw new Error('请上传文件或填写素材 URL')
      await writingProjectAssetsApi.create(Number(project.id), {
        episode_id: Number(episode.id),
        shot_id: Number(attachDraft.shot.id),
        name: data.name || `镜头 ${attachDraft.shot.shotNumber} ${attachDraft.type === 'video' ? '视频' : '图片'}`,
        asset_type: attachDraft.type,
        url: assetUrl,
        object_key: objectKey || undefined,
        thumb_url: attachDraft.type === 'image' ? assetUrl : undefined,
        prompt: attachDraft.shot.promptDraft || attachDraft.shot.description || '',
        status: 'pending',
        metadata_json: {
          source: data.file ? 'manual-upload' : 'manual-url',
          fileSize,
          shotNumber: attachDraft.shot.shotNumber
        }
      })
      setNotifyMessage(`${attachDraft.type === 'video' ? '视频' : '图片'}已加入，等待导演审核`)
      setAttachDraft(null)
      await onRefresh?.()
      window.setTimeout(() => setNotifyMessage(''), 1800)
    } catch (error) {
      setAttachError(error instanceof Error ? error.message : '添加素材失败')
    } finally {
      setAttachingMedia(false)
    }
  }

  const confirmCreate = () => {
    const store = useAppStore.getState()
    const mode = shotParams.mode
    const nodeType = mode === 'video' ? 'gen-video' : 'gen-image'
    const baseX = -store.view.x / store.view.zoom + window.innerWidth / 2
    const baseY = -store.view.y / store.view.zoom + window.innerHeight / 2

    if (createAction === 'nodes') {
      const newNodes = selectedShots.map((shot, index) => {
        const prompt = shot.promptDraft || shot.description
        const sourceMeta = createSourceMeta(project, episode, shot)
        return {
          id: `node_${Date.now()}_${shot.id}_${index}`,
          type: nodeType,
          position: { x: baseX + (index % 3) * 430, y: baseY + Math.floor(index / 3) * 340 },
          x: baseX + (index % 3) * 430,
          y: baseY + Math.floor(index / 3) * 340,
          width: 400,
          height: 300,
          data: {
            source: 'cloud-assets',
            sourceType: 'storyboard-shot',
            shotId: shot.id,
            sourceMeta
          },
          settings: {
            ...(mode === 'video' ? { videoPrompt: prompt } : { prompt }),
            model: shotParams.model,
            duration: shotParams.duration,
            resolution: shotParams.resolution,
            ratio: shotParams.ratio,
            count: shotParams.count,
            refCharacters: shotParams.includeEpisodeAssets ? shot.characters.map((name) => ({ name })) : [],
            refProps: shotParams.includeEpisodeAssets ? shot.props.map((name) => ({ name })) : [],
            refScenes: shotParams.includeEpisodeAssets && shot.scene ? [{ name: shot.scene }] : [],
            sourceMeta,
            cloudProjectId: sourceMeta.cloudProjectId,
            cloudEpisodeId: sourceMeta.cloudEpisodeId,
            cloudShotId: sourceMeta.cloudShotId,
            cloudAssignmentId: sourceMeta.cloudAssignmentId
          }
        }
      })
      store.setNodes((nodes: any[]) => [...nodes, ...newNodes])
    }

    if (createAction === 'board') {
      const rows = selectedShots.map((shot) => {
        const sourceMeta = createSourceMeta(project, episode, shot)
        return {
          id: `row_${Date.now()}_${shot.id}_${Math.random().toString(36).slice(2, 6)}`,
          name: `镜头 ${shot.shotNumber}${shot.scene ? ` - ${shot.scene}` : ''}`,
          prompt: shot.promptDraft || shot.description,
          assetIds: [],
          refCharacters: shotParams.includeEpisodeAssets ? shot.characters.map((name) => ({ name })) : [],
          refProps: shotParams.includeEpisodeAssets ? shot.props.map((name) => ({ name })) : [],
          refScenes: shotParams.includeEpisodeAssets && shot.scene ? [{ name: shot.scene }] : [],
          refAudios: [],
          refVideos: [],
          ratio: shotParams.ratio,
          duration: shotParams.duration,
          resolution: shotParams.resolution,
          count: shotParams.count,
          model: shotParams.model,
          previews: [],
          status: 'idle',
          rowHeight: null,
          sourceMeta,
          _sourceMeta: sourceMeta,
          cloudProjectId: sourceMeta.cloudProjectId,
          cloudEpisodeId: sourceMeta.cloudEpisodeId,
          cloudShotId: sourceMeta.cloudShotId,
          cloudAssignmentId: sourceMeta.cloudAssignmentId
        }
      })
      store.setProductionBoardMode(mode)
      if (store.productionBoardOpen && store.productionBoardMode === mode) {
        window.dispatchEvent(new CustomEvent('production-board-import', { detail: rows }))
      } else {
        if (mode === 'video') {
          store.setProductionBoardVideoRows([...(store.productionBoardVideoRows || []), ...rows])
        } else {
          store.setProductionBoardImageRows([...(store.productionBoardImageRows || []), ...rows])
        }
        store.setProductionBoardOpen(true)
      }
    }

    setCreateAction(null)
  }

  const notifyDirector = async () => {
    const currentProject = (useAppStore.getState().currentProject || {}) as Record<string, any>
    const assignmentId = Number(currentProject.cloudAssignmentId || 0)
    if (Number.isFinite(assignmentId) && assignmentId > 0) {
      try {
        await writingAssignmentsApi.complete(assignmentId, {
          note: `${project.title} / ${episode.title} 已完成制作，请导演审核。`
        })
        setNotifyMessage('已通知导演审核')
        window.setTimeout(() => setNotifyMessage(''), 1800)
        return
      } catch (error) {
        console.warn('[EpisodeDetailView] cloud complete failed:', error)
      }
    }
    const ok = notifyDirectorAssetReady({
      source: 'cloud-assets',
      sourceType: 'episode-assets',
      projectId: project.id,
      episodeId: episode.id,
      projectTitle: project.title,
      episodeTitle: episode.title,
      cloudProjectId: currentProject.cloudProjectId || project.id,
      cloudEpisodeId: currentProject.cloudEpisodeId || episode.id,
      cloudAssignmentId: currentProject.cloudAssignmentId || null
    })
    setNotifyMessage(ok ? '已通知导演审核' : '通知发送失败')
    window.setTimeout(() => setNotifyMessage(''), 1800)
  }

  return (
    <div className="ed-container">
      <div className="ed-breadcrumb">
        <button className="sl-back-btn" onClick={onBack}>
          <ArrowLeft size={14} />
          返回剧集列表
        </button>
        <span>/</span>
        <strong>{project.title}</strong>
        <span>/</span>
        <strong>第 {episode.episodeNumber} 集：{episode.title}</strong>
      </div>

      <div className="ed-episode-summary">
        <div>
          <h3>第 {episode.episodeNumber} 集 · {episode.title}</h3>
          <p>{episode.synopsis}</p>
        </div>
        <div className="ed-create-toolbar">
          <span>已选 {selectedShots.length} 个镜头</span>
          <input
            ref={storyboardFileInputRef}
            type="file"
            accept=".docx,.json,.csv,.tsv,.txt,.md,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json,text/plain,text/csv"
            className="ed-storyboard-file-input"
            onChange={(event) => handleStoryboardFile(event.target.files?.[0])}
          />
          <button onClick={() => storyboardFileInputRef.current?.click()}>
            <FileUp size={13} />
            上传分镜
          </button>
          <button onClick={selectAllShots} disabled={(episode.shots || []).length === 0}>全选</button>
          <button onClick={() => setSelectedShotIds(new Set())} disabled={selectedShots.length === 0}>清空</button>
          <button onClick={() => setCreateAction('nodes')} disabled={selectedShots.length === 0}>创建节点</button>
          <button onClick={() => setCreateAction('board')} disabled={selectedShots.length === 0}>批量生产板</button>
          <button onClick={notifyDirector}>完成并通知导演</button>
          {notifyMessage && <small className="ed-notify-message">{notifyMessage}</small>}
        </div>
        <div className="ed-summary-stat">
          <strong>{approvedShots}/{(episode.shots || []).length}</strong>
          <span>分镜通过</span>
        </div>
      </div>

      <div className="ed-episode-assets">
        <div>
          <strong>本集角色</strong>
          <div className="sl-tags">{(episode.characters || []).map((item) => <span className="sl-tag sl-tag-char" key={item}>{item}</span>)}</div>
        </div>
        <div>
          <strong>本集场景</strong>
          <div className="sl-tags">{(episode.scenes || []).map((item) => <span className="sl-tag sl-tag-scene" key={item}>{item}</span>)}</div>
        </div>
        <div>
          <strong>本集道具</strong>
          <div className="sl-tags">{(episode.props || []).map((item) => <span className="sl-tag sl-tag-prop" key={item}>{item}</span>)}</div>
        </div>
      </div>

      <div className="ed-workspace">
        <EpisodeTextPanel episode={episode} />
        <main className="ed-shot-list">
          {(episode.shots || []).map((shot) => (
            <ShotCard
              key={shot.id}
              shot={shot}
              status={shotStatusOverrides[shot.id] || shot.status}
              selected={selectedShotIds.has(shot.id)}
              onSelect={(checked) => setShotSelected(shot.id, checked)}
              onApprove={() => reviewShot(shot, 'approve')}
              onReject={() => reviewShot(shot, 'reject')}
              onAttach={(type) => {
                setAttachError('')
                setAttachDraft({ shot, type })
              }}
              busy={busyShotId === shot.id}
            />
          ))}
          {(episode.shots || []).length === 0 && (
            <div className="ed-empty">
              <p>这一集还没有分镜。</p>
              <div style={{ marginTop: '12px', color: 'rgba(255,255,255,0.55)', fontSize: '12px' }}>
                可直接上传 Word、JSON、CSV 或文本分镜文件，导入后进入导演审核。
              </div>
              <button className="ed-empty-upload-btn" onClick={() => storyboardFileInputRef.current?.click()}>
                <FileUp size={14} />
                上传本集分镜
              </button>
            </div>
          )}
        </main>
        <EpisodeAssetPanel project={project} episode={episode} />
      </div>
      {createAction && (
        <ShotCreateModal
          action={createAction}
          shots={selectedShots}
          params={shotParams}
          setParams={setShotParams}
          onCancel={() => setCreateAction(null)}
          onConfirm={confirmCreate}
        />
      )}
      {importDraft && (
        <StoryboardImportModal
          draft={importDraft}
          importing={importingStoryboard}
          error={importError}
          onChange={(patch) => setImportDraft((current) => current ? { ...current, ...patch } : current)}
          onCancel={() => {
            setImportDraft(null)
            setImportError('')
          }}
          onConfirm={confirmImportStoryboard}
        />
      )}
      {attachDraft && (
        <AttachMediaModal
          draft={attachDraft}
          teamId={teamId}
          submitting={attachingMedia}
          error={attachError}
          onCancel={() => {
            setAttachDraft(null)
            setAttachError('')
          }}
          onSubmit={attachMediaToShot}
        />
      )}
    </div>
  )
}

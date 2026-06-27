/**
 * W8: 剧集制素材库 — 剧项目列表 & 剧集网格
 *
 * 两层视图：
 *   1. 剧项目卡片列表（顶层）
 *   2. 点进某部剧后的剧集窗格（第二层）
 */
import { useEffect, useRef, useState, type DragEvent } from 'react'
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Film,
  Image,
  Layers,
  Plus,
  User
} from 'lucide-react'
import type { SeriesProject, SeriesEpisode, EpisodeStatus } from './seriesTypes'
import { SERIES_ASSET_MIME } from '../../utils/cloudAssetDrop'

// ─── 状态颜色 ───

const STATUS_COLOR: Record<EpisodeStatus, { bg: string; fg: string; label: string }> = {
  completed: { bg: 'rgba(76,175,80,0.18)', fg: '#81c784', label: '已完成' },
  in_progress: { bg: 'rgba(255,183,77,0.18)', fg: '#ffb74d', label: '制作中' },
  not_started: { bg: 'rgba(158,158,158,0.12)', fg: '#9e9e9e', label: '未开始' }
}

function StatusDot({ status }: { status: EpisodeStatus }) {
  const c = STATUS_COLOR[status]
  return (
    <span className="sl-status-dot" style={{ background: c.bg, color: c.fg }}>
      {status === 'completed' && <CheckCircle2 size={11} />}
      {c.label}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// ═══════════════════════════════════
//  剧项目卡片
// ═══════════════════════════════════

function SeriesProjectCard({
  project,
  onClick
}: {
  project: SeriesProject
  onClick: () => void
}) {
  const progress = project.totalEpisodes > 0
    ? Math.round((project.completedEpisodes / project.totalEpisodes) * 100)
    : 0

  return (
    <div className="sl-project-card" onClick={onClick}>
      {/* 封面 */}
      <div className="sl-project-cover">
        <img src={project.coverUrl} alt={project.title} />
        <span className="sl-project-badge">
          {project.status === 'active' ? '制作中' : '已归档'}
        </span>
      </div>

      {/* 信息 */}
      <div className="sl-project-info">
        <h3 className="sl-project-title">{project.title}</h3>
        <span className="sl-project-genre">{project.genre}</span>
        <p className="sl-project-synopsis">{project.synopsis}</p>

        {/* 进度条 */}
        <div className="sl-progress-wrap">
          <div className="sl-progress-bar">
            <div className="sl-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="sl-progress-text">
            {project.completedEpisodes} / {project.totalEpisodes} 集完成
          </span>
        </div>

        {/* 元信息 */}
        <div className="sl-project-meta">
          <span><Film size={11} /> {project.totalEpisodes} 集</span>
          <span><User size={11} /> {project.characters.length} 角色</span>
          <span><Calendar size={11} /> {formatDate(project.lastModified)}</span>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════
//  剧集预览窗格（某部剧内）
// ═══════════════════════════════════

function EpisodeCard({
  episode,
  onClick
}: {
  episode: SeriesEpisode
  onClick: () => void
}) {
  const shots = episode.shots || []
  const textAssets = episode.textAssets || []
  const shotCount = shots.length
  const approvedShots = shots.filter((s) => s.status === 'approved').length

  return (
    <div className="sl-episode-card" onClick={onClick}>
      <div className="sl-episode-header">
        <span className="sl-episode-number">第 {episode.episodeNumber} 集</span>
        <StatusDot status={episode.status} />
      </div>

      <h4 className="sl-episode-title">{episode.title}</h4>
      <p className="sl-episode-synopsis">{episode.synopsis}</p>

      {/* 分镜/文本统计 */}
      <div className="sl-episode-stats">
        {shotCount > 0 && (
          <span className="sl-stat">
            <Layers size={11} />
            分镜 {approvedShots}/{shotCount}
          </span>
        )}
        {textAssets.length > 0 && (
          <span className="sl-stat">
            <Film size={11} />
            {textAssets.length} 文档
          </span>
        )}
      </div>

      {/* 底部元信息 */}
      <div className="sl-episode-meta">
        <span><User size={11} /> {episode.assignee}</span>
        <span><Clock size={11} /> {formatDate(episode.lastModified)}</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════
//  全剧资产概览（进入某部剧后的顶部）
// ═══════════════════════════════════

function SeriesAssetsOverview({ project }: { project: SeriesProject }) {
  return (
    <div className="sl-assets-overview">
      <div className="sl-assets-section">
        <strong>全剧角色</strong>
        <div className="sl-tags">
          {(project.characters || []).map((c) => (
            <span key={c} className="sl-tag sl-tag-char">{c}</span>
          ))}
        </div>
      </div>
      <div className="sl-assets-section">
        <strong>全剧场景</strong>
        <div className="sl-tags">
          {(project.scenes || []).map((s) => (
            <span key={s} className="sl-tag sl-tag-scene">{s}</span>
          ))}
        </div>
      </div>
      <div className="sl-assets-section">
        <strong>全剧道具</strong>
        <div className="sl-tags">
          {(project.props || []).map((p) => (
            <span key={p} className="sl-tag sl-tag-prop">{p}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

type SeriesAssetCategory = {
  id: string
  name: string
}

type SeriesAssetCard = {
  id: string
  categoryId: string
  name: string
  prompt: string
  imageUrl: string
}

const DEFAULT_ASSET_CATEGORIES: SeriesAssetCategory[] = [
  { id: 'characters', name: '角色' },
  { id: 'scenes', name: '场景' },
  { id: 'props', name: '道具' }
]

function buildInitialSeriesAssets(project: SeriesProject): SeriesAssetCard[] {
  const now = Date.now()
  return [
    ...(project.characters || []).map((name, index) => ({
      id: `characters-${now}-${index}`,
      categoryId: 'characters',
      name,
      prompt: '',
      imageUrl: ''
    })),
    ...(project.scenes || []).map((name, index) => ({
      id: `scenes-${now}-${index}`,
      categoryId: 'scenes',
      name,
      prompt: '',
      imageUrl: ''
    })),
    ...(project.props || []).map((name, index) => ({
      id: `props-${now}-${index}`,
      categoryId: 'props',
      name,
      prompt: '',
      imageUrl: ''
    }))
  ]
}

function SeriesAssetLibraryView({ project }: { project: SeriesProject }) {
  const [categories, setCategories] = useState<SeriesAssetCategory[]>(DEFAULT_ASSET_CATEGORIES)
  const [activeCategoryId, setActiveCategoryId] = useState(DEFAULT_ASSET_CATEGORIES[0].id)
  const [assets, setAssets] = useState<SeriesAssetCard[]>(() => buildInitialSeriesAssets(project))
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [detailAsset, setDetailAsset] = useState<SeriesAssetCard | null>(null)
  const draftImageUrlRef = useRef('')
  const ownedBlobUrlsRef = useRef(new Set<string>())

  const activeCategory = categories.find((category) => category.id === activeCategoryId) || categories[0]
  const visibleAssets = assets.filter((asset) => asset.categoryId === activeCategory.id)

  const addCategory = () => {
    const nextName = `分类 ${categories.length + 1}`
    const nextCategory = {
      id: `custom-${Date.now()}`,
      name: nextName
    }
    setCategories((current) => [...current, nextCategory])
    setActiveCategoryId(nextCategory.id)
  }

  const resetDraft = () => {
    if (draftImageUrlRef.current) {
      URL.revokeObjectURL(draftImageUrlRef.current)
      ownedBlobUrlsRef.current.delete(draftImageUrlRef.current)
      draftImageUrlRef.current = ''
    }
    setCreating(false)
    setName('')
    setPrompt('')
    setImageUrl('')
  }

  const createAsset = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    const asset = {
      id: `series-asset-${Date.now()}`,
      categoryId: activeCategory.id,
      name: trimmedName,
      prompt: prompt.trim(),
      imageUrl
    }
    setAssets((current) => [asset, ...current])
    if (imageUrl.startsWith('blob:')) {
      ownedBlobUrlsRef.current.add(imageUrl)
      draftImageUrlRef.current = ''
    }
    resetDraft()
  }

  const handleImageFile = (file?: File | null) => {
    if (!file) return
    if (draftImageUrlRef.current) {
      URL.revokeObjectURL(draftImageUrlRef.current)
      ownedBlobUrlsRef.current.delete(draftImageUrlRef.current)
    }
    const nextUrl = URL.createObjectURL(file)
    draftImageUrlRef.current = nextUrl
    ownedBlobUrlsRef.current.add(nextUrl)
    setImageUrl(nextUrl)
  }

  useEffect(() => {
    return () => {
      for (const url of ownedBlobUrlsRef.current) {
        URL.revokeObjectURL(url)
      }
      ownedBlobUrlsRef.current.clear()
      draftImageUrlRef.current = ''
    }
  }, [])

  const handleDragStart = (event: DragEvent, asset: SeriesAssetCard) => {
    event.dataTransfer.setData(
      SERIES_ASSET_MIME,
      JSON.stringify({
        source: 'series-asset-library',
        projectId: project.id,
        categoryId: activeCategory.id,
        categoryName: activeCategory.name,
        name: asset.name,
        prompt: asset.prompt,
        imageUrl: asset.imageUrl
      })
    )
    if (asset.imageUrl) {
      event.dataTransfer.setData('asset-path', asset.imageUrl)
      event.dataTransfer.setData('asset-type', 'image/png')
    }
    event.dataTransfer.setData('text/plain', asset.prompt || asset.name)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="sl-asset-library">
      <aside className="sl-asset-sidebar">
        {categories.map((category) => (
          <button
            key={category.id}
            className={category.id === activeCategory.id ? 'sl-asset-category-active' : ''}
            onClick={() => setActiveCategoryId(category.id)}
          >
            {category.name}
            <span>{assets.filter((asset) => asset.categoryId === category.id).length}</span>
          </button>
        ))}
        <button className="sl-asset-add-category" onClick={addCategory}>
          <Plus size={13} /> 新增分类
        </button>
      </aside>

      <section className="sl-asset-main">
        <div className="sl-asset-main-head">
          <div>
            <strong>{activeCategory.name}</strong>
            <span>可上传本地图，也可先只填名称和提示词。</span>
          </div>
          <button onClick={() => setCreating(true)}>
            <Plus size={14} /> 新增资产
          </button>
        </div>

        <div className="sl-asset-grid">
          {creating && (
            <div className="sl-asset-draft">
              <label className="sl-asset-upload">
                {imageUrl ? <img src={imageUrl} alt="" /> : <Image size={24} />}
                <input type="file" accept="image/*" onChange={(event) => handleImageFile(event.target.files?.[0])} />
              </label>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder={`${activeCategory.name}名称`} />
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="提示词 / 设定说明" />
              <div className="sl-asset-draft-actions">
                <button onClick={resetDraft}>取消</button>
                <button onClick={createAsset} disabled={!name.trim()}>创建</button>
              </div>
            </div>
          )}

          <button className="sl-asset-empty-add" onClick={() => setCreating(true)}>
            <Plus size={22} />
            <span>添加{activeCategory.name}</span>
          </button>

          {visibleAssets.map((asset) => (
            <article
              key={asset.id}
              className="sl-asset-card"
              draggable
              onDragStart={(event) => handleDragStart(event, asset)}
              onClick={() => setDetailAsset(asset)}
            >
              <div className="sl-asset-thumb">
                {asset.imageUrl ? <img src={asset.imageUrl} alt={asset.name} /> : <Image size={24} />}
              </div>
              <strong>{asset.name}</strong>
              <p>{asset.prompt || '暂无提示词'}</p>
            </article>
          ))}
        </div>
      </section>

      {detailAsset && (
        <div className="sl-asset-detail-mask" onClick={() => setDetailAsset(null)}>
          <div className="sl-asset-detail" onClick={(event) => event.stopPropagation()}>
            <button className="sl-asset-detail-close" onClick={() => setDetailAsset(null)}>×</button>
            <div className="sl-asset-detail-image">
              {detailAsset.imageUrl ? <img src={detailAsset.imageUrl} alt={detailAsset.name} /> : <Image size={36} />}
            </div>
            <label>
              名称
              <input
                value={detailAsset.name}
                onChange={(event) => {
                  const nextName = event.target.value
                  setDetailAsset((current) => current ? { ...current, name: nextName } : current)
                  setAssets((current) => current.map((asset) => asset.id === detailAsset.id ? { ...asset, name: nextName } : asset))
                }}
              />
            </label>
            <label>
              提示词
              <textarea
                value={detailAsset.prompt}
                onChange={(event) => {
                  const nextPrompt = event.target.value
                  setDetailAsset((current) => current ? { ...current, prompt: nextPrompt } : current)
                  setAssets((current) => current.map((asset) => asset.id === detailAsset.id ? { ...asset, prompt: nextPrompt } : asset))
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════
//  导出：整合视图
// ═══════════════════════════════════

type SeriesListViewProps = {
  projects: SeriesProject[]
  selectedSeriesId: string | null
  onSelectSeries: (id: string) => void
  onBack: () => void
  onSelectEpisode: (seriesId: string, episodeId: string) => void
  onCreateProject?: () => void
  onCreateEpisode?: (seriesId: string) => void
}

export function SeriesListView({
  projects,
  selectedSeriesId,
  onSelectSeries,
  onBack,
  onSelectEpisode,
  onCreateProject,
  onCreateEpisode
}: SeriesListViewProps) {
  const [seriesTab, setSeriesTab] = useState<'episodes' | 'assets'>('episodes')
  const selectedProject = selectedSeriesId
    ? projects.find((p) => p.id === selectedSeriesId) || null
    : null

  // ── 第二层：某部剧的剧集列表 ──
  if (selectedProject) {
    return (
      <div className="sl-container">
        {/* 面包屑导航 */}
        <div className="sl-breadcrumb">
          <button className="sl-back-btn" onClick={onBack}>
            <ArrowLeft size={14} />
            全部剧集
          </button>
          <span className="sl-breadcrumb-sep">/</span>
          <span className="sl-breadcrumb-current">{selectedProject.title}</span>
        </div>

        {/* 全剧资产概览 */}
        <SeriesAssetsOverview project={selectedProject} />

        <div className="sl-series-tabs">
          <button
            className={seriesTab === 'episodes' ? 'sl-series-tab-active' : ''}
            onClick={() => setSeriesTab('episodes')}
          >
            剧集
          </button>
          <button
            className={seriesTab === 'assets' ? 'sl-series-tab-active' : ''}
            onClick={() => setSeriesTab('assets')}
          >
            资产库
          </button>
        </div>

        {seriesTab === 'assets' && <SeriesAssetLibraryView project={selectedProject} />}

        {/* 剧集网格 */}
        {seriesTab === 'episodes' && (
          <>
            <div className="sl-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Film size={14} />
                全部剧集（{selectedProject.episodes?.length || 0}）
              </div>
              {onCreateEpisode && (
                <button className="ca-upload-btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => onCreateEpisode(selectedProject.id)}>
                  + 新建剧集
                </button>
              )}
            </div>
            <div className="sl-episode-grid">
              {(selectedProject.episodes || []).map((ep) => (
                <EpisodeCard
                  key={ep.id}
                  episode={ep}
                  onClick={() => onSelectEpisode(selectedProject.id, ep.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // ── 第一层：剧项目列表 ──
  return (
    <div className="sl-container">
      <div className="sl-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Film size={14} />
          剧集项目（{projects.length}）
        </div>
        {onCreateProject && (
          <button className="ca-upload-btn" style={{ fontSize: 12, padding: '4px 8px' }} onClick={onCreateProject}>
            + 新建项目
          </button>
        )}
      </div>

      {projects.length === 0 && (
        <div className="sl-empty">
          <Film size={40} style={{ opacity: 0.3 }} />
          <p>还没有剧集项目</p>
          <p style={{ fontSize: 12, color: '#777' }}>后续可在独立写作软件中创建</p>
        </div>
      )}

      <div className="sl-project-grid">
        {projects.map((project) => (
          <SeriesProjectCard
            key={project.id}
            project={project}
            onClick={() => onSelectSeries(project.id)}
          />
        ))}
      </div>
    </div>
  )
}

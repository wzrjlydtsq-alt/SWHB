import { memo, useState, useCallback, useRef, useMemo, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../../store/useAppStore'
import { useShallow } from 'zustand/react/shallow'
import {
  X,
  Plus,
  Trash2,
  Play,
  Upload,
  FileText,
  Film,
  Image as ImageIcon,
  Copy,
  Music,
  Video,
  Eye,
  ChevronDown,
  Tag,
  Settings2,
  Minus,
  Maximize2,
  GripHorizontal,
  Bot,
  Square,
  CheckCircle,
  Languages,
  Sparkles,
  FileSearch
} from 'lucide-react'
import { canReadFileAsDataUrl, getXingheMediaSrc } from '../../utils/fileHelpers.ts'
import { withProjectCacheContext } from '../../utils/projectCache.ts'
import { copyTextToClipboard } from '../../utils/clipboard.ts'
import { VideoThumbnail } from '../../components/ui/VideoThumbnail.tsx'
import { Lightbox } from '../../components/ui/Lightbox.tsx'
import { getStartGeneration } from '../../utils/canvasTools.ts'
import { SEEDANCE_VIDEO_RATIOS, SEEDANCE_VIDEO_RES_OPTIONS } from '../../utils/constants.ts'
import { extractTextFromDocx, isDocxFile } from '../../utils/parseDocument.ts'
import { buildGenerationTaskDebugCode } from '../../utils/historyDiagnostics.ts'
import { useUnattendedMode, PHASES, PHASE_LABELS } from './useUnattendedMode.ts'
import { readCloudAssetDrag, readSeriesAssetDrag, resolveCloudAssetForDrop } from '../../utils/cloudAssetDrop'
import { enqueueDubbingJob } from '../dubbing/dubbingQueue'

/**
 * 批量生产板 — 类 Excel 表格式批量创建 / 管理界面
 * 列：# | 名称 | 提示词(@引用) | Asset 角色 | 参考图 | 参考音频 | 参考视频 | 秒数/比例/张数 | 预览 | 状态 | 操作
 * 顶部工具栏包含：模式切换、模型选择器、通用行、导入剧本、批量添加、提交
 */

const EMPTY_ROW = () => ({
  id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
  name: '',
  prompt: '',
  assetIds: [], // string[]
  refCharacters: [], // { path, name }[]  角色参考
  refProps: [], // { path, name }[]  道具参考
  refScenes: [], // { path, name }[]  场景参考
  refImages: [], // legacy compat — 旧行可能含此字段
  refAudios: [], // { path, name }[]
  refVideos: [], // { path, name }[]
  ratio: '',
  duration: '',
  resolution: '',
  count: 1,
  previews: [], // { url, type }[]
  status: 'idle',
  rowHeight: null // null = 自适应, number = 用户手动设定的行高(px)
})

function tokenizePromptDiff(text) {
  return String(text || '').match(/[\u4e00-\u9fff]|[a-zA-Z0-9_]+|\s+|[^\s]/g) || []
}

function buildPromptDiffParts(original, next) {
  const a = tokenizePromptDiff(original)
  const b = tokenizePromptDiff(next)
  if (a.length === 0) return b.map((text) => ({ type: 'add', text }))
  if (b.length === 0) return a.map((text) => ({ type: 'remove', text }))
  if (a.length * b.length > 900000) {
    return [
      { type: 'remove', text: original },
      { type: 'add', text: next }
    ]
  }

  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const parts = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      parts.push({ type: 'same', text: a[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      parts.push({ type: 'remove', text: a[i] })
      i += 1
    } else {
      parts.push({ type: 'add', text: b[j] })
      j += 1
    }
  }
  while (i < a.length) {
    parts.push({ type: 'remove', text: a[i] })
    i += 1
  }
  while (j < b.length) {
    parts.push({ type: 'add', text: b[j] })
    j += 1
  }
  return parts
}

function renderPromptDiff(original, next) {
  return buildPromptDiffParts(original, next).map((part, index) => {
    if (part.type === 'add') {
      return (
        <span key={index} className="rounded bg-emerald-500/20 text-emerald-100">
          {part.text}
        </span>
      )
    }
    if (part.type === 'remove') {
      return (
        <span key={index} className="rounded bg-rose-500/20 text-rose-100 line-through">
          {part.text}
        </span>
      )
    }
    return <span key={index}>{part.text}</span>
  })
}

const MEDIA_FIELDS = ['refCharacters', 'refProps', 'refScenes', 'refAudios', 'refVideos', 'assetIds']

function toMediaItems(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && Array.isArray(value.items)) return value.items
  return []
}

function areRowPreviewsSame(prev = [], next = []) {
  if (prev.length !== next.length) return false
  return next.every((item, index) => {
    const old = prev[index] || {}
    return (
      old.url === item.url &&
      old.type === item.type &&
      old.historyId === item.historyId &&
      old.taskId === item.taskId &&
      old.remoteTaskId === item.remoteTaskId
    )
  })
}

function normalizeAssetIdValue(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const withoutProtocol = raw.startsWith('asset://') ? raw.replace(/^asset:\/\//, '') : raw
  return withoutProtocol.startsWith('asset-') ? withoutProtocol : `asset-${withoutProtocol}`
}

function normalizeAssetKind(value) {
  const raw = String(value || '').toLowerCase()
  if (raw.includes('video')) return 'video'
  if (raw.includes('audio')) return 'audio'
  if (raw.includes('image')) return 'image'
  return raw
}

function normalizeAssetIdItem(item) {
  if (item === null || item === undefined) return null
  if (typeof item === 'string' || typeof item === 'number') {
    const id = normalizeAssetIdValue(item)
    return id ? { id, label: id } : null
  }

  const id = normalizeAssetIdValue(item.id ?? item.assetId ?? item.cloudAssetId)
  if (!id) return null
  return {
    ...item,
    id,
    label: item.label || item.name || item.assetName || id,
    assetType: normalizeAssetKind(item.assetType || item.type || item.asset_type)
  }
}

function normalizeAssetIdItems(value) {
  return toMediaItems(value).map(normalizeAssetIdItem).filter(Boolean)
}

function splitAssetIdInput(value) {
  return String(value || '')
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function appendUniqueAssetIdItems(current, incoming) {
  const next = normalizeAssetIdItems(current)
  const seen = new Set(next.map((item) => item.id))

  for (const rawItem of incoming) {
    const item = normalizeAssetIdItem(rawItem)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    next.push(item)
  }

  return next
}

function createCloudAssetIdItem(payload, providerAssetId = null) {
  const assetId =
    providerAssetId ||
    payload.seedanceId ||
    payload.providerAssetId ||
    payload.externalAssetId ||
    payload.asset_id
  if (!assetId) return null
  return normalizeAssetIdItem({
    id: assetId,
    label: payload.name || `Asset ${payload.assetId}`,
    cloudAssetId: payload.assetId,
    teamId: payload.teamId,
    assetType: payload.assetType,
    mimeType: payload.mimeType,
    source: payload.source
  })
}

function normalizeMediaRow(row) {
  const next = { ...row }
  for (const field of MEDIA_FIELDS) {
    next[field] = toMediaItems(next[field])
  }
  return next
}

function getMediaGenerationRef(item, { image = false } = {}) {
  if (!item) return ''
  if (item.assetId) return item.assetId
  const path = String(item.path || item.url || '').trim()
  if (!path) return ''
  if (path.startsWith('asset://')) return normalizeAssetIdValue(path)
  if (path.startsWith('asset-')) return path
  return image ? getXingheMediaSrc(path) : path
}

function getUploadPathKind(path = '') {
  const value = String(path || '')
  if (value.startsWith('xinghe://local')) return 'xinghe-local'
  if (value.startsWith('file://')) return 'file-url'
  if (/^https?:\/\//i.test(value)) return 'remote-url'
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('\\\\')) return 'local-path'
  return value ? 'unknown' : 'empty'
}

function buildUploadFailureDebugCode({ source, items, ossStatus }) {
  const failedItems = toMediaItems(items).filter((item) => item?.status === 'failed')
  return JSON.stringify(
    {
      kind: 'xinghe_asset_upload_failure_batch',
      copiedAt: new Date().toISOString(),
      source,
      failedCount: failedItems.length,
      items: failedItems.map((item) => ({
        field: item.field || null,
        index: item.index ?? null,
        kindLabel: item.kindLabel || null,
        assetType: item.assetType || null,
        name: item.name || null,
        path: item.path || null,
        pathKind: getUploadPathKind(item.path),
        status: item.status || null,
        error: item.error || null,
        assetId: item.assetId || null
      })),
      oss: ossStatus
        ? {
            success: ossStatus.success,
            configured: ossStatus.configured,
            storedConfigured: ossStatus.storedConfigured,
            envConfigured: ossStatus.envConfigured,
            safeStorageAvailable: ossStatus.safeStorageAvailable,
            source: ossStatus.source,
            accessKeyIdMasked: ossStatus.accessKeyIdMasked,
            region: ossStatus.region,
            bucket: ossStatus.bucket,
            endpoint: ossStatus.endpoint,
            publicUrl: ossStatus.publicUrl,
            error: ossStatus.error || null
          }
        : null
    },
    null,
    2
  )
}

// ═══════════════════════════════════════════
// 媒体缩略图组件 — 支持拖入/资产库拖入/上传/双击预览
// ═══════════════════════════════════════════
function MediaCell({ items, onAdd, onRemove, onReorder, accept, icon: Icon, label, color }) {
  const mediaItems = toMediaItems(items)
  const [previewItem, setPreviewItem] = useState(null)
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  // ref 绕过闭包：onDragEnd 始终读到最新值
  const dragRef = useRef(null)
  const overRef = useRef(null)

  const getCategory = () => (accept.includes('video') ? 'gen_vidref' : 'gen_ref')
  const getType = () => {
    if (accept.includes('image')) return 'image'
    if (accept.includes('audio')) return 'audio'
    if (accept.includes('video')) return 'video'
    return 'image'
  }

  const cacheFile = async (file, idx = 0) => {
    const name = file.name || 'unknown'
    try {
      if (file.path) {
        const res = await window.api.invoke('cache:copy-file', withProjectCacheContext({
          id: `pb_${getType()}_${Date.now()}_${idx}`,
          sourcePath: file.path,
          category: getCategory(),
          type: getType()
        }))
        if (res?.success && res.path) return { path: res.path, name }
      }
      if (!canReadFileAsDataUrl(file, `${getType()} production file`)) return null
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (ev) => resolve(ev.target.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const ext = name.split('.').pop()?.toLowerCase() || ''
      const res = await window.api.localCacheAPI.saveCache(withProjectCacheContext({
        id: `pb_${getType()}_${Date.now()}_${idx}`,
        content: base64,
        category: getCategory(),
        ext: `.${ext}`,
        type: getType()
      }))
      if (res?.success && res.path) return { path: res.path, name }
    } catch (err) {
      console.error(`[PB] 缓存文件失败: ${name}`, err)
    }
    return null
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()

    // 内部排序由 onDragEnd 处理，这里只处理外部拖入
    if (dragRef.current !== null) {
      dragRef.current = null
      overRef.current = null
      setDragIdx(null)
      setOverIdx(null)
      return
    }

    const seriesAsset = readSeriesAssetDrag(e.dataTransfer)
    if (seriesAsset) {
      if (seriesAsset.imageUrl && !mediaItems.some((it) => it.path === seriesAsset.imageUrl)) {
        onAdd({ path: seriesAsset.imageUrl, name: seriesAsset.name })
      }
      return
    }

    // 云素材拖入处理
    const cloudPayload = readCloudAssetDrag(e.dataTransfer)
    if (cloudPayload) {
      resolveCloudAssetForDrop(cloudPayload)
        .then(({ downloadUrl }) => {
          const cloudPath = downloadUrl || `cloud://team/${cloudPayload.teamId}/asset/${cloudPayload.assetId}`
          if (!mediaItems.some((it) => it.path === cloudPath)) {
            onAdd({ path: cloudPath, name: cloudPayload.name })
          }
        })
        .catch((err) => console.error('[PB] 云素材拖入失败:', err))
      return
    }

    const assetPath = e.dataTransfer.getData('asset-path')
    const assetPaths = e.dataTransfer.getData('asset-paths')
    if (assetPaths) {
      try {
        JSON.parse(assetPaths).forEach((p) => {
          if (!mediaItems.some((it) => it.path === p)) onAdd({ path: p, name: p.split(/[\\/]/).pop() })
        })
      } catch {
        /* ignore */
      }
      return
    }
    if (assetPath) {
      if (!mediaItems.some((it) => it.path === assetPath))
        onAdd({ path: assetPath, name: assetPath.split(/[\\/]/).pop() })
      return
    }
    const files = Array.from(e.dataTransfer.files)
    for (let i = 0; i < files.length; i++) {
      const result = await cacheFile(files[i], i)
      if (result && !mediaItems.some((it) => it.path === result.path)) onAdd(result)
    }
  }

  const handleClickAdd = async () => {
    const filterMap = {
      'image/*': { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'] },
      'audio/*': { name: '音频', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
      'video/*': { name: '视频', extensions: ['mp4', 'mov', 'avi', 'webm', 'mkv'] }
    }
    const filter = filterMap[accept] || filterMap['image/*']
    const result = await window.api.localCacheAPI.openFiles({ filters: [filter], multiple: true })
    if (result.success && result.paths?.length) {
      result.paths.forEach((p) => {
        if (!mediaItems.some((it) => it.path === p)) onAdd({ path: p, name: p.split(/[\\/]/).pop() })
      })
    }
  }

  const getSrc = (item) => getXingheMediaSrc(item.path)

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDrop={handleDrop}
      className="flex flex-wrap items-start gap-1.5 min-h-[72px] p-2 rounded-lg transition-colors"
      style={{ backgroundColor: 'var(--bg-input)', border: '1px dashed var(--border-subtle)' }}
    >
      {mediaItems.map((item, i) => (
        <div
          key={i}
          className={`relative group shrink-0 cursor-grab active:cursor-grabbing transition-all ${dragIdx === i ? 'opacity-30 scale-90' : ''} ${overIdx === i && dragIdx !== i ? 'ring-2 ring-[var(--border-strong)] rounded-md' : ''}`}
          draggable
          onDragStart={(e) => {
            e.stopPropagation()
            e.dataTransfer.effectAllowed = 'move'
            dragRef.current = i
            setDragIdx(i)
          }}
          onDragEnd={() => {
            const from = dragRef.current,
              to = overRef.current
            if (from !== null && to !== null && from !== to && onReorder) onReorder(from, to)
            dragRef.current = null
            overRef.current = null
            setDragIdx(null)
            setOverIdx(null)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (dragRef.current !== null && dragRef.current !== i) {
              overRef.current = i
              setOverIdx(i)
            }
          }}
          onDragLeave={() => {
            if (overRef.current === i) {
              overRef.current = null
              setOverIdx(null)
            }
          }}
          onDoubleClick={() => setPreviewItem(item)}
        >
          {accept.includes('image') ? (
            <img
              src={getSrc(item)}
              alt=""
              className="w-14 h-14 rounded-md object-cover"
              style={{
                border: item.assetId
                  ? '1px solid rgba(16, 185, 129, 0.9)'
                  : '1px solid var(--border-subtle)'
              }}
            />
          ) : (
            <div
              className="w-14 h-14 rounded-md flex flex-col items-center justify-center gap-0.5 text-[8px]"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: item.assetId
                  ? '1px solid rgba(16, 185, 129, 0.9)'
                  : '1px solid var(--border-subtle)',
                color: 'var(--text-muted)'
              }}
            >
              <Icon size={16} />
              <span className="truncate max-w-[52px]">{item.name?.split('.')[0]?.slice(0, 6)}</span>
            </div>
          )}
          {item.assetId && (
            <span className="absolute bottom-0.5 left-0.5 rounded bg-emerald-500/90 px-1 text-[7px] font-semibold text-white shadow">
              ASSET
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove(i)
            }}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] opacity-0 group-hover:opacity-100 transition-opacity shadow"
            style={{ backgroundColor: '#ef4444', color: '#fff' }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={handleClickAdd}
        className="w-14 h-14 rounded-md flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer shrink-0 hover:opacity-80"
        style={{
          border: '1.5px dashed var(--border-default)',
          color: color || 'var(--text-muted)'
        }}
        title={`添加${label}`}
      >
        <Upload size={12} />
        <span className="text-[8px]">{label}</span>
      </button>
      {previewItem &&
        createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
            onClick={() => setPreviewItem(null)}
          >
            <div
              className="max-w-2xl max-h-[82vh] rounded-xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {accept.includes('image') && (
                <img src={getSrc(previewItem)} className="max-w-full max-h-[74vh] object-contain" />
              )}
              {accept.includes('audio') && (
                <audio src={getSrc(previewItem)} controls autoPlay className="w-96" />
              )}
              {accept.includes('video') && (
                <video
                  src={getSrc(previewItem)}
                  controls
                  autoPlay
                  className="max-w-full max-h-[74vh]"
                />
              )}
              <div
                className="flex flex-col items-center gap-1 px-3 py-2 text-xs"
                style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-panel)' }}
              >
                {previewItem.assetId ? (
                  <>
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-300">
                      ASSET READY
                    </span>
                    <span className="max-w-full truncate font-mono text-[10px]">
                      {previewItem.assetId}
                    </span>
                  </>
                ) : (
                  <span>{previewItem.name}</span>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

// ═══════════════════════════════════════════
// Asset ID 标签输入组件 — 支持多个 ID
// ═══════════════════════════════════════════
function AssetIdCell({ ids, onChange }) {
  const [inputVal, setInputVal] = useState('')
  const normalizedIds = normalizeAssetIdItems(ids)

  const commitItems = (items) => {
    const next = appendUniqueAssetIdItems(ids || [], items)
    onChange(next)
  }

  const addId = () => {
    const items = splitAssetIdInput(inputVal).map((id) => ({ id, label: id }))
    if (items.length > 0) {
      commitItems(items)
      setInputVal('')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()

    const seedanceId = e.dataTransfer.getData('seedance-id')
    if (seedanceId) {
      commitItems([
        {
          id: seedanceId,
          label: seedanceId,
          assetType: e.dataTransfer.getData('asset-type') || ''
        }
      ])
      return
    }

    const cloudPayload = readCloudAssetDrag(e.dataTransfer)
    if (cloudPayload) {
      const item = createCloudAssetIdItem(cloudPayload)
      if (item) commitItems([item])
      return
    }

    const plainText = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('asset-id')
    const textIds = splitAssetIdInput(plainText).map((id) => ({ id, label: id }))
    if (textIds.length > 0) commitItems(textIds)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDrop={handleDrop}
      className="flex flex-wrap items-start gap-1 min-h-[72px] p-2 rounded-lg"
      style={{ backgroundColor: 'var(--bg-input)', border: '1px dashed var(--border-subtle)' }}
    >
      {normalizedIds.map((item, i) => (
        <span
          key={i}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] group shrink-0 cursor-default"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-strong)'
          }}
          title={`Asset ID: ${item.id}${item.assetType ? ` · ${item.assetType}` : ''}`}
        >
          <Tag size={8} />
          {item.assetType && (
            <span
              className="px-1 rounded uppercase text-[8px]"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              {item.assetType}
            </span>
          )}
          <span className="max-w-[100px] truncate">{item.label || item.id}</span>
          <button
            onClick={() => onChange(normalizeAssetIdItems(ids).filter((_, j) => j !== i))}
            className="ml-0.5 opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addId()
          }
        }}
        onBlur={addId}
        placeholder={normalizedIds.length === 0 ? '拖云素材 / Asset ID' : '继续添加...'}
        className="flex-1 min-w-[80px] text-[10px] px-1 py-0.5 bg-transparent outline-none"
        style={{ color: 'var(--text-primary)' }}
      />
    </div>
  )
}

// ═══════════════════════════════════════════
// 带 @ 引用弹窗的提示词输入框
// ═══════════════════════════════════════════
function PromptCellWithAt({ value, onChange, row, commonValues, isVideo, placeholder }) {
  const [showAtPopup, setShowAtPopup] = useState(false)
  const [atPopupPos, setAtPopupPos] = useState({ x: 0, y: 0 })
  const [promptPilotBusy, setPromptPilotBusy] = useState('')
  const [promptPilotError, setPromptPilotError] = useState('')
  const [promptPilotReport, setPromptPilotReport] = useState('')
  const [promptPilotResultMode, setPromptPilotResultMode] = useState('')
  const taRef = useRef(null)
  const promptPilotPanelRef = useRef(null)
  const atPosRef = useRef(0)

  // 合并：行自身 + 通用行的所有参考资源
  const cv = commonValues || {}
  const allRefCharacters = [...toMediaItems(row.refCharacters), ...toMediaItems(cv.refCharacters)]
  const allRefProps = [...toMediaItems(row.refProps), ...toMediaItems(cv.refProps)]
  const allRefScenes = [...toMediaItems(row.refScenes), ...toMediaItems(cv.refScenes)]
  const allRefAudios = [...toMediaItems(row.refAudios), ...toMediaItems(cv.refAudios)]
  const allRefVideos = [...toMediaItems(row.refVideos), ...toMediaItems(cv.refVideos)]
  const hasRefs =
    allRefCharacters.length > 0 ||
    allRefProps.length > 0 ||
    allRefScenes.length > 0 ||
    allRefAudios.length > 0 ||
    allRefVideos.length > 0

  const doInsertRef = (type, idx) => {
    const ta = taRef.current
    if (!ta) return
    const cursorAfterAt = atPosRef.current
    const text = ta.value
    const atIdx = cursorAfterAt - 1
    if (atIdx < 0) return
    let label
    if (type === 'character') label = `@角色${idx + 1} `
    else if (type === 'prop') label = `@道具${idx + 1} `
    else if (type === 'scene') label = `@场景${idx + 1} `
    else if (type === 'audio') label = `@音频${idx + 1} `
    else if (type === 'video') label = `@视频${idx + 1} `
    else if (type === 'asset') label = `@素材${idx + 1} `
    else label = `@${type}${idx + 1} `
    const result = text.slice(0, atIdx) + label + text.slice(cursorAfterAt)
    ta.value = result
    onChange(result)
    setShowAtPopup(false)
    ta.focus()
    const newCursor = atIdx + label.length
    ta.setSelectionRange(newCursor, newCursor)
  }

  const isManuallyResizedRef = useRef(false)
  const heightOnMouseDown = useRef(0)

  // 自动调整高度
  const autoResize = useCallback((el) => {
    if (!el || isManuallyResizedRef.current) return
    el.style.height = '0'
    el.style.height = Math.max(54, el.scrollHeight) + 'px'
  }, [])

  // 挂载时 + value 变化时调整
  const setTaRef = useCallback(
    (el) => {
      taRef.current = el
      autoResize(el)
    },
    [autoResize]
  )

  useEffect(() => {
    autoResize(taRef.current)
  }, [value, autoResize])

  useEffect(() => {
    if (!promptPilotBusy && !promptPilotReport) return
    const panel = promptPilotPanelRef.current
    if (!panel) return
    const handleWheel = (e) => {
      e.stopPropagation()
    }
    panel.addEventListener('wheel', handleWheel, { passive: false })
    return () => panel.removeEventListener('wheel', handleWheel)
  }, [promptPilotBusy, promptPilotReport])

  const handleChange = (e) => {
    const val = e.target.value
    onChange(val)
    setPromptPilotError('')
    setPromptPilotReport('')
    setPromptPilotResultMode('')
    autoResize(e.target)
    const pos = e.target.selectionStart
    if (pos > 0 && val[pos - 1] === '@' && hasRefs) {
      atPosRef.current = pos
      const rect = e.target.getBoundingClientRect()
      setAtPopupPos({ x: rect.left + 12, y: rect.bottom + 4 })
      setShowAtPopup(true)
    } else {
      setShowAtPopup(false)
    }
  }

  const runPromptPilot = useCallback(
    async (mode) => {
      const sourceText = String(value || '').trim()
      if (!sourceText) {
        setPromptPilotError('请先输入文本')
        return
      }

      setPromptPilotBusy(mode)
      setPromptPilotError('')
      setPromptPilotReport('')
      setPromptPilotResultMode('')
      try {
        const result = await window.api?.promptPilot?.run?.({
          mode,
          text: sourceText,
          context: {
            target: isVideo ? 'video' : 'image',
            source: 'production-board',
            language: 'zh-CN'
          }
        })

        if (!result?.success) {
          setPromptPilotError(result?.error || 'PromptPilot 调用失败')
          return
        }

        if (mode === 'check' || mode === 'optimize') {
          setPromptPilotReport(result.text)
          setPromptPilotResultMode(mode)
          return
        }
      } catch (err) {
        const message = err?.message || String(err)
        setPromptPilotError(
          message.includes('No handler registered') && message.includes('promptpilot:run')
            ? 'PromptPilot 主进程通道尚未加载，请重启应用或重新启动 dev 服务后再试。'
            : message
        )
      } finally {
        setPromptPilotBusy('')
      }
    },
    [autoResize, isVideo, onChange, value]
  )

  const applyPromptPilotResult = useCallback(() => {
    if (!['optimize', 'check'].includes(promptPilotResultMode) || !String(promptPilotReport || '').trim()) {
      return
    }
    onChange(promptPilotReport)
    setPromptPilotReport('')
    setPromptPilotResultMode('')
    requestAnimationFrame(() => autoResize(taRef.current))
  }, [autoResize, onChange, promptPilotReport, promptPilotResultMode])

  const renderPopupSection = (title, items, type, iconOrImg, color) => {
    const popupItems = toMediaItems(items)
    return popupItems.length === 0 ? null : (
      <>
        <div
          className="text-[9px] px-3 pt-2 pb-0.5 uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          {title}
        </div>
        {popupItems.map((item, idx) => (
          <div
            key={`${type}-${idx}`}
            className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              doInsertRef(type, idx)
            }}
          >
            <div
              className="w-7 h-7 rounded-md overflow-hidden shrink-0 flex items-center justify-center"
              style={{ border: `1px solid ${color}33`, backgroundColor: `${color}15` }}
            >
              {typeof iconOrImg === 'function' ? iconOrImg(item) : iconOrImg}
            </div>
            <span className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
              {type === 'character'
                ? `角色${idx + 1}`
                : type === 'prop'
                  ? `道具${idx + 1}`
                  : type === 'scene'
                    ? `场景${idx + 1}`
                    : type === 'audio'
                      ? `音频${idx + 1}`
                      : type === 'video'
                        ? `视频${idx + 1}`
                        : `素材${idx + 1}`}
            </span>
          </div>
        ))}
      </>
    )
  }

  const imgPreview = (item) => (
    <img
      src={getXingheMediaSrc(item.path)}
      className="w-full h-full object-cover"
      draggable={false}
    />
  )

  const atPopup =
    showAtPopup &&
    hasRefs &&
    createPortal(
      <div
        style={{
          position: 'fixed',
          left: atPopupPos.x,
          top: atPopupPos.y,
          zIndex: 99999,
          minWidth: 220
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-default)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
          }}
        >
          <div className="text-[10px] px-3 pt-2 pb-1" style={{ color: 'var(--text-muted)' }}>
            可引用的内容 (点击插入)
          </div>
          <div className="max-h-[320px] overflow-y-auto pb-1">
            {renderPopupSection(
              'Asset 素材',
              [],
              'asset',
              <Tag size={12} style={{ color: '#60a5fa' }} />,
              '#60a5fa'
            )}
            {renderPopupSection('👤 角色', allRefCharacters, 'character', imgPreview, '#f472b6')}
            {renderPopupSection('🔧 道具', allRefProps, 'prop', imgPreview, '#fb923c')}
            {renderPopupSection('🏔️ 场景', allRefScenes, 'scene', imgPreview, '#34d399')}
            {renderPopupSection(
              '🎵 音频',
              allRefAudios,
              'audio',
              <Music size={12} style={{ color: '#34d399' }} />,
              '#34d399'
            )}
            {renderPopupSection(
              '🎬 视频',
              allRefVideos,
              'video',
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                🎬
              </span>,
              'var(--text-secondary)'
            )}
          </div>
        </div>
      </div>,
      document.body
    )

  const promptPilotPanelMode = promptPilotBusy || promptPilotResultMode

  return (
    <>
      <div className="relative">
        <div className="relative">
        <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              runPromptPilot('optimize')
            }}
            disabled={!!promptPilotBusy || !String(value || '').trim()}
            className="p-1 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-hover)' }}
            title="优化你的 Prompt"
          >
            <Sparkles size={11} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              runPromptPilot('check')
            }}
            disabled={!!promptPilotBusy || !String(value || '').trim()}
            className="p-1 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-hover)' }}
            title="检查 Prompt"
          >
            <FileSearch size={11} />
          </button>
        </div>
      <textarea
        ref={setTaRef}
        value={value}
        onChange={handleChange}
        onMouseDown={(e) => {
          heightOnMouseDown.current = e.currentTarget.clientHeight
        }}
        onMouseUp={(e) => {
          if (heightOnMouseDown.current && e.currentTarget.clientHeight !== heightOnMouseDown.current) {
            isManuallyResizedRef.current = true
          }
        }}
        placeholder={placeholder || '提示词 (输入@引用参考)'}
        className="w-full text-[11px] px-2 py-1.5 rounded-md outline-none transition-colors resize-y"
        style={{
          backgroundColor: 'var(--bg-input)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)',
          minHeight: 54,
          paddingRight: 52
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') setShowAtPopup(false)
        }}
        onBlur={() => setTimeout(() => setShowAtPopup(false), 200)}
      />
        {promptPilotError && (
          <div
            className="mt-1 rounded-lg border px-2 py-1.5 text-[10px] leading-relaxed"
            style={{
              borderColor: promptPilotError ? 'rgba(248,113,113,0.35)' : 'var(--border-default)',
              color: promptPilotError ? '#fca5a5' : 'var(--text-secondary)',
              backgroundColor: 'var(--bg-secondary)'
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {promptPilotError}
          </div>
        )}
        </div>
        {((promptPilotPanelMode === 'check' || promptPilotPanelMode === 'optimize') ||
          promptPilotReport) && (
          <aside
            ref={promptPilotPanelRef}
            className="nodrag nowheel absolute left-[calc(100%+8px)] top-0 z-50 max-h-[220px] w-[320px] rounded-lg border text-[10px] leading-relaxed shadow-xl"
            style={{
              borderColor: 'var(--border-default)',
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-secondary)'
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between gap-2 border-b px-2 py-1.5 font-medium"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
            >
              <span>{promptPilotPanelMode === 'optimize' ? 'Prompt 优化' : 'Prompt 检查'}</span>
              <div className="flex items-center gap-1">
                {['optimize', 'check'].includes(promptPilotPanelMode) &&
                  promptPilotReport &&
                  !promptPilotBusy && (
                  <button
                    type="button"
                    onClick={applyPromptPilotResult}
                    className="rounded-md border px-1.5 py-0.5 text-[10px] transition-colors hover:bg-white/10"
                    style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                    title="快捷替换为当前结果"
                  >
                    替换
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPromptPilotReport('')
                    setPromptPilotResultMode('')
                  }}
                  className="rounded p-0.5 transition-colors hover:bg-white/10"
                  style={{ color: 'var(--text-muted)' }}
                  title="关闭结果"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
            <div className="max-h-[176px] overflow-y-auto whitespace-pre-wrap px-2 py-1.5 custom-scrollbar">
              {promptPilotBusy
                ? `PromptPilot ${promptPilotBusy === 'optimize' ? '优化' : '检查'}中...`
                : ['optimize', 'check'].includes(promptPilotPanelMode)
                  ? renderPromptDiff(value, promptPilotReport)
                  : promptPilotReport}
            </div>
          </aside>
        )}
      </div>
      {atPopup}
    </>
  )
}

// ═══════════════════════════════════════════
// 模型选择器下拉
// ═══════════════════════════════════════════
function ModelSelector({ value, onChange, filterType }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const apiConfigs = useAppStore((s) => s.apiConfigs || [])

  const filteredModels = useMemo(
    () => apiConfigs.filter((m) => m.type === filterType),
    [apiConfigs, filterType]
  )

  const selectedModel = apiConfigs.find((m) => m.id === value)
  const displayName = selectedModel?.provider || '选择模型'

  return (
    <div className="relative" ref={btnRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-default)'
        }}
      >
        <Settings2 size={12} />
        <span className="truncate max-w-[120px]">{displayName}</span>
        <ChevronDown
          size={10}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-muted)' }}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[98]" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full left-0 mt-1 w-56 rounded-xl shadow-2xl p-1 z-[99] overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-default)'
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-[9px] px-3 py-1.5" style={{ color: 'var(--text-muted)' }}>
              {filterType === 'Video' ? '视频模型' : '图片模型'} ({filteredModels.length})
            </div>
            {filteredModels.length === 0 && (
              <div className="text-[10px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
                未配置{filterType === 'Video' ? '视频' : '图片'}模型
              </div>
            )}
            {filteredModels.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onChange(m.id)
                  setOpen(false)
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors"
                style={{
                  backgroundColor: m.id === value ? 'var(--bg-elevated)' : 'transparent',
                  color: 'var(--text-primary)',
                  border: `1px solid ${m.id === value ? 'var(--border-strong)' : 'transparent'}`
                }}
                onMouseEnter={(e) => {
                  if (m.id !== value) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  if (m.id !== value) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <span className="text-[11px] font-medium truncate">{m.modelName || m.id}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════
export const ProductionBoard = memo(function ProductionBoard({ embedded = false }: any = {}) {
  const {
    productionBoardOpen,
    setProductionBoardOpen,
    productionBoardMode,
    setProductionBoardMode,
    productionBoardInitCount,
    setProductionBoardInitCount,
    productionBoardInitData,
    setProductionBoardInitData,
    // 视频模式行存储
    productionBoardVideoRows: storeVideoRows,
    setProductionBoardVideoRows: setStoreVideoRows,
    productionBoardVideoCommonValues: storeVideoCommon,
    setProductionBoardVideoCommonValues: setStoreVideoCommon,
    // 图片模式行存储
    productionBoardImageRows: storeImageRows,
    setProductionBoardImageRows: setStoreImageRows,
    productionBoardImageCommonValues: storeImageCommon,
    setProductionBoardImageCommonValues: setStoreImageCommon,
    // 共享参考数据（视频/图片板互通）
    productionBoardSharedRefs: storeSharedRefs,
    setProductionBoardSharedRefs: setStoreSharedRefs,
    setActiveWorkspacePage
  } = useAppStore(
    useShallow((s) => ({
      productionBoardOpen: s.productionBoardOpen,
      setProductionBoardOpen: s.setProductionBoardOpen,
      productionBoardMode: s.productionBoardMode,
      setProductionBoardMode: s.setProductionBoardMode,
      productionBoardInitCount: s.productionBoardInitCount,
      setProductionBoardInitCount: s.setProductionBoardInitCount,
      productionBoardInitData: s.productionBoardInitData,
      setProductionBoardInitData: s.setProductionBoardInitData,
      productionBoardVideoRows: s.productionBoardVideoRows,
      setProductionBoardVideoRows: s.setProductionBoardVideoRows,
      productionBoardVideoCommonValues: s.productionBoardVideoCommonValues,
      setProductionBoardVideoCommonValues: s.setProductionBoardVideoCommonValues,
      productionBoardImageRows: s.productionBoardImageRows,
      setProductionBoardImageRows: s.setProductionBoardImageRows,
      productionBoardImageCommonValues: s.productionBoardImageCommonValues,
      setProductionBoardImageCommonValues: s.setProductionBoardImageCommonValues,
      productionBoardSharedRefs: s.productionBoardSharedRefs,
      setProductionBoardSharedRefs: s.setProductionBoardSharedRefs,
      setActiveWorkspacePage: s.setActiveWorkspacePage
    }))
  )

  const isVideo = productionBoardMode === 'video'

  // 根据当前模式获取对应的 store 行数据
  const storeRows = isVideo ? storeVideoRows : storeImageRows
  const storeCommonValues = isVideo ? storeVideoCommon : storeImageCommon

  // 根据 initData 创建预填充行
  const createInitRows = useCallback(
    (count, initData) => {
      return Array.from({ length: count }, (_, i) => ({
        ...EMPTY_ROW(),
        name: initData?.[i]?.name || (isVideo ? `镜头${i + 1}` : `图片${i + 1}`),
        prompt: initData?.[i]?.prompt || ''
      }))
    },
    [isVideo]
  )

  // 初始化行数：优先从 store 恢复（项目加载），其次 initCount，最后默认 3 行
  const [rows, setRows] = useState(() => {
    if (Array.isArray(storeRows) && storeRows.length > 0) return storeRows
    const count = productionBoardInitCount > 0 ? productionBoardInitCount : 3
    return createInitRows(count, productionBoardInitData)
  })
  const [commonValues, setCommonValues] = useState(() => {
    const shared = storeSharedRefs || {}
    const modeSpecific = storeCommonValues || {}
    return {
      prompt: modeSpecific.prompt || '',
      refCharacters: shared.refCharacters || [],
      refProps: shared.refProps || [],
      refScenes: shared.refScenes || [],
      assetIds: shared.assetIds || [], // [{ id, label }]
      refAudios: modeSpecific.refAudios || [],
      refVideos: modeSpecific.refVideos || [],
      ratio: modeSpecific.ratio || '16:9',
      duration: modeSpecific.duration || '5s',
      resolution: modeSpecific.resolution || '',
      count: modeSpecific.count || 1,
      model: modeSpecific.model || ''
    }
  })
  const [productionLightboxItem, setProductionLightboxItem] = useState(null)
  const [showCommonRow, setShowCommonRow] = useState(true)

  // 一键上传 Asset 状态
  // uploadStatus: null | { uploading: boolean, results: [{ name, path, status: 'pending'|'uploading'|'done'|'failed', assetId?, error? }] }
  const [uploadStatus, setUploadStatus] = useState(null)

  // 可拖拽列宽 state
  const [colWidths, setColWidths] = useState({
    num: 36,
    name: 72,
    prompt: 180,
    characters: 140,
    props: 140,
    scenes: 140,
    audios: 140,
    videos: 140,
    params: 110,
    preview: 150,
    status: 56,
    actions: 52
  })
  const colResizing = useRef(null)
  const startColResize = useCallback(
    (colKey, e) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX,
        startW = colWidths[colKey]
      const onMove = (ev) => {
        setColWidths((prev) => ({ ...prev, [colKey]: Math.max(36, startW + ev.clientX - startX) }))
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        colResizing.current = null
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      colResizing.current = colKey
    },
    [colWidths]
  )

  // 同步回 store（供项目保存使用）— 按模式分别存储
  useEffect(() => {
    if (isVideo) {
      setStoreVideoRows(rows)
    } else {
      setStoreImageRows(rows)
    }
  }, [rows, isVideo])
  useEffect(() => {
    if (isVideo) {
      setStoreVideoCommon(commonValues)
    } else {
      setStoreImageCommon(commonValues)
    }
    // 共享字段同步到 sharedRefs（角色/道具/场景/assetIds 两板互通）
    setStoreSharedRefs({
      refCharacters: toMediaItems(commonValues.refCharacters),
      refProps: toMediaItems(commonValues.refProps),
      refScenes: toMediaItems(commonValues.refScenes),
      assetIds: toMediaItems(commonValues.assetIds)
    })
  }, [commonValues, isVideo])

  // 当 productionBoardInitCount 变化时（如新建项目），重置行数
  useEffect(() => {
    if (productionBoardInitCount > 0) {
      setRows(createInitRows(productionBoardInitCount, productionBoardInitData))
      setProductionBoardInitCount(0)
      setProductionBoardInitData(null)
    }
  }, [productionBoardInitCount, productionBoardInitData])

  // 切换模式时：加载另一模式的行数据，合并共享参考
  const prevModeRef = useRef(productionBoardMode)
  useEffect(() => {
    if (prevModeRef.current !== productionBoardMode) {
      const newStoreRows = isVideo ? storeVideoRows : storeImageRows
      const newStoreCommon = isVideo ? storeVideoCommon : storeImageCommon
      const shared = storeSharedRefs || {}
      if (Array.isArray(newStoreRows) && newStoreRows.length > 0) {
        setRows(newStoreRows)
      } else {
        setRows(createInitRows(3, null))
      }
      setCommonValues({
        prompt: newStoreCommon?.prompt || '',
        refCharacters: toMediaItems(shared.refCharacters),
        refProps: toMediaItems(shared.refProps),
        refScenes: toMediaItems(shared.refScenes),
        assetIds: toMediaItems(shared.assetIds),
        refAudios: toMediaItems(newStoreCommon?.refAudios),
        refVideos: toMediaItems(newStoreCommon?.refVideos),
        ratio: newStoreCommon?.ratio || '16:9',
        duration: newStoreCommon?.duration || '5s',
        resolution: newStoreCommon?.resolution || '',
        count: newStoreCommon?.count || 1,
        model: newStoreCommon?.model || ''
      })
      prevModeRef.current = productionBoardMode
    }
  }, [productionBoardMode])

  const addRow = useCallback(() => setRows((prev) => [...prev, EMPTY_ROW()]), [])
  const removeRow = useCallback((id) => setRows((prev) => prev.filter((r) => r.id !== id)), [])
  const updateRow = useCallback((id, field, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? normalizeMediaRow({ ...r, [field]: value }) : normalizeMediaRow(r))))
  }, [])
  const duplicateRow = useCallback((id) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id)
      if (idx === -1) return prev
      const clone = { ...prev[idx], id: EMPTY_ROW().id, status: 'idle', previews: [] }
      const next = [...prev]
      next.splice(idx + 1, 0, clone)
      return next
    })
  }, [])
  const handleAddBatch = useCallback((count) => {
    setRows((prev) => [...prev, ...Array.from({ length: count }, () => EMPTY_ROW())])
  }, [])

  // 桥接入口：监听外部导入事件（如从分镜本导入）
  useEffect(() => {
    const handleImport = (e: CustomEvent) => {
      if (Array.isArray(e.detail)) {
        setRows((prev) => [...prev.map(normalizeMediaRow), ...e.detail.map(normalizeMediaRow)])
      }
    }
    window.addEventListener('production-board-import', handleImport as EventListener)
    return () => window.removeEventListener('production-board-import', handleImport as EventListener)
  }, [])

  // 导入文档：视频模式导入镜头，图片模式导入角色+道具+场景
  const handleImportDocument = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.md,.text,.docx'
    input.onchange = async (e) => {
      const file = (e.currentTarget as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        let text: string
        if (isDocxFile(file.name)) {
          const buf = await file.arrayBuffer()
          text = await extractTextFromDocx(buf)
        } else {
          text = await file.text()
        }

        // 使用结构化解析
        const { parseDocument } = await import('../../utils/parseDocument.ts')
        const parsed = parseDocument(text)

        const newRows = []

        if (isVideo) {
          // ═══ 视频模式：只导入镜头 ═══
          if (parsed.shots.length > 0) {
            parsed.shots.forEach((shot, i) => {
              newRows.push({
                ...EMPTY_ROW(),
                name: shot.title || `镜头${i + 1}`,
                prompt: shot.content
              })
            })
          } else {
            // 降级：按行拆分
            const lines = text
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => l.length > 0)
            lines.forEach((line, i) => {
              newRows.push({ ...EMPTY_ROW(), name: `镜头${i + 1}`, prompt: line })
            })
          }
        } else {
          // ═══ 图片模式：导入角色 + 道具 + 场景 ═══
          parsed.characters.forEach((item, i) => {
            newRows.push({
              ...EMPTY_ROW(),
              name: item.title || `角色${i + 1}`,
              prompt: item.content
            })
          })
          parsed.props.forEach((item, i) => {
            newRows.push({
              ...EMPTY_ROW(),
              name: item.title || `道具${i + 1}`,
              prompt: item.content
            })
          })
          parsed.scenes.forEach((item, i) => {
            newRows.push({
              ...EMPTY_ROW(),
              name: item.title || `场景${i + 1}`,
              prompt: item.content
            })
          })
          // 若都未识别到，降级按行拆
          if (newRows.length === 0) {
            const lines = text
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => l.length > 0)
            lines.forEach((line, i) => {
              newRows.push({ ...EMPTY_ROW(), name: `图片${i + 1}`, prompt: line })
            })
          }
        }

        if (newRows.length === 0) {
          alert('文档为空，未找到有效内容')
          return
        }

        setRows((prev) => [...prev, ...newRows])
        const modeLabel = isVideo ? '视频' : '图片'
        console.log(`[ProductionBoard] ${modeLabel}模式导入成功: ${newRows.length} 行`)
        alert(`✅ 导入成功：共 ${newRows.length} 个${isVideo ? '镜头' : '图片'}行`)
      } catch (err) {
        console.error('[ProductionBoard] 导入文档失败:', err)
        alert('导入失败: ' + err.message)
      }
    }
    input.click()
  }, [isVideo])

  // ═══ 一键上传通用行角色 → 获取 Asset ID ═══
  const handleBatchUploadAssets = useCallback(
    async (retryOnly = false, silent = false) => {
      const commonMediaFields = [
        { field: 'refCharacters', label: '??', assetType: 'Image' },
        { field: 'refProps', label: '??', assetType: 'Image' },
        { field: 'refScenes', label: '??', assetType: 'Image' },
        { field: 'refAudios', label: '??', assetType: 'Audio' },
        { field: 'refVideos', label: '??', assetType: 'Video' }
      ];

      let items;
      if (retryOnly && uploadStatus?.results) {
        items = uploadStatus.results.map((r) =>
          r.status === 'failed' ? { ...r, status: 'pending', error: null } : r
        );
      } else {
        items = commonMediaFields.flatMap(({ field, label, assetType }) =>
          toMediaItems(commonValues[field])
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => {
              const path = String(item?.path || '').trim();
              return path && !item.assetId && !path.startsWith('asset-') && !path.startsWith('asset://');
            })
            .map(({ item, index }) => ({
              field,
              index,
              kindLabel: label,
              assetType,
              name: item.name || `${label}${index + 1}`,
              path: item.path,
              status: 'pending',
              assetId: null,
              error: null
            }))
        );
      }

      if (items.length === 0) {
        if (!silent) alert('\u901a\u7528\u884c\u91cc\u6ca1\u6709\u9700\u8981\u4e0a\u4f20\u7684\u7d20\u6750');
        return { success: false, error: '\u6ca1\u6709\u9700\u8981\u4e0a\u4f20\u7684\u7d20\u6750' };
      }

      try {
        const ossStatus = await window.api?.ossAPI?.getConfig?.();
        if (!ossStatus?.success) {
          throw new Error(`OSS 配置检查失败：${ossStatus?.error || '无法读取配置'}`);
        }
        if (!ossStatus.configured) {
          throw new Error(
            'OSS 未配置：请在 设置 -> 服务 -> 阿里云 OSS 上传 中保存 AccessKey、Bucket、Endpoint 和 Public URL'
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const failedItems = items.map((item) => ({ ...item, status: 'failed', error: message }));
        setUploadStatus({ uploading: false, results: failedItems });
        if (!silent) alert(message);
        return { success: false, doneCount: 0, failCount: failedItems.length, items: failedItems, error: message };
      }

      setUploadStatus({ uploading: true, results: items });

      for (let i = 0; i < items.length; i++) {
        if (items[i].status !== 'pending') continue;

        items = items.map((r, j) => (j === i ? { ...r, status: 'uploading' } : r));
        setUploadStatus({ uploading: true, results: [...items] });

        try {
          let realPath = items[i].path;
          if (realPath?.startsWith('xinghe://local/?path=')) {
            realPath = decodeURIComponent(realPath.replace('xinghe://local/?path=', ''));
          } else if (realPath?.startsWith('xinghe://local/')) {
            realPath = decodeURIComponent(realPath.replace('xinghe://local/', ''));
          }

          const ossResult = await window.api.ossAPI.uploadFile(realPath);
          if (!ossResult?.success || !ossResult.url) {
            throw new Error(ossResult?.error || 'OSS \u4e0a\u4f20\u5931\u8d25');
          }

          const assetType = items[i].assetType || 'Image';
          const createResult = await (window.api.assetAPI.create as any)(
            ossResult.url,
            items[i].name,
            null,
            assetType
          );
          if (!createResult?.id) throw new Error('CreateAsset \u8fd4\u56de\u4e3a\u7a7a');

          await window.api.assetAPI.poll(createResult.id, 3000, 600000);

          items = items.map((r, j) =>
            j === i ? { ...r, status: 'done', assetId: createResult.id } : r
          );
          setUploadStatus({ uploading: true, results: [...items] });

          setCommonValues((prev) => {
            const nextItems = toMediaItems(prev[items[i].field]).map((item, index) =>
              index === items[i].index
                ? {
                    ...item,
                    assetId: createResult.id,
                    assetType,
                    assetName: items[i].name
                  }
                : item
            );
            return { ...prev, [items[i].field]: nextItems };
          });
        } catch (err) {
          items = items.map((r, j) =>
            j === i ? { ...r, status: 'failed', error: err.message } : r
          );
          setUploadStatus({ uploading: true, results: [...items] });
        }
      }

      setUploadStatus((prev) => ({ ...prev, uploading: false }));
      const doneCount = items.filter((r) => r.status === 'done').length;
      const failCount = items.filter((r) => r.status === 'failed').length;
      if (!silent) {
        if (failCount === 0) {
          alert(`\u4e0a\u4f20\u6210\u529f\uff1a\u5171 ${doneCount} \u4e2a\u901a\u7528\u884c\u7d20\u6750\u5df2\u8f6c\u4e3a Asset`);
        } else {
          alert(`${doneCount} \u4e2a\u6210\u529f\uff0c${failCount} \u4e2a\u5931\u8d25\u3002\u53ef\u70b9\u51fb\u201c\u91cd\u8bd5\u5931\u8d25\u201d`);
        }
      }
      return { success: failCount === 0, doneCount, failCount, items };
    },
    [
      commonValues.refCharacters,
      commonValues.refProps,
      commonValues.refScenes,
      commonValues.refAudios,
      commonValues.refVideos,
      uploadStatus
    ]
  );

  const copyUploadFailureDiagnostics = useCallback(async () => {
    const failedItems = toMediaItems(uploadStatus?.results).filter((item) => item?.status === 'failed');
    if (failedItems.length === 0) return;
    const ossStatus = await window.api?.ossAPI?.getConfig?.().catch((error) => ({
      success: false,
      error: error?.message || String(error)
    }));
    const payload = buildUploadFailureDebugCode({
      source: 'production-board-batch-upload',
      items: failedItems,
      ossStatus
    });
    await copyTextToClipboard(payload);
  }, [uploadStatus]);

  const [rowTaskMap, setRowTaskMap] = useState({}) // { rowId: [nodeId, ...] }

  // 单行发起任务
  const startRowTask = useCallback(
    async (row, rowIndex) => {
      const startGen = getStartGeneration()
      if (!startGen) {
        console.warn('[ProductionBoard] startGeneration 未就绪')
        return
      }

      const finalPrompt = row.prompt || commonValues.prompt
      if (!finalPrompt) return

      const mergedAssetItems = [
        ...normalizeAssetIdItems(row.assetIds),
        ...normalizeAssetIdItems(commonValues.assetIds)
      ]
      const imageAssetIds = mergedAssetItems
        .filter((item) => !['video', 'audio'].includes(String(item.assetType || '').toLowerCase()))
        .map((item) => item.id)
      const videoAssetIds = mergedAssetItems
        .filter((item) => String(item.assetType || '').toLowerCase() === 'video')
        .map((item) => item.id)
      const audioAssetIds = mergedAssetItems
        .filter((item) => String(item.assetType || '').toLowerCase() === 'audio')
        .map((item) => item.id)
      const refImages = [
        ...toMediaItems(row.refCharacters).map((r) => getMediaGenerationRef(r, { image: true })),
        ...toMediaItems(row.refProps).map((r) => getMediaGenerationRef(r, { image: true })),
        ...toMediaItems(row.refScenes).map((r) => getMediaGenerationRef(r, { image: true })),
        ...toMediaItems(row.refImages).map((r) => getMediaGenerationRef(r, { image: true })),
        ...toMediaItems(commonValues.refCharacters).map((r) =>
          getMediaGenerationRef(r, { image: true })
        ),
        ...toMediaItems(commonValues.refProps).map((r) => getMediaGenerationRef(r, { image: true })),
        ...toMediaItems(commonValues.refScenes).map((r) =>
          getMediaGenerationRef(r, { image: true })
        ),
        ...imageAssetIds
      ].filter(Boolean)

      const settings = {
        model: commonValues.model || '',
        ratio: row.ratio || commonValues.ratio || '16:9',
        resolution: row.resolution || commonValues.resolution || '',
        ...(isVideo && { duration: row.duration || commonValues.duration || '5s' }),
        batchSize: 1,
        sourceMeta: row.sourceMeta || row._sourceMeta || null,
        ...(isVideo && {
          sourceVideos:
            [
              ...toMediaItems(row.refVideos).map((r) => getMediaGenerationRef(r)),
              ...toMediaItems(commonValues.refVideos).map((r) => getMediaGenerationRef(r)),
              ...videoAssetIds
            ].length > 0
              ? [
                  ...toMediaItems(row.refVideos).map((r) => getMediaGenerationRef(r)),
                  ...toMediaItems(commonValues.refVideos).map((r) => getMediaGenerationRef(r)),
                  ...videoAssetIds
                ].filter(Boolean)
              : undefined,
          sourceAudios:
            [
              ...toMediaItems(row.refAudios).map((r) => getMediaGenerationRef(r)),
              ...toMediaItems(commonValues.refAudios).map((r) => getMediaGenerationRef(r)),
              ...audioAssetIds
            ].length > 0
              ? [
                  ...toMediaItems(row.refAudios).map((r) => getMediaGenerationRef(r)),
                  ...toMediaItems(commonValues.refAudios).map((r) => getMediaGenerationRef(r)),
                  ...audioAssetIds
                ].filter(Boolean)
              : undefined
        })
      }

      const batchCount = row.count || commonValues.count || 1
      const taskIds = []

      for (let b = 0; b < batchCount; b++) {
        taskIds.push(`pb_${Date.now()}_${rowIndex}_${b}`)
      }

      // 清除旧映射，添加新映射
      setRowTaskMap((prev) => ({ ...prev, [row.id]: taskIds }))
      // 重置状态和预览
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, status: 'generating', previews: [] } : r))
      )

      for (let b = 0; b < batchCount; b++) {
        try {
          await (startGen as any)(finalPrompt, isVideo ? 'video' : 'image', refImages, taskIds[b], settings)
        } catch (err) {
          console.error('[ProductionBoard] 任务发起失败:', err)
          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: 'failed' } : r)))
          return
        }
        if (b < batchCount - 1) await new Promise((r) => setTimeout(r, 500))
      }
    },
    [commonValues, isVideo]
  )

  // 全部发起任务
  const handleStartTasks = useCallback(async () => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const finalPrompt = row.prompt || commonValues.prompt
      if (!finalPrompt) continue
      await startRowTask(row, i)
      if (i < rows.length - 1) await new Promise((r) => setTimeout(r, 300))
    }
  }, [rows, commonValues, startRowTask])

  // 失败任务统计
  const failedRows = useMemo(() => rows.filter((r) => r.status === 'failed'), [rows])
  const diagnosticRows = useMemo(
    () =>
      rows.filter((r) => ['running', 'generating', 'completed', 'done', 'failed'].includes(r.status)),
    [rows]
  )

  // 重试所有失败任务
  const retryFailedTasks = useCallback(async () => {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].status === 'failed') {
        await startRowTask(rows[i], i)
        await new Promise((r) => setTimeout(r, 300))
      }
    }
  }, [rows, startRowTask])

  const sendPreviewToDubbing = useCallback(
    (row, preview = null) => {
      const videoPreview =
        preview || toMediaItems(row.previews).find((item) => item.type === 'video') || null
      if (!videoPreview?.url) {
        alert('这一行还没有可送译制的视频结果')
        return
      }

      const vid =
        videoPreview.vodVid ||
        videoPreview.vid ||
        videoPreview.videoId ||
        videoPreview.Vid ||
        ''
      const job = enqueueDubbingJob({
        title: row.name || '批量生产视频',
        vid,
        duration: row.duration || commonValues.duration || '',
        sourceUrl: videoPreview.url,
        sourcePanel: '批量生产板',
        sourceRowId: row.id,
        targetLanguage: '英语',
        workflow: 'staged',
        subtitleSource: 'ASR',
        enableVoice: true,
        enableFace: true,
        hardSubtitle: true,
        eraseOriginalSubtitle: false
      })

      setActiveWorkspacePage?.('dubbing')
      window.dispatchEvent(
        new CustomEvent('overseas-dubbing-queue-updated', {
          detail: {
            jobId: job.id,
            message: vid
              ? '已从批量生产板送入海外译制队列。'
              : '已送入海外译制队列；提交前需要上传到火山 VOD 并填写 Vid。'
          }
        })
      )
    },
    [commonValues.duration, setActiveWorkspacePage]
  )

  // ═══ 无人值守模式 ═══
  const {
    unattendedMode: uaMode,
    startUnattended,
    stopUnattended,
    confirmSwitchToVideo
  } = useUnattendedMode({
    rows,
    setRows,
    commonValues,
    setCommonValues,
    startRowTask,
    isVideo,
    setProductionBoardMode: setProductionBoardMode,
    handleBatchUploadAssets
  })
  const [showUaConfig, setShowUaConfig] = useState(false)
  const [uaConfig, setUaConfig] = useState({
    afterImage: 'auto', // 'auto' | 'pause'
    maxRetries: 3, // 0 | 1 | 3 | 99
    timeoutMinutes: 30,
    feishuEnabled: false,
    feishuChatId: '',
    reportInterval: 0 // 0 = 仅完成时
  })
  const [feishuChats, setFeishuChats] = useState([])

  const loadFeishuChats = useCallback(async () => {
    try {
      const res = await window.api.invoke('feishu:list-chats')
      if (res?.success) setFeishuChats(res.items || [])
    } catch {
      /* ignore */
    }
  }, [])

  // ─── 监听 history 变化，同步预览和状态到行 ───
  const history = useAppStore((s) => s.history)

  const copyRowDiagnostics = useCallback(
    async (row: any = null) => {
      const diagnosticStatuses = new Set(['running', 'generating', 'completed', 'done', 'failed'])
      const historyDiagnosticStatuses = new Set(['generating', 'completed', 'failed'])
      const targetRows = row ? [row] : rows.filter((r) => diagnosticStatuses.has(r.status))
      const taskIds = new Set(
        targetRows.flatMap((r) => rowTaskMap[r.id] || []).filter(Boolean).map(String)
      )
      if (row && taskIds.size === 0) return
      const diagnosticItems = (history || []).filter((item) => {
        const sourceNodeId = String(item.sourceNodeId || item.originalPayload?.nodeId || '')
        return (
          historyDiagnosticStatuses.has(item.status) && (!taskIds.size || taskIds.has(sourceNodeId))
        )
      })

      if (diagnosticItems.length === 0) return

      const payload =
        diagnosticItems.length === 1
          ? buildGenerationTaskDebugCode(diagnosticItems[0])
          : JSON.stringify(
              {
                kind: 'xinghe_generation_task_batch',
                copiedAt: new Date().toISOString(),
                count: diagnosticItems.length,
                items: diagnosticItems.map((item) => JSON.parse(buildGenerationTaskDebugCode(item)))
              },
              null,
              2
            )

      await copyTextToClipboard(payload)
    },
    [history, rowTaskMap, rows]
  )

  useEffect(() => {
    if (Object.keys(rowTaskMap).length === 0) return

    setRows((prev) =>
      prev.map((row) => {
        const taskIds = rowTaskMap[row.id]
        if (!taskIds || taskIds.length === 0) return row

        // 找到该行关联的 history 条目
        const matched = history.filter((h) => taskIds.includes(h.sourceNodeId))
        if (matched.length === 0) return row

        // 收集预览
        const previews = matched
          .filter((h) => h.resultUrl || h.url || h.originalUrl || h.localCacheUrl)
          .map((h) => ({
            historyId: h.id,
            url: h.resultUrl || h.url || h.originalUrl || h.localCacheUrl,
            localCacheUrl: h.localCacheUrl || null,
            type: h.type || 'image',
            prompt: h.prompt,
            modelName: h.modelName,
            durationMs: h.durationMs,
            requestId: h.requestId,
            taskId: h.taskId,
            remoteTaskId: h.remoteTaskId,
            sourceMeta: h.sourceMeta || row.sourceMeta || row._sourceMeta || null
          }))

        // 判断状态
        const allDone = matched.every((h) => ['completed', 'done'].includes(String(h.status)))
        const anyFailed = matched.some((h) => ['failed', 'error'].includes(String(h.status)))
        const anyGenerating = matched.some(
          (h) => ['generating', 'pending'].includes(String(h.status))
        )

        let newStatus = row.status
        if (anyFailed && !anyGenerating) newStatus = 'failed'
        else if (allDone && matched.length >= taskIds.length) newStatus = 'done'
        else if (anyGenerating) newStatus = 'generating'

        // 只在有变化时更新
        if (!areRowPreviewsSame(row.previews || [], previews) || newStatus !== row.status) {
          return { ...row, previews, status: newStatus }
        }
        return row
      })
    )
  }, [history, rowTaskMap])

  // ─── 悬浮面板拖拽 & 调整大小（hooks 必须在条件返回之前） ───
  const [panelPos, setPanelPos] = useState({
    x: typeof window !== 'undefined' ? Math.round((window.innerWidth - 900) / 2) : 60,
    y: 50
  })
  const [panelSize, setPanelSize] = useState({
    w: 900,
    h: Math.min(typeof window !== 'undefined' ? window.innerHeight - 100 : 600, 650)
  })
  const [isMaximized, setIsMaximized] = useState(false)
  const dragRef = useRef(null)
  const resizeRef = useRef(null)

  const onDragStart = useCallback(
    (e) => {
      if (e.target.closest('button, input, select, textarea')) return
      const startX = e.clientX - panelPos.x
      const startY = e.clientY - panelPos.y
      const onMove = (ev) => {
        setPanelPos({ x: Math.max(0, ev.clientX - startX), y: Math.max(0, ev.clientY - startY) })
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [panelPos]
  )

  const onResizeStart = useCallback(
    (e) => {
      e.stopPropagation()
      const startX = e.clientX,
        startY = e.clientY
      const startW = panelSize.w,
        startH = panelSize.h
      const onMove = (ev) => {
        setPanelSize({
          w: Math.max(600, startW + ev.clientX - startX),
          h: Math.max(350, startH + ev.clientY - startY)
        })
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [panelSize]
  )

  const toggleMaximize = useCallback(() => {
    if (isMaximized) {
      setPanelPos({ x: 60, y: 50 })
      setPanelSize({
        w: Math.min(window.innerWidth - 120, 1400),
        h: Math.min(window.innerHeight - 100, 700)
      })
    } else {
      setPanelPos({ x: 0, y: 0 })
      setPanelSize({ w: window.innerWidth, h: window.innerHeight })
    }
    setIsMaximized(!isMaximized)
  }, [isMaximized])

  if (!productionBoardOpen && !embedded) return null

  // ─── 列定义（宽度由 state 控制） ───
  const colStyle = (key): CSSProperties => ({
    width: colWidths[key],
    minWidth: 36,
    flexShrink: 0,
    position: 'relative'
  })
  const hs = {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    padding: '0 4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden'
  }
  const ci = 'w-full text-[11px] px-2 py-1.5 rounded-md outline-none transition-colors'
  const cs = {
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)'
  }

  // 可拖拽列边界手柄
  const ColResizer = ({ colKey }) => (
    <div
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize z-10 hover:bg-[var(--border-strong)] hover:opacity-40"
      onMouseDown={(e) => startColResize(colKey, e)}
    />
  )

  // 表头单元格
  const TH = ({ colKey, label }) => (
    <div style={{ ...colStyle(colKey), ...hs, display: 'flex', alignItems: 'center' }}>
      {label}
      <ColResizer colKey={colKey} />
    </div>
  )

  return (
    <div
      className={
        embedded
          ? 'relative z-0 flex h-full w-full flex-col overflow-hidden'
          : 'fixed z-[90] flex flex-col overflow-hidden'
      }
      style={
        embedded
          ? {
              width: '100%',
              height: '100%',
              backgroundColor: 'var(--bg-panel)',
              borderRadius: 0,
              border: 'none',
              boxShadow: 'none'
            }
          : {
              left: panelPos.x,
              top: panelPos.y,
              width: panelSize.w,
              height: panelSize.h,
              backgroundColor: 'var(--bg-panel)',
              borderRadius: isMaximized ? 0 : 12,
              border: isMaximized ? 'none' : '1px solid var(--border-default)',
              boxShadow: isMaximized
                ? 'none'
                : '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
              animation: 'pbFadeIn 0.25s ease-out forwards'
            }
      }
    >
      <style>{`@keyframes pbFadeIn { from { opacity:0; transform:translateY(10px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>

      {/* ═══ 顶部工具栏 ═══ */}
      <div
        className={`flex items-center justify-between px-4 py-2 shrink-0 select-none ${embedded ? '' : 'cursor-move'}`}
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-card)'
        }}
        onMouseDown={embedded ? undefined : onDragStart}
      >
        <div className="flex items-center gap-3">
          <h2
            className="text-xs font-bold flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <span style={{ fontSize: 14 }}>📋</span> 批量生产板
          </h2>
          {/* 模式切换 */}
          <div
            className="flex gap-0.5 p-0.5 rounded-lg"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            {[
              { mode: 'video', icon: Film, text: '视频' },
              { mode: 'image', icon: ImageIcon, text: '图片' }
            ].map((m) => (
              <button
                key={m.mode}
                onClick={() => setProductionBoardMode(m.mode)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all"
                style={{
                  backgroundColor:
                    (isVideo ? 'video' : 'image') === m.mode ? 'var(--bg-elevated)' : 'transparent',
                  color:
                    (isVideo ? 'video' : 'image') === m.mode
                      ? 'var(--text-primary)'
                      : 'var(--text-muted)',
                  border: `1px solid ${
                    (isVideo ? 'video' : 'image') === m.mode
                      ? 'var(--border-strong)'
                      : 'transparent'
                  }`
                }}
              >
                <m.icon size={12} /> {m.text}
              </button>
            ))}
          </div>
          {/* 模型选择器 */}
          <ModelSelector
            value={commonValues.model}
            onChange={(model) => setCommonValues((p) => ({ ...p, model }))}
            filterType={isVideo ? 'Video' : 'Image'}
          />
          <span
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
          >
            {rows.length} 行
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCommonRow(!showCommonRow)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] transition-all"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)'
            }}
          >
            <ChevronDown
              size={12}
              className={`transition-transform ${showCommonRow ? '' : '-rotate-90'}`}
            />{' '}
            通用行
          </button>
          <button
            onClick={handleImportDocument}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] transition-all"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)'
            }}
          >
            <FileText size={12} /> 导入文档
          </button>
          <button
            onClick={() => handleBatchUploadAssets(false)}
            disabled={uploadStatus?.uploading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] transition-all"
            style={{
              backgroundColor: uploadStatus?.uploading
                ? 'rgba(59,130,246,0.2)'
                : 'var(--bg-secondary)',
              color: uploadStatus?.uploading ? '#60a5fa' : 'var(--text-secondary)',
              border: `1px solid ${uploadStatus?.uploading ? 'rgba(59,130,246,0.4)' : 'var(--border-default)'}`,
              opacity: uploadStatus?.uploading ? 0.7 : 1
            }}
          >
            <Upload size={12} />
            {uploadStatus?.uploading
              ? `\u4e0a\u4f20\u4e2d ${uploadStatus.results.filter((r) => r.status === 'done').length}/${uploadStatus.results.length}`
              : '\u4e00\u952e\u4e0a\u4f20\u7d20\u6750'}
          </button>
          {uploadStatus &&
            !uploadStatus.uploading &&
            uploadStatus.results?.some((r) => r.status === 'failed') && (
              <>
              <button
                onClick={() => handleBatchUploadAssets(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:opacity-90 animate-pulse"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.15)',
                  color: '#f87171',
                  border: '1px solid rgba(239,68,68,0.3)'
                }}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                  style={{ backgroundColor: '#ef4444', color: '#fff' }}
                >
                  {uploadStatus.results.filter((r) => r.status === 'failed').length}
                </span>
                重试失败上传
              </button>
              <button
                onClick={() => copyUploadFailureDiagnostics()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:opacity-90"
                style={{
                  backgroundColor: 'rgba(148,163,184,0.14)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(148,163,184,0.28)'
                }}
                title="复制上传失败诊断"
              >
                <Copy size={11} />
                复制上传诊断
              </button>
              </>
            )}
          <button
            onClick={() => handleAddBatch(5)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] transition-all"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)'
            }}
          >
            <Plus size={12} /> +5 行
          </button>
          <button
            onClick={handleStartTasks}
            className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:opacity-90"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-strong)'
            }}
          >
            <Play size={12} /> 发起任务
          </button>
          {diagnosticRows.length > 0 && (
            <button
              onClick={() => copyRowDiagnostics()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:opacity-90"
              style={{
                backgroundColor: 'rgba(59,130,246,0.1)',
                color: '#bfdbfe',
                border: '1px solid rgba(59,130,246,0.25)'
              }}
            >
              <Copy size={11} /> 复制任务诊断
            </button>
          )}
          {failedRows.length > 0 && (
            <button
              onClick={retryFailedTasks}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:opacity-90 animate-pulse"
              style={{
                backgroundColor: 'rgba(239,68,68,0.15)',
                color: '#f87171',
                border: '1px solid rgba(239,68,68,0.3)'
              }}
            >
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                style={{ backgroundColor: '#ef4444', color: '#fff' }}
              >
                {failedRows.length}
              </span>
              重试失败
            </button>
          )}
          {/* ═══ 无人值守按钮 ═══ */}
          {uaMode?.active ? (
            <button
              onClick={stopUnattended}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:opacity-90"
              style={{
                backgroundColor: 'rgba(239,68,68,0.15)',
                color: '#f87171',
                border: '1px solid rgba(239,68,68,0.3)'
              }}
            >
              <Square size={10} /> 停止无人值守
            </button>
          ) : (
            <button
              onClick={() => {
                setShowUaConfig(true)
                loadFeishuChats()
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:opacity-90"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-default)'
              }}
            >
              <Bot size={12} /> 无人值守
            </button>
          )}
          {!embedded && (
            <button
              onClick={toggleMaximize}
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <Maximize2 size={13} />
            </button>
          )}
          <button
            onClick={() => setProductionBoardOpen(false)}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ═══ 无人值守进度面板 ═══ */}
      {uaMode?.active && (
        <div
          className="mx-4 mb-2 px-4 py-2.5 rounded-xl flex items-center gap-4 text-[11px]"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)'
          }}
        >
          <Bot
            size={16}
            style={{ color: 'var(--text-secondary)' }}
            className="animate-pulse shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                🤖 无人值守运行中
              </span>
              <span
                className="px-1.5 py-0.5 rounded text-[9px]"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-strong)'
                }}
              >
                {PHASE_LABELS[uaMode.phase] || uaMode.phase}
              </span>
            </div>
            <div className="flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
              <span>
                ✅ {uaMode.progress?.done || 0}/{uaMode.progress?.total || 0}
              </span>
              {(uaMode.progress?.generating || 0) > 0 && (
                <span>⏳ {uaMode.progress.generating} 生成中</span>
              )}
              {(uaMode.progress?.failed || 0) > 0 && (
                <span style={{ color: '#f87171' }}>❌ {uaMode.progress.failed} 失败</span>
              )}
              <span>
                ⏱️ {uaMode.startTime ? Math.floor((Date.now() - uaMode.startTime) / 60000) : 0}分钟
              </span>
            </div>
          </div>
          {uaMode.waitingConfirm && (
            <button
              onClick={confirmSwitchToVideo}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium animate-pulse"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-strong)'
              }}
            >
              <Play size={10} /> 继续生成视频
            </button>
          )}
          <button
            onClick={stopUnattended}
            className="p-1.5 rounded-lg transition-colors hover:bg-[rgba(239,68,68,0.2)]"
            style={{ color: '#f87171' }}
          >
            <Square size={12} />
          </button>
        </div>
      )}

      {/* ═══ 无人值守配置弹窗 ═══ */}
      {showUaConfig &&
        createPortal(
          <div
            className="fixed inset-0 z-[400] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowUaConfig(false)}
          >
            <div
              className="w-[420px] rounded-2xl overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-panel)',
                border: '1px solid var(--border-default)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.5)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="px-5 py-4 flex items-center gap-3"
                style={{ borderBottom: '1px solid var(--border-default)' }}
              >
                <Bot size={20} style={{ color: 'var(--text-secondary)' }} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    无人值守模式
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    全自动：图片生成 → 资产上传 → 视频生成
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 space-y-3">
                {/* 图片完成后 */}
                <div>
                  <label
                    className="text-[11px] block mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    图片生成完成后
                  </label>
                  <select
                    value={uaConfig.afterImage}
                    onChange={(e) => setUaConfig((p) => ({ ...p, afterImage: e.target.value }))}
                    className="w-full text-[11px] px-3 py-1.5 rounded-lg outline-none"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-default)'
                    }}
                  >
                    <option value="auto">自动继续生成视频</option>
                    <option value="pause">暂停等待确认</option>
                  </select>
                </div>
                {/* 重试策略 */}
                <div>
                  <label
                    className="text-[11px] block mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    失败重试策略
                  </label>
                  <select
                    value={uaConfig.maxRetries}
                    onChange={(e) =>
                      setUaConfig((p) => ({ ...p, maxRetries: Number(e.target.value) }))
                    }
                    className="w-full text-[11px] px-3 py-1.5 rounded-lg outline-none"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-default)'
                    }}
                  >
                    <option value={0}>不重试</option>
                    <option value={1}>重试 1 次</option>
                    <option value={3}>重试 3 次</option>
                    <option value={99}>无限重试</option>
                  </select>
                </div>
                {/* 超时 */}
                <div>
                  <label
                    className="text-[11px] block mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    超时自动继续（分钟，0=不限）
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={uaConfig.timeoutMinutes}
                    onChange={(e) =>
                      setUaConfig((p) => ({ ...p, timeoutMinutes: Number(e.target.value) }))
                    }
                    className="w-full text-[11px] px-3 py-1.5 rounded-lg outline-none"
                    style={{
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-default)'
                    }}
                  />
                </div>
                {/* 飞书 */}
                <div className="pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={uaConfig.feishuEnabled}
                      onChange={(e) =>
                        setUaConfig((p) => ({ ...p, feishuEnabled: e.target.checked }))
                      }
                    />
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      启用飞书推送
                    </span>
                  </div>
                  {uaConfig.feishuEnabled && (
                    <div className="space-y-2 ml-5">
                      <div>
                        <label
                          className="text-[10px] block mb-1"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          推送目标群组
                        </label>
                        <select
                          value={uaConfig.feishuChatId}
                          onChange={(e) =>
                            setUaConfig((p) => ({ ...p, feishuChatId: e.target.value }))
                          }
                          className="w-full text-[11px] px-3 py-1.5 rounded-lg outline-none"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-default)'
                          }}
                        >
                          <option value="">选择群组...</option>
                          {feishuChats.map((c) => (
                            <option key={c.chatId} value={c.chatId}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="或手动输入 Chat ID"
                          value={uaConfig.feishuChatId}
                          onChange={(e) =>
                            setUaConfig((p) => ({ ...p, feishuChatId: e.target.value }))
                          }
                          className="w-full text-[10px] px-3 py-1 rounded-lg outline-none mt-1"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border-subtle)'
                          }}
                        />
                        <div className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
                          💡 需先在「设置→飞书集成」中连接成功，且机器人已加入目标群
                        </div>
                      </div>
                      <div>
                        <label
                          className="text-[10px] block mb-1"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          汇报间隔（分钟，0=仅完成时汇报）
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={uaConfig.reportInterval}
                          onChange={(e) =>
                            setUaConfig((p) => ({ ...p, reportInterval: Number(e.target.value) }))
                          }
                          className="w-full text-[11px] px-3 py-1.5 rounded-lg outline-none"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-default)'
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div
                className="px-5 py-3 flex justify-end gap-2"
                style={{ borderTop: '1px solid var(--border-default)' }}
              >
                <button
                  onClick={() => setShowUaConfig(false)}
                  className="px-4 py-1.5 rounded-lg text-[11px]"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setShowUaConfig(false)
                    startUnattended(uaConfig)
                  }}
                  className="px-4 py-1.5 rounded-lg text-[11px] font-medium"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-strong)'
                  }}
                >
                  <span className="flex items-center gap-1">
                    <Bot size={12} /> 开始无人值守
                  </span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ═══ 表头 ═══ */}
      <div
        className="flex items-center px-5 py-2 shrink-0 gap-1"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderBottom: '2px solid var(--border-default)'
        }}
      >
        <TH colKey="num" label="#" />
        <TH colKey="name" label="名称" />
        <TH colKey="prompt" label="提示词" />
        <TH colKey="characters" label="👤 角色" />
        <TH colKey="props" label="🔧 道具" />
        <TH colKey="scenes" label="🏔️ 场景" />
        <TH colKey="audios" label="🎵 音频" />
        <TH colKey="videos" label="🎬 视频" />
        <TH colKey="params" label={isVideo ? '秒/比例/像素' : '比例/像素/张'} />
        <TH colKey="preview" label="预览" />
        <TH colKey="status" label="状态" />
        <TH colKey="actions" label="" />
      </div>

      {/* ═══ 通用值行 ═══ */}
      {showCommonRow && (
        <div
          className="flex items-start px-5 py-3 gap-1 shrink-0"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-default)'
          }}
        >
          <div style={colStyle('num')} className="text-center text-[9px] pt-3">
            <span style={{ color: 'var(--text-primary)' }}>通用</span>
          </div>
          <div style={colStyle('name')}></div>
          <div style={colStyle('prompt')}>
            <PromptCellWithAt
              value={commonValues.prompt}
              onChange={(val) => setCommonValues((p) => ({ ...p, prompt: val }))}
              row={commonValues}
              commonValues={{}}
              isVideo={isVideo}
              placeholder="通用提示词"
            />
          </div>
          <div style={colStyle('characters')}>
            <MediaCell
              items={commonValues.refCharacters || []}
              accept="image/*"
              icon={ImageIcon}
              label="角色"
              color="#f472b6"
              onAdd={(item) =>
                setCommonValues((p) => ({
                  ...p,
                  refCharacters: [...toMediaItems(p.refCharacters), item]
                }))
              }
              onRemove={(idx) =>
                setCommonValues((p) => ({
                  ...p,
                  refCharacters: toMediaItems(p.refCharacters).filter((_, j) => j !== idx)
                }))
              }
              onReorder={(from, to) => {
                const arr = [...toMediaItems(commonValues.refCharacters)]
                const [m] = arr.splice(from, 1)
                arr.splice(to, 0, m)
                setCommonValues((p) => ({ ...p, refCharacters: arr }))
              }}
            />
          </div>
          <div style={colStyle('props')}>
            <MediaCell
              items={commonValues.refProps || []}
              accept="image/*"
              icon={ImageIcon}
              label="道具"
              color="#fb923c"
              onAdd={(item) =>
                setCommonValues((p) => ({ ...p, refProps: [...toMediaItems(p.refProps), item] }))
              }
              onRemove={(idx) =>
                setCommonValues((p) => ({
                  ...p,
                  refProps: toMediaItems(p.refProps).filter((_, j) => j !== idx)
                }))
              }
              onReorder={(from, to) => {
                const arr = [...toMediaItems(commonValues.refProps)]
                const [m] = arr.splice(from, 1)
                arr.splice(to, 0, m)
                setCommonValues((p) => ({ ...p, refProps: arr }))
              }}
            />
          </div>
          <div style={colStyle('scenes')}>
            <MediaCell
              items={commonValues.refScenes || []}
              accept="image/*"
              icon={ImageIcon}
              label="场景"
              color="#34d399"
              onAdd={(item) =>
                setCommonValues((p) => ({ ...p, refScenes: [...toMediaItems(p.refScenes), item] }))
              }
              onRemove={(idx) =>
                setCommonValues((p) => ({
                  ...p,
                  refScenes: toMediaItems(p.refScenes).filter((_, j) => j !== idx)
                }))
              }
              onReorder={(from, to) => {
                const arr = [...toMediaItems(commonValues.refScenes)]
                const [m] = arr.splice(from, 1)
                arr.splice(to, 0, m)
                setCommonValues((p) => ({ ...p, refScenes: arr }))
              }}
            />
          </div>
          <div style={colStyle('audios')}>
            <MediaCell
              items={commonValues.refAudios || []}
              accept="audio/*"
              icon={Music}
              label="音频"
              color="#f59e0b"
              onAdd={(item) =>
                setCommonValues((p) => ({ ...p, refAudios: [...toMediaItems(p.refAudios), item] }))
              }
              onRemove={(idx) =>
                setCommonValues((p) => ({
                  ...p,
                  refAudios: toMediaItems(p.refAudios).filter((_, j) => j !== idx)
                }))
              }
              onReorder={(from, to) => {
                const arr = [...toMediaItems(commonValues.refAudios)]
                const [m] = arr.splice(from, 1)
                arr.splice(to, 0, m)
                setCommonValues((p) => ({ ...p, refAudios: arr }))
              }}
            />
          </div>
          <div style={colStyle('videos')}>
            <MediaCell
              items={commonValues.refVideos || []}
              accept="video/*"
              icon={Video}
              label="视频"
              color="#8b5cf6"
              onAdd={(item) =>
                setCommonValues((p) => ({ ...p, refVideos: [...toMediaItems(p.refVideos), item] }))
              }
              onRemove={(idx) =>
                setCommonValues((p) => ({
                  ...p,
                  refVideos: toMediaItems(p.refVideos).filter((_, j) => j !== idx)
                }))
              }
              onReorder={(from, to) => {
                const arr = [...toMediaItems(commonValues.refVideos)]
                const [m] = arr.splice(from, 1)
                arr.splice(to, 0, m)
                setCommonValues((p) => ({ ...p, refVideos: arr }))
              }}
            />
          </div>
          <div style={colStyle('params')}>
            <div className="flex flex-col gap-1.5">
              {isVideo && (
                <select
                  value={commonValues.duration}
                  onChange={(e) => setCommonValues((p) => ({ ...p, duration: e.target.value }))}
                  className={ci + ' cursor-pointer'}
                  style={cs}
                >
                  <option value="5s">5 秒</option>
                  <option value="8s">8 秒</option>
                  <option value="10s">10 秒</option>
                  <option value="15s">15 秒</option>
                </select>
              )}
              <select
                value={commonValues.ratio}
                onChange={(e) => setCommonValues((p) => ({ ...p, ratio: e.target.value }))}
                className={ci + ' cursor-pointer'}
                style={cs}
              >
                {SEEDANCE_VIDEO_RATIOS.map((ratio) => (
                  <option key={ratio}>{ratio}</option>
                ))}
              </select>
              <select
                value={commonValues.resolution || ''}
                onChange={(e) => setCommonValues((p) => ({ ...p, resolution: e.target.value }))}
                className={ci + ' cursor-pointer'}
                style={cs}
              >
                {isVideo ? (
                  <>
                    <option value="">Auto</option>
                    {SEEDANCE_VIDEO_RES_OPTIONS.map((resolution) => (
                      <option key={resolution} value={resolution}>
                        {resolution}
                      </option>
                    ))}
                  </>
                ) : (
                  <>
                    <option value="">Auto</option>
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </>
                )}
              </select>
              <input
                type="number"
                min={1}
                max={10}
                value={commonValues.count}
                onChange={(e) =>
                  setCommonValues((p) => ({ ...p, count: parseInt(e.target.value) || 1 }))
                }
                className={ci}
                style={cs}
                placeholder="张数"
              />
            </div>
          </div>
          <div style={colStyle('preview')}></div>
          <div style={colStyle('status')}></div>
          <div style={colStyle('actions')}></div>
        </div>
      )}

      {/* ═══ 数据行 ═══ */}
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        {rows.map((row, i) => (
          <div
            key={row.id}
            className="flex items-start px-5 py-3 gap-1 transition-colors relative"
            style={{
              borderBottom: '1px solid var(--border-subtle)',
              backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--bg-hover)',
              ...(row.rowHeight ? { minHeight: row.rowHeight } : {})
            }}
          >
            {/* # */}
            <div style={colStyle('num')} className="text-center text-[11px] pt-3 font-mono">
              <span style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
            </div>

            {/* 名称 */}
            <div style={colStyle('name')}>
              <input
                value={row.name}
                onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                placeholder={`镜头${i + 1}`}
                className={ci}
                style={cs}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>

            {/* 提示词 + @引用（自适应高度） */}
            <div style={colStyle('prompt')}>
              <PromptCellWithAt
                value={row.prompt}
                onChange={(val) => updateRow(row.id, 'prompt', val)}
                row={row}
                commonValues={commonValues}
                isVideo={isVideo}
                placeholder="提示词 (输入@引用参考)"
              />
            </div>

            {/* 👤 角色 */}
            <div style={colStyle('characters')}>
              <MediaCell
                items={row.refCharacters || []}
                accept="image/*"
                icon={ImageIcon}
                label="角色"
                color="#f472b6"
                onAdd={(item) =>
                  updateRow(row.id, 'refCharacters', [...toMediaItems(row.refCharacters), item])
                }
                onRemove={(idx) =>
                  updateRow(
                    row.id,
                    'refCharacters',
                    toMediaItems(row.refCharacters).filter((_, j) => j !== idx)
                  )
                }
                onReorder={(from, to) => {
                  const arr = [...toMediaItems(row.refCharacters)]
                  const [moved] = arr.splice(from, 1)
                  arr.splice(to, 0, moved)
                  updateRow(row.id, 'refCharacters', arr)
                }}
              />
            </div>

            {/* 🔧 道具 */}
            <div style={colStyle('props')}>
              <MediaCell
                items={row.refProps || []}
                accept="image/*"
                icon={ImageIcon}
                label="道具"
                color="#fb923c"
                onAdd={(item) => updateRow(row.id, 'refProps', [...toMediaItems(row.refProps), item])}
                onRemove={(idx) =>
                  updateRow(
                    row.id,
                    'refProps',
                    toMediaItems(row.refProps).filter((_, j) => j !== idx)
                  )
                }
                onReorder={(from, to) => {
                  const arr = [...toMediaItems(row.refProps)]
                  const [moved] = arr.splice(from, 1)
                  arr.splice(to, 0, moved)
                  updateRow(row.id, 'refProps', arr)
                }}
              />
            </div>

            {/* 🏔️ 场景 */}
            <div style={colStyle('scenes')}>
              <MediaCell
                items={row.refScenes || []}
                accept="image/*"
                icon={ImageIcon}
                label="场景"
                color="#34d399"
                onAdd={(item) => updateRow(row.id, 'refScenes', [...toMediaItems(row.refScenes), item])}
                onRemove={(idx) =>
                  updateRow(
                    row.id,
                    'refScenes',
                    toMediaItems(row.refScenes).filter((_, j) => j !== idx)
                  )
                }
                onReorder={(from, to) => {
                  const arr = [...toMediaItems(row.refScenes)]
                  const [moved] = arr.splice(from, 1)
                  arr.splice(to, 0, moved)
                  updateRow(row.id, 'refScenes', arr)
                }}
              />
            </div>

            {/* 🎵 音频 */}
            <div style={colStyle('audios')}>
              <MediaCell
                items={row.refAudios || []}
                accept="audio/*"
                icon={Music}
                label="音频"
                color="#f59e0b"
                onAdd={(item) => updateRow(row.id, 'refAudios', [...toMediaItems(row.refAudios), item])}
                onRemove={(idx) =>
                  updateRow(
                    row.id,
                    'refAudios',
                    toMediaItems(row.refAudios).filter((_, j) => j !== idx)
                  )
                }
                onReorder={(from, to) => {
                  const arr = [...toMediaItems(row.refAudios)]
                  const [moved] = arr.splice(from, 1)
                  arr.splice(to, 0, moved)
                  updateRow(row.id, 'refAudios', arr)
                }}
              />
            </div>

            {/* 🎬 视频 */}
            <div style={colStyle('videos')}>
              <MediaCell
                items={row.refVideos || []}
                accept="video/*"
                icon={Video}
                label="视频"
                color="#8b5cf6"
                onAdd={(item) => updateRow(row.id, 'refVideos', [...toMediaItems(row.refVideos), item])}
                onRemove={(idx) =>
                  updateRow(
                    row.id,
                    'refVideos',
                    toMediaItems(row.refVideos).filter((_, j) => j !== idx)
                  )
                }
                onReorder={(from, to) => {
                  const arr = [...toMediaItems(row.refVideos)]
                  const [moved] = arr.splice(from, 1)
                  arr.splice(to, 0, moved)
                  updateRow(row.id, 'refVideos', arr)
                }}
              />
            </div>

            {/* 秒数/比例/张数 */}
            <div style={colStyle('params')}>
              <div className="flex flex-col gap-1.5">
                {isVideo && (
                  <select
                    value={row.duration || ''}
                    onChange={(e) => updateRow(row.id, 'duration', e.target.value)}
                    className={ci + ' cursor-pointer'}
                    style={cs}
                  >
                    <option value="">通用</option>
                    <option value="5s">5 秒</option>
                    <option value="8s">8 秒</option>
                    <option value="10s">10 秒</option>
                    <option value="15s">15 秒</option>
                  </select>
                )}
                <select
                  value={row.ratio || ''}
                  onChange={(e) => updateRow(row.id, 'ratio', e.target.value)}
                  className={ci + ' cursor-pointer'}
                  style={cs}
                >
                  <option value="">通用</option>
                  {SEEDANCE_VIDEO_RATIOS.map((ratio) => (
                    <option key={ratio}>{ratio}</option>
                  ))}
                </select>
                <select
                  value={row.resolution || ''}
                  onChange={(e) => updateRow(row.id, 'resolution', e.target.value)}
                  className={ci + ' cursor-pointer'}
                  style={cs}
                >
                  {isVideo ? (
                    <>
                      <option value="">通用</option>
                      {SEEDANCE_VIDEO_RES_OPTIONS.map((resolution) => (
                        <option key={resolution} value={resolution}>
                          {resolution}
                        </option>
                      ))}
                    </>
                  ) : (
                    <>
                      <option value="">通用</option>
                      <option value="1K">1K</option>
                      <option value="2K">2K</option>
                      <option value="4K">4K</option>
                    </>
                  )}
                </select>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={row.count}
                  onChange={(e) => updateRow(row.id, 'count', parseInt(e.target.value) || 1)}
                  className={ci}
                  style={cs}
                  placeholder="张数"
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            {/* 预览 */}
            <div style={colStyle('preview')}>
              <div
                className="flex flex-wrap items-start gap-1.5 min-h-[56px] p-1.5 rounded-lg"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px dashed var(--border-subtle)'
                }}
              >
                {row.previews.length > 0 ? (
                  row.previews.map((p, pi) => (
                    <div
                      key={pi}
                      className="relative group cursor-pointer shrink-0"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('asset-path', p.url)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onDoubleClick={() =>
                        setProductionLightboxItem({
                          url: p.url,
                          type: p.type || 'image',
                          title: row.name || `Preview ${pi + 1}`
                        })
                      }
                      onContextMenu={(e) => {
                        if (p.type === 'video') return
                        e.preventDefault()
                        const menuId = `pb-ctx-${row.id}-${pi}`
                        // 移除已有菜单
                        document.getElementById(menuId)?.remove()
                        const menu = document.createElement('div')
                        menu.id = menuId
                        menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:9999;background:var(--bg-panel);border:1px solid var(--border-default);border-radius:8px;padding:4px 0;min-width:140px;box-shadow:var(--shadow-lg);`
                        const items = [
                          { label: '👤 添加到通用·角色', key: 'refCharacters' },
                          { label: '🔧 添加到通用·道具', key: 'refProps' },
                          { label: '🏔️ 添加到通用·场景', key: 'refScenes' }
                        ]
                        items.forEach(({ label, key }) => {
                          const btn = document.createElement('button')
                          btn.textContent = label
                          btn.style.cssText =
                            'display:block;width:100%;text-align:left;padding:6px 12px;font-size:12px;color:var(--text-primary);background:none;border:none;cursor:pointer;'
                          btn.onmouseenter = () => {
                            btn.style.backgroundColor = 'var(--bg-hover)'
                          }
                          btn.onmouseleave = () => {
                            btn.style.backgroundColor = 'transparent'
                          }
                          btn.onclick = () => {
                            const item = { path: p.url, name: row.name || `预览${pi + 1}` }
                            setCommonValues((prev) => ({
                              ...prev,
                              [key]: [...(prev[key] || []), item]
                            }))
                            menu.remove()
                          }
                          menu.appendChild(btn)
                        })
                        document.body.appendChild(menu)
                        const dismiss = () => {
                          menu.remove()
                          document.removeEventListener('click', dismiss)
                        }
                        setTimeout(() => document.addEventListener('click', dismiss), 0)
                      }}
                    >
                      {p.type === 'video' ? (
                        <VideoThumbnail src={p.url} className="w-12 h-12 rounded-md object-cover" />
                      ) : (
                        <img
                          src={p.url}
                          alt=""
                          className="w-12 h-12 rounded-md object-cover"
                          style={{ border: '1px solid var(--border-subtle)' }}
                        />
                      )}
                      <div
                        className="absolute inset-0 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                      >
                        <Eye size={12} style={{ color: '#fff' }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div
                    className="w-full h-12 rounded-md flex items-center justify-center text-[9px]"
                    style={{
                      border: '1px dashed var(--border-subtle)',
                      color: 'var(--text-muted)',
                      backgroundColor: 'var(--bg-secondary)'
                    }}
                  >
                    {row.status === 'generating' ? '⏳ 生成中…' : '暂无预览'}
                  </div>
                )}
              </div>
            </div>

            {/* 状态 */}
            <div style={colStyle('status')} className="text-center pt-3">
              <span
                className="text-[8px] px-1 py-0.5 rounded-full whitespace-nowrap"
                style={{
                  backgroundColor:
                    row.status === 'done'
                      ? 'rgba(16,185,129,0.2)'
                      : row.status === 'generating'
                        ? 'rgba(250,204,21,0.2)'
                        : row.status === 'failed'
                          ? 'rgba(239,68,68,0.2)'
                          : 'var(--bg-secondary)',
                  color:
                    row.status === 'done'
                      ? '#34d399'
                      : row.status === 'generating'
                        ? '#fbbf24'
                        : row.status === 'failed'
                          ? '#f87171'
                          : 'var(--text-muted)'
                }}
              >
                {row.status === 'idle'
                  ? '待提交'
                  : row.status === 'generating'
                    ? '生成中'
                    : row.status === 'done'
                      ? '完成'
                      : '失败'}
              </span>
            </div>

            {/* 操作 */}
            <div style={colStyle('actions')} className="flex flex-col items-center gap-1 pt-2">
              <button
                onClick={() => startRowTask(row, i)}
                disabled={row.status === 'generating' || !(row.prompt || commonValues.prompt)}
                className="w-6 h-6 flex items-center justify-center rounded-md transition-all disabled:opacity-20 hover:scale-110"
                style={{
                  backgroundColor:
                    row.status === 'generating' ? 'rgba(250,204,21,0.2)' : 'var(--bg-elevated)',
                  color: row.status === 'generating' ? '#fbbf24' : 'var(--text-primary)',
                  border: `1px solid ${
                    row.status === 'generating' ? 'rgba(250,204,21,0.35)' : 'var(--border-strong)'
                  }`
                }}
                title={row.status === 'generating' ? '生成中' : '发起任务'}
              >
                {row.status === 'generating' ? (
                  <div className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Play size={12} />
                )}
              </button>
              {['running', 'generating', 'completed', 'done', 'failed'].includes(row.status) && (
                <button
                  onClick={() => copyRowDiagnostics(row)}
                  className="w-6 h-6 flex items-center justify-center rounded-md transition-all hover:scale-110"
                  style={{
                    backgroundColor: 'rgba(59,130,246,0.12)',
                    color: '#bfdbfe',
                    border: '1px solid rgba(59,130,246,0.28)'
                  }}
                  title="复制本行任务诊断"
                >
                  <Copy size={11} />
                </button>
              )}
              <div className="flex gap-0.5">
                {isVideo && (
                  <button
                    onClick={() => sendPreviewToDubbing(row)}
                    disabled={!row.previews?.some((item) => item.type === 'video' && item.url)}
                    className="p-0.5 rounded transition-colors hover:bg-cyan-500/10 disabled:opacity-25 disabled:cursor-not-allowed"
                    style={{ color: '#67e8f9' }}
                    title="送海外译制"
                  >
                    <Languages size={10} />
                  </button>
                )}
                <button
                  onClick={() => duplicateRow(row.id)}
                  className="p-0.5 rounded transition-colors hover:bg-[var(--bg-secondary)]"
                  style={{ color: 'var(--text-muted)' }}
                  title="复制行"
                >
                  <Copy size={10} />
                </button>
                <button
                  onClick={() => removeRow(row.id)}
                  className="p-0.5 rounded transition-colors hover:bg-red-500/10"
                  style={{ color: '#f87171' }}
                  title="删除行"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
            {/* 行高拖拽手柄 */}
            <div
              className="absolute bottom-0 left-0 w-full h-1.5 cursor-row-resize z-10 group/resize hover:bg-[var(--primary-color)] hover:opacity-30 transition-colors"
              title="拖拽调整行高"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const rowEl = e.currentTarget.parentElement
                if (!rowEl) return
                const startY = e.clientY
                const startH = rowEl.offsetHeight
                const rowId = row.id
                const onMove = (me) => {
                  const newH = Math.max(60, startH + (me.clientY - startY))
                  rowEl.style.minHeight = newH + 'px'
                }
                const onUp = (me) => {
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                  const finalH = Math.max(60, startH + (me.clientY - startY))
                  updateRow(rowId, 'rowHeight', finalH)
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }}
            />
          </div>
        ))}

        {/* 添加行 */}
        <div className="flex items-center justify-center py-4">
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-[11px] transition-all hover:scale-[1.02]"
            style={{ border: '1.5px dashed var(--border-default)', color: 'var(--text-muted)' }}
          >
            <Plus size={13} /> 添加新镜头
          </button>
        </div>
      </div>

      {/* ═══ 底部统计 ═══ */}
      <div
        className="flex items-center justify-between px-5 py-2.5 shrink-0"
        style={{ borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}
      >
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          共 {rows.length} 行 · {rows.filter((r) => r.prompt || commonValues.prompt).length}{' '}
          行有提示词
          {commonValues.model &&
            ` · 模型: ${useAppStore.getState().apiConfigs?.find((m) => m.id === commonValues.model)?.modelName || commonValues.model}`}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          预计生成 {rows.reduce((sum, r) => sum + (r.count || commonValues.count || 1), 0)} 个
          {isVideo ? '视频' : '图片'}
        </span>
      </div>

      {/* ═══ 调整大小手柄 ═══ */}
      <Lightbox
        item={productionLightboxItem}
        onClose={() => setProductionLightboxItem(null)}
        onNavigate={() => {}}
        scope="parent"
      />

      {!embedded && !isMaximized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
          style={{
            background: 'linear-gradient(135deg, transparent 50%, var(--text-muted) 50%)',
            opacity: 0.3,
            borderRadius: '0 0 12px 0'
          }}
          onMouseDown={onResizeStart}
        />
      )}
    </div>
  )
})

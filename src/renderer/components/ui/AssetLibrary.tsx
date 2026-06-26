import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ThumbnailImage } from './ThumbnailImage.tsx'
import { VideoThumbnail } from './VideoThumbnail.tsx'
import {
  Sparkles,
  Image,
  FolderOpen,
  MoreHorizontal,
  FileText,
  Settings,
  Film,
  Music,
  Check,
  Trash2,
  ChevronRight,
  X,
  Play,
  Loader2,
  Plus,
  ArrowRightSquare,
  AlertCircle,
  CloudUpload,
  Copy,
  Users,
  Edit,
  FolderPlus,
  Upload
} from '../../utils/icons.tsx'
import { useAppStore } from '../../store/useAppStore.ts'
import { withProjectCacheContext } from '../../utils/projectCache.ts'
import { canReadFileAsDataUrl, getXingheMediaSrc } from '../../utils/fileHelpers.ts'
import { copyTextToClipboard } from '../../utils/clipboard.ts'
import { FloatingPanel } from './FloatingPanel.tsx'
import { readCloudAssetDrag, readSeriesAssetDrag, hasCloudAssetDrag, resolveCloudAssetForDrop, inferAssetLibraryCategory } from '../../utils/cloudAssetDrop'

const CATEGORIES = [
  { id: 'characters', label: '人物', icon: Users },
  { id: 'materials', label: '素材', icon: Image },
  { id: 'videos', label: '视频', icon: Film },
  { id: 'audio', label: '音频', icon: Music },
  { id: 'props', label: '道具', icon: FolderOpen },
  { id: 'documents', label: '文档', icon: FileText }
]

// 鏂版牸寮忥細姣忎釜鍒嗙被 { folders: [...], items: [...] }
const CATEGORY_IDS = CATEGORIES.map((category) => category.id)
const CATEGORY_ALIASES = {
  scenes: 'materials',
  video: 'videos'
}
const EMPTY_CATEGORY = { folders: [], items: [] }
const ASSET_TILE_SIZE_KEY = 'tapnow_asset_library_tile_size'
const MIN_ASSET_TILE_SIZE = 56
const MAX_ASSET_TILE_SIZE = 128
const DEFAULT_ASSET_TILE_SIZE = 72

function getUploadPathKind(path = '') {
  const value = String(path || '')
  if (value.startsWith('xinghe://local')) return 'xinghe-local'
  if (value.startsWith('file://')) return 'file-url'
  if (/^https?:\/\//i.test(value)) return 'remote-url'
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('\\\\')) return 'local-path'
  return value ? 'unknown' : 'empty'
}

function buildUploadFailureDebugCode({ source, asset, status, ossStatus }) {
  return JSON.stringify(
    {
      kind: 'xinghe_asset_upload_failure',
      copiedAt: new Date().toISOString(),
      source,
      error: status?.error || null,
      uploadStatus: status?.status || null,
      asset: {
        id: asset?.id || null,
        name: asset?.name || null,
        type: asset?.type || null,
        path: asset?.path || null,
        pathKind: getUploadPathKind(asset?.path),
        seedanceId: asset?.seedanceId || status?.seedanceId || null
      },
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

function createEmptyCategory() {
  return { folders: [], items: [] }
}

function normalizeFolder(folder) {
  if (!folder || typeof folder !== 'object') return null
  return {
    ...folder,
    items: Array.isArray(folder.items) ? folder.items : []
  }
}

function normalizeCategory(category) {
  if (Array.isArray(category)) {
    return { folders: [], items: category }
  }

  if (category && typeof category === 'object') {
    return {
      folders: Array.isArray(category.folders)
        ? category.folders.map(normalizeFolder).filter(Boolean)
        : [],
      items: Array.isArray(category.items) ? category.items : []
    }
  }

  return createEmptyCategory()
}

function resolveCategoryId(category) {
  if (CATEGORY_IDS.includes(category)) return category
  return CATEGORY_ALIASES[category] || 'materials'
}

function mergeCategory(target, source) {
  if (!source.items.length && !source.folders.length) return target
  return {
    folders: [...target.folders, ...source.folders],
    items: [...target.items, ...source.items]
  }
}

function normalizeAssetsData(input) {
  const parsed = input && typeof input === 'object' ? input : {}
  const migrated = Object.fromEntries(CATEGORY_IDS.map((id) => [id, createEmptyCategory()]))

  for (const categoryId of CATEGORY_IDS) {
    migrated[categoryId] = normalizeCategory(parsed[categoryId])
  }

  for (const [legacyId, targetId] of Object.entries(CATEGORY_ALIASES)) {
    migrated[targetId] = mergeCategory(migrated[targetId], normalizeCategory(parsed[legacyId]))
  }

  return migrated
}

function clampAssetTileSize(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_ASSET_TILE_SIZE
  return Math.min(Math.max(numeric, MIN_ASSET_TILE_SIZE), MAX_ASSET_TILE_SIZE)
}

function loadAssetTileSize() {
  if (typeof window === 'undefined') return DEFAULT_ASSET_TILE_SIZE
  return clampAssetTileSize(localStorage.getItem(ASSET_TILE_SIZE_KEY))
}

function getStorageKey(projectId) {
  return projectId ? `tapnow_asset_library_${projectId}` : 'tapnow_asset_library'
}

function loadAssets(projectId) {
  try {
    const key = getStorageKey(projectId)
    const data = localStorage.getItem(key)
    if (!data) {
      return normalizeAssetsData(null)
    }
    const parsed = JSON.parse(data)
    return normalizeAssetsData(parsed)
  } catch {
    return normalizeAssetsData(null)
  }
}

function saveAssets(projectId, assets) {
  const key = getStorageKey(projectId)
  localStorage.setItem(key, JSON.stringify(normalizeAssetsData(assets)))
}

export function AssetLibrary() {
  const assetLibraryOpen = useAppStore((state) => state.assetLibraryOpen)
  const setAssetLibraryOpen = useAppStore((state) => state.setAssetLibraryOpen)
  const currentProject = useAppStore((state) => state.currentProject)

  const [activeCategory, setActiveCategory] = useState('characters')
  const [assets, setAssets] = useState(() => loadAssets(currentProject?.id))
  const [assetTileSize, setAssetTileSize] = useState(loadAssetTileSize)
  const [openFolderId, setOpenFolderId] = useState(null)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewType, setPreviewType] = useState<'image' | 'video' | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState(null)
  const [isDragOverPanel, setIsDragOverPanel] = useState(false)

  // ========== 绱犳潗鍏ュ簱鐘舵€?==========
  // assetId 鈫?{ status: 'uploading'|'processing'|'active'|'failed', seedanceId?: string, error?: string }
  const [seedanceStatus, setSeedanceStatus] = useState({})

  const prevProjectRef = useRef(currentProject?.id)
  const latestProjectIdRef = useRef(currentProject?.id)
  const latestAssetsRef = useRef(assets)
  const assetSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const folderBarRef = useRef<HTMLDivElement>(null)

  // 文件夹横向栏：鼠标滚轮转横向滚动
  useEffect(() => {
    const el = folderBarRef.current
    if (!el) return undefined
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => {
    localStorage.setItem(ASSET_TILE_SIZE_KEY, String(assetTileSize))
  }, [assetTileSize])

  useEffect(() => {
    latestProjectIdRef.current = currentProject?.id
    latestAssetsRef.current = assets
  }, [assets, currentProject?.id])

  useEffect(
    () => () => {
      if (assetSaveTimerRef.current) {
        clearTimeout(assetSaveTimerRef.current)
        assetSaveTimerRef.current = null
      }
      saveAssets(latestProjectIdRef.current, latestAssetsRef.current)
    },
    []
  )

  useEffect(() => {
    if (assetSaveTimerRef.current) {
      clearTimeout(assetSaveTimerRef.current)
      assetSaveTimerRef.current = null
    }

    if (prevProjectRef.current !== currentProject?.id) {
      saveAssets(prevProjectRef.current, assets)
      prevProjectRef.current = currentProject?.id
      setAssets(loadAssets(currentProject?.id))
      setOpenFolderId(null)
      return
    }

    assetSaveTimerRef.current = setTimeout(() => {
      saveAssets(currentProject?.id, assets)
      assetSaveTimerRef.current = null
    }, 400)

    return () => {
      if (assetSaveTimerRef.current) {
        clearTimeout(assetSaveTimerRef.current)
        assetSaveTimerRef.current = null
      }
    }
  }, [assets, currentProject?.id])

  // 鐩戝惉澶栭儴娣诲姞璧勪骇浜嬩欢锛圤utputResultsPanel 閫氳繃 localStorage 鐩存帴鍐欏叆鍚庝細瑙﹀彂姝や簨浠讹級
  useEffect(() => {
    const handleExternalUpdate = () =>
      setAssets(loadAssets(useAppStore.getState().currentProject?.id))
    window.addEventListener('asset-library-updated', handleExternalUpdate)
    return () => window.removeEventListener('asset-library-updated', handleExternalUpdate)
  }, [])

  // 鍒囨崲鍒嗙被鏃跺叧闂枃浠跺す
  useEffect(() => {
    setOpenFolderId(null)
    setCreatingFolder(false)
  }, [activeCategory])

  const catData = normalizeCategory(assets[activeCategory] || EMPTY_CATEGORY)

  // 褰撳墠灞曞紑鐨勬枃浠跺す
  const openFolder = openFolderId ? catData.folders.find((f) => f.id === openFolderId) : null

  const clearDragState = useCallback(() => {
    setDragOverFolderId(null)
    setIsDragOverPanel(false)
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearDragState()
      }
    }

    window.addEventListener('blur', clearDragState)
    window.addEventListener('dragend', clearDragState)
    window.addEventListener('drop', clearDragState)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('blur', clearDragState)
      window.removeEventListener('dragend', clearDragState)
      window.removeEventListener('drop', clearDragState)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [clearDragState])

  // ========== 鏂囦欢瀵煎叆 ==========
  const handleImport = useCallback(async () => {
    const fileFilters =
      activeCategory === 'audio'
        ? [{ name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] }]
        : activeCategory === 'videos'
          ? [
              {
                name: '视频文件',
                extensions: ['mp4', 'webm', 'mov']
              }
            ]
          : [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'] }]

    const result = await window.api.localCacheAPI.openFiles({
      filters: fileFilters,
      multiple: true
    })

    if (!result.success || !result.paths?.length) return

    const newAssets = result.paths.map((filePath) => {
      const name = filePath.split(/[/\\]/).pop() || filePath
      const ext = name.split('.').pop()?.toLowerCase() || ''
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
      const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
      const videoExts = ['mp4', 'webm', 'mov', 'ogg']

      let type = 'application/octet-stream'
      if (imageExts.includes(ext)) type = `image/${ext === 'jpg' ? 'jpeg' : ext}`
      else if (audioExts.includes(ext)) type = `audio/${ext}`
      else if (videoExts.includes(ext)) type = `video/${ext}`

      return {
        id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        type,
        path: filePath,
        addedAt: Date.now()
      }
    })

    setAssets((prev) => {
      const cat = normalizeCategory(prev[activeCategory])
      if (openFolderId) {
        cat.folders = cat.folders.map((f) =>
          f.id === openFolderId ? { ...f, items: [...f.items, ...newAssets] } : f
        )
      } else {
        // 瀵煎叆鍒版暎钀藉尯
        cat.items = [...cat.items, ...newAssets]
      }
      return { ...prev, [activeCategory]: cat }
    })
  }, [activeCategory, openFolderId])

  // ========== 鍒犻櫎璧勪骇 ==========
  const handleDelete = useCallback(
    (assetId) => {
      setAssets((prev) => {
        const cat = normalizeCategory(prev[activeCategory])
        if (openFolderId) {
          cat.folders = cat.folders.map((f) =>
            f.id === openFolderId ? { ...f, items: f.items.filter((a) => a.id !== assetId) } : f
          )
        } else {
          cat.items = cat.items.filter((a) => a.id !== assetId)
        }
        return { ...prev, [activeCategory]: cat }
      })
    },
    [activeCategory, openFolderId]
  )

  // ========== 鏂囦欢澶?CRUD ==========
  const handleCreateFolder = useCallback(() => {
    const name = newFolderName.trim()
    if (!name) return
    setAssets((prev) => {
      const cat = normalizeCategory(prev[activeCategory])
      cat.folders = [
        ...cat.folders,
        {
          id: `folder-${Date.now()}`,
          name,
          items: [],
          createdAt: Date.now()
        }
      ]
      return { ...prev, [activeCategory]: cat }
    })
    setNewFolderName('')
    setCreatingFolder(false)
  }, [activeCategory, newFolderName])

  const handleDeleteFolder = useCallback(
    (folderId) => {
      if (!confirm('删除文件夹会同时删除其中所有资产，确定吗？')) return
      setAssets((prev) => {
        const cat = normalizeCategory(prev[activeCategory])
        cat.folders = cat.folders.filter((f) => f.id !== folderId)
        return { ...prev, [activeCategory]: cat }
      })
      if (openFolderId === folderId) setOpenFolderId(null)
    },
    [activeCategory, openFolderId]
  )

  const handleRenameFolder = useCallback(
    (folderId) => {
      const name = renameValue.trim()
      if (!name) return
      setAssets((prev) => {
        const cat = normalizeCategory(prev[activeCategory])
        cat.folders = cat.folders.map((f) => (f.id === folderId ? { ...f, name } : f))
        return { ...prev, [activeCategory]: cat }
      })
      setRenamingFolderId(null)
      setRenameValue('')
    },
    [activeCategory, renameValue]
  )

  // ========== 鏁ｈ惤鍥炬嫋鍏ユ枃浠跺す ==========
  const handleDropToFolder = useCallback(
    (folderId, assetId) => {
      setAssets((prev) => {
        const cat = normalizeCategory(prev[activeCategory])
        const asset = cat.items.find((a) => a.id === assetId)
        if (!asset) return prev
        // 浠庢暎钀藉尯绉婚櫎
        cat.items = cat.items.filter((a) => a.id !== assetId)
        // 娣诲姞鍒版枃浠跺す
        cat.folders = cat.folders.map((f) =>
          f.id === folderId ? { ...f, items: [...f.items, asset] } : f
        )
        return { ...prev, [activeCategory]: cat }
      })
      setDragOverFolderId(null)
    },
    [activeCategory]
  )

  // ========== 澶栭儴鏂囦欢鎷栧叆 ==========
  // 浣跨敤涓?ReactFlowCanvas 鐩稿悓鐨勭瓥鐣ワ細IPC cache:copy-file 鈫?xinghe:// URL
  // 澶辫触鍒?FileReader + cache:save-cache 闄嶇骇锛涗笉鍐嶇洿鎺ヤ緷璧?file.path 灞曠ず
  const handleExternalFileDrop = useCallback(
    async (e, targetFolderId) => {
      e.preventDefault()
      e.stopPropagation()
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
      const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
      const videoExts = ['mp4', 'webm', 'mov']
      const fileArray = Array.from(files as FileList | File[]) as File[]
      const newAssets = []

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        const name = file.name || 'unknown'
        const ext = name.split('.').pop()?.toLowerCase() || ''

        if (activeCategory === 'audio' && !audioExts.includes(ext)) continue
        if (
          (activeCategory === 'characters' || activeCategory === 'materials') &&
          !imageExts.includes(ext)
        )
          continue
        if (activeCategory === 'videos' && !videoExts.includes(ext)) continue

        const cacheType = audioExts.includes(ext)
          ? 'audio'
          : videoExts.includes(ext)
            ? 'video'
            : 'image'
        let finalPath = null

        try {
          if (file.path) {
            const res = await window.api.invoke('cache:copy-file', withProjectCacheContext({
              id: `asset_${Date.now()}_${i}`,
              sourcePath: file.path,
              category: 'asset_library',
              type: cacheType
            }))
            if (res?.success && res.path) {
              finalPath = res.path
            }
          }
          if (!finalPath) {
            if (!canReadFileAsDataUrl(file, `${cacheType} asset`)) {
              continue
            }
            const base64 = await new Promise<string>((res, rej) => {
              const reader = new FileReader()
              reader.onload = (ev) => res(String(ev.target?.result || ''))
              reader.onerror = rej
              reader.readAsDataURL(file)
            })
            const res = await window.api.localCacheAPI.saveCache(withProjectCacheContext({
              id: `asset_${Date.now()}_${i}`,
              content: base64,
              category: 'asset_library',
              ext: `.${ext}`,
              type: cacheType
            }))
            if (res?.success && res.path) {
              finalPath = res.path
            }
          }
        } catch (err) {
          console.error('[AssetLibrary] 澶勭悊鎷栧叆鏂囦欢寮傚父:', name, err)
          continue
        }

        if (!finalPath) continue

        let type = 'application/octet-stream'
        if (imageExts.includes(ext)) type = `image/${ext === 'jpg' ? 'jpeg' : ext}`
        else if (audioExts.includes(ext)) type = `audio/${ext}`
        else if (videoExts.includes(ext)) type = `video/${ext}`

        newAssets.push({
          id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          type,
          path: finalPath,
          addedAt: Date.now()
        })
      }

      if (newAssets.length === 0) return

      const effectiveFolderId = targetFolderId ?? openFolderId
      setAssets((prev) => {
        const cat = normalizeCategory(prev[activeCategory])
        if (effectiveFolderId) {
          cat.folders = cat.folders.map((f) =>
            f.id === effectiveFolderId ? { ...f, items: [...f.items, ...newAssets] } : f
          )
        } else {
          cat.items = [...cat.items, ...newAssets]
        }
        return { ...prev, [activeCategory]: cat }
      })
    },
    [activeCategory, openFolderId]
  )

  // ========== 褰撳墠鏄剧ず鐨勮祫浜у垪琛?==========
  const displayItems = openFolder ? openFolder.items : catData.items

  // ========== 绱犳潗鍏ュ簱鍒?Seedance ==========
  const handleSeedanceUpload = useCallback(
    async (asset) => {
      if (!asset.path) return

      let assetType = 'Image'
      if (asset.type?.startsWith('video/')) assetType = 'Video'
      else if (asset.type?.startsWith('audio/')) assetType = 'Audio'
      else if (!asset.type?.startsWith('image/')) return // 只处理这三种类型

      const localAssetId = asset.id

      // 标记为上传中
      setSeedanceStatus((prev) => ({ ...prev, [localAssetId]: { status: 'uploading' } }))

      try {
        // 1. 上传文件到阿里云 OSS，获取公共可访问 URL
        const ossStatus = await window.api?.ossAPI?.getConfig?.()
        if (!ossStatus?.success) {
          throw new Error(`OSS 配置检查失败：${ossStatus?.error || '无法读取配置'}`)
        }
        if (!ossStatus.configured) {
          throw new Error(
            'OSS 未配置：请在 设置 -> 服务 -> 阿里云 OSS 上传 中保存 AccessKey、Bucket、Endpoint 和 Public URL'
          )
        }

        const ossResult = await window.api.ossAPI.uploadFile(asset.path)
        if (!ossResult?.success || !ossResult.url) {
          throw new Error(ossResult?.error || 'OSS 上传失败')
        }
        console.log('[Seedance] OSS URL:', ossResult.url)

        // 2. 调用 Seedance CreateAsset API
        setSeedanceStatus((prev) => ({ ...prev, [localAssetId]: { status: 'processing' } }))
        const createResult = await (window.api.assetAPI.create as any)(
          ossResult.url,
          asset.name || '',
          null,
          assetType
        )
        if (!createResult?.id) {
          throw new Error('CreateAsset 杩斿洖涓虹┖')
        }
        console.log('[Seedance] Asset ID:', createResult.id)

        // 3. 轮询等待 Active (视频/音频处理较慢，放宽到 10 分钟)
        const pollResult = await window.api.assetAPI.poll(createResult.id, 3000, 600000)
        console.log('[Seedance] 素材已激活', pollResult)

        // 4. 鏇存柊鐘舵€佸拰鏈湴璧勪骇鏁版嵁
        setSeedanceStatus((prev) => ({
          ...prev,
          [localAssetId]: { status: 'active', seedanceId: createResult.id }
        }))

        // 灏?seedanceId 鍐欏叆璧勪骇鏁版嵁涓紙鎸佷箙鍖栵級
        setAssets((prev) => {
          const cat = normalizeCategory(prev[activeCategory])
          const updateItem = (item) =>
            item.id === localAssetId ? { ...item, seedanceId: createResult.id } : item

          if (openFolderId) {
            cat.folders = cat.folders.map((f) =>
              f.id === openFolderId ? { ...f, items: f.items.map(updateItem) } : f
            )
          } else {
            cat.items = cat.items.map(updateItem)
          }
          return { ...prev, [activeCategory]: cat }
        })
      } catch (err) {
        console.error('[Seedance] 鍏ュ簱澶辫触:', err)
        setSeedanceStatus((prev) => ({
          ...prev,
          [localAssetId]: { status: 'failed', error: err.message || String(err) }
        }))
      }
    },
    [activeCategory, openFolderId]
  )

  // ========== 渲染资产网格项 ==========
  const copySeedanceUploadFailure = useCallback(async (asset, status) => {
    const ossStatus = await window.api?.ossAPI?.getConfig?.().catch((error) => ({
      success: false,
      error: error?.message || String(error)
    }))
    const payload = buildUploadFailureDebugCode({
      source: 'asset-library-seedance-upload',
      asset,
      status,
      ossStatus
    })
    await copyTextToClipboard(payload)
  }, [])

  const renderAssetItem = (asset: any, _nested = false) => {
    const isUploadable =
      asset.type?.startsWith('image/') ||
      asset.type?.startsWith('video/') ||
      asset.type?.startsWith('audio/')
    const sStatus = isUploadable ? seedanceStatus[asset.id] : null
    const hasSeedanceId =
      isUploadable && (asset.seedanceId || sStatus?.seedanceId || sStatus?.status === 'active')
    const activeSeedanceId = asset.seedanceId || sStatus?.seedanceId

    return (
      <div
        key={asset.id}
        data-asset-item
        className={`group relative flex w-full min-w-0 flex-col items-center rounded-lg p-1.5 transition-colors cursor-grab active:cursor-grabbing ${
          hasSeedanceId
            ? 'bg-emerald-500/10 hover:bg-emerald-500/20 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.4)]'
            : 'hover:bg-[var(--bg-hover)]'
        }`}
        draggable
        onDragStart={(e) => {
          clearDragState()
          e.dataTransfer.setData('asset-path', asset.path)
          e.dataTransfer.setData('asset-type', asset.type || '')
          e.dataTransfer.setData('asset-id', asset.id)
          if (hasSeedanceId && activeSeedanceId) {
            e.dataTransfer.setData('seedance-id', activeSeedanceId)
          }
          e.dataTransfer.effectAllowed = 'copyMove'
        }}
        onDragEnd={clearDragState}
        onDoubleClick={() => {
          if (
            (asset.type?.startsWith('image/') || asset.type?.startsWith('video/')) &&
            asset.path
          ) {
            setPreviewUrl(getXingheMediaSrc(asset.path))
            setPreviewType(asset.type.startsWith('video/') ? 'video' : 'image')
          }
        }}
      >
        <div className="relative w-full aspect-square overflow-hidden bg-[var(--bg-base)] flex items-center justify-center text-[var(--text-muted)] mb-0.5">
          {(asset.type?.startsWith('image/') || asset.type?.startsWith('video/')) && asset.path ? (
            <>
              {asset.type?.startsWith('video/') ? (
                <VideoThumbnail
                  src={asset.path}
                  className="w-full h-full object-cover"
                  allowCapture
                  onLoadedDimensions={(nw, nh) => {
                    // 延迟查找 DOM，因为 render 可能还没完成
                    requestAnimationFrame(() => {
                      const el = document.querySelector(`[data-asset-item] [data-dim-label]`)
                      // 这里无法精准定位，改用 ref 或忽略
                    })
                  }}
                />
              ) : (
                <ThumbnailImage
                  src={asset.path}
                  alt={asset.name}
                  className="w-full h-full object-cover"
                  onLoad={(e) => {
                    const nw = e.currentTarget.naturalWidth
                    const nh = e.currentTarget.naturalHeight
                    if (nw && nh) {
                      const dimEl = e.currentTarget
                        .closest('[data-asset-item]')
                        ?.querySelector('[data-dim-label]')
                      if (dimEl) dimEl.textContent = `${nw}x${nh}`
                    }
                  }}
                />
              )}
              {asset.type?.startsWith('video/') && (
                <div className="absolute top-1 left-1 bg-black/60 rounded p-0.5 text-white">
                  <Film size={10} />
                </div>
              )}
              <div
                data-dim-label
                className="absolute bottom-0.5 right-0.5 bg-black/60 backdrop-blur-sm text-white asset-library-text-micro px-1 py-0 rounded font-mono pointer-events-none border border-white/10"
              ></div>
            </>
          ) : asset.type?.startsWith('audio/') ? (
            <Music size={14} className="opacity-40" />
          ) : (
            <Image size={14} className="opacity-40" />
          )}
        </div>
        <span className="w-full truncate text-center asset-library-file-name text-[var(--text-secondary)] mt-1">
          {asset.name}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDelete(asset.id)
          }}
          className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/50 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400 z-10"
        >
          <Trash2 size={8} />
        </button>

        {/* 鐗规潈寰掔珷 - 宸插叆搴撶殑瑙嗚琛ㄧ幇 */}
        {hasSeedanceId && (
          <div
            className="absolute top-1 left-1 flex items-center justify-center bg-emerald-500 text-white rounded-full p-0.5 shadow-sm shadow-emerald-500/50 z-10 cursor-help"
            title="✨ 已入库资产，可直接拖入节点生成"
          >
            <Sparkles size={8} />
          </div>
        )}

        {/* Seedance 入库按钮和状态 */}
        {isUploadable &&
          (() => {
            if (hasSeedanceId) {
              return (
                <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      const btn = e.currentTarget
                      const original = btn.innerHTML
                      copyTextToClipboard(activeSeedanceId).then(() => {
                        btn.textContent = '已复制 ID'
                        setTimeout(() => {
                          btn.innerHTML = original
                        }, 1500)
                      })
                    }}
                    title={`点击复制 Asset ID: ${activeSeedanceId}`}
                    className="flex items-center gap-0.5 asset-library-text-micro bg-emerald-600/90 text-white px-1.5 py-0.5 rounded-full hover:bg-emerald-500 transition-colors cursor-pointer pointer-events-auto"
                  >
                    <Check size={7} /> 复制 ID
                  </button>
                </div>
              )
            }

            if (sStatus?.status === 'uploading' || sStatus?.status === 'processing') {
              return (
                <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-1">
                  <span className="flex items-center gap-0.5 asset-library-text-micro bg-blue-600/80 text-white px-1 py-0 rounded-full">
                    <Loader2 size={7} className="animate-spin" />
                    {sStatus.status === 'uploading' ? '上传中' : '处理中'}
                  </span>
                </div>
              )
            }

            if (sStatus?.status === 'failed') {
              return (
                <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSeedanceUpload(asset)
                    }}
                    title={sStatus.error || '入库失败，点击重试'}
                    className="flex items-center gap-0.5 asset-library-text-micro bg-red-600/80 text-white px-1 py-0 rounded-full hover:bg-red-500 transition-colors"
                  >
                    <AlertCircle size={7} /> 重试
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      copySeedanceUploadFailure(asset, sStatus)
                    }}
                    title="复制上传失败诊断"
                    className="flex items-center gap-0.5 asset-library-text-micro bg-slate-800/90 text-white px-1 py-0 rounded-full hover:bg-slate-700 transition-colors"
                  >
                    <Copy size={7} /> 诊断
                  </button>
                </div>
              )
            }

            return (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleSeedanceUpload(asset)
                }}
                className="absolute top-1 left-1 p-[3px] rounded-full bg-blue-500/80 text-white/90 shadow-sm transition-all hover:bg-blue-400 hover:scale-110 flex items-center justify-center opacity-80 group-hover:opacity-100"
                title="一键入库到 Seedance"
              >
                <CloudUpload size={8} />
              </button>
            )
          })()}
      </div>
    )
  }

  return (
    <FloatingPanel
      open={assetLibraryOpen}
      onClose={() => setAssetLibraryOpen(false)}
      title="资产库"
      icon="📁"
      defaultX={typeof window !== 'undefined' ? Math.round((window.innerWidth - 520) / 2) : 300}
      defaultY={60}
      width={520}
      maxHeight="55vh"
    >
      <div
        className={`flex-1 flex flex-col min-h-0 ${isDragOverPanel ? 'ring-2 ring-inset ring-[var(--primary-color)]' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'copy'
          setIsDragOverPanel(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setIsDragOverPanel(false)
          }
        }}
        onDrop={(e) => {
          setIsDragOverPanel(false)
          const seriesAsset = readSeriesAssetDrag(e.dataTransfer)
          if (seriesAsset) {
            e.preventDefault()
            e.stopPropagation()
            const categoryMap: Record<string, string> = {
              characters: 'characters',
              scenes: 'materials',
              props: 'props'
            }
            const category = resolveCategoryId(categoryMap[seriesAsset.categoryId] || 'materials')
            const newAsset = {
              id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: seriesAsset.name,
              type: seriesAsset.imageUrl ? 'image/png' : 'text/plain',
              path: seriesAsset.imageUrl || `series-asset://${seriesAsset.projectId}/${seriesAsset.categoryId}/${encodeURIComponent(seriesAsset.name)}`,
              addedAt: Date.now(),
              source: 'series-asset',
              prompt: seriesAsset.prompt,
              projectId: seriesAsset.projectId,
              categoryName: seriesAsset.categoryName
            }
            setAssets((prev: Record<string, any>) => {
              const cat = normalizeCategory(prev[category])
              cat.items = [...cat.items, newAsset]
              return { ...prev, [category]: cat }
            })
            setActiveCategory(category)
            return
          }

          // 云素材拖入处理
          const cloudPayload = readCloudAssetDrag(e.dataTransfer)
          if (cloudPayload) {
            e.preventDefault()
            e.stopPropagation()
            const category = resolveCategoryId(inferAssetLibraryCategory(cloudPayload.assetType))
            // 保存稳定的云素材引用，使用时再换取可用 URL
            const cloudPath = `cloud://team/${cloudPayload.teamId}/asset/${cloudPayload.assetId}`
            const mimeMap: Record<string, string> = {
              image: 'image/jpeg',
              video: 'video/mp4',
              audio: 'audio/mpeg',
              document: 'application/pdf'
            }
            const newAsset = {
              id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: cloudPayload.name,
              type: mimeMap[cloudPayload.assetType] || cloudPayload.mimeType,
              path: cloudPath,         // 始终保存稳定的 cloud:// 引用，不保存临时签名 URL
              addedAt: Date.now(),
              cloudAssetId: cloudPayload.assetId,
              teamId: cloudPayload.teamId,
              ossKey: cloudPayload.ossKey || null,
              source: 'cloud'
            }
            setAssets((prev: Record<string, any>) => {
              const cat = normalizeCategory(prev[category])
              cat.items = [...cat.items, newAsset]
              return { ...prev, [category]: cat }
            })
            // 自动切换到目标分类
            setActiveCategory(category)
            return
          }
          handleExternalFileDrop(e, null)
        }}
      >
        <div className="flex-1 flex flex-col asset-panel overflow-hidden min-h-0">
          {/* 鏂囦欢澶硅 + 闈㈠寘灞?*/}
          <div ref={folderBarRef} className="flex items-center gap-1.5 px-3 py-3 border-b border-[var(--border-color)]/30 shrink-0 overflow-x-auto custom-scrollbar">
            {openFolder ? (
              /* 闈㈠寘灞戝鑸?*/
              <div className="flex items-center gap-1 text-xs">
                <button
                  onClick={() => setOpenFolderId(null)}
                  className="text-[var(--primary-color)] hover:underline font-medium"
                >
                  {CATEGORIES.find((c) => c.id === activeCategory)?.label}
                </button>
                <ChevronRight size={12} className="text-[var(--text-muted)]" />
                <span className="text-[var(--text-primary)] font-medium">
                  {openFolder.name}
                  <span className="text-[var(--text-muted)] ml-1">({openFolder.items.length})</span>
                </span>
              </div>
            ) : (
              /* 鏂囦欢澶瑰崱鐗囧垪琛?*/
              <>
                {catData.folders.map((folder) => (
                  <div
                    key={folder.id}
                    className={`group/folder flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-[var(--bg-base)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shrink-0 ${
                      dragOverFolderId === folder.id
                        ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/10'
                        : 'border-[var(--border-color)] hover:border-[var(--primary-color)]/40'
                    }`}
                    draggable
                    onDragStart={(e) => {
                      clearDragState()
                      const allPaths = folder.items.filter((a) => a.path).map((a) => a.path)
                      e.dataTransfer.setData('asset-paths', JSON.stringify(allPaths))
                      e.dataTransfer.setData('asset-type', 'folder')
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onDragEnd={clearDragState}
                    onDragOver={(e) => {
                      e.preventDefault()
                      const hasFiles = e.dataTransfer.types.includes('Files')
                      e.dataTransfer.dropEffect = hasFiles ? 'copy' : 'move'
                      setDragOverFolderId(folder.id)
                    }}
                    onDragLeave={() => setDragOverFolderId(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const assetId = e.dataTransfer.getData('asset-id')
                      if (assetId) {
                        // 鍐呴儴璧勪骇鎷栧埌鏂囦欢澶?                      handleDropToFolder(folder.id, assetId)
                      } else if (e.dataTransfer.files?.length > 0) {
                        // 澶栭儴鏂囦欢鎷栧叆鏂囦欢澶癸細鐩存帴浼犲叆 folder.id
                        handleExternalFileDrop(e, folder.id)
                      }
                      clearDragState()
                    }}
                    onClick={() => setOpenFolderId(folder.id)}
                  >
                    {renamingFolderId === folder.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') handleRenameFolder(folder.id)
                          if (e.key === 'Escape') setRenamingFolderId(null)
                        }}
                        onBlur={() => handleRenameFolder(folder.id)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-16 asset-library-text-control bg-transparent outline-none border-b border-[var(--primary-color)] text-[var(--text-primary)]"
                      />
                    ) : (
                      <>
                        <FolderPlus size={12} className="text-[var(--text-muted)] shrink-0" />
                        <span className="asset-library-text-control font-medium text-[var(--text-primary)] max-w-[60px] truncate">
                          {folder.name}
                        </span>
                        <span className="asset-library-text-count text-[var(--text-muted)]">
                          ({folder.items.length})
                        </span>
                      </>
                    )}
                    {/* 鏂囦欢澶规搷浣滄寜閽?*/}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover/folder:opacity-100 transition-opacity ml-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenamingFolderId(folder.id)
                          setRenameValue(folder.name)
                        }}
                        className="p-0.5 rounded hover:bg-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        title="重命名"
                      >
                        <Edit size={9} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteFolder(folder.id)
                        }}
                        className="p-0.5 rounded hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400"
                        title="删除文件夹"
                      >
                        <Trash2 size={9} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* 鏂板缓鏂囦欢澶?*/}
                {creatingFolder ? (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--primary-color)]/50 bg-[var(--bg-base)] shrink-0">
                    <FolderPlus size={12} className="text-[var(--primary-color)] shrink-0" />
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') handleCreateFolder()
                        if (e.key === 'Escape') {
                          setCreatingFolder(false)
                          setNewFolderName('')
                        }
                      }}
                      onBlur={() => {
                        if (newFolderName.trim()) handleCreateFolder()
                        else setCreatingFolder(false)
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      placeholder="文件夹名称"
                      className="w-20 asset-library-text-control bg-transparent outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setCreatingFolder(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-[var(--border-color)] hover:border-[var(--primary-color)] text-[var(--text-muted)] hover:text-[var(--primary-color)] transition-colors shrink-0"
                    title="新建文件夹"
                  >
                    <Plus size={10} />
                    <span className="asset-library-text-control">新建</span>
                  </button>
                )}
              </>
            )}
          </div>

          {/* 璧勪骇灞曠ず鍖?*/}
          <div className="flex items-center gap-2 border-b border-[var(--border-color)]/30 px-3 py-2 shrink-0">
            <span className="asset-library-text-control font-medium text-[var(--text-muted)]">缩略图</span>
            <input
              type="range"
              min={MIN_ASSET_TILE_SIZE}
              max={MAX_ASSET_TILE_SIZE}
              step={8}
              value={assetTileSize}
              onChange={(e) => setAssetTileSize(clampAssetTileSize(e.target.value))}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="h-1.5 flex-1 cursor-pointer"
              style={{ accentColor: 'var(--primary-color)' }}
              aria-label="资产缩略图大小"
            />
            <span className="w-10 text-right asset-library-text-control tabular-nums text-[var(--text-secondary)]">
              {assetTileSize}px
            </span>
          </div>

          <div
            className="flex-1 overflow-y-auto custom-scrollbar p-3 min-h-0"
            data-onboarding="asset-grid"
            onWheel={(e) => {
              if (!e.ctrlKey && !e.metaKey) return
              e.preventDefault()
              e.stopPropagation()
              setAssetTileSize((prev) => clampAssetTileSize(prev - Math.sign(e.deltaY) * 8))
            }}
          >
            {displayItems.length === 0 ? (
              <div
                className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)] transition-colors"
                onClick={handleImport}
              >
                <FolderPlus size={32} className="mb-2 opacity-40" />
                <p className="text-xs">
                  {openFolder
                    ? `"${openFolder.name}" 为空，点击导入添加文件`
                    : '暂无资产，点击导入添加文件'}
                </p>
              </div>
            ) : (
              <div
                className="grid justify-start gap-2"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${assetTileSize}px, ${assetTileSize}px))`
                }}
              >
                {displayItems.map((a) => renderAssetItem(a, !!openFolder))}
                {/* + 鍙峰鍏ユ寜閽?*/}
                <div
                  onClick={handleImport}
                  className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-[var(--border-color)] hover:border-[var(--primary-color)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                >
                  <Plus size={18} className="text-[var(--text-muted)]" />
                </div>
              </div>
            )}
          </div>

          {/* 搴曢儴鍒嗙被鏍囩 + 鎿嶄綔鎸夐挳 */}
          <div
            className="flex items-center shrink-0 border-t border-[var(--border-color)]/50"
            data-onboarding="asset-tabs"
          >
            {CATEGORIES.map((cat) => {
              const catInfo = normalizeCategory(assets[cat.id])
              const totalCount =
                catInfo.items.length + catInfo.folders.reduce((s, f) => s + f.items.length, 0)
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all border-t-2 ${
                    activeCategory === cat.id
                      ? 'text-[var(--primary-color)] bg-[var(--primary-color)]/8 border-[var(--primary-color)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border-transparent'
                  }`}
                >
                  <cat.icon size={14} />
                  <span>{cat.label}</span>
                  {totalCount > 0 && (
                    <span className="asset-library-text-count px-1 py-0.5 rounded-full bg-[var(--bg-base)] text-[var(--text-muted)]">
                      {totalCount}
                    </span>
                  )}
                </button>
              )
            })}
            <button
              onClick={handleImport}
              className="px-3 py-2 text-[var(--text-muted)] hover:text-[var(--primary-color)] transition-colors"
              title="导入"
              data-onboarding="asset-upload"
            >
              <Upload size={14} />
            </button>
            <button
              onClick={() => setAssetLibraryOpen(false)}
              className="px-3 py-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="关闭"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* 澶у浘棰勮寮圭獥 - 鐢?portal 娓叉煋鍒?body 閬垮厤鐖?transform 褰卞搷 fixed 瀹氫綅 */}
        {previewUrl &&
          createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
              onClick={() => {
                setPreviewUrl(null)
                setPreviewType(null)
              }}
            >
              <div className="relative max-w-[80vw] max-h-[80vh]">
                {previewType === 'video' ? (
                  <video
                    src={previewUrl}
                    controls
                    autoPlay
                    loop
                    className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="preview"
                    className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <button
                  onClick={() => {
                    setPreviewUrl(null)
                    setPreviewType(null)
                  }}
                  className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>,
            document.body
          )}
      </div>
    </FloatingPanel>
  )
}

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ThumbnailImage } from './ThumbnailImage.jsx'
import {
  FolderPlus,
  Upload,
  Trash2,
  X,
  Users,
  Image,
  Film,
  Music,
  Plus,
  ChevronRight,
  Edit
} from '../../utils/icons.jsx'
import { useAppStore } from '../../store/useAppStore.js'
import { getXingheMediaSrc } from '../../utils/fileHelpers.js'

const CATEGORIES = [
  { id: 'characters', label: '人物', icon: Users },
  { id: 'scenes', label: '场景', icon: Image },
  { id: 'materials', label: '素材', icon: Film },
  { id: 'audio', label: '音频', icon: Music }
]

// 新格式：每个分类 { folders: [...], items: [...] }
const EMPTY_CATEGORY = { folders: [], items: [] }

function getStorageKey(projectId) {
  return projectId ? `tapnow_asset_library_${projectId}` : 'tapnow_asset_library'
}

function loadAssets(projectId) {
  try {
    const key = getStorageKey(projectId)
    const data = localStorage.getItem(key)
    if (!data) {
      return {
        characters: { ...EMPTY_CATEGORY },
        scenes: { ...EMPTY_CATEGORY },
        materials: { ...EMPTY_CATEGORY },
        audio: { ...EMPTY_CATEGORY }
      }
    }
    const parsed = JSON.parse(data)

    // 数据迁移：旧格式（纯数组）→ 新格式（folders + items）
    const migrated = {}
    for (const catId of ['characters', 'scenes', 'materials', 'audio']) {
      const catData = parsed[catId]
      if (Array.isArray(catData)) {
        // 旧格式：平铺数组 → 全部放入 items
        migrated[catId] = { folders: [], items: catData }
      } else if (catData && typeof catData === 'object') {
        migrated[catId] = {
          folders: catData.folders || [],
          items: catData.items || []
        }
      } else {
        migrated[catId] = { ...EMPTY_CATEGORY }
      }
    }
    return migrated
  } catch {
    return {
      characters: { ...EMPTY_CATEGORY },
      scenes: { ...EMPTY_CATEGORY },
      materials: { ...EMPTY_CATEGORY },
      audio: { ...EMPTY_CATEGORY }
    }
  }
}

function saveAssets(projectId, assets) {
  const key = getStorageKey(projectId)
  localStorage.setItem(key, JSON.stringify(assets))
}

export function AssetLibrary() {
  const assetLibraryOpen = useAppStore((state) => state.assetLibraryOpen)
  const setAssetLibraryOpen = useAppStore((state) => state.setAssetLibraryOpen)
  const currentProject = useAppStore((state) => state.currentProject)

  const [activeCategory, setActiveCategory] = useState('characters')
  const [assets, setAssets] = useState(() => loadAssets(currentProject?.id))
  const [openFolderId, setOpenFolderId] = useState(null)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [dragOverFolderId, setDragOverFolderId] = useState(null)
  const [isDragOverPanel, setIsDragOverPanel] = useState(false)

  const prevProjectRef = useRef(currentProject?.id)

  useEffect(() => {
    if (prevProjectRef.current !== currentProject?.id) {
      // 发生项目切换：重新加载新项目资产，并阻断保存老数据
      prevProjectRef.current = currentProject?.id
      setAssets(loadAssets(currentProject?.id))
      setOpenFolderId(null)
      return
    }
    // 未发生项目切换：正常持久化当前状态
    saveAssets(currentProject?.id, assets)
  }, [assets, currentProject?.id])

  // 监听外部添加资产事件（OutputResultsPanel 通过 localStorage 直接写入后会触发此事件）
  useEffect(() => {
    const handleExternalUpdate = () =>
      setAssets(loadAssets(useAppStore.getState().currentProject?.id))
    window.addEventListener('asset-library-updated', handleExternalUpdate)
    return () => window.removeEventListener('asset-library-updated', handleExternalUpdate)
  }, [])

  // 切换分类时关闭文件夹
  useEffect(() => {
    setOpenFolderId(null)
    setCreatingFolder(false)
  }, [activeCategory])

  const catData = assets[activeCategory] || EMPTY_CATEGORY

  // 当前展开的文件夹
  const openFolder = openFolderId ? catData.folders.find((f) => f.id === openFolderId) : null

  // ========== 文件导入 ==========
  const handleImport = useCallback(async () => {
    const fileFilters =
      activeCategory === 'audio'
        ? [{ name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] }]
        : activeCategory === 'materials'
          ? [
              {
                name: '媒体文件',
                extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov']
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
      const cat = { ...prev[activeCategory] }
      if (openFolderId) {
        // 导入到展开的文件夹中
        cat.folders = cat.folders.map((f) =>
          f.id === openFolderId ? { ...f, items: [...f.items, ...newAssets] } : f
        )
      } else {
        // 导入到散落区
        cat.items = [...cat.items, ...newAssets]
      }
      return { ...prev, [activeCategory]: cat }
    })
  }, [activeCategory, openFolderId])

  // ========== 删除资产 ==========
  const handleDelete = useCallback(
    (assetId) => {
      setAssets((prev) => {
        const cat = { ...prev[activeCategory] }
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

  // ========== 文件夹 CRUD ==========
  const handleCreateFolder = useCallback(() => {
    const name = newFolderName.trim()
    if (!name) return
    setAssets((prev) => {
      const cat = { ...prev[activeCategory] }
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
      if (!confirm('删除文件夹将同时删除其中所有资产，确定？')) return
      setAssets((prev) => {
        const cat = { ...prev[activeCategory] }
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
        const cat = { ...prev[activeCategory] }
        cat.folders = cat.folders.map((f) => (f.id === folderId ? { ...f, name } : f))
        return { ...prev, [activeCategory]: cat }
      })
      setRenamingFolderId(null)
      setRenameValue('')
    },
    [activeCategory, renameValue]
  )

  // ========== 散落图拖入文件夹 ==========
  const handleDropToFolder = useCallback(
    (folderId, assetId) => {
      setAssets((prev) => {
        const cat = { ...prev[activeCategory] }
        const asset = cat.items.find((a) => a.id === assetId)
        if (!asset) return prev
        // 从散落区移除
        cat.items = cat.items.filter((a) => a.id !== assetId)
        // 添加到文件夹
        cat.folders = cat.folders.map((f) =>
          f.id === folderId ? { ...f, items: [...f.items, asset] } : f
        )
        return { ...prev, [activeCategory]: cat }
      })
      setDragOverFolderId(null)
    },
    [activeCategory]
  )

  // ========== 外部文件拖入 ==========
  // 使用与 ReactFlowCanvas 相同的策略：IPC cache:copy-file → xinghe:// URL
  // 失败则 FileReader + cache:save-cache 降级；不再直接依赖 file.path 展示
  const handleExternalFileDrop = useCallback(
    async (e, targetFolderId) => {
      e.preventDefault()
      e.stopPropagation()
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return

      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
      const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
      const videoExts = ['mp4', 'webm', 'mov']
      const fileArray = Array.from(files)
      const newAssets = []

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        const name = file.name || 'unknown'
        const ext = name.split('.').pop()?.toLowerCase() || ''

        // 按分类过滤类型
        if (activeCategory === 'audio' && !audioExts.includes(ext)) continue
        if ((activeCategory === 'characters' || activeCategory === 'scenes') && !imageExts.includes(ext)) continue
        if (activeCategory === 'materials' && !imageExts.includes(ext) && !videoExts.includes(ext)) continue

        const cacheType = audioExts.includes(ext) ? 'audio' : 'image'
        let finalPath = null

        try {
          // 策略一：IPC 让主进程复制文件（需要 file.path 可用）
          if (file.path) {
            const res = await window.api.invoke('cache:copy-file', {
              id: `asset_${Date.now()}_${i}`,
              sourcePath: file.path,
              category: 'asset_library',
              type: cacheType
            })
            if (res?.success && res.path) {
              finalPath = res.path
            }
          }
          // 策略二：FileReader 读取 → 主进程保存
          if (!finalPath) {
            const base64 = await new Promise((res, rej) => {
              const reader = new FileReader()
              reader.onload = (ev) => res(ev.target.result)
              reader.onerror = rej
              reader.readAsDataURL(file)
            })
            const res = await window.api.localCacheAPI.saveCache({
              id: `asset_${Date.now()}_${i}`,
              content: base64,
              category: 'asset_library',
              ext: `.${ext}`,
              type: cacheType
            })
            if (res?.success && res.path) {
              finalPath = res.path
            }
          }
        } catch (err) {
          console.error('[AssetLibrary] 处理拖入文件异常:', name, err)
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
        const cat = { ...prev[activeCategory] }
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


  // ========== 当前显示的资产列表 ==========
  const displayItems = openFolder ? openFolder.items : catData.items

  // ========== 渲染资产网格项 ==========
  const renderAssetItem = (asset) => (
    <div
      key={asset.id}
      data-asset-item
      className="group relative flex flex-col items-center p-1 hover:bg-[var(--bg-hover)] transition-colors cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('asset-path', asset.path)
        e.dataTransfer.setData('asset-type', asset.type || '')
        e.dataTransfer.setData('asset-id', asset.id)
        e.dataTransfer.effectAllowed = 'copyMove'
      }}
      onDoubleClick={() => {
        if (asset.type?.startsWith('image/') && asset.path) {
          setPreviewUrl(getXingheMediaSrc(asset.path))
        }
      }}
    >
      <div className="relative w-full aspect-square overflow-hidden bg-[var(--bg-base)] flex items-center justify-center text-[var(--text-muted)] mb-0.5">
        {asset.type?.startsWith('image/') && asset.path ? (
          <>
            <ThumbnailImage
              src={asset.path}
              alt={asset.name}
              className="w-full h-full object-cover"
              onLoad={(e) => {
                const nw = e.target.naturalWidth
                const nh = e.target.naturalHeight
                if (nw && nh) {
                  const dimEl = e.target
                    .closest('[data-asset-item]')
                    ?.querySelector('[data-dim-label]')
                  if (dimEl) dimEl.textContent = `${nw}x${nh}`
                }
              }}
            />
            <div
              data-dim-label
              className="absolute bottom-0.5 right-0.5 bg-black/60 backdrop-blur-sm text-white text-[7px] px-1 py-0 rounded font-mono pointer-events-none border border-white/10"
            ></div>
          </>
        ) : asset.type?.startsWith('audio/') ? (
          <Music size={14} className="opacity-40" />
        ) : asset.type?.startsWith('video/') ? (
          <>
            <Film size={14} className="opacity-40" />
          </>
        ) : (
          <Image size={14} className="opacity-40" />
        )}
      </div>
      <span className="text-[8px] text-[var(--text-secondary)] truncate w-full text-center">
        {asset.name}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          handleDelete(asset.id)
        }}
        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/50 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
      >
        <Trash2 size={8} />
      </button>
    </div>
  )

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-30 transition-all duration-300 ease-in-out ${
        assetLibraryOpen
          ? 'translate-y-0 opacity-100'
          : '-translate-y-full opacity-0 pointer-events-none'
      } ${isDragOverPanel ? 'ring-2 ring-inset ring-[var(--primary-color)]' : ''}`}
      style={{ height: '18vh' }}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'copy'
        setIsDragOverPanel(true)
      }}
      onDragLeave={(e) => {
        // 只有真正离开面板时才取消高亮（relatedTarget 不在面板内）
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsDragOverPanel(false)
        }
      }}
      onDrop={(e) => {
        setIsDragOverPanel(false)
        handleExternalFileDrop(e)
      }}
    >
      <div className="h-full flex flex-col bg-[var(--bg-secondary)] backdrop-blur-md border-b border-[var(--border-color)] shadow-xl">
        {/* 文件夹行 + 面包屑 */}
        <div className="flex items-center gap-1.5 px-3 py-3 border-b border-[var(--border-color)]/30 shrink-0 overflow-x-auto custom-scrollbar">
          {openFolder ? (
            /* 面包屑导航 */
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
            /* 文件夹卡片列表 */
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
                    const allPaths = folder.items.filter((a) => a.path).map((a) => a.path)
                    e.dataTransfer.setData('asset-paths', JSON.stringify(allPaths))
                    e.dataTransfer.setData('asset-type', 'folder')
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    // 不调用 stopPropagation，让外层面板也能感知到拖拽（用于 isDragOverPanel 高亮）
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
                      // 内部资产拖到文件夹
                      handleDropToFolder(folder.id, assetId)
                    } else if (e.dataTransfer.files?.length > 0) {
                      // 外部文件拖入文件夹：直接传入 folder.id
                      handleExternalFileDrop(e, folder.id)
                    }
                    setDragOverFolderId(null)
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
                      className="w-16 text-[10px] bg-transparent outline-none border-b border-[var(--primary-color)] text-[var(--text-primary)]"
                    />
                  ) : (
                    <>
                      <FolderPlus size={12} className="text-[var(--text-muted)] shrink-0" />
                      <span className="text-[10px] font-medium text-[var(--text-primary)] max-w-[60px] truncate">
                        {folder.name}
                      </span>
                      <span className="text-[9px] text-[var(--text-muted)]">
                        ({folder.items.length})
                      </span>
                    </>
                  )}
                  {/* 文件夹操作按钮 */}
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

              {/* 新建文件夹 */}
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
                    className="w-20 text-[10px] bg-transparent outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setCreatingFolder(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-[var(--border-color)] hover:border-[var(--primary-color)] text-[var(--text-muted)] hover:text-[var(--primary-color)] transition-colors shrink-0"
                  title="新建文件夹"
                >
                  <Plus size={10} />
                  <span className="text-[10px]">新建</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* 资产展示区 */}
        <div
          className="flex-1 overflow-y-auto custom-scrollbar p-3 min-h-0"
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
            <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-16 xl:grid-cols-20 gap-1">
              {displayItems.map((a) => renderAssetItem(a, !!openFolder))}
              {/* + 号导入按钮 */}
              <div
                onClick={handleImport}
                className="flex flex-col items-center justify-center p-1.5 rounded-lg border-2 border-dashed border-[var(--border-color)] hover:border-[var(--primary-color)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer aspect-square"
              >
                <Plus size={18} className="text-[var(--text-muted)]" />
              </div>
            </div>
          )}
        </div>

        {/* 底部分类标签 + 操作按钮 */}
        <div className="flex items-center shrink-0 border-t border-[var(--border-color)]/50">
          {CATEGORIES.map((cat) => {
            const catInfo = assets[cat.id]
            const totalCount = catInfo
              ? catInfo.items.length + catInfo.folders.reduce((s, f) => s + f.items.length, 0)
              : 0
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all ${
                  activeCategory === cat.id
                    ? 'text-[var(--primary-color)] bg-[var(--primary-color)]/10 border-t-2 border-[var(--primary-color)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border-t-2 border-transparent'
                }`}
              >
                <cat.icon size={14} />
                <span>{cat.label}</span>
                {totalCount > 0 && (
                  <span className="text-[9px] px-1 py-0.5 rounded-full bg-[var(--bg-base)] text-[var(--text-muted)]">
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

      {/* 大图预览弹窗 - 用 portal 渲染到 body 避免父 transform 影响 fixed 定位 */}
      {previewUrl &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setPreviewUrl(null)}
          >
            <div className="relative max-w-[80vw] max-h-[80vh]">
              <img
                src={previewUrl}
                alt="preview"
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              />
              <button
                onClick={() => setPreviewUrl(null)}
                className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

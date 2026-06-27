import { useEffect, useMemo, useState } from 'react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { VideoThumbnail } from '../../components/ui/VideoThumbnail'
import { useAppStore } from '../../store/useAppStore'
import { favoritesApi } from '../../services/cloud'
import { getXingheMediaSrc } from '../../utils/fileHelpers'
import {
  createFavoriteFolder,
  deleteFavoriteFolder,
  deleteFavoriteItem,
  moveFavoriteItem,
  PERSONAL_FAVORITES_EVENT,
  readFavoritesState,
  renameFavoriteFolder,
  renameFavoriteItem
} from './favoritesStore'

function resolveMediaType(item: any) {
  if (item?.type?.startsWith?.('video')) return 'video'
  if (item?.type?.startsWith?.('audio')) return 'audio'
  return item?.type || 'image'
}

function asNumber(value: any) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : undefined
}

export function FavoriteLibraryPanel() {
  const open = useAppStore((state) => state.favoriteLibraryOpen)
  const setOpen = useAppStore((state) => state.setFavoriteLibraryOpen)
  const [state, setState] = useState(() => readFavoritesState())
  const [activeFolderId, setActiveFolderId] = useState('root')
  const [folderName, setFolderName] = useState('')
  const [editingFolderId, setEditingFolderId] = useState('')
  const [editingFolderName, setEditingFolderName] = useState('')
  const [editingItemId, setEditingItemId] = useState('')
  const [editingName, setEditingName] = useState('')
  const [toast, setToast] = useState('')

  const refresh = () => setState(readFavoritesState())

  useEffect(() => {
    if (!open) return
    refresh()
    const onUpdate = () => refresh()
    window.addEventListener(PERSONAL_FAVORITES_EVENT, onUpdate)
    return () => window.removeEventListener(PERSONAL_FAVORITES_EVENT, onUpdate)
  }, [open])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 1600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const folders = state.folders || []
  const items = useMemo(
    () => (state.items || []).filter((item: any) => (item.folderId || 'root') === activeFolderId),
    [state.items, activeFolderId]
  )

  const addFolder = () => {
    const result = createFavoriteFolder(folderName)
    if (result.success) {
      setFolderName('')
      refresh()
    } else {
      setToast(result.error || '创建文件夹失败')
    }
  }

  const saveFolderRename = (folderId: string) => {
    const result = renameFavoriteFolder(folderId, editingFolderName)
    setEditingFolderId('')
    setEditingFolderName('')
    if (!result.success) setToast(result.error || '重命名失败')
    refresh()
  }

  const saveItemRename = (itemId: string) => {
    const result = renameFavoriteItem(itemId, editingName)
    setEditingItemId('')
    setEditingName('')
    if (!result.success) setToast(result.error || '重命名失败')
    refresh()
  }

  const dropItemToFolder = (event: React.DragEvent, folderId: string) => {
    event.preventDefault()
    const itemId = event.dataTransfer.getData('application/x-favorite-item-id')
    if (!itemId) return
    moveFavoriteItem(itemId, folderId)
    setActiveFolderId(folderId)
    refresh()
    setToast('已移动到文件夹')
  }

  const removeFolder = (folderId: string) => {
    const result = deleteFavoriteFolder(folderId)
    if (!result.success) {
      setToast(result.error || '删除失败')
      return
    }
    if (activeFolderId === folderId) setActiveFolderId('root')
    refresh()
  }

  const uploadToCloud = async (item: any) => {
    const projectId = asNumber(item?.sourceMeta?.projectId || item?.sourceMeta?.cloudProjectId)
    const episodeId = asNumber(item?.sourceMeta?.episodeId || item?.sourceMeta?.cloudEpisodeId)
    const shotId = asNumber(item?.sourceMeta?.shotId || item?.sourceMeta?.cloudShotId)
    const categoryId = asNumber(item?.sourceMeta?.categoryId || item?.sourceMeta?.cloudCategoryId)
    if (!projectId) {
      setToast('这个素材缺少云端项目上下文')
      return
    }

    try {
      const favorite = await favoritesApi.createAsset({
        name: item.name || '收藏素材',
        asset_type: resolveMediaType(item),
        url: item.url,
        object_key: item.objectKey || item.ossKey || item.sourceMeta?.objectKey || item.url,
        thumb_url: item.thumbUrl || item.thumbnailUrl || item.url,
        prompt: item.prompt || '',
        model: item.modelName || item.model || '',
        duration_ms: item.durationMs || null,
        request_id: item.requestId || '',
        task_id: item.taskId || item.remoteTaskId || '',
        width: item.width || null,
        height: item.height || null,
        source_meta: item.sourceMeta || {}
      })
      await favoritesApi.copyToProject(favorite.id, {
        project_id: projectId,
        episode_id: episodeId,
        shot_id: shotId,
        category_id: categoryId,
        status: 'pending'
      })
      useAppStore.getState().setCloudAssetsOpen?.(true)
      setToast('已复制到本集团队云素材库')
    } catch (error) {
      console.warn('[FavoriteLibraryPanel] upload to cloud failed:', error)
      setToast('上传云素材库失败，请检查登录和云端连接')
    }
  }

  return (
    <FloatingPanel
      open={open}
      onClose={() => setOpen(false)}
      title="收藏夹"
      icon="☆"
      defaultX={92}
      defaultY={92}
      width={440}
      minWidth={360}
      minHeight={320}
      maxHeight="76vh"
    >
      <div className="flex min-h-0 flex-1 bg-[var(--bg-panel)]/80 text-xs text-[var(--text-primary)]">
        <aside className="w-36 shrink-0 border-r border-[var(--border-subtle)] p-2">
          {folders.map((folder: any) => {
            const count = (state.items || []).filter((item: any) => (item.folderId || 'root') === folder.id).length
            return (
              <div
                key={folder.id}
                className={`mb-1 rounded-lg ${activeFolderId === folder.id ? 'bg-[var(--primary-color)]/15 text-[var(--primary-color)]' : 'hover:bg-white/10'}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropItemToFolder(event, folder.id)}
              >
                {editingFolderId === folder.id ? (
                  <input
                    autoFocus
                    value={editingFolderName}
                    onChange={(event) => setEditingFolderName(event.target.value)}
                    onBlur={() => saveFolderRename(folder.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveFolderRename(folder.id)
                      if (event.key === 'Escape') setEditingFolderId('')
                    }}
                    className="w-full rounded-lg border border-white/10 bg-white/10 px-2 py-2 outline-none"
                  />
                ) : (
                  <button
                    className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left"
                    onClick={() => setActiveFolderId(folder.id)}
                    onDoubleClick={() => {
                      if (folder.id === 'root') return
                      setEditingFolderId(folder.id)
                      setEditingFolderName(folder.name)
                    }}
                    title={folder.id === 'root' ? '默认文件夹' : '双击重命名，拖素材到这里归档'}
                  >
                    <span className="min-w-0 truncate">{folder.name}</span>
                    <span className="shrink-0 text-[10px] opacity-60">{count}</span>
                  </button>
                )}
                {folder.id !== 'root' && activeFolderId === folder.id && !editingFolderId && (
                  <button className="mx-2 mb-2 rounded-md px-2 py-1 text-[10px] text-red-200 hover:bg-red-500/20" onClick={() => removeFolder(folder.id)}>
                    删除文件夹
                  </button>
                )}
              </div>
            )
          })}
          <div className="mt-2 flex gap-1">
            <input
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addFolder()
              }}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/10 px-2 py-1 outline-none"
              placeholder="新文件夹"
            />
            <button className="rounded-lg bg-[var(--primary-color)] px-2 font-bold" onClick={addFolder}>
              +
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-3">
          <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
            <span>{items.length} 个素材</span>
            <span>跟随当前登录账号保存</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {items.map((item: any) => {
              const type = resolveMediaType(item)
              return (
                <article
                  key={item.id}
                  className="group overflow-hidden rounded-xl border border-white/10 bg-white/5"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-favorite-item-id', item.id)
                    event.dataTransfer.setData('asset-path', item.url)
                    event.dataTransfer.setData('asset-type', type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/mpeg' : 'image/png')
                    event.dataTransfer.setData('text/plain', item.prompt || item.name || item.url)
                    event.dataTransfer.effectAllowed = 'copyMove'
                  }}
                >
                  <div className="relative aspect-video bg-black/25">
                    {type === 'video' ? (
                      <VideoThumbnail src={item.url} className="h-full w-full object-cover" />
                    ) : type === 'audio' ? (
                      <div className="flex h-full items-center justify-center text-[var(--text-secondary)]">音频</div>
                    ) : (
                      <img src={getXingheMediaSrc(item.url)} className="h-full w-full object-cover" alt="" />
                    )}
                    <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] text-white">{type}</span>
                  </div>
                  <div className="space-y-2 p-2">
                    {editingItemId === item.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onBlur={() => saveItemRename(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveItemRename(item.id)
                          if (event.key === 'Escape') setEditingItemId('')
                        }}
                        className="w-full rounded-md border border-white/10 bg-white/10 px-2 py-1 outline-none"
                      />
                    ) : (
                      <button
                        className="block w-full truncate text-left font-semibold"
                        onDoubleClick={() => {
                          setEditingItemId(item.id)
                          setEditingName(item.name || '')
                        }}
                        title="双击重命名"
                      >
                        {item.name}
                      </button>
                    )}
                    <select
                      value={item.folderId || 'root'}
                      onChange={(event) => {
                        moveFavoriteItem(item.id, event.target.value)
                        refresh()
                      }}
                      className="w-full rounded-md border border-white/10 bg-white/10 px-2 py-1 outline-none"
                    >
                      {folders.map((folder: any) => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                    <div className="flex gap-1">
                      <button className="flex-1 rounded-md bg-white/10 px-2 py-1 hover:bg-white/15" onClick={() => uploadToCloud(item)}>
                        上传云素材
                      </button>
                      <button
                        className="rounded-md bg-red-500/15 px-2 py-1 text-red-200 hover:bg-red-500/25"
                        onClick={() => {
                          deleteFavoriteItem(item.id)
                          refresh()
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          {items.length === 0 && (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/15 px-6 text-center text-[var(--text-secondary)]">
              右键生成结果选择“添加到收藏夹”，也可以把素材拖到左侧文件夹归档。
            </div>
          )}
        </main>
      </div>
      {toast && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg border border-white/10 bg-black/75 px-3 py-2 text-xs text-white">
          {toast}
        </div>
      )}
    </FloatingPanel>
  )
}

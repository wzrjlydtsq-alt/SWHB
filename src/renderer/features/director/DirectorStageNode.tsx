import { lazy, Suspense, useState, useCallback, useMemo, useEffect } from 'react'
import { NodeShell } from '../../components/nodes/shared/NodeShell.tsx'
import { getXingheMediaSrc } from '../../utils/fileHelpers.ts'
import { addAssetToLibrary } from '../../utils/assetLibrary.ts'
import { useAppStore } from '../../store/useAppStore.ts'
import {
  addImagePathToReferenceNode,
  copyImagePathToClipboard,
  findBestReferenceTargetNodeId
} from '../../utils/snapshotUtils.ts'
import {
  buildDirectorPrompt,
  getDefaultDirectorState,
  sanitizeDirectorState,
  useDirectorStore
} from './useDirectorStore.ts'

const Director3DModal = lazy(() => import('./Director3DModal.tsx'))

const FALLBACK_DIRECTOR_STATE = Object.freeze(getDefaultDirectorState())

export default function DirectorStageNode({ node, updateNodeSettings, deleteNode }) {
  const [show3D, setShow3D] = useState(false)
  const [toast, setToast] = useState(null)

  const directorState = useDirectorStore((state) => state.nodes[node.id] || FALLBACK_DIRECTOR_STATE)
  const ensureNode = useDirectorStore((state) => state.ensureNode)
  const hydrateNode = useDirectorStore((state) => state.hydrateNode)
  const removeNodeStore = useDirectorStore((state) => state.removeNode)

  const snapshotPath = node.settings?.snapshotPath || null
  const normalizedNodeState = useMemo(
    () => sanitizeDirectorState(node.settings?.directorState),
    [node.settings?.directorState]
  )
  const prompt = useMemo(
    () => buildDirectorPrompt(sanitizeDirectorState(directorState)),
    [directorState]
  )
  const backgroundPlate = directorState.backgroundPlate

  useEffect(() => {
    ensureNode(node.id, normalizedNodeState)
    hydrateNode(node.id, normalizedNodeState)
  }, [ensureNode, hydrateNode, node.id, normalizedNodeState])

  useEffect(() => {
    if (!updateNodeSettings) return

    const currentStateJson = JSON.stringify(normalizedNodeState)
    const nextStateJson = JSON.stringify(sanitizeDirectorState(directorState))

    if (currentStateJson !== nextStateJson || node.settings?.prompt !== prompt) {
      updateNodeSettings(node.id, {
        directorState: sanitizeDirectorState(directorState),
        prompt
      })
    }
  }, [
    directorState,
    normalizedNodeState,
    node.id,
    node.settings?.prompt,
    prompt,
    updateNodeSettings
  ])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(timer)
  }, [toast])

  const handleSnapshotSaved = useCallback(
    (path) => {
      if (!path) return
      updateNodeSettings?.(node.id, {
        snapshotPath: path,
        prompt,
        directorState: sanitizeDirectorState(directorState)
      })
      setToast('快照已更新')
    },
    [directorState, node.id, prompt, updateNodeSettings]
  )

  const handleAddSnapshotToReference = useCallback(async () => {
    if (!snapshotPath) return

    try {
      const targetNodeId = findBestReferenceTargetNodeId(node.id)
      if (!targetNodeId) {
        await copyImagePathToClipboard(snapshotPath)
        setToast('没找到下游生图节点，已复制到剪贴板')
        return
      }

      const result = await addImagePathToReferenceNode(targetNodeId, snapshotPath)
      if (!result?.success) {
        throw new Error(result?.error || '加入参考图失败')
      }

      setToast('已加入参考图')
    } catch (error) {
      console.error('导演台快照加入参考图失败:', error)
      setToast('加入参考图失败')
    }
  }, [node.id, snapshotPath])

  const handleSaveSnapshotToAssets = useCallback(() => {
    if (!snapshotPath) return

    const result = addAssetToLibrary({
      category: 'scenes',
      path: snapshotPath,
      name: `director_snapshot_${Date.now()}.png`
    })

    if (result?.success) {
      window.dispatchEvent(new CustomEvent('asset-library-updated'))
      useAppStore.getState().setAssetLibraryOpen?.(true)
      setToast('已加入资产库')
      return
    }

    setToast(result?.error || '加入资产库失败')
  }, [snapshotPath])

  const handleCopySnapshot = useCallback(async () => {
    if (!snapshotPath) return

    try {
      await copyImagePathToClipboard(snapshotPath)
      setToast('快照已复制到剪贴板')
    } catch (error) {
      console.error('复制导演台快照失败:', error)
      setToast('复制失败')
    }
  }, [snapshotPath])

  return (
    <>
      <NodeShell
        icon={<span>🎬</span>}
        title="3D 导演台"
        onDelete={() => {
          removeNodeStore(node.id)
          deleteNode?.(node.id)
        }}
        footer={null}
        width={360}
      >
        {backgroundPlate?.path && (
          <div className="nodrag nopan relative" onMouseDown={(event) => event.stopPropagation()}>
            <img
              src={getXingheMediaSrc(backgroundPlate.path)}
              alt="导演台底图"
              className="h-24 w-full rounded-lg border border-[var(--border-color)] object-contain bg-black/20"
            />
            <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white/85">
              底图
            </div>
          </div>
        )}

        {snapshotPath && (
          <div className="nodrag nopan relative" onMouseDown={(event) => event.stopPropagation()}>
            <img
              src={getXingheMediaSrc(snapshotPath)}
              alt="导演台快照"
              className="w-full rounded-lg border border-[var(--border-color)]"
            />
            <div className="absolute bottom-1 right-1 flex gap-1">
              <button
                type="button"
                onClick={handleAddSnapshotToReference}
                onMouseDown={(event) => event.stopPropagation()}
                className="rounded bg-blue-500/70 px-1.5 py-0.5 text-[9px] text-white transition-all hover:bg-blue-500"
              >
                参考图
              </button>
              <button
                type="button"
                onClick={handleSaveSnapshotToAssets}
                onMouseDown={(event) => event.stopPropagation()}
                className="rounded bg-emerald-500/70 px-1.5 py-0.5 text-[9px] text-white transition-all hover:bg-emerald-500"
              >
                资产库
              </button>
              <button
                type="button"
                onClick={handleCopySnapshot}
                onMouseDown={(event) => event.stopPropagation()}
                className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white/90 transition-all hover:bg-black/80"
              >
                复制
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShow3D(true)}
          onMouseDown={(event) => event.stopPropagation()}
          className="nodrag nopan w-full rounded-lg border border-violet-500/30 bg-gradient-to-r from-violet-500/20 to-blue-500/20 py-2 text-xs font-semibold text-violet-400 transition-all hover:from-violet-500/30 hover:to-blue-500/30 active:scale-[0.98]"
        >
          打开 3D 舞台
        </button>
      </NodeShell>

      {show3D && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90">
              <div className="animate-pulse text-sm text-white">加载 3D 引擎中...</div>
            </div>
          }
        >
          <Director3DModal
            nodeId={node.id}
            onClose={() => setShow3D(false)}
            onSnapshotSaved={handleSnapshotSaved}
          />
        </Suspense>
      )}

      {toast && (
        <div className="fixed top-5 left-1/2 z-[10000] -translate-x-1/2 rounded-lg border border-white/10 bg-black/70 px-4 py-2 text-xs text-white/90 shadow-[var(--shadow-lg)]">
          {toast}
        </div>
      )}
    </>
  )
}

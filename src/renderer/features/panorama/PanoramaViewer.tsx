/**
 * PanoramaViewer — CSS 3D 圆柱投影全景查看器
 *
 * - 4:1 全景图拆分为圆柱面片
 * - 支持指针拖拽/惯性/自动旋转
 * - 当前视角快照可加入资产库、加入参考图、复制、另存为
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { getXingheMediaSrc } from '../../utils/fileHelpers.ts'
import { useAppStore } from '../../store/useAppStore.ts'
import {
  addSnapshotToAssetLibrary,
  addSnapshotToReferenceImages,
  copyImagePathToClipboard,
  saveDataUrlToLocalCache
} from '../../utils/snapshotUtils.ts'

const SEGMENTS = 12
const DEFAULT_RADIUS = 500

export function PanoramaViewer({ open, imageUrl, sourceNodeId, onClose }) {
  const [rotateY, setRotateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [autoRotate, setAutoRotate] = useState(true)
  const [toast, setToast] = useState(null)
  const lastX = useRef(0)
  const velocity = useRef(0)
  const animRef = useRef(null)
  const draggingRef = useRef(false)

  const resolvedImageUrl = imageUrl ? getXingheMediaSrc(imageUrl) : ''

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!open) return
    setRotateY(0)
    setIsDragging(false)
    setAutoRotate(true)
    velocity.current = 0
  }, [open, imageUrl])

  useEffect(() => {
    if (!open || !autoRotate || isDragging) return
    let raf
    const tick = () => {
      setRotateY((value) => value + 0.15)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open, autoRotate, isDragging])

  useEffect(() => {
    if (!open || isDragging || autoRotate) return
    const tick = () => {
      if (Math.abs(velocity.current) < 0.01) return
      velocity.current *= 0.95
      setRotateY((value) => value + velocity.current)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [open, isDragging, autoRotate])

  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    draggingRef.current = true
    setIsDragging(true)
    setAutoRotate(false)
    lastX.current = e.clientX
    velocity.current = 0
  }, [])

  const handlePointerMove = useCallback((e) => {
    if (!draggingRef.current) return
    const delta = (e.clientX - lastX.current) * 0.3
    velocity.current = delta
    setRotateY((value) => value + delta)
    lastX.current = e.clientX
  }, [])

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (!open) return
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [open, handlePointerMove, handlePointerUp])

  const captureSnapshot = useCallback(async () => {
    if (!resolvedImageUrl) return null

    try {
      const canvas = document.createElement('canvas')
      canvas.width = 1920
      canvas.height = 1080
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = resolvedImageUrl
      })

      const normalizedRotation = ((rotateY % 360) + 360) % 360
      const viewportFraction = 0.25
      const sourceX = (normalizedRotation / 360) * img.width
      const sourceW = img.width * viewportFraction

      if (sourceX + sourceW <= img.width) {
        ctx.drawImage(img, sourceX, 0, sourceW, img.height, 0, 0, canvas.width, canvas.height)
      } else {
        const firstW = img.width - sourceX
        const firstCanvasW = (firstW / sourceW) * canvas.width
        ctx.drawImage(img, sourceX, 0, firstW, img.height, 0, 0, firstCanvasW, canvas.height)
        const secondW = sourceW - firstW
        ctx.drawImage(
          img,
          0,
          0,
          secondW,
          img.height,
          firstCanvasW,
          0,
          canvas.width - firstCanvasW,
          canvas.height
        )
      }

      return canvas.toDataURL('image/png')
    } catch (error) {
      console.error('全景快照失败:', error)
      setToast('全景快照失败')
      return null
    }
  }, [resolvedImageUrl, rotateY])

  const persistSnapshot = useCallback(async () => {
    const dataUrl = await captureSnapshot()
    if (!dataUrl) return null

    const path = await saveDataUrlToLocalCache(dataUrl, {
      idPrefix: 'panorama',
      category: 'panorama_snapshot',
      ext: '.png',
      type: 'image'
    })

    return { dataUrl, path }
  }, [captureSnapshot])

  const handleAddToAssets = useCallback(async () => {
    try {
      const dataUrl = await captureSnapshot()
      if (!dataUrl) return

      const result = await addSnapshotToAssetLibrary({
        dataUrl,
        category: 'scenes',
        namePrefix: 'panorama'
      })

      if (!result?.success) {
        throw new Error(result?.error || '添加到资产库失败')
      }

      useAppStore.getState().setAssetLibraryOpen?.(true)
      setToast('已加入资产库')
    } catch (error) {
      console.error('全景快照入库失败:', error)
      setToast('加入资产库失败')
    }
  }, [captureSnapshot])

  const handleAddToReference = useCallback(async () => {
    try {
      const dataUrl = await captureSnapshot()
      if (!dataUrl) return

      const result = await addSnapshotToReferenceImages({
        dataUrl,
        sourceNodeId,
        namePrefix: 'panorama'
      })

      if (result?.fallback === 'clipboard') {
        setToast('未找到下游生图节点，已复制到剪贴板')
        return
      }

      if (!result?.success) {
        throw new Error(result?.error || '添加参考图失败')
      }

      setToast('已加入参考图')
    } catch (error) {
      console.error('全景快照加入参考图失败:', error)
      setToast('加入参考图失败')
    }
  }, [captureSnapshot, sourceNodeId])

  const handleCopySnapshot = useCallback(async () => {
    try {
      const snapshot = await persistSnapshot()
      if (!snapshot?.path) return
      await copyImagePathToClipboard(snapshot.path)
      setToast('快照已复制到剪贴板')
    } catch (error) {
      console.error('复制全景快照失败:', error)
      setToast('复制失败')
    }
  }, [persistSnapshot])

  const handleSaveSnapshotAs = useCallback(async () => {
    try {
      const snapshot = await persistSnapshot()
      if (!snapshot?.path) return

      const result = (await window.api.localCacheAPI.saveFileAs(
        snapshot.path,
        `panorama_snapshot_${Date.now()}.png`
      )) as { success?: boolean; path?: string; error?: string }

      if (!result?.success) {
        throw new Error(result?.error || '另存为失败')
      }

      setToast('快照已保存')
    } catch (error) {
      console.error('另存全景快照失败:', error)
      setToast('另存为失败')
    }
  }, [persistSnapshot])

  if (!open || !resolvedImageUrl) return null

  const segmentWidth = 2 * DEFAULT_RADIUS * Math.tan(Math.PI / SEGMENTS)

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
    >
      <div className="flex items-center justify-between px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-white text-sm font-semibold">🌐 720° 全景漫游</span>
          <button
            onClick={() => setAutoRotate((value) => !value)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              autoRotate
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                : 'bg-white/10 text-white/60 border border-white/20'
            }`}
          >
            {autoRotate ? '⏸ 暂停旋转' : '▶ 自动旋转'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAddToReference}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/40 transition-all"
          >
            🧷 加入参考图
          </button>
          <button
            onClick={handleAddToAssets}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/50 transition-all"
          >
            💾 存入资产库
          </button>
          <button
            onClick={handleCopySnapshot}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/80 hover:bg-white/20 border border-white/20 transition-all"
          >
            📋 复制快照
          </button>
          <button
            onClick={handleSaveSnapshotAs}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/80 hover:bg-white/20 border border-white/20 transition-all"
          >
            ⬇ 另存为
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/80 hover:bg-white/20 border border-white/20 transition-all"
          >
            ✕ 关闭
          </button>
        </div>
      </div>

      <div
        className="flex-1 flex items-center justify-center overflow-hidden"
        style={{
          perspective: '800px',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        onPointerDown={handlePointerDown}
      >
        <div
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateY(${rotateY}deg)`,
            width: '1px',
            height: '1px',
            position: 'relative'
          }}
        >
          {Array.from({ length: SEGMENTS }).map((_, index) => {
            const angle = (360 / SEGMENTS) * index
            return (
              <div
                key={index}
                style={{
                  position: 'absolute',
                  width: `${segmentWidth}px`,
                  height: '400px',
                  left: `${-segmentWidth / 2}px`,
                  top: '-200px',
                  transform: `rotateY(${angle}deg) translateZ(${DEFAULT_RADIUS}px)`,
                  backgroundImage: `url(${resolvedImageUrl})`,
                  backgroundSize: `${segmentWidth * SEGMENTS}px 100%`,
                  backgroundPosition: `${-index * segmentWidth}px 0`,
                  backgroundRepeat: 'no-repeat',
                  backfaceVisibility: 'hidden'
                }}
              />
            )
          })}
        </div>
      </div>

      <div className="text-center py-3 text-white/40 text-xs">
        拖拽左右旋转 · 当前视角快照可直接复用到资产库和参考图
      </div>

      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[10000] px-4 py-2 rounded-lg bg-black/70 border border-white/10 text-xs text-white/90 shadow-[var(--shadow-lg)]">
          {toast}
        </div>
      )}
    </div>
  )
}

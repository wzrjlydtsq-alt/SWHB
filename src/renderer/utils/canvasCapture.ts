/**
 * 画布截图工具
 * 支持三种模式：全画布、可视区域、框选区域
 */
import { useAppStore } from '../store/useAppStore'
import { saveDataUrlToLocalCache } from './snapshotUtils.ts'

export type CaptureMode = 'full' | 'viewport' | 'selection'

export interface CaptureResult {
  dataUrl: string
  width: number
  height: number
}

/**
 * 获取画布所有节点的边界
 */
function getCanvasBounds() {
  const { nodes } = useAppStore.getState()
  if (nodes.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const n of nodes) {
    const nx = n.x ?? n.position?.x ?? 0
    const ny = n.y ?? n.position?.y ?? 0
    const nw = n.width || 300
    const nh = n.height || 200
    if (nx < minX) minX = nx
    if (ny < minY) minY = ny
    if (nx + nw > maxX) maxX = nx + nw
    if (ny + nh > maxY) maxY = ny + nh
  }

  const pad = 40
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2
  }
}

/**
 * 截取可视区域
 */
export async function captureViewport(): Promise<CaptureResult | null> {
  try {
    if (window.api?.windowAPI?.capturePage) {
      const dataUrl = await window.api.windowAPI.capturePage()
      if (dataUrl) {
        return {
          dataUrl,
          width: window.innerWidth,
          height: window.innerHeight
        }
      }
    }

    return captureByDomToCanvas()
  } catch (err) {
    console.warn('[截图] 可视区域截取失败:', err)
    return null
  }
}

/**
 * DOM 转 canvas 截图（使用原生 Canvas API）
 */
async function captureByDomToCanvas(): Promise<CaptureResult | null> {
  return captureByNativeCanvas()
}

/**
 * 使用原生 Canvas API 截取 ReactFlow svg/canvas 内容
 */
async function captureByNativeCanvas(): Promise<CaptureResult | null> {
  const rfViewport = document.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!rfViewport) return null

  const canvas = document.createElement('canvas')
  const rect = rfViewport.getBoundingClientRect()
  canvas.width = rect.width * 2
  canvas.height = rect.height * 2

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-deepest').trim()
  ctx.fillStyle = bgColor || '#1a1a2e'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const { nodes, view } = useAppStore.getState()
  ctx.save()
  ctx.scale(2, 2)
  ctx.translate(view.x, view.y)
  ctx.scale(view.zoom, view.zoom)

  for (const node of nodes) {
    const nx = node.x ?? node.position?.x ?? 0
    const ny = node.y ?? node.position?.y ?? 0
    const nw = node.width || 300
    const nh = node.height || 200

    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(nx, ny, nw, nh, 8)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.font = '12px sans-serif'
    const label = node.settings?.prompt?.slice(0, 20) || node.type || 'Node'
    ctx.fillText(label, nx + 8, ny + 20)
  }

  ctx.restore()

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width / 2,
    height: canvas.height / 2
  }
}

async function saveCaptureToTempFile(result: CaptureResult) {
  return saveDataUrlToLocalCache(result.dataUrl, {
    idPrefix: 'canvas',
    category: 'canvas_capture',
    ext: '.png',
    type: 'image'
  })
}

/**
 * 截图后的操作
 */
export async function handleCaptureAction(
  result: CaptureResult,
  action: 'clipboard' | 'save' | 'node'
) {
  if (action === 'clipboard') {
    try {
      const blob = await (await fetch(result.dataUrl)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return { success: true, message: '已复制到剪贴板' }
    } catch {
      try {
        const tempPath = await saveCaptureToTempFile(result)
        await window.api.invoke('clipboard:copy-image', { filePath: tempPath })
        return { success: true, message: '已复制到剪贴板' }
      } catch {
        return { success: false, message: '复制失败' }
      }
    }
  }

  if (action === 'save') {
    try {
      const tempPath = await saveCaptureToTempFile(result)
      const saved = await window.api.localCacheAPI.saveFileAs(tempPath, `canvas_${Date.now()}.png`)
      return {
        success: !!saved?.success,
        message: saved?.success ? '已保存' : '已取消'
      }
    } catch {
      const a = document.createElement('a')
      a.href = result.dataUrl
      a.download = `canvas_${Date.now()}.png`
      a.click()
      return { success: true, message: '已下载' }
    }
  }

  if (action === 'node') {
    return { success: false, message: '功能即将推出' }
  }

  return { success: false, message: '未知操作' }
}

export { getCanvasBounds }

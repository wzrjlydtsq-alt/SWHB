import { useEffect, useRef, useCallback, useState } from 'react'

/**
 * 赛博朋克深空粒子 Canvas 组件
 * - 原生 Canvas 2D，零外部依赖
 * - 鼠标斥力交互 + 粒子连线
 * - active=false 时完全停止 rAF，不消耗任何 CPU/GPU
 */
const BASE_PARTICLE_COUNT = 320
const CONNECT_DIST = 120
const MOUSE_RADIUS = 200
const MOUSE_FORCE = 0.9

function getParticleCount() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return BASE_PARTICLE_COUNT
  }

  const cores = navigator.hardwareConcurrency || 4
  const memory = (navigator as any).deviceMemory || 4
  const dpr = window.devicePixelRatio || 1
  let factor = 1

  if (cores <= 4) factor *= 0.72
  if (memory <= 4) factor *= 0.78
  if (dpr >= 2) factor *= 0.72

  return Math.max(120, Math.round(BASE_PARTICLE_COUNT * factor))
}

function canRunAnimation(active, element) {
  if (!active) return false
  if (document.hidden) return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (element?.closest?.('.perf-mode')) return false
  return true
}

export const ParticleCanvas = ({ active = true }) => {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const particlesRef = useRef([])
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const sizeRef = useRef({ w: 0, h: 0 })
  const meteorsRef = useRef([])
  const meteorTimerRef = useRef(0)
  const [shouldAnimate, setShouldAnimate] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateAnimationState = () => {
      setShouldAnimate(canRunAnimation(active, canvasRef.current))
    }

    updateAnimationState()
    document.addEventListener('visibilitychange', updateAnimationState)
    media.addEventListener?.('change', updateAnimationState)

    const observer = new MutationObserver(updateAnimationState)
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class']
      })
    }

    return () => {
      document.removeEventListener('visibilitychange', updateAnimationState)
      media.removeEventListener?.('change', updateAnimationState)
      observer.disconnect()
    }
  }, [active])

  // 初始化粒子
  const initParticles = useCallback((w, h) => {
    const particles = []
    const particleCount = getParticleCount()
    for (let i = 0; i < particleCount; i++) {
      const hue = 190 + Math.random() * 30 // 190-220 青蓝色系
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: 1 + Math.random() * 2,
        hue,
        alpha: 0.5 + Math.random() * 0.5
      })
    }
    particlesRef.current = particles
  }, [])

  // 动画循环
  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { w, h } = sizeRef.current
    const mouse = mouseRef.current
    const particles = particlesRef.current

    ctx.clearRect(0, 0, w, h)

    // 更新 & 绘制粒子
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]

      // 鼠标斥力
      const dx = p.x - mouse.x
      const dy = p.y - mouse.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < MOUSE_RADIUS && dist > 0) {
        const force = (1 - dist / MOUSE_RADIUS) * MOUSE_FORCE
        p.vx += (dx / dist) * force
        p.vy += (dy / dist) * force
      }

      // 速度衰减
      p.vx *= 0.98
      p.vy *= 0.98

      // 移动
      p.x += p.vx
      p.y += p.vy

      // 边界反弹
      if (p.x < 0 || p.x > w) p.vx *= -1
      if (p.y < 0 || p.y > h) p.vy *= -1
      p.x = Math.max(0, Math.min(w, p.x))
      p.y = Math.max(0, Math.min(h, p.y))

      // 绘制粒子
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${p.hue}, 60%, 75%, ${p.alpha})`
      ctx.fill()
    }

    // 粒子连线（空间网格优化）
    const cellSize = CONNECT_DIST
    const cols = Math.ceil(w / cellSize) + 1
    const grid = new Map()
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      const cx = Math.floor(p.x / cellSize)
      const cy = Math.floor(p.y / cellSize)
      const key = cx + cy * cols
      if (!grid.has(key)) grid.set(key, [])
      grid.get(key).push(i)
    }

    for (const [key, cell] of grid) {
      const cy = Math.floor(key / cols)
      const cx = key - cy * cols
      // 检查当前格子和相邻 4 个格子（避免重复）
      const neighbors = [
        key,
        cx + 1 + cy * cols,
        cx + (cy + 1) * cols,
        cx + 1 + (cy + 1) * cols,
        cx - 1 + (cy + 1) * cols
      ]
      for (const nKey of neighbors) {
        const nCell = nKey === key ? cell : grid.get(nKey)
        if (!nCell) continue
        const startJ = nKey === key ? 0 : 0
        for (let ii = 0; ii < cell.length; ii++) {
          const a = particles[cell[ii]]
          const jStart = nKey === key ? ii + 1 : startJ
          for (let jj = jStart; jj < nCell.length; jj++) {
            const b = particles[nCell[jj]]
            const ddx = a.x - b.x
            const ddy = a.y - b.y
            const dd = ddx * ddx + ddy * ddy
            if (dd < CONNECT_DIST * CONNECT_DIST) {
              const d = Math.sqrt(dd)
              const alpha = (1 - d / CONNECT_DIST) * 0.15
              const mDx = (a.x + b.x) / 2 - mouse.x
              const mDy = (a.y + b.y) / 2 - mouse.y
              const mDist = Math.sqrt(mDx * mDx + mDy * mDy)
              const highlight = mDist < MOUSE_RADIUS * 1.5 ? 2.5 : 1

              ctx.beginPath()
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(b.x, b.y)
              ctx.strokeStyle = `hsla(195, 70%, 70%, ${alpha * highlight})`
              ctx.lineWidth = 0.7
              ctx.stroke()
            }
          }
        }
      }
    }

    // 流星系统
    meteorTimerRef.current++
    if (meteorTimerRef.current % Math.floor(400 / 16) === 0) {
      // 每次可能生成 1-3 颗
      const count = 1 + Math.floor(Math.random() * 3)
      for (let mi = 0; mi < count; mi++) {
        const side = Math.random()
        const size = Math.random() // 0=小流星, 1=大流星
        meteorsRef.current.push({
          x: side < 0.5 ? Math.random() * w : w + 20,
          y: side < 0.5 ? -20 : Math.random() * h * 0.5,
          vx: -(2 + Math.random() * 5),
          vy: 1.5 + Math.random() * 3.5,
          life: 1,
          decay: 0.006 + Math.random() * 0.012,
          len: 20 + size * 80,
          width: 0.5 + size * 2,
          hue: 190 + Math.random() * 30
        })
      }
    }

    meteorsRef.current = meteorsRef.current.filter((m) => m.life > 0)
    for (const m of meteorsRef.current) {
      m.x += m.vx
      m.y += m.vy
      m.life -= m.decay

      const speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy)
      const tailX = m.x - (m.vx / speed) * m.len
      const tailY = m.y - (m.vy / speed) * m.len

      const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y)
      grad.addColorStop(0, `hsla(${m.hue}, 60%, 75%, 0)`)
      grad.addColorStop(1, `hsla(${m.hue}, 70%, 85%, ${m.life * 0.7})`)

      ctx.beginPath()
      ctx.moveTo(tailX, tailY)
      ctx.lineTo(m.x, m.y)
      ctx.strokeStyle = grad
      ctx.lineWidth = m.width
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(m.x, m.y, m.width * 0.8, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${m.hue}, 60%, 90%, ${m.life * 0.8})`
      ctx.fill()
    }

    rafRef.current = requestAnimationFrame(animate)
  }, [])

  // 尺寸管理
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const updateSize = () => {
      const rect = canvas.parentElement.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = Math.floor(rect.width)
      const h = Math.floor(rect.height)

      const oldW = sizeRef.current.w
      const oldH = sizeRef.current.h

      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      // 重置变换矩阵再 scale，防止累积
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = { w, h }

      if (particlesRef.current.length === 0) {
        initParticles(w, h)
      } else if (oldW > 0 && oldH > 0 && (oldW !== w || oldH !== h)) {
        // 窗口大小变化 → 按比例重新映射粒子位置
        const scaleX = w / oldW
        const scaleY = h / oldH
        for (const p of particlesRef.current) {
          p.x = Math.max(0, Math.min(w, p.x * scaleX))
          p.y = Math.max(0, Math.min(h, p.y * scaleY))
        }
      }
    }

    updateSize()

    const ro = new ResizeObserver(updateSize)
    ro.observe(canvas.parentElement)

    return () => ro.disconnect()
  }, [initParticles])

  // 鼠标事件
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleMove = (e) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const handleLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 }
    }

    canvas.addEventListener('mousemove', handleMove)
    canvas.addEventListener('mouseleave', handleLeave)
    return () => {
      canvas.removeEventListener('mousemove', handleMove)
      canvas.removeEventListener('mouseleave', handleLeave)
    }
  }, [])

  // rAF 生命周期
  useEffect(() => {
    if (shouldAnimate) {
      // 确保有粒子数据
      if (particlesRef.current.length === 0) {
        const { w, h } = sizeRef.current
        if (w > 0 && h > 0) initParticles(w, h)
      }
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(animate)
      }
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [shouldAnimate, animate, initParticles])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: shouldAnimate ? 'auto' : 'none'
      }}
    />
  )
}

import { useEffect, useRef, useCallback, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'

/**
 * 画布 WebGL 星尘粒子背景（增强版）
 * - 纯 WebGL 实现，GPU 渲染
 * - 300 个微粒 + 远近视差漂移 + 粒子间连线
 * - 自动适配亮色/暗色主题
 * - pointer-events: none，不影响画布交互
 */

// ═══ Shader: 粒子点 ═══
const POINT_VERT = `
  attribute vec2 a_position;
  attribute float a_size;
  attribute float a_alpha;
  attribute float a_speed;
  uniform float u_time;
  varying float v_alpha;
  varying vec2 v_pos;

  void main() {
    float y = a_position.y + u_time * a_speed * 0.000035;
    y = fract(y);
    float x = a_position.x + sin(u_time * 0.00025 + a_position.y * 6.28) * 0.004;
    x = fract(x);
    vec2 p = vec2(x, y) * 2.0 - 1.0;
    gl_Position = vec4(p, 0.0, 1.0);
    gl_PointSize = a_size;
    v_alpha = a_alpha;
    v_pos = vec2(x, y);
  }
`

const POINT_FRAG = `
  precision mediump float;
  varying float v_alpha;
  uniform vec3 u_color;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float fade = 1.0 - d * d;
    gl_FragColor = vec4(u_color, v_alpha * fade * 0.7);
  }
`

// ═══ Shader: 连线 ═══
const LINE_VERT = `
  attribute vec2 a_pos;
  attribute float a_lineAlpha;
  varying float v_lineAlpha;

  void main() {
    vec2 p = a_pos * 2.0 - 1.0;
    gl_Position = vec4(p, 0.0, 1.0);
    v_lineAlpha = a_lineAlpha;
  }
`

const LINE_FRAG = `
  precision mediump float;
  varying float v_lineAlpha;
  uniform vec3 u_lineColor;

  void main() {
    gl_FragColor = vec4(u_lineColor, v_lineAlpha);
  }
`

const BASE_PARTICLE_COUNT = 160
const CONNECT_DIST = 0.065 // 归一化坐标系下的连线距离
function getParticleBudget() {
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

  return Math.max(72, Math.round(BASE_PARTICLE_COUNT * factor))
}

const PARTICLE_COUNT = getParticleBudget()
const MAX_LINES = Math.max(90, Math.round(PARTICLE_COUNT * 1.35))

interface ParticleData {
  positions: Float32Array
  sizes: Float32Array
  alphas: Float32Array
  speeds: Float32Array
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext, vertSrc: string, fragSrc: string) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vertSrc)
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragSrc)
  if (!vs || !fs) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    return null
  }
  return program
}

function getRelativeLuminance(r: number, g: number, b: number) {
  const [rs, gs, bs] = [r, g, b].map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function parseCssColorBrightness(value: string) {
  const color = value.trim()
  const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hexMatch) {
    const body =
      hexMatch[1].length === 3
        ? hexMatch[1]
            .split('')
            .map((char) => char + char)
            .join('')
        : hexMatch[1]
    return getRelativeLuminance(
      parseInt(body.slice(0, 2), 16),
      parseInt(body.slice(2, 4), 16),
      parseInt(body.slice(4, 6), 16)
    )
  }

  const hslMatch = color.match(/hsla?\(\s*[\d.]+(?:deg)?\s*,?\s*[\d.]+%\s*,?\s*([\d.]+)%/i)
  if (hslMatch) return Number(hslMatch[1]) / 100

  if (/^rgba?\(/i.test(color)) {
    const channels = color.match(/[\d.]+/g)
    if (channels && channels.length >= 3) {
      return getRelativeLuminance(Number(channels[0]), Number(channels[1]), Number(channels[2]))
    }
  }

  return null
}

function isDarkMode(): boolean {
  const styles = getComputedStyle(document.documentElement)
  const bgBase =
    styles.getPropertyValue('--canvas-bg-base').trim() ||
    styles.getPropertyValue('--bg-base').trim()
  const brightness = parseCssColorBrightness(bgBase)
  if (brightness !== null) return brightness < 0.45
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function generateParticles(): ParticleData {
  const positions = new Float32Array(PARTICLE_COUNT * 2)
  const sizes = new Float32Array(PARTICLE_COUNT)
  const alphas = new Float32Array(PARTICLE_COUNT)
  const speeds = new Float32Array(PARTICLE_COUNT)

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 2] = Math.random()
    positions[i * 2 + 1] = Math.random()
    const depth = Math.random()
    sizes[i] = 1.5 + depth * 3.0 // 1.5~4.5px — 更大更可见
    alphas[i] = 0.25 + depth * 0.6 // 0.25~0.85 — 更亮
    speeds[i] = 0.2 + depth * 0.8
  }

  return { positions, sizes, alphas, speeds }
}

function canRunAnimation(active: boolean, element: HTMLElement | null) {
  if (!active) return false
  if (document.hidden) return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (element?.closest?.('.perf-mode')) return false
  return true
}

export function CanvasParticlesBg({ active = true }: { active?: boolean }) {
  const enableGpu = useAppStore((state) => state.enableGpu)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const activeRef = useRef(false)
  const renderLoopRef = useRef<(() => void) | null>(null)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const startTimeRef = useRef(performance.now())
  const [shouldAnimate, setShouldAnimate] = useState(false)

  // 存储程序和 uniform refs
  const pointProgRef = useRef<WebGLProgram | null>(null)
  const lineProgRef = useRef<WebGLProgram | null>(null)
  const uPointColorRef = useRef<WebGLUniformLocation | null>(null)
  const uLineColorRef = useRef<WebGLUniformLocation | null>(null)
  const lastColorCheckRef = useRef(0)

  // 粒子 CPU 端位置（用于连线计算）
  const particleDataRef = useRef<ParticleData | null>(null)
  const lineVertBufRef = useRef<WebGLBuffer | null>(null)
  const lineAlphaBufRef = useRef<WebGLBuffer | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateAnimationState = () => {
      setShouldAnimate(enableGpu && canRunAnimation(active, canvasRef.current))
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
  }, [active, enableGpu])

  const updateColors = useCallback(() => {
    const gl = glRef.current
    if (!gl) return
    const dark = isDarkMode()

    if (pointProgRef.current && uPointColorRef.current) {
      gl.useProgram(pointProgRef.current)
      if (dark) {
        gl.uniform3f(uPointColorRef.current, 0.72, 0.78, 0.88) // 浅蓝白
      } else {
        gl.uniform3f(uPointColorRef.current, 0.3, 0.38, 0.55) // 深蓝灰
      }
    }
    if (lineProgRef.current && uLineColorRef.current) {
      gl.useProgram(lineProgRef.current)
      if (dark) {
        gl.uniform3f(uLineColorRef.current, 0.45, 0.55, 0.72) // 柔和蓝线
      } else {
        gl.uniform3f(uLineColorRef.current, 0.5, 0.55, 0.65) // 浅灰蓝线
      }
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!enableGpu) return

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false
    })
    if (!gl) return
    glRef.current = gl

    // ═══ Point Program ═══
    const pointProg = createProgram(gl, POINT_VERT, POINT_FRAG)
    if (!pointProg) return
    pointProgRef.current = pointProg

    // ═══ Line Program ═══
    const lineProg = createProgram(gl, LINE_VERT, LINE_FRAG)
    if (!lineProg) return
    lineProgRef.current = lineProg

    const handleContextLost = (event: Event) => {
      event.preventDefault()
      activeRef.current = false
      setShouldAnimate(false)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      console.warn('[CanvasParticlesBg] WebGL context lost; particle background stopped')
    }
    canvas.addEventListener('webglcontextlost', handleContextLost)

    // ═══ 粒子数据 ═══
    const data = generateParticles()
    particleDataRef.current = data

    gl.useProgram(pointProg)

    const buffers: WebGLBuffer[] = []
    const bindAttr = (prog: WebGLProgram, arr: Float32Array, name: string, size: number) => {
      const buf = gl.createBuffer()
      if (!buf) return
      buffers.push(buf)
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(prog, name)
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0)
      }
    }

    bindAttr(pointProg, data.positions, 'a_position', 2)
    bindAttr(pointProg, data.sizes, 'a_size', 1)
    bindAttr(pointProg, data.alphas, 'a_alpha', 1)
    bindAttr(pointProg, data.speeds, 'a_speed', 1)

    const uTime = gl.getUniformLocation(pointProg, 'u_time')
    uPointColorRef.current = gl.getUniformLocation(pointProg, 'u_color')

    // ═══ 连线 Buffer ═══
    const lineVertBuf = gl.createBuffer()
    const lineAlphaBuf = gl.createBuffer()
    lineVertBufRef.current = lineVertBuf
    lineAlphaBufRef.current = lineAlphaBuf
    if (lineVertBuf) buffers.push(lineVertBuf)
    if (lineAlphaBuf) buffers.push(lineAlphaBuf)

    uLineColorRef.current = gl.getUniformLocation(lineProg, 'u_lineColor')

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    updateColors()

    // ═══ 尺寸管理 ═══
    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      const w = Math.floor(rect.width)
      const h = Math.floor(rect.height)
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    updateSize()

    const ro = new ResizeObserver(updateSize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    // ═══ 临时数组（复用避免 GC） ═══
    const lineVerts = new Float32Array(MAX_LINES * 4) // 每条线 2 顶点 * 2 坐标
    const lineAlphas = new Float32Array(MAX_LINES * 2) // 每条线 2 顶点
    const curPos = new Float32Array(PARTICLE_COUNT * 2) // 预分配粒子位置缓冲区

    // ═══ 帧循环 ═══
    const render = () => {
      if (!activeRef.current) {
        rafRef.current = null
        return
      }
      if (gl.isContextLost()) {
        activeRef.current = false
        rafRef.current = null
        return
      }

      const t = performance.now() - startTimeRef.current
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      // 每 2 秒检查主题变化
      if (t - lastColorCheckRef.current > 2000) {
        lastColorCheckRef.current = t
        updateColors()
      }

      const pd = particleDataRef.current
      if (!pd) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      // 计算当前帧粒子位置（CPU侧，用于连线）— 复用预分配缓冲区
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        let y = pd.positions[i * 2 + 1] + t * pd.speeds[i] * 0.000035
        y = y - Math.floor(y) // fract
        let x = pd.positions[i * 2] + Math.sin(t * 0.00025 + pd.positions[i * 2 + 1] * 6.28) * 0.004
        x = x - Math.floor(x)
        curPos[i * 2] = x
        curPos[i * 2 + 1] = y
      }

      // ═══ 画连线 ═══
      let lineCount = 0
      const distSq = CONNECT_DIST * CONNECT_DIST

      for (let i = 0; i < PARTICLE_COUNT && lineCount < MAX_LINES; i++) {
        const ax = curPos[i * 2]
        const ay = curPos[i * 2 + 1]
        for (let j = i + 1; j < PARTICLE_COUNT && lineCount < MAX_LINES; j++) {
          const bx = curPos[j * 2]
          const by = curPos[j * 2 + 1]
          const dx = ax - bx
          const dy = ay - by
          const dd = dx * dx + dy * dy
          if (dd < distSq) {
            const alpha = (1 - Math.sqrt(dd) / CONNECT_DIST) * 0.08
            const idx = lineCount * 4
            lineVerts[idx] = ax
            lineVerts[idx + 1] = ay
            lineVerts[idx + 2] = bx
            lineVerts[idx + 3] = by
            lineAlphas[lineCount * 2] = alpha
            lineAlphas[lineCount * 2 + 1] = alpha
            lineCount++
          }
        }
      }

      if (lineCount > 0 && lineVertBuf && lineAlphaBuf) {
        gl.useProgram(lineProg)

        gl.bindBuffer(gl.ARRAY_BUFFER, lineVertBuf)
        gl.bufferData(gl.ARRAY_BUFFER, lineVerts.subarray(0, lineCount * 4), gl.DYNAMIC_DRAW)
        const aPosLoc = gl.getAttribLocation(lineProg, 'a_pos')
        gl.enableVertexAttribArray(aPosLoc)
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0)

        gl.bindBuffer(gl.ARRAY_BUFFER, lineAlphaBuf)
        gl.bufferData(gl.ARRAY_BUFFER, lineAlphas.subarray(0, lineCount * 2), gl.DYNAMIC_DRAW)
        const aAlphaLoc = gl.getAttribLocation(lineProg, 'a_lineAlpha')
        gl.enableVertexAttribArray(aAlphaLoc)
        gl.vertexAttribPointer(aAlphaLoc, 1, gl.FLOAT, false, 0, 0)

        gl.lineWidth(1.0)
        gl.drawArrays(gl.LINES, 0, lineCount * 2)
      }

      // ═══ 画粒子点 ═══
      gl.useProgram(pointProg)

      // 重新绑定 point 属性（因为切换了 program）
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[0]) // positions
      const aPos2 = gl.getAttribLocation(pointProg, 'a_position')
      gl.enableVertexAttribArray(aPos2)
      gl.vertexAttribPointer(aPos2, 2, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[1]) // sizes
      const aSize2 = gl.getAttribLocation(pointProg, 'a_size')
      gl.enableVertexAttribArray(aSize2)
      gl.vertexAttribPointer(aSize2, 1, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[2]) // alphas
      const aAlpha2 = gl.getAttribLocation(pointProg, 'a_alpha')
      gl.enableVertexAttribArray(aAlpha2)
      gl.vertexAttribPointer(aAlpha2, 1, gl.FLOAT, false, 0, 0)

      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[3]) // speeds
      const aSpeed2 = gl.getAttribLocation(pointProg, 'a_speed')
      gl.enableVertexAttribArray(aSpeed2)
      gl.vertexAttribPointer(aSpeed2, 1, gl.FLOAT, false, 0, 0)

      gl.uniform1f(uTime, t)
      gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT)

      rafRef.current = requestAnimationFrame(render)
    }

    renderLoopRef.current = render

    if (activeRef.current) {
      rafRef.current = requestAnimationFrame(render)
    }

    return () => {
      renderLoopRef.current = null
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      ro.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      buffers.forEach((b) => gl.deleteBuffer(b))
      gl.deleteProgram(pointProg)
      gl.deleteProgram(lineProg)
    }
  }, [enableGpu, updateColors])

  // active 切换
  useEffect(() => {
    activeRef.current = shouldAnimate
    if (!glRef.current || !pointProgRef.current) return

    if (shouldAnimate && !rafRef.current) {
      if (renderLoopRef.current) {
        rafRef.current = requestAnimationFrame(renderLoopRef.current)
      }
    } else if (!shouldAnimate && rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [shouldAnimate])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0
      }}
    />
  )
}

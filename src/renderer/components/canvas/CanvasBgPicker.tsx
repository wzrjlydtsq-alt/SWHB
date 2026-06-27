import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { Palette, RotateCcw } from '../../utils/icons.tsx'
import { useAppStore } from '../../store/useAppStore.ts'

const PRESET_COLORS = [
  '#1A1A2E',
  '#2D2D44',
  '#42425E',
  '#1E293B',
  '#18181B',
  '#0F172A',
  '#1C1917',
  '#292524'
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeHex(hex: string) {
  const value = hex.trim()
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`.toUpperCase()
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase()
  return '#42425E'
}

function hexToRgb(hex: string) {
  const safeHex = normalizeHex(hex)
  return {
    r: parseInt(safeHex.slice(1, 3), 16),
    g: parseInt(safeHex.slice(3, 5), 16),
    b: parseInt(safeHex.slice(5, 7), 16)
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase()
}

function hexToHsv(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0

  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
    else h = 60 * ((rn - gn) / delta + 4)
  }

  return {
    h: Math.round((h + 360) % 360),
    s: max === 0 ? 0 : Math.round((delta / max) * 100),
    v: Math.round(max * 100)
  }
}

function hsvToHex(h: number, s: number, v: number) {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 100) / 100
  const val = clamp(v, 0, 100) / 100
  const c = val * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = val - c
  let r = 0
  let g = 0
  let b = 0

  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

export function CanvasBgPicker() {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'canvas' | 'component' | 'text'>('canvas')
  const panelRef = useRef<HTMLDivElement | null>(null)

  const canvasBgColor = useAppStore((s) => s.canvasBgColor)
  const setCanvasBgColor = useAppStore((s) => s.setCanvasBgColor)
  const componentBaseColor = useAppStore((s) => s.componentBaseColor)
  const setComponentBaseColor = useAppStore((s) => s.setComponentBaseColor)
  const textBaseColor = useAppStore((s) => s.textBaseColor)
  const setTextStyle = useAppStore((s) => s.setTextStyle)
  const themeColor = useAppStore((s) => s.themeColor)

  const activeColorValue =
    activeTab === 'canvas'
      ? canvasBgColor
      : activeTab === 'component'
        ? componentBaseColor
        : textBaseColor
  const fallbackColor =
    activeTab === 'canvas' ? '#42425e' : activeTab === 'component' ? '#36364e' : '#f5f5f5'
  const currentColor = normalizeHex(activeColorValue || themeColor || fallbackColor)
  const currentHsv = useMemo(() => hexToHsv(currentColor), [currentColor])
  const [hexDraft, setHexDraft] = useState(currentColor)

  useEffect(() => {
    setHexDraft(currentColor)
  }, [currentColor])

  useEffect(() => {
    if (!open) return

    const handler = (event: MouseEvent) => {
      if (
        panelRef.current &&
        event.target instanceof Node &&
        !panelRef.current.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    const timer = window.setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [open])

  const setTargetColor = useCallback(
    (color: string) => {
      if (activeTab === 'canvas') setCanvasBgColor(color)
      else if (activeTab === 'component') setComponentBaseColor(color)
      else setTextStyle(color, 95)
    },
    [activeTab, setCanvasBgColor, setComponentBaseColor, setTextStyle]
  )

  const applySaturationValue = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const s = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100)
      const v = clamp(100 - ((event.clientY - rect.top) / rect.height) * 100, 0, 100)
      setTargetColor(hsvToHex(currentHsv.h, s, v))
    },
    [currentHsv.h, setTargetColor]
  )

  const applyHue = useCallback(
    (hue: number) => {
      const nextS = currentHsv.s === 0 ? 100 : currentHsv.s
      const nextV = currentHsv.v === 0 ? 100 : currentHsv.v
      setTargetColor(hsvToHex(hue, nextS, nextV))
    },
    [currentHsv.s, currentHsv.v, setTargetColor]
  )

  const applyHexDraft = useCallback(
    (value: string) => {
      const next = value.toUpperCase().replace(/[^0-9A-F#]/g, '')
      const body = next.replace(/^#/, '').slice(0, 6)
      const formatted = `#${body}`
      setHexDraft(formatted)
      if (/^#[0-9A-F]{6}$/.test(formatted)) setTargetColor(formatted)
    },
    [setTargetColor]
  )

  return (
    <div className="absolute left-3 bottom-3 z-30" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="group flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-card)] shadow-lg transition-all hover:scale-110 active:scale-95"
        style={{ border: `1px solid ${currentColor}` }}
        title="画布背景色"
        aria-label="画布背景色"
      >
        <Palette
          size={14}
          className="text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]"
        />
      </button>

      {open && (
        <div
          className="absolute left-0 bottom-11 w-56 overflow-hidden rounded-xl bg-[var(--bg-elevated)] shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          style={{ border: '1px solid var(--border-default)' }}
        >
          {/* Tabs */}
          <div className="flex border-b border-[var(--border-default)]">
            <button
              onClick={() => setActiveTab('canvas')}
              className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
                activeTab === 'canvas'
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] border-b-2 border-[var(--primary-color)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border-b-2 border-transparent'
              }`}
            >
              画布色
            </button>
            <button
              onClick={() => setActiveTab('component')}
              className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
                activeTab === 'component'
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] border-b-2 border-[var(--primary-color)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border-b-2 border-transparent'
              }`}
            >
              组件色
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
                activeTab === 'text'
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] border-b-2 border-[var(--primary-color)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border-b-2 border-transparent'
              }`}
            >
              字体色
            </button>
          </div>

          <div className="flex items-center justify-between px-3 py-2 mt-1">
            <span className="text-[10px] text-[var(--text-muted)]">
              {activeTab === 'canvas'
                ? '画布背景色配置'
                : activeTab === 'component'
                  ? '面板和卡片底色配置'
                  : '全局字体颜色配置'}
            </span>
            {activeColorValue && (
              <button
                onClick={() => setTargetColor('')}
                className="flex items-center gap-1 text-[9px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                title="重置为主题默认"
              >
                <RotateCcw size={10} /> 重置
              </button>
            )}
          </div>

          <div className="space-y-3 px-3 pb-3">
            <div
              className="relative h-28 cursor-crosshair overflow-hidden rounded-lg"
              style={{
                background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${currentHsv.h}, 100%, 50%))`
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                applySaturationValue(event)
              }}
              onPointerMove={(event) => {
                if (event.buttons === 1) applySaturationValue(event)
              }}
            >
              <div
                className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_5px_rgba(0,0,0,0.45)]"
                style={{
                  left: `${currentHsv.s}%`,
                  top: `${100 - currentHsv.v}%`,
                  backgroundColor: currentColor
                }}
              />
            </div>

            <input
              type="range"
              min="0"
              max="360"
              value={currentHsv.h}
              onChange={(event) => applyHue(Number(event.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full"
              style={{
                background:
                  'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'
              }}
              aria-label="色相"
            />

            <div className="flex items-center gap-2">
              <span
                className="h-5 w-5 shrink-0 rounded-full"
                style={{ backgroundColor: currentColor }}
              />
              <input
                type="text"
                value={hexDraft}
                onChange={(event) => applyHexDraft(event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                className="min-w-0 flex-1 rounded-md bg-[var(--bg-input)] px-2 py-1 text-[11px] font-mono text-[var(--text-primary)] outline-none"
                maxLength={7}
                spellCheck={false}
                aria-label="HEX 颜色"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setTargetColor(color)}
                  className="h-5 w-5 rounded-full transition-all hover:scale-125 active:scale-95"
                  style={{
                    backgroundColor: color,
                    boxShadow:
                      currentColor === normalizeHex(color)
                        ? `0 0 0 2px var(--bg-elevated), 0 0 0 3.5px ${color}`
                        : 'none'
                  }}
                  title={color}
                  aria-label={color}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

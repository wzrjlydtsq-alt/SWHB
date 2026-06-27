import React, { memo, useCallback, useMemo, useState } from 'react'
import { buildCameraPrompt } from '../../../features/camera/cameraPresets.ts'
import { LightSphereControl } from '../../../features/lighting/LightSphereControl.tsx'
import { getXingheMediaSrc } from '../../../utils/fileHelpers.ts'
import { Camera, RefreshCw, Sparkles, Sun, X } from '../../../utils/icons.tsx'

type PanelKind = 'camera' | 'lighting'
type LightDirection = '左侧' | '顶部' | '右侧' | '前方' | '底部' | '后方'

const CAMERA_PRESETS = [
  { label: '自定义', azimuth: 0, elevation: 0, scale: 1.0, prompt: '' },
  {
    label: '鱼眼视角',
    azimuth: 0,
    elevation: 0,
    scale: 0.3,
    prompt: 'fisheye lens, barrel distortion, ultra wide angle'
  },
  {
    label: '倾斜视角',
    azimuth: 15,
    elevation: -15,
    scale: 0.7,
    prompt: 'dutch angle, tilted frame, dynamic composition'
  },
  {
    label: '正面俯拍',
    azimuth: 0,
    elevation: 55,
    scale: 1.2,
    prompt: 'front high angle shot, overhead, looking down'
  },
  {
    label: '正面仰拍',
    azimuth: 0,
    elevation: -40,
    scale: 0.7,
    prompt: 'front low angle shot, looking up, heroic perspective'
  },
  {
    label: '全景俯拍',
    azimuth: 0,
    elevation: 80,
    scale: 2.0,
    prompt: "bird's eye view, aerial, top-down perspective"
  },
  {
    label: '背面视角',
    azimuth: 180,
    elevation: 0,
    scale: 0.8,
    prompt: 'back view, from behind, rear perspective'
  }
] as const

const LIGHT_DIRECTIONS: readonly LightDirection[] = ['左侧', '顶部', '右侧', '前方', '底部', '后方']

const LIGHT_DIRECTION_ANGLES: Record<LightDirection, { azimuth: number; elevation: number }> = {
  左侧: { azimuth: -90, elevation: 0 },
  顶部: { azimuth: 0, elevation: 80 },
  右侧: { azimuth: 90, elevation: 0 },
  前方: { azimuth: 0, elevation: 0 },
  底部: { azimuth: 0, elevation: -70 },
  后方: { azimuth: 180, elevation: 0 }
}

const LIGHT_DIRECTION_PROMPTS: Record<LightDirection, string> = {
  左侧: 'key light from left side, dramatic side lighting, split lighting',
  顶部: 'overhead lighting, top-down illumination, zenith light',
  右侧: 'key light from right side, Rembrandt lighting',
  前方: 'front lighting, fill light, flat illumination, beauty dish',
  底部: 'under lighting, horror lighting, low key, campfire glow',
  后方: 'backlit, rim lighting, silhouette, halo effect, lens flare'
}

const SMART_PRESET_OPTIONS = [
  {
    name: '伦勃朗光',
    direction: '右侧' as LightDirection,
    brightness: 60,
    rimLight: false,
    prompt: 'Rembrandt lighting, dramatic triangle of light on cheek'
  },
  {
    name: '蝴蝶光',
    direction: '前方' as LightDirection,
    brightness: 70,
    rimLight: false,
    prompt: 'butterfly lighting, glamour lighting, shadow under nose'
  },
  {
    name: '环形光',
    direction: '前方' as LightDirection,
    brightness: 80,
    rimLight: true,
    prompt: 'ring light, even illumination, catchlight in eyes'
  },
  {
    name: '逆光剪影',
    direction: '后方' as LightDirection,
    brightness: 90,
    rimLight: true,
    prompt: 'backlit silhouette, dramatic rim lighting, lens flare'
  },
  {
    name: '恐怖光',
    direction: '底部' as LightDirection,
    brightness: 40,
    rimLight: false,
    prompt: 'horror underlighting, sinister uplight, campfire glow'
  }
] as const

export const GenImageToolPanel = memo(function GenImageToolPanel({
  kind,
  previewImage,
  initialState,
  onApply,
  onClear,
  onClose
}: {
  kind: PanelKind
  previewImage?: string | null
  initialState?: any
  onApply?: (state: any) => void
  onClear?: () => void
  onClose?: () => void
}) {
  return kind === 'lighting' ? (
    <LightingPanel
      previewImage={previewImage}
      initialState={initialState}
      onApply={onApply}
      onClear={onClear}
      onClose={onClose}
    />
  ) : (
    <CameraPanel
      previewImage={previewImage}
      initialState={initialState}
      onApply={onApply}
      onClear={onClear}
      onClose={onClose}
    />
  )
})

export function getDefaultCameraToolState() {
  return {
    azimuth: 0,
    elevation: 0,
    scale: 0.8,
    presetPrompt: '',
    activePreset: '自定义'
  }
}

export function normalizeCameraToolState(state?: any) {
  return {
    ...getDefaultCameraToolState(),
    ...(state || {})
  }
}

export function buildHiddenCameraPrompt(state?: any) {
  if (!state) return ''
  const normalized = normalizeCameraToolState(state)
  return buildCameraPrompt(
    normalized.azimuth,
    normalized.elevation,
    normalized.scale,
    normalized.presetPrompt
  )
}

function getScaleLabel(scale: number) {
  if (scale < 0.2) return '大特写'
  if (scale < 0.4) return '特写'
  if (scale < 0.6) return '近景'
  if (scale < 0.8) return '中景'
  if (scale < 1.2) return '中远景'
  if (scale < 1.8) return '远景'
  return '大远景'
}

function getBrightnessPrompt(brightness: number) {
  if (brightness < 25) return 'very dim lighting, barely visible, deep shadows'
  if (brightness < 50) return 'soft diffused lighting, gentle illumination, low key'
  if (brightness < 75) return 'well-lit, balanced lighting, moderate shadows'
  return 'intense bright lighting, harsh shadows, high key, overexposed highlights'
}

function getColorPrompt(hex: string) {
  if (!hex || hex.toLowerCase() === '#ffffff') return ''

  const red = parseInt(hex.slice(1, 3), 16) / 255
  const green = parseInt(hex.slice(3, 5), 16) / 255
  const blue = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const saturation = max - min

  if (saturation < 0.15) return ''

  let hue = 0
  if (max === red) hue = ((green - blue) / (max - min)) * 60
  else if (max === green) hue = (2 + (blue - red) / (max - min)) * 60
  else hue = (4 + (red - green) / (max - min)) * 60
  if (hue < 0) hue += 360

  if (hue < 30 || hue >= 330) return 'warm red-tinted lighting, dramatic mood'
  if (hue < 70) return 'golden warm lighting, sunset tones, tungsten'
  if (hue < 150) return 'eerie green lighting, matrix-style, toxic glow'
  if (hue < 260) return 'cool blue lighting, moonlight, clinical'
  return 'purple ambient light, ultraviolet, neon mood'
}

function inferSmartPresetName({
  direction,
  brightness,
  rimLight
}: {
  direction: LightDirection
  brightness: number
  rimLight: boolean
}) {
  let bestName: string = SMART_PRESET_OPTIONS[0].name
  let bestScore = Number.POSITIVE_INFINITY

  SMART_PRESET_OPTIONS.forEach((preset) => {
    const directionPenalty = preset.direction === direction ? 0 : 30
    const brightnessPenalty = Math.abs(preset.brightness - brightness)
    const rimPenalty = preset.rimLight === rimLight ? 0 : 15
    const score = directionPenalty + brightnessPenalty + rimPenalty

    if (score < bestScore) {
      bestScore = score
      bestName = preset.name
    }
  })

  return bestName
}

function buildLightingPrompt({
  direction,
  brightness,
  color,
  rimLight,
  smartMode
}: {
  direction: LightDirection
  brightness: number
  color: string
  rimLight: boolean
  smartMode: boolean
}) {
  const parts = [LIGHT_DIRECTION_PROMPTS[direction], getBrightnessPrompt(brightness)]
  const colorPrompt = getColorPrompt(color)
  if (colorPrompt) parts.push(colorPrompt)
  if (rimLight) parts.push('rim light, edge lighting, hair light, backlit contour')
  if (smartMode) {
    const matchedPreset = SMART_PRESET_OPTIONS.find(
      (preset) => preset.name === inferSmartPresetName({ direction, brightness, rimLight })
    )
    if (matchedPreset?.prompt) parts.push(matchedPreset.prompt)
  }
  return parts.filter(Boolean).join(', ')
}

export function getDefaultLightingToolState() {
  return {
    direction: '前方' as LightDirection,
    brightness: 68,
    color: '#ffffff',
    rimLight: false,
    smartMode: true
  }
}

export function normalizeLightingToolState(state?: any) {
  return {
    ...getDefaultLightingToolState(),
    ...(state || {})
  }
}

export function buildHiddenLightingPrompt(state?: any) {
  if (!state) return ''
  return buildLightingPrompt(normalizeLightingToolState(state))
}

function FloatingShell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      className="relative w-[400px] rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        title="收起"
      >
        <X size={14} />
      </button>
      {children}
    </div>
  )
}

function PreviewBlock({ previewImage }: { previewImage?: string | null }) {
  if (!previewImage) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-secondary)] text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
        <div>
          <div className="text-[var(--text-secondary)]">先放入参考图或生成一张图</div>
          <div className="mt-1">这样角度和打光会更直观</div>
        </div>
      </div>
    )
  }

  return (
    <div className="aspect-[16/9] w-full overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-[var(--shadow-sm)]">
      <img
        src={getXingheMediaSrc(previewImage)}
        alt="preview"
        className="h-full w-full object-cover"
        draggable={false}
      />
    </div>
  )
}

function CameraPanel({
  previewImage,
  initialState,
  onApply,
  onClear,
  onClose
}: {
  previewImage?: string | null
  initialState?: any
  onApply?: (state: any) => void
  onClear?: () => void
  onClose?: () => void
}) {
  const initial = normalizeCameraToolState(initialState)
  const [azimuth, setAzimuth] = useState(initial.azimuth)
  const [elevation, setElevation] = useState(initial.elevation)
  const [scale, setScale] = useState(initial.scale)
  const [presetPrompt, setPresetPrompt] = useState(initial.presetPrompt)
  const [activePreset, setActivePreset] = useState(initial.activePreset)

  const handleAngleChange = useCallback((nextAzimuth: number, nextElevation: number) => {
    setAzimuth(nextAzimuth)
    setElevation(nextElevation)
    setActivePreset('自定义')
    setPresetPrompt('')
  }, [])

  const handlePreset = useCallback((preset: (typeof CAMERA_PRESETS)[number]) => {
    setAzimuth(preset.azimuth)
    setElevation(preset.elevation)
    setScale(preset.scale)
    setActivePreset(preset.label)
    setPresetPrompt(preset.prompt || '')
  }, [])

  const handleReset = useCallback(() => {
    const nextState = getDefaultCameraToolState()
    setAzimuth(nextState.azimuth)
    setElevation(nextState.elevation)
    setScale(nextState.scale)
    setPresetPrompt(nextState.presetPrompt)
    setActivePreset(nextState.activePreset)
  }, [])

  return (
    <FloatingShell onClose={onClose}>
      <PanelHeader
        icon={<Camera size={16} />}
        title="多角度编辑器"
        subtitle="拖动球体或点预设，生成时会自动带上角度效果。"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {CAMERA_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePreset(preset)}
            className={`rounded-xl border px-3 py-1.5 text-[11px] font-medium transition-all ${
              activePreset === preset.label
                ? 'border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)]'
                : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)]/70 p-3">
          <LightSphereControl
            azimuth={azimuth}
            elevation={elevation}
            onAngleChange={handleAngleChange}
            mode="camera"
            previewImage={previewImage || undefined}
            size={160}
          />
        </div>

        <div className="flex flex-col gap-4">
          <PreviewBlock previewImage={previewImage} />
          <SliderField
            label="水平环绕"
            value={`${azimuth}°`}
            min={-180}
            max={180}
            current={azimuth}
            onChange={(value) => {
              setAzimuth(value)
              setActivePreset('自定义')
              setPresetPrompt('')
            }}
          />
          <SliderField
            label="垂直俯仰"
            value={`${elevation}°`}
            min={-90}
            max={90}
            current={elevation}
            onChange={(value) => {
              setElevation(value)
              setActivePreset('自定义')
              setPresetPrompt('')
            }}
          />
          <SliderField
            label="景别缩放"
            value={getScaleLabel(scale)}
            min={0}
            max={200}
            current={Math.round(scale * 100)}
            onChange={(value) => {
              setScale(value / 100)
              setActivePreset('自定义')
              setPresetPrompt('')
            }}
          />
        </div>
      </div>

      <PanelFooter
        onReset={handleReset}
        onClear={onClear}
        onApply={() => {
          onApply?.({ azimuth, elevation, scale, presetPrompt, activePreset })
          onClose?.()
        }}
      />
    </FloatingShell>
  )
}

function LightingPanel({
  previewImage,
  initialState,
  onApply,
  onClear,
  onClose
}: {
  previewImage?: string | null
  initialState?: any
  onApply?: (state: any) => void
  onClear?: () => void
  onClose?: () => void
}) {
  const initial = normalizeLightingToolState(initialState)
  const [direction, setDirection] = useState<LightDirection>(initial.direction)
  const [brightness, setBrightness] = useState(initial.brightness)
  const [color, setColor] = useState(initial.color)
  const [rimLight, setRimLight] = useState(initial.rimLight)
  const [smartMode, setSmartMode] = useState(initial.smartMode)

  const inferredSmartPreset = useMemo(
    () => inferSmartPresetName({ direction, brightness, rimLight }),
    [brightness, direction, rimLight]
  )

  const handleAngleChange = useCallback((azimuth: number, elevation: number) => {
    let nearestDirection: LightDirection = '前方'
    let nearestDistance = Number.POSITIVE_INFINITY

    Object.entries(LIGHT_DIRECTION_ANGLES).forEach(([name, angle]) => {
      const distance = Math.abs(angle.azimuth - azimuth) + Math.abs(angle.elevation - elevation)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestDirection = name as LightDirection
      }
    })

    setDirection(nearestDirection)
  }, [])

  const handleReset = useCallback(() => {
    const nextState = getDefaultLightingToolState()
    setDirection(nextState.direction)
    setBrightness(nextState.brightness)
    setColor(nextState.color)
    setRimLight(nextState.rimLight)
    setSmartMode(nextState.smartMode)
  }, [])

  return (
    <FloatingShell onClose={onClose}>
      <PanelHeader
        icon={<Sun size={16} />}
        title="打光编辑器"
        subtitle="先定主光方向，再细调亮度和色温，生成时自动应用。"
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ToggleChip
          label="智能模式"
          active={smartMode}
          onClick={() => setSmartMode((value) => !value)}
        />
        <ToggleChip
          label="轮廓光"
          active={rimLight}
          onClick={() => setRimLight((value) => !value)}
        />
      </div>

      {smartMode && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SMART_PRESET_OPTIONS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => {
                setDirection(preset.direction)
                setBrightness(preset.brightness)
                setRimLight(preset.rimLight)
              }}
              className={`rounded-xl border px-3 py-1.5 text-[11px] font-medium transition-all ${
                inferredSmartPreset === preset.name
                  ? 'border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)]'
                  : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)]/70 p-3">
          <LightSphereControl
            azimuth={LIGHT_DIRECTION_ANGLES[direction].azimuth}
            elevation={LIGHT_DIRECTION_ANGLES[direction].elevation}
            onAngleChange={handleAngleChange}
            mode="light"
            previewImage={previewImage || undefined}
            size={160}
          />
        </div>

        <div className="flex flex-col gap-4">
          <PreviewBlock previewImage={previewImage} />
          <SliderField
            label="亮度"
            value={`${brightness}%`}
            min={0}
            max={100}
            current={brightness}
            onChange={setBrightness}
          />

          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[11px] font-medium text-[var(--text-secondary)]">
              色温
            </span>
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-8 w-12 cursor-pointer rounded-lg border border-[var(--border-color)] bg-transparent"
            />
            <span className="text-[11px] font-mono text-[var(--text-muted)]">{color}</span>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-medium text-[var(--text-secondary)]">
              主光方向
            </div>
            <div className="grid grid-cols-3 gap-2">
              {LIGHT_DIRECTIONS.map((item) => (
                <button
                  key={item}
                  onClick={() => setDirection(item)}
                  className={`rounded-xl border px-2.5 py-2 text-[11px] transition-all ${
                    direction === item
                      ? 'border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)]'
                      : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <PanelFooter
        onReset={handleReset}
        onClear={onClear}
        onApply={() => {
          onApply?.({ direction, brightness, color, rimLight, smartMode })
          onClose?.()
        }}
      />
    </FloatingShell>
  )
}

function PanelHeader({
  icon,
  title,
  subtitle
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-start gap-2.5 pr-10">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)]">
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-[var(--text-primary)]">{title}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
          {subtitle}
        </div>
      </div>
    </div>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  current,
  onChange
}: {
  label: string
  value: string
  min: number
  max: number
  current: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[11px] font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={current}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1 accent-[var(--primary-color)]"
      />
      <span className="w-14 shrink-0 text-right text-[11px] font-medium text-[var(--text-primary)]">
        {value}
      </span>
    </div>
  )
}

function ToggleChip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all ${
        active
          ? 'border-[var(--border-strong)] bg-[var(--bg-hover)] text-[var(--text-primary)]'
          : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Sparkles size={11} />
      <span>{label}</span>
    </button>
  )
}

function PanelFooter({
  onReset,
  onClear,
  onApply
}: {
  onReset: () => void
  onClear?: () => void
  onApply: () => void
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)]/60 p-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw size={12} />
          <span>重置参数</span>
        </button>
        {onClear && (
          <button
            onClick={onClear}
            className="rounded-xl border border-[var(--border-color)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            清除效果
          </button>
        )}
      </div>
      <div>
        <button
          onClick={onApply}
          className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-1.5 text-[11px] font-semibold text-[var(--text-primary)] shadow-none transition-all hover:bg-[var(--bg-hover)]"
        >
          应用设置
        </button>
      </div>
    </div>
  )
}

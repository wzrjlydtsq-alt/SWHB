/**
 * cameraPresets.ts — 多角度编辑器预设 + 角度→Prompt 映射
 */

export interface CameraPreset {
  label: string
  azimuth: number // 水平环绕
  elevation: number // 垂直俯仰
  scale: number // 景别 0~2 (0=特写, 1=中景, 2=远景)
  prompt: string
}

// 预设按钮
export const CAMERA_PRESETS: CameraPreset[] = [
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
]

// 垂直角度 → 镜头术语
export function getVerticalPrompt(elevation: number): string {
  if (elevation > 70) return "bird's eye view, top-down"
  if (elevation > 45) return 'high angle shot, looking down, overhead'
  if (elevation > 15) return 'slightly elevated angle, high angle'
  if (elevation > -15) return 'eye-level shot'
  if (elevation > -45) return 'low angle shot, looking up'
  return "worm's eye view, extreme low angle"
}

// 水平角度 → 方位术语
export function getHorizontalPrompt(azimuth: number): string {
  const abs = Math.abs(azimuth)
  const side = azimuth >= 0 ? 'right' : 'left'
  if (abs < 22) return 'front view'
  if (abs < 67) return `three-quarter view from ${side}`
  if (abs < 112) return `${side} side view, profile`
  if (abs < 157) return `rear three-quarter view from ${side}`
  return 'back view, rear view'
}

// 景别缩放 → 景别术语
export function getScalePrompt(scale: number): string {
  if (scale < 0.2) return 'extreme close-up (ECU)'
  if (scale < 0.4) return 'close-up (CU)'
  if (scale < 0.6) return 'medium close-up (MCU)'
  if (scale < 0.8) return 'medium shot (MS)'
  if (scale < 1.2) return 'medium wide shot'
  if (scale < 1.8) return 'wide shot (WS)'
  return 'extreme wide shot (EWS)'
}

// 景别缩放值→中文标签
export function getScaleLabel(scale: number): string {
  if (scale < 0.2) return '大特写'
  if (scale < 0.4) return '特写'
  if (scale < 0.6) return '近景'
  if (scale < 0.8) return '中景'
  if (scale < 1.2) return '中远景'
  if (scale < 1.8) return '远景'
  return '大远景'
}

function dedupeParts(parts: string[]): string[] {
  const seen = new Set<string>()
  return parts.filter((part) => {
    const key = part.trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// 组合完整 Prompt
export function buildCameraPrompt(
  azimuth: number,
  elevation: number,
  scale: number,
  presetPrompt = ''
): string {
  const parts = dedupeParts([
    presetPrompt,
    getHorizontalPrompt(azimuth),
    getVerticalPrompt(elevation),
    getScalePrompt(scale)
  ])
  return parts.filter(Boolean).join(', ')
}

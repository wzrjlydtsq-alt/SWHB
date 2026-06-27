/**
 * lightingPresets.ts — 打光效果预设 + 光源→Prompt 映射
 */

export type LightDirection = '左侧' | '顶部' | '右侧' | '前方' | '底部' | '后方'

export interface LightingState {
  direction: LightDirection
  brightness: number // 0-100
  color: string // hex
  rimLight: boolean
  smartMode: boolean
  viewMode: 'perspective' | 'front'
}

// 光源方向→Prompt
export const DIRECTION_PROMPT_MAP: Record<LightDirection, string> = {
  左侧: 'key light from left side, dramatic side lighting, split lighting',
  顶部: 'overhead lighting, top-down illumination, zenith light',
  右侧: 'key light from right side, Rembrandt lighting',
  前方: 'front lighting, fill light, flat illumination, beauty dish',
  底部: 'under lighting, horror lighting, low key, campfire glow',
  后方: 'backlit, rim lighting, silhouette, halo effect, lens flare'
}

// 方向→球体角度
export const DIRECTION_ANGLE_MAP: Record<LightDirection, { azimuth: number; elevation: number }> = {
  左侧: { azimuth: -90, elevation: 0 },
  顶部: { azimuth: 0, elevation: 80 },
  右侧: { azimuth: 90, elevation: 0 },
  前方: { azimuth: 0, elevation: 0 },
  底部: { azimuth: 0, elevation: -70 },
  后方: { azimuth: 180, elevation: 0 }
}

// 亮度→Prompt
export function getBrightnessPrompt(brightness: number): string {
  if (brightness < 25) return 'very dim lighting, barely visible, deep shadows'
  if (brightness < 50) return 'soft diffused lighting, gentle illumination, low key'
  if (brightness < 75) return 'well-lit, balanced lighting, moderate shadows'
  return 'intense bright lighting, harsh shadows, high key, overexposed highlights'
}

// 颜色→Prompt
export function getColorPrompt(hex: string): string {
  if (!hex || hex === '#ffffff' || hex === '#FFFFFF') return ''

  // 解析 HSL
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const sat = max - min

  if (sat < 0.15) return '' // 近白色/灰色 — 不追加

  let hue = 0
  if (max === r) hue = ((g - b) / (max - min)) * 60
  else if (max === g) hue = (2 + (b - r) / (max - min)) * 60
  else hue = (4 + (r - g) / (max - min)) * 60
  if (hue < 0) hue += 360

  if (hue < 30 || hue >= 330) return 'warm red-tinted lighting, dramatic mood'
  if (hue < 70) return 'golden warm lighting, sunset tones, tungsten'
  if (hue < 150) return 'eerie green lighting, matrix-style, toxic glow'
  if (hue < 260) return 'cool blue lighting, moonlight, clinical'
  return 'purple ambient light, ultraviolet, neon mood'
}

// 智能模式预设
export const SMART_PRESETS = {
  伦勃朗光: {
    direction: '右侧' as LightDirection,
    brightness: 60,
    rimLight: false,
    prompt: 'Rembrandt lighting, dramatic triangle of light on cheek'
  },
  蝴蝶光: {
    direction: '前方' as LightDirection,
    brightness: 70,
    rimLight: false,
    prompt: 'butterfly lighting, glamour lighting, shadow under nose'
  },
  环形光: {
    direction: '前方' as LightDirection,
    brightness: 80,
    rimLight: true,
    prompt: 'ring light, even illumination, catchlight in eyes'
  },
  逆光剪影: {
    direction: '后方' as LightDirection,
    brightness: 90,
    rimLight: true,
    prompt: 'backlit silhouette, dramatic rim lighting, lens flare'
  },
  恐怖光: {
    direction: '底部' as LightDirection,
    brightness: 40,
    rimLight: false,
    prompt: 'horror underlighting, sinister uplight, campfire glow'
  }
}

export function inferSmartPresetName(
  state: Pick<LightingState, 'direction' | 'brightness' | 'rimLight'>
): keyof typeof SMART_PRESETS {
  let bestName: keyof typeof SMART_PRESETS = '伦勃朗光'
  let bestScore = Number.POSITIVE_INFINITY

  for (const [name, preset] of Object.entries(SMART_PRESETS) as Array<
    [keyof typeof SMART_PRESETS, (typeof SMART_PRESETS)[keyof typeof SMART_PRESETS]]
  >) {
    const directionPenalty = preset.direction === state.direction ? 0 : 30
    const brightnessPenalty = Math.abs(preset.brightness - state.brightness)
    const rimPenalty = preset.rimLight === state.rimLight ? 0 : 15
    const score = directionPenalty + brightnessPenalty + rimPenalty

    if (score < bestScore) {
      bestScore = score
      bestName = name
    }
  }

  return bestName
}

// 组合完整 Prompt
export function buildLightingPrompt(state: LightingState): string {
  const parts: string[] = []

  // 方向
  parts.push(DIRECTION_PROMPT_MAP[state.direction])

  // 亮度
  parts.push(getBrightnessPrompt(state.brightness))

  // 颜色
  const colorPrompt = getColorPrompt(state.color)
  if (colorPrompt) parts.push(colorPrompt)

  // 轮廓光
  if (state.rimLight) parts.push('rim light, edge lighting, hair light, backlit contour')

  if (state.smartMode) {
    const matchedPreset = SMART_PRESETS[inferSmartPresetName(state)]
    if (matchedPreset?.prompt) {
      parts.push(matchedPreset.prompt)
    }
  }

  return parts.join(', ')
}

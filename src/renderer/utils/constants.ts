export const VIRTUAL_CANVAS_WIDTH = 4000
export const VIRTUAL_CANVAS_HEIGHT = 4000

// --- 默认配置 ---
export const T8STAR_IMAGE_GATEWAY_URL = 'https://ai.t8star.org'
export const OPENAI_COMPATIBLE_GATEWAY_URL = 'http://8.209.238.65:8080'
export const DEFAULT_BASE_URL = ''
export const LINGJING_XINGHE_TOP_GATEWAY_URL = 'https://www.lingjingxinghe.top'
export const MODEL_API_BASE_URL_OPTIONS = [
  { label: 'T8Star 图片网关（旧 GPT Image 2）', value: T8STAR_IMAGE_GATEWAY_URL },
  { label: 'Sub2API 网关（新 GPT Image 2 / 对话）', value: OPENAI_COMPATIBLE_GATEWAY_URL },
  { label: 'Aliyun DashScope', value: 'https://dashscope.aliyuncs.com' },
  { label: 'Lingjing Xinghe Top', value: LINGJING_XINGHE_TOP_GATEWAY_URL },
]
export const MODEL_API_BASE_URLS = MODEL_API_BASE_URL_OPTIONS.map((option) => option.value)
const MODEL_API_BASE_URL_ALIASES = new Map([
  ['http://lingjingxinghe.top', LINGJING_XINGHE_TOP_GATEWAY_URL],
  ['https://lingjingxinghe.top', LINGJING_XINGHE_TOP_GATEWAY_URL]
])
export const DEFAULT_VIDEO_URL = DEFAULT_BASE_URL
export const DEFAULT_GROUP_API_URLS = {
  Chat: '',
  Image: '',
  Video: ''
}

const LEGACY_VIDEO_GATEWAY_URLS = new Set<string>()

const normalizeModelApiBaseUrlValue = (value) =>
  String(value || '')
    .trim()
    .replace(/\/+$/, '')

const getCanonicalModelApiBaseUrl = (value) => {
  const normalized = normalizeModelApiBaseUrlValue(value)
  const normalizedLower = normalized.toLowerCase()
  const matched = MODEL_API_BASE_URLS.find((url) => url.toLowerCase() === normalizedLower)
  if (matched) return matched
  return MODEL_API_BASE_URL_ALIASES.get(normalizedLower) || ''
}

export const isAllowedModelApiBaseUrl = (value) => {
  return Boolean(getCanonicalModelApiBaseUrl(value))
}

export const normalizeModelApiBaseUrl = (value, fallback = DEFAULT_BASE_URL) => {
  const matched = getCanonicalModelApiBaseUrl(value)
  if (matched) return matched

  const fallbackMatched = getCanonicalModelApiBaseUrl(fallback)
  return fallbackMatched || DEFAULT_BASE_URL
}

export const normalizeOptionalModelApiBaseUrl = (value, fallback = '') => {
  const normalized = normalizeModelApiBaseUrlValue(value)
  if (!normalized) return ''
  return normalizeModelApiBaseUrl(normalized, fallback || DEFAULT_BASE_URL)
}

export const isKnownLegacyVideoGatewayUrl = (value) => {
  const normalized = String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase()
  return LEGACY_VIDEO_GATEWAY_URLS.has(normalized)
}

export const normalizeKnownLegacyVideoGatewayUrl = (value, fallback = DEFAULT_VIDEO_URL) => {
  return normalizeModelApiBaseUrl(value, fallback)
}

// 即梦API配置（代理地址，默认本地5100端口）
export const JIMENG_API_BASE_URL = 'http://localhost:5100'
export const JIMENG_SESSION_ID = '28166090-b3b8-4c3d-8a6b-36319c608723'

export const DEFAULT_API_CONFIGS = [
  // ─── Chat Models ───
  {
    id: 'gpt-5.5',
    provider: 'GPT 5.5',
    modelName: 'gpt-5.5',
    type: 'Chat',
    key: '',
    url: DEFAULT_BASE_URL
  },
  {
    id: 'claude-opus-4-6',
    provider: 'Claude Opus 4.6',
    modelName: 'claude-opus-4-6',
    type: 'Chat',
    key: '',
    url: DEFAULT_BASE_URL
  },
  {
    id: 'kimi-k2.6',
    provider: 'Kimi K2.6',
    modelName: 'kimi-k2.6',
    type: 'Chat',
    key: '',
    url: DEFAULT_BASE_URL
  },

  // ─── Image Models ───
  {
    id: 'nano-banana',
    provider: 'Nano Banana Pro',
    modelName: 'nano-banana-pro',
    type: 'Image',
    key: '',
    url: DEFAULT_BASE_URL
  },
  {
    id: 'nano-banana-3.1',
    provider: 'Nano Banana 3.1 Flash',
    modelName: 'gemini-3.1-flash-image-preview',
    type: 'Image',
    key: '',
    url: DEFAULT_BASE_URL
  },
  {
    id: 'gemini-3.1-flash-image-preview-2k',
    provider: 'Gemini 3.1 Flash Image 2K',
    modelName: 'gemini-3.1-flash-image-preview-2k',
    type: 'Image',
    key: '',
    url: DEFAULT_BASE_URL
  },
  {
    id: 'nano-banana-pro-2k',
    provider: 'Nano Banana Pro 2K',
    modelName: 'nano-banana-pro-2k',
    type: 'Image',
    key: '',
    url: DEFAULT_BASE_URL
  },
  {
    id: 'gpt-image-2',
    provider: 'GPT Image 2',
    modelName: 'gpt-image-2',
    type: 'Image',
    key: '',
    url: ''
  },
  {
    id: 'sub2api-gpt-image-2',
    provider: 'Sub2API',
    modelName: 'gpt-image-2',
    type: 'Image',
    key: '',
    url: ''
  },

  // ─── Video Models ───
  {
    id: 'doubao-seedance-2',
    provider: 'doubao',
    modelName: 'doubao-seedance-2',
    type: 'Video',
    key: '',
    url: '',
    durations: ['5s', '8s', '11s', '15s']
  },
  {
    id: 'doubao-seedance-2.0-fast',
    provider: 'Doubao-Seedance-2.0-fast',
    modelName: 'Doubao-Seedance-2.0-fast',
    type: 'Video',
    key: '',
    url: '',
    durations: ['5s', '8s', '11s', '15s']
  },

  // ─── HappyHorse (阿里 DashScope) ───
  {
    id: 'happyhorse-1.1-t2v',
    provider: 'HappyHorse 1.1 T2V',
    modelName: 'happyhorse-1.1-t2v',
    type: 'Video',
    key: '',
    url: '',
    durations: ['3s', '5s', '8s', '10s', '15s']
  },
  {
    id: 'happyhorse-1.1-i2v',
    provider: 'HappyHorse 1.1 I2V',
    modelName: 'happyhorse-1.1-i2v',
    type: 'Video',
    key: '',
    url: '',
    durations: ['3s', '5s', '8s', '10s', '15s']
  },
  {
    id: 'happyhorse-1.1-r2v',
    provider: 'HappyHorse 1.1 R2V',
    modelName: 'happyhorse-1.1-r2v',
    type: 'Video',
    key: '',
    url: '',
    durations: ['3s', '5s', '8s', '10s', '15s']
  },
  {
    id: 'happyhorse-video-edit',
    provider: 'HappyHorse 视频编辑',
    modelName: 'happyhorse-1.0-video-edit',
    type: 'Video',
    key: '',
    url: '',
    durations: ['3s', '5s', '8s', '10s', '15s']
  }
]

export const RATIOS = [
  'Auto',
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '21:9',
  '3:2',
  '2:3',
  '4:5',
  '5:4',
  '4:1',
  '8:1',
  '1:4',
  '1:8'
]

export const VIDEO_RES_OPTIONS = ['1080P', '720P']
export const SEEDANCE_VIDEO_RES_OPTIONS = ['720p', '480p']
export const SEEDANCE_VIDEO_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
export const PROMPT_LIBRARY_KEY = 'tapnow_prompt_library'
export const GRID_PROMPT_TEXT = `基于我上传的这张参考图，生成一张九宫格（3x3 grid）布局的分镜脚本。请严格保持角色与参考图一致（Keep character strictly consistent），但在9个格子中展示该角色不同的动作、表情和拍摄角度（如正面、侧面、背面、特写等）。要求风格高度统一，形成一张完整的角色动态表（Character Sheet）。`
export const UPSCALE_PROMPT_TEXT = `请对参考图片进行无损高清放大（Upscale）。请严格保持原图的构图、色彩、光影和所有细节元素不变，不要进行任何创造性的重绘或添加新内容。仅专注于提升分辨率、锐化边缘（Sharpening）和去除噪点（Denoising），实现像素级的高清修复。Best quality, 8k, masterpiece, highres, ultra detailed, sharp focus, image restoration, upscale, faithful to original.`
export const STORYBOARD_PROMPT_TEXT = `you are a veteran Hollywood storyboard artist with years of experience. You have the ability to accurately analyze character features and scene characteristics based on images. Provide me with the most suitable camera angles and storyboards. Strictly base this on the uploaded character and scene images, while maintaining a consistent visual style.

MANDATORY LAYOUT: Create a precise 3x3 GRID containing exactly 9 distinct panels.

- The output image MUST be a single image divided into a 3 (rows) by 3 (columns) matrix.
- There must be EXACTLY 3 horizontal rows and 3 vertical columns.
- Each panel must be completely separated by a thin, distinct, solid black line.
- DO NOT create a collage. DO NOT overlap images. DO NOT create random sizes. 
- The grid structure must be perfectly aligned for slicing.

Subject Content: "[在此处填充你对故事的描述]"

Styling Instructions:
- Each panel shows the SAME subject/scene from a DIFFERENT angle (e.g., Front, Side, Back, Action, Close-up).
- Maintain perfect consistency of the character/object across all panels.
- Cinematic lighting, high fidelity, 8k resolution.

Negative Constraints:
- No text, no captions, no UI elements.
- No watermarks.
- No broken grid lines.`

export const CHARACTER_SHEET_PROMPT_TEXT = `(strictly mimic source image art style:1.5), (same visual style:1.4),
score_9, score_8_up, masterpiece, best quality, (character sheet:1.4), (reference sheet:1.3), (consistent art style:1.3), matching visual style, 

[Structure & General Annotations]:
multiple views, full body central figure, clean background, 
(heavy annotation:1.4), (text labels with arrows:1.3), handwriting, data readout,

[SPECIAL CHARACTER DESCRIPTION AREA]:
(prominent character profile text box:1.6), (dedicated biography section:1.5), large descriptive text block,
[在此处填写特殊角色说明，例如：姓名、种族、背景故事等],

[Clothing Breakdown]:
(clothing breakdown:1.5), (outfit decomposition:1.4), garment analysis, (floating apparel:1.3), 
displaying outerwear, displaying upper body garment, displaying lower body garment, 

[Footwear Focus]:
(detailed footwear display:1.5), (floating shoes:1.4), shoe design breakdown, focus on shoes, 

[Inventory & Details]:
(inventory knolling:1.2), open container, personal accessories, organized items display, expression panels`

export const MOOD_BOARD_PROMPT_TEXT = `# Directive: Create a "Rich Narrative Mood Board" (8-Grid Layout)

## 1. PROJECT INPUT 

**A. [Story & Concept / 故事与核心想法]**
> [跟据自身内容书写]

**B. [Key Symbols / 核心意象 (Optional)]**
> [深度理解参考图，自行创作]

**C. [Color Preferences / 色彩倾向 (Optional)]**
> [深度理解参考图，自行创作]

**D. [Reference Images / 参考图]**
> (See attached images / 请读取我上传的图片)

---

## 2. Role Definition
Act as a **Senior Art Director**. Synthesize the Input above into a single, cohesive, high-density **Visual Mood Board** using a complex **8-Panel Asymmetrical Grid Layout**.

## 3. Layout Mapping (Strict Adherence)
You must design a visual composition that tells the story through **8 distinct panels** within one image. **Do not** generate random grids. Map the content exactly as follows:

* **Panel 1 (The World):** A wide, cinematic establishing shot of the environment (based on Input A).
* **Panel 2 (The Protagonist):** A portrait close-up (based on reference images), focusing on micro-expressions.
* **Panel 3 (The Metaphor):** An **abstract symbolic object** representing the core theme (based on Input B).
* **Panel 4 (The Palette):** A graphical **Color Palette Strip** showcasing 5 specific colors extracted from the scene.
* **Panel 5 (The Texture):** Extreme macro close-up of a material surface (e.g., rust, skin, fabric) to add tactile richness.
* **Panel 6 (The Motion):** A motion-blurred or long-exposure shot representing time/chaos.
* **Panel 7 (The Detail):** A focused shot of a specific prop or accessory relevant to the plot.
* **Panel 8 (The AI Art Interpretation - CRITICAL):** This is your **free creative space**. Generate an artistic, surreal, or abstract re-interpretation of the story's emotion. **Do not just copy the inputs.** Create a "Vibe Image" (e.g., Double Exposure, Oil Painting style, or abstract geometry) that captures the *soul* of the narrative.

## 4. Execution Requirements
* **Composition Style:** High-end Editorial / Magazine Layout. Clean, thin white borders.
* **Visual Unity:** All panels must share the same lighting conditions and color grading logic (Unified Aesthetic).
* **Task:** Provide the **Final English Image Prompt** that explicitly describes this 8-grid layout, ensuring Panel 8 stands out as an artistic variation.`

// 已删除的模型ID列表（用于过滤）
export const DELETED_MODEL_IDS = [
  'gemini-image',
  'qwen-image',
  'doubao-seedream',
  'jimeng', // Jimeng Video
  'hailuo-02',
  'kling-v1-6',
  'wan-2.5',
  // 精简后移除的模型
  'gpt-5-1',
  'gpt-5-2',
  'deepseek-v3',
  'gemini-3.1-pro',
  'sub2api-openai-chat',
  'gpt-5.4',
  'deepseek-v3.1',
  'kimi-k2.5',
  'minimax-m2.7',
  'gemini-3-pro-preview',
  'custom-1779327873664',
  'gpt-4o',
  'nano-banana-2',
  'gemini-3.1-flash-image-preview-4',
  'nano-banana-pro-4k',
  'doubao-seedream-5',
  'gpt-image',
  'gpt-image-1.5',
  'flux-kontext',
  'mj-v6',
  'jimeng-4.5',
  'jimeng-4.1',
  'jimeng-3.1',
  'sora-2',
  'sora-2-pro',
  'grok-video-3',
  'happyhorse-t2v',
  'happyhorse-i2v',
  'happyhorse-r2v',
  'seedance-2',
  'veo3.1-components',
  'veo3.1'
]

export const NANO_BANANA_31_RATIOS = [
  'Auto',
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '21:9',
  '3:2',
  '2:3',
  '4:5',
  '5:4',
  '4:1',
  '8:1',
  '1:4',
  '1:8'
]

export const getRatiosForModel = (modelId) => {
  if (!modelId) return RATIOS
  const lowerModelId = String(modelId).toLowerCase()
  if (lowerModelId.includes('seedance')) return SEEDANCE_VIDEO_RATIOS
  if (modelId.includes('nano-banana-3.1') || modelId.includes('gemini-3.1-flash-image'))
    return NANO_BANANA_31_RATIOS
  return RATIOS
}
export const RESOLUTIONS = ['Auto', '1K', '2K', '4K']

// 根据模型返回不同的分辨率选项
export const getResolutionsForModel = (modelId) => {
  if (!modelId) return RESOLUTIONS
  const lowerModelId = String(modelId).toLowerCase()
  if (lowerModelId.includes('seedance')) return SEEDANCE_VIDEO_RES_OPTIONS
  // jimeng-4.5模型只显示2K和4K两个选项
  if (lowerModelId.includes('jimeng-4.5')) return ['2K', '4K']
  // nano-banana-3.1 支持 512/1K/2K/4K
  if (
    lowerModelId.includes('nano-banana-3.1') ||
    lowerModelId.includes('gemini-3.1-flash-image')
  )
    return ['512', '1K', '2K', '4K']
  // nano-banana 支持 1K/2K/4K
  if (lowerModelId.includes('nano-banana')) return ['1K', '2K', '4K']
  // gpt-image-2 支持 1K/2K/4K 分辨率档位
  if (modelId.includes('gpt-image')) return ['1K', '2K', '4K']
  // Seedream 5.0 支持 2K/3K
  if (lowerModelId.includes('gpt-image')) return ['1K', '2K', '4K']
  if (lowerModelId.includes('seedream')) return ['2K', '3K']
  return RESOLUTIONS
}

// Midjourney版本列表
export const MJ_VERSIONS = [
  { label: 'MJ V7', value: '--v 7' },
  { label: 'MJ V6.1', value: '--v 6.1' },
  { label: 'MJ V6', value: '--v 6' },
  { label: 'MJ V5.2', value: '--v 5.2' },
  { label: 'MJ V5.1', value: '--v 5.1' },
  { label: 'Niji V6', value: '--niji 6' },
  { label: 'Niji V5', value: '--niji 5' },
  { label: 'Niji V4', value: '--niji 4' }
]

// --- 辅助：计算真实分辨率 ---
export const calculateResolution = (ratio, baseResolution) => {
  const normalizedResolution = String(baseResolution || 'Auto').toUpperCase()
  let baseW = 1024
  let baseH = 1024

  if (normalizedResolution === '1080P') {
    baseW = 1920
    baseH = 1080
  } else if (normalizedResolution === '720P') {
    baseW = 1280
    baseH = 720
  } else if (normalizedResolution === '480P') {
    baseW = 854
    baseH = 480
  } else if (normalizedResolution === '2K') {
    baseW = 2048
    baseH = 2048
  } else if (normalizedResolution === '4K') {
    baseW = 3840
    baseH = 2160
  }

  if (ratio === 'Auto') {
    return { str: `${baseW}x${baseH}`, w: baseW, h: baseH }
  }

  const [rW, rH] = ratio.split(':').map(Number)
  if (!rW || !rH) return { str: '1024x1024', w: 1024, h: 1024 }

  let targetW
  let targetH

  if (Math.abs(rW - rH) < 0.1) {
    targetW = baseW
    targetH = baseH
  } else if (rW > rH) {
    targetW = normalizedResolution === 'AUTO' || normalizedResolution === '1K' ? 1280 : baseW
    targetH = Math.round(targetW * (rH / rW))
  } else {
    targetH = normalizedResolution === 'AUTO' || normalizedResolution === '1K' ? 1280 : baseW
    targetW = Math.round(targetH * (rW / rH))
  }

  targetW = Math.round(targetW / 16) * 16
  targetH = Math.round(targetH / 16) * 16

  return { str: `${targetW}x${targetH}`, w: targetW, h: targetH }
}

export const normalizeSeedanceVideoRatio = (ratio) => {
  const normalized = String(ratio || '').trim()
  if (normalized.toLowerCase() === 'auto' || normalized.toLowerCase() === 'adaptive') {
    return 'adaptive'
  }
  return SEEDANCE_VIDEO_RATIOS.includes(normalized) ? normalized : '16:9'
}

export const normalizeSeedanceVideoResolution = (resolution, fallback = '720p') => {
  const normalized = String(resolution || '').trim().toLowerCase()
  return SEEDANCE_VIDEO_RES_OPTIONS.includes(normalized) ? normalized : fallback
}

const SEEDANCE_VIDEO_DIMENSIONS = {
  '480p': {
    '16:9': { w: 864, h: 496 },
    '9:16': { w: 496, h: 864 },
    '1:1': { w: 640, h: 640 },
    '4:3': { w: 752, h: 560 },
    '3:4': { w: 560, h: 752 },
    '21:9': { w: 992, h: 432 }
  },
  '720p': {
    '16:9': { w: 1280, h: 720 },
    '9:16': { w: 720, h: 1280 },
    '1:1': { w: 960, h: 960 },
    '4:3': { w: 1112, h: 834 },
    '3:4': { w: 834, h: 1112 },
    '21:9': { w: 1470, h: 630 }
  }
}

export const getModelParams = (modelId, ratio, resolution) => {
  const { w, h } = calculateResolution(ratio, resolution)
  const lowerModelId = String(modelId || '').toLowerCase()
  const seedanceResolution = normalizeSeedanceVideoResolution(resolution)

  if (lowerModelId.includes('minimax')) {
    return { sizeStr: resolution === '4K' ? '1080p' : '720p', w, h }
  }
  if (lowerModelId.includes('seedance')) {
    const seedanceRatio = normalizeSeedanceVideoRatio(ratio)
    const dimensionRatio = seedanceRatio === 'adaptive' ? '16:9' : seedanceRatio
    const dimensions = SEEDANCE_VIDEO_DIMENSIONS[seedanceResolution]?.[dimensionRatio]
    return { sizeStr: seedanceResolution, w: dimensions?.w || w, h: dimensions?.h || h }
  }
  if (lowerModelId.includes('jimeng')) {
    return { sizeStr: ratio, w, h }
  }
  if (lowerModelId.includes('nano-banana-3.1') || lowerModelId.includes('gemini-3.1-flash-image')) {
    return { sizeStr: resolution === 'Auto' ? '2K' : resolution, w, h }
  }
  if (lowerModelId.includes('nano-banana')) {
    // nano-banana API uses exact strings like '1K', '2K', '4K' for image_size
    return { sizeStr: resolution === 'Auto' ? '1K' : resolution, w, h }
  }
  if (lowerModelId.includes('gpt-image')) {
    // gpt-image-2: 支持任意分辨率（需满足约束：边长≤3840, 16px倍数, 长短边比≤3:1）
    // 按分辨率档位确定基准边长
    const base = resolution === '4K' ? 3840 : resolution === '2K' ? 2048 : 1024
    if (!ratio || ratio === 'Auto' || ratio === '1:1') {
      return { sizeStr: `${base}x${base}`, w: base, h: base }
    }
    const [rW, rH] = ratio.split(':').map(Number)
    let tw, th
    if (rW > rH) {
      tw = base
      th = Math.round(base * (rH / rW))
    } else {
      th = base
      tw = Math.round(base * (rW / rH))
    }
    // 对齐到 16px 倍数
    tw = Math.round(tw / 16) * 16
    th = Math.round(th / 16) * 16
    return { sizeStr: `${tw}x${th}`, w: tw, h: th }
  }
  if (lowerModelId.includes('seedream')) {
    // Seedream API 使用 '2K', '3K' 等字符串
    return { sizeStr: resolution === 'Auto' ? '2K' : resolution, w, h }
  }
}

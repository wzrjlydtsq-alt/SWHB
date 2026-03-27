export const VIRTUAL_CANVAS_WIDTH = 4000
export const VIRTUAL_CANVAS_HEIGHT = 4000

// --- 默认配置 ---
export const DEFAULT_BASE_URL = 'https://lingjingxinghe.cn'

// 即梦API配置（代理地址，默认本地5100端口）
export const JIMENG_API_BASE_URL = 'http://localhost:5100'
export const JIMENG_SESSION_ID = '28166090-b3b8-4c3d-8a6b-36319c608723'

export const DEFAULT_API_CONFIGS = [
  // Chat Models
  {
    id: 'gemini-3-pro',
    provider: 'Gemini 3 Pro',
    modelName: 'gemini-3-pro-preview',
    type: 'Chat',
    key: '',
    url: 'https://ai.t8star.cn'
  },

  // Image Models
  {
    id: 'nano-banana',
    provider: 'Nano Banana Pro',
    modelName: 'nano-banana-pro',
    type: 'Image',
    key: '',
    url: 'https://ai.t8star.cn'
  },

  // Video Models
  {
    id: 'doubao-seedance-2',
    provider: 'doubao',
    modelName: 'doubao-seedance-2',
    type: 'Video',
    key: '',
    url: 'https://lingjingxinghe.cn',
    durations: ['5s', '8s', '11s', '15s']
  }
]

export const RATIOS = ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3']
export const GROK_VIDEO_RATIOS = ['3:2', '2:3', '1:1']
export const VIDEO_RES_OPTIONS = ['1080P', '720P']
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
  'gpt-4o',
  'nano-banana-2',
  'gpt-image',
  'gpt-image-1.5',
  'flux-kontext',
  'mj-v6',
  'jimeng-4.5',
  'jimeng-4.1',
  'jimeng-3.1',
  'sora-2',
  'sora-2-pro',
  'seedance-2',
  'veo3.1-components',
  'veo3.1',
  'grok-3'
]

export const getRatiosForModel = (modelId) => {
  if (!modelId) return RATIOS
  if (modelId.includes('grok')) return GROK_VIDEO_RATIOS
  return RATIOS
}
export const RESOLUTIONS = ['Auto', '1K', '2K', '4K']

// 根据模型返回不同的分辨率选项
export const getResolutionsForModel = (modelId) => {
  if (!modelId) return RESOLUTIONS
  // jimeng-4.5模型只显示2K和4K两个选项
  if (modelId.includes('jimeng-4.5')) return ['2K', '4K']
  // nano-banana 支持 1K/2K/4K
  if (modelId.includes('nano-banana')) return ['1K', '2K', '4K']
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
  let baseW = 1024
  let baseH = 1024

  if (baseResolution === '1080P') {
    baseW = 1920
    baseH = 1080
  } else if (baseResolution === '720P') {
    baseW = 1280
    baseH = 720
  } else if (baseResolution === '2K') {
    baseW = 2048
    baseH = 2048
  } else if (baseResolution === '4K') {
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
    targetW = baseResolution === 'Auto' || baseResolution === '1K' ? 1280 : baseW
    targetH = Math.round(targetW * (rH / rW))
  } else {
    targetH = baseResolution === 'Auto' || baseResolution === '1K' ? 1280 : baseW
    targetW = Math.round(targetH * (rW / rH))
  }

  targetW = Math.round(targetW / 16) * 16
  targetH = Math.round(targetH / 16) * 16

  return { str: `${targetW}x${targetH}`, w: targetW, h: targetH }
}

export const getModelParams = (modelId, ratio, resolution) => {
  const { w, h } = calculateResolution(ratio, resolution)
  if (modelId.includes('minimax')) {
    return { sizeStr: resolution === '4K' ? '1080p' : '720p', w, h }
  }
  if (modelId.includes('jimeng') || modelId.includes('veo') || modelId.includes('seedance')) {
    return { sizeStr: ratio, w, h }
  }
  if (modelId.includes('grok')) {
    // Grok 接口需要传 aspect_ratio，size 传比例字符串即可
    return { sizeStr: ratio, w, h }
  }
  if (modelId.includes('nano-banana')) {
    // nano-banana API uses exact strings like '1K', '2K', '4K' for image_size
    return { sizeStr: resolution === 'Auto' ? '1K' : resolution, w, h }
  }
}

// --- Sora 2: 强制将输入图片转换为合规尺寸/格式 ---
// 背景：/v1/videos 对 sora-2 会校验 size 与输入图像尺寸；若用户上传的是任意尺寸/比例，容易触发 invalid_size。
export const getSora2CompliantSize = (ratio, w, h, enableHD = false) => {
  // Sora2 仅支持 16:9 / 9:16；其它比例按当前 w/h 取最接近方向
  const toAspectValue = (r) => {
    if (!r || typeof r !== 'string') return null
    const [a, b] = r.split(':').map(Number)
    if (!a || !b) return null
    return a / b
  }
  const aspect =
    ratio === '16:9' || ratio === '9:16'
      ? ratio
      : (() => {
          const rv = toAspectValue(ratio)
          const fallback = w && h ? w / h : rv || 16 / 9
          const d169 = Math.abs(fallback - 16 / 9)
          const d916 = Math.abs(fallback - 9 / 16)
          return d916 < d169 ? '9:16' : '16:9'
        })()

  const portrait = aspect === '9:16'

  // 采用固定像素尺寸集合（避免后端 size 校验失败）
  // - 非HD：1280x720 / 720x1280
  // - HD：1920x1080 / 1080x1920
  if (enableHD) {
    return portrait
      ? { sizeStr: '1080x1920', w: 1080, h: 1920, aspect }
      : { sizeStr: '1920x1080', w: 1920, h: 1080, aspect }
  }
  return portrait
    ? { sizeStr: '720x1280', w: 720, h: 1280, aspect }
    : { sizeStr: '1280x720', w: 1280, h: 720, aspect }
}

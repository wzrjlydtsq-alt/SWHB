/**
 * panoramaPrompt.ts — 全景提示词模板
 */

// 文生图模式：追加在用户 prompt 末尾
export const PANORAMA_TEXT2IMG_SUFFIX =
  ', 720 degree seamless panoramic view, equirectangular projection, ' +
  'continuous wraparound scene, consistent lighting and color throughout, ' +
  'no visible seams, immersive environment, ultra wide panorama'

// 图生图模式：有参考图时使用
export const PANORAMA_IMG2IMG_PROMPT =
  'Generate a 720-degree seamless panoramic extension of this image. ' +
  'Maintain exact color palette, lighting direction, and visual style. ' +
  'Extend the scene naturally in all horizontal directions. ' +
  'No added or removed elements. Seamless equirectangular projection.'

/**
 * 构建全景提示词
 * @param userPrompt 用户输入的原始 prompt
 * @param hasRefImage 是否有参考图
 */
export function buildPanoramaPrompt(userPrompt: string, hasRefImage: boolean): string {
  if (hasRefImage && !userPrompt.trim()) {
    return PANORAMA_IMG2IMG_PROMPT
  }
  if (hasRefImage) {
    return userPrompt + '. ' + PANORAMA_IMG2IMG_PROMPT
  }
  return (userPrompt || 'a beautiful landscape') + PANORAMA_TEXT2IMG_SUFFIX
}

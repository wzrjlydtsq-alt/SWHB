/**
 * Generation Service
 * Utility functions for AI generation tasks.
 * Polling is handled exclusively by the main process TaskExecutor via IPC.
 */

/**
 * Gets metadata (width, height, duration) for a video URL.
 * @param {string} videoUrl
 * @returns {Promise<{width: number, height: number, duration: number}|null>}
 */
export const getVideoMetadata = async (videoUrl) => {
  if (!videoUrl) return null
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration
      })
    }
    video.onerror = () => {
      console.error('[VideoMetadata] Failed to load video metadata:', videoUrl)
      resolve(null)
    }
    video.src = videoUrl
  })
}

/**
 * Normalizes a prompt for Sora models by removing curly braces from character references.
 * @param {string} prompt
 * @returns {string}
 */
export const normalizePromptForSora = (prompt) => {
  if (!prompt) return ''
  return prompt.replace(/@\{([^}]+)\}/g, (match, username) => {
    return `@${username}`
  })
}

/**
 * Processes a mask for inpainting by converting a white-on-transparent mask
 * to a transparent-on-black mask.
 * @param {string} maskContent - Data URL or URL of the mask image
 * @returns {Promise<Blob|null>}
 */
export const processMaskForInpainting = async (maskContent) => {
  if (!maskContent) return null

  try {
    const maskImg = new Image()
    maskImg.crossOrigin = 'anonymous'
    await new Promise((resolve, reject) => {
      maskImg.onload = resolve
      maskImg.onerror = reject
      maskImg.src = maskContent
    })

    const canvas = document.createElement('canvas')
    canvas.width = maskImg.width
    canvas.height = maskImg.height
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.globalCompositeOperation = 'destination-out'
    ctx.drawImage(maskImg, 0, 0)

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('蒙版转换失败'))
        }
      }, 'image/png')
    })
  } catch (error) {
    console.error('[Inpainting] 蒙版处理失败:', error)
    return null
  }
}

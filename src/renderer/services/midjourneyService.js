/**
 * midjourneyService.js
 * 提供 Midjourney 相关的图片上传、切割和任务处理功能。
 */

import { prepareImageForMidjourneyUpload } from '../utils/dataHelpers.js'
import { apiClient } from './apiClient.js'

/**
 * 获取 Blob 对象（兼容 HTTP URL 和 Blob URL）
 */
export const getBlobFromUrl = async (url) => {
  const res = await fetch(url)
  return await res.blob()
}

/**
 * 将 Blob 转换为 Data URL
 */
export const blobToDataURL = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = (e) => reject(e)
    reader.readAsDataURL(blob)
  })
}

/**
 * 获取 Base64 字符串（自动识别 Data URL 或 Blob URL 并转换）
 */
export const getBase64FromUrl = async (url) => {
  if (url.startsWith('data:')) {
    return url.split(',')[1]
  }
  const blob = await getBlobFromUrl(url)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const res = reader.result
      resolve(res.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * 上传图片到 Midjourney 官方上传接口
 */
export const uploadMidjourneyImages = async (base64Array, baseUrl, apiKey) => {
  try {
    console.log(`Midjourney: 准备上传 ${base64Array.length} 张图片，先进行压缩/缩放处理...`)
    const processedImages = await Promise.all(
      base64Array.map(async (imageUrl, index) => {
        if (imageUrl.startsWith('data:')) {
          try {
            const processed = await prepareImageForMidjourneyUpload(imageUrl, 2048, 8)
            return processed
          } catch (err) {
            console.error(`Midjourney: 图片[${index}]处理失败，使用原图`, err)
            return imageUrl
          }
        } else {
          try {
            const blob = await getBlobFromUrl(imageUrl)
            const dataUrl = await blobToDataURL(blob)
            const processed = await prepareImageForMidjourneyUpload(dataUrl, 2048, 8)
            return processed
          } catch (err) {
            console.error(`Midjourney: 图片[${index}]从URL处理失败`, err)
            throw err
          }
        }
      })
    )

    const cleanedBase64Array = processedImages.map((base64) => {
      let cleaned = base64
      if (cleaned.includes(',')) {
        cleaned = cleaned.split(',')[1]
      } else if (cleaned.startsWith('data:')) {
        cleaned = cleaned.replace(/^data:[^;]*;base64,?/i, '')
      }
      cleaned = cleaned.replace(/[^A-Za-z0-9+/=]/g, '')

      const padding = cleaned.length % 4
      if (padding !== 0) {
        cleaned = cleaned.replace(/=+$/, '')
        cleaned += '='.repeat(4 - padding)
      }
      return `data:image/jpeg;base64,${cleaned}`
    })

    const data = await apiClient(
      '/mj/submit/upload-discord-images',
      {
        method: 'POST',
        body: JSON.stringify({ base64Array: cleanedBase64Array })
      },
      { baseUrl, apiKey }
    )

    if (data.code === 1 && data.result && Array.isArray(data.result)) {
      return data.result
    } else {
      throw new Error(data.description || '上传失败：响应格式错误')
    }
  } catch (err) {
    console.error('Midjourney: 图片上传失败:', err)
    throw err
  }
}

/**
 * 上传单个图片到图床或 Midjourney 并获取 HTTP URL
 */
export const uploadImageToGetHttpUrl = async (imageUrl, baseUrl, apiKey) => {
  try {
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return imageUrl
    }

    if (imageUrl.startsWith('blob:')) {
      const base64Data = await getBase64FromUrl(imageUrl)
      imageUrl = `data:image/png;base64,${base64Data}`
    }

    if (imageUrl.startsWith('data:')) {
      let base64Data = imageUrl.includes(',')
        ? imageUrl.split(',')[1]
        : imageUrl.replace(/^data:[^;]*;base64,?/i, '')
      base64Data = base64Data.replace(/[^A-Za-z0-9+/=]/g, '')

      const padding = base64Data.length % 4
      if (padding !== 0) {
        base64Data += '='.repeat(4 - padding)
      }

      // 优先使用 Midjourney
      try {
        const results = await uploadMidjourneyImages(
          [`data:image/png;base64,${base64Data}`],
          baseUrl,
          apiKey
        )
        if (results && results.length > 0) return results[0]
      } catch (err) {
        console.warn('Midjourney 上传失败，尝试备用图床', err)
      }

      // 备用图床 (sm.ms)
      try {
        const mimeMatch = imageUrl.match(/data:([^;]+);base64/)
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png'
        const byteCharacters = atob(base64Data)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: mimeType })

        const formData = new FormData()
        formData.append('smfile', blob, 'image.png')
        const resp = await fetch('https://sm.ms/api/v2/upload', {
          method: 'POST',
          body: formData
        })
        if (resp.ok) {
          const data = await resp.json()
          if (data.success && data.data?.url) return data.data.url
        }
      } catch (err) {
        console.warn('备用图床上传也失败', err)
      }
    }
    return null
  } catch (err) {
    console.error('上传图片失败:', err)
    return null
  }
}

/**
 * 切割图片（通常用于九宫格）
 */
export const splitGridImage = async (imageUrl, cols = 3, rows = 3) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timeout = setTimeout(() => reject(new Error('图片加载超时')), 30000)

    img.onload = () => {
      clearTimeout(timeout)
      try {
        const singleWidth = Math.floor(img.width / cols)
        const singleHeight = Math.floor(img.height / rows)
        const cropPromises = []

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cropX = Math.max(0, Math.min(col * singleWidth, img.width - singleWidth))
            const cropY = Math.max(0, Math.min(row * singleHeight, img.height - singleHeight))
            const cropW = Math.min(singleWidth, img.width - cropX)
            const cropH = Math.min(singleHeight, img.height - cropY)

            const cropCanvas = document.createElement('canvas')
            cropCanvas.width = cropW
            cropCanvas.height = cropH
            const cropCtx = cropCanvas.getContext('2d')
            cropCtx.fillStyle = '#ffffff'
            cropCtx.fillRect(0, 0, cropW, cropH)
            cropCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

            const cropPromise = new Promise((resolveCrop) => {
              cropCanvas.toBlob((blob) => {
                if (blob) {
                  resolveCrop({
                    url: URL.createObjectURL(blob),
                    width: cropW,
                    height: cropH
                  })
                } else {
                  resolveCrop(null)
                }
              }, 'image/png')
            })
            cropPromises.push(cropPromise)
          }
        }

        Promise.all(cropPromises).then((results) => resolve(results.filter(Boolean)))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('图片加载失败'))
    }
    img.src = imageUrl
  })
}

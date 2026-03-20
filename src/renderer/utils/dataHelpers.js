import { apiClient } from '../services/apiClient.js'

export const blobToDataURL = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export const base64ToBlobUrl = async (base64Data) => {
  try {
    if (!base64Data || typeof base64Data !== 'string') {
      return base64Data
    }
    // 如果已经是 Blob URL 或 HTTP URL，直接返回
    if (
      base64Data.startsWith('blob:') ||
      base64Data.startsWith('http://') ||
      base64Data.startsWith('https://')
    ) {
      return base64Data
    }
    // 如果是 Base64 Data URL，转换为 Blob URL
    if (base64Data.startsWith('data:')) {
      const res = await apiClient(base64Data, {}, { isJson: false })
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    }
    // 其他情况直接返回
    return base64Data
  } catch (e) {
    console.error('Base64转Blob失败', e)
    return base64Data // 失败则返回原数据
  }
}

// 压缩/缩放图片用于Midjourney上传（Discord对图片有尺寸和大小限制）
export const prepareImageForMidjourneyUpload = async (
  imageUrl,
  maxSize = 2048,
  maxFileSizeMB = 8
) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const originalWidth = img.width
      const originalHeight = img.height

      // 计算缩放后的尺寸，保持宽高比
      let newWidth = originalWidth
      let newHeight = originalHeight

      if (originalWidth > maxSize || originalHeight > maxSize) {
        const scale = maxSize / Math.max(originalWidth, originalHeight)
        newWidth = Math.floor(originalWidth * scale)
        newHeight = Math.floor(originalHeight * scale)
        console.log(
          `Midjourney: 缩放图片 ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight}`
        )
      }

      // 创建canvas并绘制
      const canvas = document.createElement('canvas')
      canvas.width = newWidth
      canvas.height = newHeight
      const ctx = canvas.getContext('2d')

      // 使用高质量绘制
      ctx.imageSmoothingEnabled = true

      // 如果缩放了，使用更高质量的算法
      if (newWidth < originalWidth) {
        ctx.imageSmoothingQuality = 'high'
      }

      // 绘制图片
      ctx.drawImage(img, 0, 0, newWidth, newHeight)

      // 首先尝试使用PNG格式（无损）
      const processBlob = (blob) => {
        if (!blob) {
          reject(new Error('图片处理失败'))
          return
        }

        // 检查文件大小是否超过限制（例如Discord最大允许8MB）
        const fileSizeMB = blob.size / (1024 * 1024)

        if (fileSizeMB > maxFileSizeMB) {
          console.log(
            `Midjourney: 图片大小 ${fileSizeMB.toFixed(2)}MB 超过限制 ${maxFileSizeMB}MB，重新使用JPEG压缩`
          )
          // 如果文件太大，使用JPEG格式降低质量
          canvas.toBlob(
            (jpegBlob) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result)
              reader.readAsDataURL(jpegBlob)
            },
            'image/jpeg',
            0.85
          ) // 85%是很好的画质与体积的平衡点
        } else {
          // 大小符合要求，转换为DataURL返回
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.readAsDataURL(blob)
        }
      }

      // 总是先尝试导出为高画质的PNG
      canvas.toBlob(processBlob, 'image/png')
    }

    img.onerror = () => {
      console.error('准备图片失败:', imageUrl)
      reject(new Error('加载原始图片失败'))
    }

    // 如果是Data URL，直接赋值即可；如果是远端URL，前面已经设置了crossOrigin
    img.src = imageUrl
  })
}

export const compressImage = (dataUrl, maxWidth = 1024, quality = 0.8) => {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      // 计算压缩后的尺寸
      let width = img.width
      let height = img.height
      if (width > maxWidth || height > maxWidth) {
        const scale = maxWidth / Math.max(width, height)
        width = Math.floor(width * scale)
        height = Math.floor(height * scale)
      }

      canvas.width = width
      canvas.height = height

      // 绘制并压缩
      ctx.drawImage(img, 0, 0, width, height)
      // 使用JPEG格式压缩，减少文件大小
      const compressed = canvas.toDataURL('image/jpeg', quality)
      resolve(compressed)
    }
    img.onerror = () => resolve(dataUrl) // 如果压缩失败，返回原图
    img.src = dataUrl
  })
}

export const splitMidjourneyImage = async (imageUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    // 设置超时，防止图片加载卡死
    const timeout = setTimeout(() => {
      reject(new Error('图片加载超时'))
    }, 30000) // 30秒超时

    img.onload = () => {
      clearTimeout(timeout)
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        // Midjourney返回的是2x2网格，每张图是原图的1/4
        // 计算每张图的尺寸（使用Math.floor确保整数像素）
        const singleWidth = Math.floor(img.width / 2)
        const singleHeight = Math.floor(img.height / 2)

        // 计算实际每张图的比例
        const actualRatio = singleWidth / singleHeight

        const images = []

        // 切割4张图：左上、右上、左下、右下
        for (let row = 0; row < 2; row++) {
          for (let col = 0; col < 2; col++) {
            // 计算裁剪区域（确保不超出边界）
            const cropX = Math.max(0, Math.min(col * singleWidth, img.width - singleWidth))
            const cropY = Math.max(0, Math.min(row * singleHeight, img.height - singleHeight))
            const cropW = Math.min(singleWidth, img.width - cropX)
            const cropH = Math.min(singleHeight, img.height - cropY)

            // 设置canvas尺寸
            canvas.width = cropW
            canvas.height = cropH

            // 清空canvas并设置白色背景（防止透明区域）
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, cropW, cropH)

            // 提取图片区域
            ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

            // 使用PNG格式，保持图片质量
            const dataUrl = canvas.toDataURL('image/png')
            images.push({
              url: dataUrl,
              width: cropW,
              height: cropH,
              ratio: actualRatio
            })
          }
        }

        console.log(
          `Midjourney: 切割图片完成，原图尺寸 ${img.width}x${img.height}，每张图尺寸 ${singleWidth}x${singleHeight}，比例 ${actualRatio.toFixed(2)}`
        )
        resolve(images)
      } catch (error) {
        console.error('Midjourney: 切割图片时出错:', error)
        reject(error)
      }
    }

    img.onerror = () => {
      clearTimeout(timeout)
      console.error('Midjourney: 图片加载失败:', imageUrl)
      reject(new Error('图片加载失败'))
    }

    img.src = imageUrl
  })
}

export const getBlobFromUrl = async (url) => {
  if (!url) return null
  if (url.startsWith('blob:')) {
    const resp = await apiClient(url, {}, { isJson: false })
    return await resp.blob()
  }
  if (url.startsWith('data:')) {
    const parts = url.split(',')
    const mime = parts[0].match(/:(.*?);/)[1]
    const bstr = atob(parts[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new Blob([u8arr], { type: mime })
  }
  const response = await apiClient(url, {}, { isJson: false })
  return await response.blob()
}

export const getBase64FromUrl = async (url) => {
  if (!url) return null
  if (url.startsWith('data:')) return url
  const blob = await getBlobFromUrl(url)
  return await blobToDataURL(blob)
}

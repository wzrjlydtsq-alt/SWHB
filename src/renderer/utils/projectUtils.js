/**
 * Project Utilities
 * 提供项目保存、加载、时间戳生成及 Data URL 转换等工具函数。
 */

/**
 * 获取当前时间的 CST 时间戳（格式：YYYY-MM-DD HH:mm:ss）
 */
export const getCSTTimestamp = () => {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const cst = new Date(utc + 3600000 * 8) // UTC+8
  return (
    cst.getFullYear() +
    '-' +
    String(cst.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(cst.getDate()).padStart(2, '0') +
    ' ' +
    String(cst.getHours()).padStart(2, '0') +
    ':' +
    String(cst.getMinutes()).padStart(2, '0') +
    ':' +
    String(cst.getSeconds()).padStart(2, '0')
  )
}

/**
 * 获取文件名友好的 CST 时间戳（格式：YYYYMMDD_HHmmss）
 */
export const getCSTFilenameTimestamp = () => {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const cst = new Date(utc + 3600000 * 8) // UTC+8
  return (
    cst.getFullYear() +
    String(cst.getMonth() + 1).padStart(2, '0') +
    String(cst.getDate()).padStart(2, '0') +
    '_' +
    String(cst.getHours()).padStart(2, '0') +
    String(cst.getMinutes()).padStart(2, '0') +
    String(cst.getSeconds()).padStart(2, '0')
  )
}

/**
 * 从 URL 获取 Blob 对象
 */
export const getBlobFromUrl = async (url) => {
  const response = await fetch(url)
  return await response.blob()
}

/**
 * 从 URL 获取 Base64 字符串
 */
export const getBase64FromUrl = async (url) => {
  const blob = await getBlobFromUrl(url)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result === 'string') {
        resolve(result.split(',')[1])
      } else {
        reject(new Error('Failed to convert blob to base64'))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * 将 Blob 转换为 Data URL
 */
export const blobToDataURL = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * 检查是否为视频 URL
 */
export const isVideoUrl = (url) => {
  if (!url) return false
  return (
    url.includes('video/') ||
    url.toLowerCase().endsWith('.mp4') ||
    url.toLowerCase().endsWith('.webm') ||
    url.toLowerCase().endsWith('.ogg') ||
    url.startsWith('data:video/')
  )
}

/**
 * downloadService.js
 * 提供批次下载功能。
 */

import { isVideoUrl } from '../utils/projectUtils.js'

/**
 * 批量下载选中的图片或视频节点
 */
export const batchDownloadNodes = async (selectedNodes) => {
  if (!selectedNodes || selectedNodes.length === 0) {
    alert('请先选择要下载的图片或视频节点')
    return
  }

  for (const node of selectedNodes) {
    try {
      const url = node.content
      if (!url || (typeof url !== 'string' && !url.startsWith('data:'))) {
        console.warn(`节点 ${node.id} 的内容URL无效: `, url)
        continue
      }

      // 使用原生 fetch 下载静态资源，避免 apiClient 在非 API 请求上附加 Authorization header
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl

      let extension = '.png'
      if (node.type === 'preview') {
        extension = node.previewType === 'video' || isVideoUrl(url) ? '.mp4' : '.png'
      } else if (node.type === 'video-input') {
        extension = '.mp4'
      } else {
        extension = isVideoUrl(url) ? '.mp4' : '.png'
      }

      a.download = `${node.id}${extension}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)

      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (error) {
      console.error(`下载节点 ${node.id} 失败: `, error)
    }
  }
}

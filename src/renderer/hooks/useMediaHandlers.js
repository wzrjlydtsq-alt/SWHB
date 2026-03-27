import { useCallback } from 'react'
import { getImageDimensions, extractKeyFrames } from '../utils/fileHelpers.js'
import { splitGridImage } from '../services/midjourneyService.js'
import { detectScenesAndCapture } from '../services/videoProcessingService.js'

export const useMediaHandlers = ({ setNodes, nodesMap, selectedNodeIdsRef, screenToWorld }) => {
  const updateNodeContentWithUrl = async (nodeId, finalUrl, fileType, updateFn) => {
    let dimensions = { w: 0, h: 0 }
    if (fileType.startsWith('image')) {
      try {
        dimensions = await getImageDimensions(finalUrl)
      } catch (err) {
        console.error('Failed to parse dimensions:', err)
      }
    }

    updateFn((prev) =>
      prev.map((n) => {
        if (n.id === nodeId) {
          let finalW = dimensions.w > 0 ? dimensions.w : n.width
          let finalH = dimensions.h > 0 ? dimensions.h : n.height

          if (dimensions.w > 0 && dimensions.h > 0) {
            const maxDim = 400
            if (finalW > maxDim || finalH > maxDim) {
              if (finalW > finalH) {
                finalH = Math.round(finalH * (maxDim / finalW))
                finalW = maxDim
              } else {
                finalW = Math.round(finalW * (maxDim / finalH))
                finalH = maxDim
              }
            }
          }

          return {
            ...n,
            content: finalUrl,
            dimensions,
            width: finalW,
            height: finalH
          }
        }
        return n
      })
    )
  }
  const handleFileUpload = useCallback(
    async (nodeId, e) => {
      if (e.preventDefault) e.preventDefault()
      if (e.stopPropagation) e.stopPropagation()
      const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0]
      if (!file) return

      try {
        // 如果文件有本地绝对路径 (Electron 特性)，直接传给主进程负责拷贝，避免将大图片读入内存造成 OOM
        if (file.path) {
          const response = await window.api.invoke('cache:copy-file', {
            id: `upload_${Date.now()}`,
            sourcePath: file.path,
            category: 'user_upload',
            type: file.type.startsWith('video') ? 'video' : 'image'
          })

          if (response?.success && response.url) {
            updateNodeContentWithUrl(nodeId, response.url, file.type, setNodes)
          } else {
            console.error('IPC Asset Copy failed:', response?.error)
            alert('文件存入失败: ' + (response?.error || '未知错误'))
          }
          return
        }

        // 回退逻辑：针对由剪贴板纯构建出的无路径 Blob/File，退回走 FileReader + Base64
        const reader = new FileReader()
        reader.onload = async (event) => {
          const base64Content = event.target.result

          const response = await window.api.invoke('cache:save-cache', {
            id: `upload_${Date.now()}`,
            content: base64Content,
            category: 'user_upload',
            ext: file.name ? '.' + file.name.split('.').pop() : '.jpg',
            type: file.type.startsWith('video') ? 'video' : 'image'
          })

          if (response?.success && response.url) {
            updateNodeContentWithUrl(nodeId, response.url, file.type, setNodes)
          } else {
            console.error('IPC Asset Cache failed:', response?.error)
            alert('文件缓存失败: ' + (response?.error || '未知错误'))
          }
        }
        reader.readAsDataURL(file)
      } catch (error) {
        console.error('File reading/copying failed:', error)
      }
    },
    [setNodes]
  )

  const handleAudioFileUpload = useCallback(
    async (nodeId, file) => {
      if (!file) return

      try {
        if (file.path) {
          const response = await window.api.invoke('cache:copy-file', {
            id: `upload_audio_${Date.now()}`,
            sourcePath: file.path,
            category: 'user_upload',
            type: 'audio'
          })

          if (response?.success && response.url) {
            setNodes((prev) =>
              prev.map((n) => {
                if (n.id === nodeId) {
                  return {
                    ...n,
                    content: response.url,
                    fileName: file.name,
                    filePath: response.path || response.url
                  }
                }
                return n
              })
            )
          } else {
            console.error('IPC Asset Copy failed:', response?.error)
            alert('音频缓存失败: ' + (response?.error || '未知错误'))
          }
          return
        }

        const reader = new FileReader()
        reader.onload = async (event) => {
          const base64Content = event.target.result

          const response = await window.api.invoke('cache:save-cache', {
            id: `upload_audio_${Date.now()}`,
            content: base64Content,
            category: 'user_upload',
            ext: file.name ? '.' + file.name.split('.').pop() : '.mp3',
            type: 'audio'
          })

          if (response?.success && response.url) {
            setNodes((prev) =>
              prev.map((n) => {
                if (n.id === nodeId) {
                  return {
                    ...n,
                    content: response.url,
                    fileName: file.name,
                    filePath: response.path || response.url
                  }
                }
                return n
              })
            )
          } else {
            console.error('IPC Asset Cache failed:', response?.error)
            alert('音频缓存失败: ' + (response?.error || '未知错误'))
          }
        }
        reader.readAsDataURL(file)
      } catch (error) {
        console.error('Audio file reading/copying failed:', error)
      }
    },
    [setNodes]
  )

  const handleSplitGridFromUrl = useCallback(
    async (imageUrl, options = {}) => {
      if (!imageUrl) return
      const {
        originX,
        originY,
        cols = 3,
        spacing = 20,
        nodeWidth = 260,
        nodeHeight = 260,
        replaceSelected = false
      } = options

      try {
        const croppedImages = await splitGridImage(imageUrl)
        if (croppedImages.length !== 9) {
          alert('切割失败：未能生成9张图')
          return
        }

        const currentSelectedIds = selectedNodeIdsRef.current
        if (replaceSelected && currentSelectedIds && currentSelectedIds.size === 9) {
          const selectedIdsArray = Array.from(currentSelectedIds)
          setNodes((prev) =>
            prev.map((node) => {
              const index = selectedIdsArray.indexOf(node.id)
              if (index !== -1 && index < croppedImages.length) {
                return {
                  ...node,
                  content: croppedImages[index].url,
                  dimensions: {
                    w: croppedImages[index].width,
                    h: croppedImages[index].height
                  }
                }
              }
              return node
            })
          )
          return
        }

        const world = screenToWorld(window.innerWidth / 2, window.innerHeight / 2)
        const startX = originX !== undefined ? originX : world.x
        const startY = originY !== undefined ? originY : world.y
        const newNodes = []
        for (let i = 0; i < croppedImages.length; i++) {
          const row = Math.floor(i / cols)
          const col = i % cols
          const x = startX + col * (nodeWidth + spacing)
          const y = startY + row * (nodeHeight + spacing)
          newNodes.push({
            id: `node-${Date.now()}-${i}`,
            type: 'input-image',
            x,
            y,
            width: nodeWidth,
            height: nodeHeight,
            content: croppedImages[i].url,
            dimensions: { w: croppedImages[i].width, h: croppedImages[i].height }
          })
        }
        setNodes((prev) => [...prev, ...newNodes])
      } catch (e) {
        alert('切割失败: ' + e.message)
      }
    },
    [setNodes, selectedNodeIdsRef, screenToWorld]
  )

  const handleAutoExtractKeyframes = useCallback(
    async (nodeId, fps = 2) => {
      const node = nodesMap.get(nodeId)
      if (!node?.content) return
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, extractingFrames: true } : n)))
      try {
        const frames = await extractKeyFrames(node.content, { fps })
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId ? { ...n, frames, selectedKeyframes: [], extractingFrames: false } : n
          )
        )
      } catch (error) {
        console.error('视频抽帧失败', error)
        setNodes((prev) =>
          prev.map((n) => (n.id === nodeId ? { ...n, extractingFrames: false } : n))
        )
      }
    },
    [setNodes, nodesMap]
  )

  const handleSmartExtractKeyframes = useCallback(
    async (nodeId, threshold = 30) => {
      const node = nodesMap.get(nodeId)
      if (!node?.content) return
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, extractingFrames: true } : n)))
      try {
        const frames = await detectScenesAndCapture(node.content, threshold)
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId ? { ...n, frames, selectedKeyframes: [], extractingFrames: false } : n
          )
        )
      } catch (error) {
        console.error('智能抽帧失败', error)
        alert(`智能抽帧失败: ${error.message}`)
        setNodes((prev) =>
          prev.map((n) => (n.id === nodeId ? { ...n, extractingFrames: false } : n))
        )
      }
    },
    [setNodes, nodesMap]
  )

  return {
    handleFileUpload,
    handleAudioFileUpload,
    handleSplitGridFromUrl,
    handleAutoExtractKeyframes,
    handleSmartExtractKeyframes
  }
}

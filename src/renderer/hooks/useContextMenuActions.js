import { useCallback } from 'react'
import { getImageDimensions } from '../utils/fileHelpers.js'

export const useContextMenuActions = ({
  setFrameContextMenu,
  frameContextMenu,
  setChatFiles,
  setIsChatOpen,
  screenToWorld,
  addNode,
  selectedNodeId,
  nodesMap,
  setNodes,
  historyContextMenu,
  setHistoryContextMenu,
  isVideoUrl,
  inputImageContextMenu,
  closeInputImageContextMenu
}) => {
  const closeFrameContextMenu = useCallback(() => {
    setFrameContextMenu({ visible: false, x: 0, y: 0, nodeId: null, frame: null })
  }, [setFrameContextMenu])

  const sendFrameToChat = useCallback(() => {
    const { frame } = frameContextMenu
    if (!frame?.url) return
    const newFile = {
      name: `Frame-${(frame.time || 0).toFixed(2)}s.png`,
      type: 'image/png',
      content: frame.url,
      isImage: true,
      isVideo: false,
      isAudio: false,
      fromHistory: true,
      fileExt: 'png'
    }
    setChatFiles((prev) => [...prev, newFile])
    setIsChatOpen(true)
    closeFrameContextMenu()
  }, [frameContextMenu, setChatFiles, setIsChatOpen, closeFrameContextMenu])

  const sendFrameToCanvas = useCallback(async () => {
    const { frame } = frameContextMenu
    if (!frame?.url) return
    const world = screenToWorld(window.innerWidth / 2, window.innerHeight / 2)
    let dims
    try {
      const real = await getImageDimensions(frame.url)
      if (real?.w && real?.h) dims = { w: real.w, h: real.h }
    } catch (e) {
      console.error(e)
    }
    addNode('input-image', world.x + 50, world.y + 50, null, frame.url, dims)
    closeFrameContextMenu()
  }, [frameContextMenu, screenToWorld, addNode, closeFrameContextMenu])

  const applyFrameToSelectedNode = useCallback(() => {
    const { frame } = frameContextMenu
    if (!frame?.url) return
    const targetId = selectedNodeId
    const targetNode = nodesMap.get(targetId)
    if (targetNode && targetNode.type === 'input-image') {
      setNodes((prev) => prev.map((n) => (n.id === targetId ? { ...n, content: frame.url } : n)))
    } else {
      alert('请先选择一个输入图片节点')
    }
    closeFrameContextMenu()
  }, [frameContextMenu, selectedNodeId, nodesMap, setNodes, closeFrameContextMenu])

  const applyHistoryToSelectedNode = useCallback(() => {
    const item = historyContextMenu.item
    const targetId = selectedNodeId
    const targetNode = nodesMap.get(targetId)

    if (targetNode && targetNode.type === 'input-image' && (item.url || item.originalUrl)) {
      setNodes((prev) =>
        prev.map((n) => (n.id === targetId ? { ...n, content: item.url || item.originalUrl } : n))
      )
    } else {
      alert('请先选择一个输入图片节点')
    }
    setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null })
  }, [historyContextMenu, selectedNodeId, nodesMap, setNodes, setHistoryContextMenu])

  const sendHistoryToCanvas = useCallback(async () => {
    const item = historyContextMenu.item
    if (!item?.url && !item?.originalUrl) return
    const world = screenToWorld(window.innerWidth / 2, window.innerHeight / 2)

    let content = item.url || item.originalUrl
    if (item.type === 'video' && !isVideoUrl(content)) {
      content += (content.includes('?') ? '&' : '?') + 'force_video_display=true'
    }

    let dims
    if (item.type === 'image') {
      try {
        const real = await getImageDimensions(content)
        if (real?.w && real?.h) {
          dims = { w: real.w, h: real.h }
        }
      } catch (e) {
        console.error('SendHistoryToCanvas getImageDimensions error', e)
      }
    }

    addNode('input-image', world.x + 50, world.y + 50, null, content, dims)
    setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null })
  }, [historyContextMenu, screenToWorld, isVideoUrl, addNode, setHistoryContextMenu])

  const sendHistoryToChat = useCallback(() => {
    const item = historyContextMenu.item
    if (!item || !item.url) return

    const isImage = item.type === 'image'
    const isVideo = item.type === 'video'
    const fileExt = isImage ? 'png' : isVideo ? 'mp4' : 'file'
    const mimeType = isImage ? 'image/png' : isVideo ? 'video/mp4' : 'application/octet-stream'

    const newFile = {
      name: `Generated-${item.id}.${fileExt}`,
      type: mimeType,
      content: item.url,
      isImage,
      isVideo,
      isAudio: false,
      fromHistory: true,
      fileExt
    }

    setChatFiles((prev) => [...prev, newFile])
    setIsChatOpen(true)
    setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null })
  }, [historyContextMenu, setChatFiles, setIsChatOpen, setHistoryContextMenu])

  const sendInputImageToChat = useCallback(() => {
    const nodeId = inputImageContextMenu.nodeId
    const node = nodesMap.get(nodeId)
    if (!node || !node.content) return

    const isImage = !isVideoUrl(node.content)
    const isVideo = isVideoUrl(node.content)
    const fileExt = isImage ? 'png' : 'mp4'
    const mimeType = isImage ? 'image/png' : 'video/mp4'
    const newFile = {
      name: `InputImage-${Date.now()}.${fileExt}`,
      type: mimeType,
      content: node.content,
      isImage,
      isVideo,
      isAudio: false,
      fileExt
    }
    setChatFiles((prev) => [...prev, newFile])
    setIsChatOpen(true)
    closeInputImageContextMenu()
  }, [
    inputImageContextMenu,
    nodesMap,
    isVideoUrl,
    setChatFiles,
    setIsChatOpen,
    closeInputImageContextMenu
  ])

  return {
    closeFrameContextMenu,
    sendFrameToChat,
    sendFrameToCanvas,
    applyFrameToSelectedNode,
    applyHistoryToSelectedNode,
    sendHistoryToCanvas,
    sendHistoryToChat,
    sendInputImageToChat
  }
}

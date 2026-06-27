import { useState, useCallback } from 'react'

/**
 * useMenuManager Hook
 * 管理应用中所有右键菜单和弹出菜单的状态。
 */
export const useMenuManager = () => {
  // 通用右键菜单
  const [contextMenu, setContextMenu] = useState({
    x: 0,
    y: 0,
    worldX: 0,
    worldY: 0,
    visible: false
  })

  // 历史记录右键菜单
  const [historyContextMenu, setHistoryContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    worldX: 0,
    worldY: 0,
    item: null
  })

  // 节点通用右键菜单
  const [nodeContextMenu, setNodeContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    nodeId: null
  })

  // 分镜帧右键菜单
  const [frameContextMenu, setFrameContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    nodeId: null,
    frame: null
  })

  // 输入图片节点右键菜单
  const [inputImageContextMenu, setInputImageContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    nodeId: null
  })

  // 关闭输入图片菜单
  const closeInputImageContextMenu = useCallback(() => {
    setInputImageContextMenu((prev) => ({ ...prev, visible: false }))
  }, [])

  return {
    contextMenu,
    setContextMenu,
    historyContextMenu,
    setHistoryContextMenu,
    nodeContextMenu,
    setNodeContextMenu,
    frameContextMenu,
    setFrameContextMenu,

    inputImageContextMenu,
    setInputImageContextMenu,
    closeInputImageContextMenu
  }
}

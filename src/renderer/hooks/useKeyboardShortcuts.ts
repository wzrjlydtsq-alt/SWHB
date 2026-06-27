import { useEffect } from 'react'

/**
 * 处理所有的全局键盘快捷键监听逻辑
 */
export const useKeyboardShortcuts = ({
  selectedNodeIdRef,
  selectedNodeIdsRef,
  deleteNode,
  setSelectedNodeId,
  setSelectedNodeIds
}) => {
  // 全局 Delete 键删除节点
  useEffect(() => {
    const handleDeleteKey = (e) => {
      // 防止在输入框中触发
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable
      )
        return

      // 检查是否按下了 Delete 或 Del 键
      if (e.key === 'Delete' || e.key === 'Del') {
        e.preventDefault()
        e.stopPropagation()

        const currentSelectedId = selectedNodeIdRef.current
        const currentSelectedIds = selectedNodeIdsRef.current

        // 删除选中的节点
        if (currentSelectedId) {
          deleteNode(currentSelectedId)
          setSelectedNodeId(null)
        } else if (currentSelectedIds && currentSelectedIds.size > 0) {
          // 删除多选节点
          currentSelectedIds.forEach((id) => deleteNode(id))
          setSelectedNodeIds(new Set())
        }
      }
    }

    window.addEventListener('keydown', handleDeleteKey)
    return () => {
      window.removeEventListener('keydown', handleDeleteKey)
    }
  }, [deleteNode, setSelectedNodeId, setSelectedNodeIds, selectedNodeIdRef, selectedNodeIdsRef])
}

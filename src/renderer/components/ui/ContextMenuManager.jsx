import { GlobalContextMenu } from './GlobalContextMenu.jsx'
import {
  MessageSquare,
  CopyPlus,
  Maximize2,
  ArrowRightSquare,
  LayoutGrid,
  Scissors
} from '../../utils/icons.jsx'

export function ContextMenuManager({
  contextMenu,
  setContextMenu,
  addNode,
  historyContextMenu,
  sendHistoryToChat,
  sendHistoryToCanvas,
  setNodes,
  setHistoryContextMenu,
  applyHistoryToSelectedNode,
  activeShot,
  updateShot,
  handleSplitGridFromUrl,
  frameContextMenu,
  sendFrameToChat,
  sendFrameToCanvas,
  applyFrameToSelectedNode,
  selectedNodeIdsRef,
  selectedNodeId,
  inputImageContextMenu,
  closeInputImageContextMenu,
  sendInputImageToChat,
  nodesMap,
  // nodeContextMenu, setNodeContextMenu, deleteNode 已移除 — 节点仅通过 Delete 键删除
  nodeContextMenu: _ncm,
  setNodeContextMenu: _sncm,
  deleteNode: _dn
}) {
  return (
    <>
      <GlobalContextMenu
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        addNode={addNode}
      />

      {historyContextMenu.visible && (
        <div
          className={`fixed z-[100] w-48 rounded-lg shadow-2xl py-1 animate-in fade-in duration-100 border ${'bg-[#18181b] border-zinc-700'}`}
          style={{ left: historyContextMenu.x, top: historyContextMenu.y }}
        >
          <div
            className={`px-3 py-1.5 text-[10px] font-medium border-b mb-1 ${'text-zinc-500 border-zinc-800'}`}
          >
            操作
          </div>
          <button
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${'text-zinc-300 hover:bg-zinc-800'}`}
            onClick={sendHistoryToChat}
          >
            <MessageSquare size={14} className="text-purple-500" /> 发送到当前对话
          </button>
          <button
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${'text-zinc-300 hover:bg-zinc-800'}`}
            onClick={sendHistoryToCanvas}
          >
            <CopyPlus size={14} className="text-blue-500" /> 发送到画布
          </button>
          <button
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${'text-zinc-300 hover:bg-zinc-800'}`}
            onClick={() => {
              const item = historyContextMenu.item
              if (!item?.url) return
              // 找到所有预览节点，默认更新最近创建的一个
              setNodes((prev) => {
                const previews = prev.filter((n) => n.type === 'preview')
                if (!previews.length) return prev
                const targetId = previews[previews.length - 1].id
                return prev.map((n) =>
                  n.id === targetId
                    ? {
                        ...n,
                        content: item.url,
                        previewType: item.type === 'video' ? 'video' : 'image'
                      }
                    : n
                )
              })
              setHistoryContextMenu({ visible: false, x: 0, y: 0, item: null })
            }}
          >
            <Maximize2 size={14} className="text-emerald-500" /> 发送到预览窗口
          </button>
          {/* 拓展图片功能已移除 */}
          <button
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${'text-zinc-300 hover:bg-zinc-800'}`}
            onClick={applyHistoryToSelectedNode}
          >
            <ArrowRightSquare
              size={14}
              className={selectedNodeId ? 'text-green-500' : 'text-zinc-400'}
            />{' '}
            应用到选中节点
          </button>
          <button
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${'text-zinc-300 hover:bg-zinc-800'}`}
            onClick={() => {
              const item = historyContextMenu.item
              if (!item?.url) return

              if (activeShot?.nodeId && activeShot?.shotId) {
                // 发送到选中的分镜
                updateShot(activeShot.nodeId, activeShot.shotId, { image_url: item.url })
                // 可选：添加一个小提示或动画
              } else {
                alert('请先点击分镜表中的某一行使其处于选中状态')
              }
              setHistoryContextMenu({
                visible: false,
                x: 0,
                y: 0,
                worldX: 0,
                worldY: 0,
                item: null
              })
            }}
          >
            <LayoutGrid
              size={14}
              className={
                activeShot?.nodeId && activeShot?.shotId ? 'text-orange-500' : 'text-zinc-400'
              }
            />{' '}
            发送到当前分镜
          </button>
          <button
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${'text-zinc-300 hover:bg-zinc-800'}`}
            onClick={() => {
              const item = historyContextMenu.item
              if (item?.url) {
                // 将九宫格切割结果推到历史卡片右侧，避免遮挡列表
                const startX = (historyContextMenu.worldX || 0) + 340 // 侧边栏约 320px，再留 20px 间距
                const startY = historyContextMenu.worldY || 0
                handleSplitGridFromUrl(item.url, { originX: startX, originY: startY })
              }
              setHistoryContextMenu({
                visible: false,
                x: 0,
                y: 0,
                worldX: 0,
                worldY: 0,
                item: null
              })
            }}
          >
            <Scissors size={14} className="text-blue-500" /> 九宫格裁切
          </button>
        </div>
      )}

      {frameContextMenu.visible && (
        <div
          className={`fixed z-[110] w-48 rounded-lg shadow-2xl py-1 animate-in fade-in duration-100 border ${'bg-[#18181b] border-zinc-700'}`}
          style={{ left: frameContextMenu.x, top: frameContextMenu.y }}
        >
          <div
            className={`px-3 py-1.5 text-[10px] font-medium border-b mb-1 ${'text-zinc-500 border-zinc-800'}`}
          >
            操作
          </div>
          <button
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${'text-zinc-300 hover:bg-zinc-800'}`}
            onClick={sendFrameToChat}
          >
            <MessageSquare size={14} className="text-purple-500" /> 发送到当前对话
          </button>
          <button
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${'text-zinc-300 hover:bg-zinc-800'}`}
            onClick={sendFrameToCanvas}
          >
            <CopyPlus size={14} className="text-blue-500" /> 发送到画布
          </button>

          <button
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${'text-zinc-300 hover:bg-zinc-800'}`}
            onClick={applyFrameToSelectedNode}
          >
            <ArrowRightSquare
              size={14}
              className={selectedNodeId ? 'text-green-500' : 'text-zinc-400'}
            />{' '}
            应用到选中节点
          </button>
        </div>
      )}

      {inputImageContextMenu.visible && (
        <div
          className={`fixed z-[110] w-48 rounded-lg shadow-2xl py-1 animate-in fade-in duration-100 border ${'bg-[#18181b] border-zinc-700'}`}
          style={{ left: inputImageContextMenu.x, top: inputImageContextMenu.y }}
          onMouseLeave={closeInputImageContextMenu}
        >
          <div
            className={`px-3 py-1.5 text-[10px] font-medium border-b mb-1 ${'text-zinc-500 border-zinc-800'}`}
          >
            操作
          </div>
          <button
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${'text-zinc-300 hover:bg-zinc-800'}`}
            onClick={sendInputImageToChat}
          >
            <MessageSquare size={14} className="text-purple-500" /> 发送到当前对话
          </button>
          <button
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${'text-zinc-300 hover:bg-zinc-800'}`}
            onClick={() => {
              const nodeId = inputImageContextMenu.nodeId
              const node = nodesMap.get(nodeId)
              if (!node || !node.content) return

              // 检查是否有框选的节点，且数量正好是9个
              const currentSelectedIds = selectedNodeIdsRef.current
              const hasSelectedNodes = currentSelectedIds && currentSelectedIds.size === 9

              if (hasSelectedNodes) {
                // 替换模式：直接替换已选中的9个节点
                handleSplitGridFromUrl(node.content, { replaceSelected: true })
              } else {
                // 创建新节点模式：在源节点旁边创建
                const originX = node.x + node.width + 20
                const originY = node.y
                handleSplitGridFromUrl(node.content, { originX, originY })
              }
              closeInputImageContextMenu()
            }}
          >
            <Scissors size={14} className="text-blue-500" /> 九宫格裁切
          </button>
        </div>
      )}

      {/* 框选节点右键菜单 (已被移除) */}

      {/* 节点右键菜单已移除 — 仅通过 Delete 键删除节点 */}
    </>
  )
}

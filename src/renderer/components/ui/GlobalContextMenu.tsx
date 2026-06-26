export const GlobalContextMenu = ({ contextMenu, setContextMenu, addNode }) => {
  if (!contextMenu.visible) return null

  const handleCreate = (type) => {
    addNode(
      type,
      contextMenu.worldX,
      contextMenu.worldY,
      contextMenu.sourceNodeId,
      undefined,
      undefined,
      contextMenu.targetNodeId,
      contextMenu.inputType
    )
    // 创建后立即关闭菜单
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }

  return (
    <div
      className="context-menu fixed z-50 w-32"
      style={{ left: contextMenu.x, top: contextMenu.y, transform: 'translate(-50%, -50%)' }}
      onMouseLeave={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
    >
      {[
        // { type: 'text-node', label: '文字节点' },
        { type: 'gen-image', label: 'AI 绘图' },
        { type: 'gen-video', label: 'AI 视频' }
        // { type: 'audio-input', label: '音频参考' },
      ].map((item) => (
        <button
          key={item.type}
          className="context-menu-item text-xs"
          onClick={() => handleCreate(item.type)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

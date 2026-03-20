export const GlobalContextMenu = ({ contextMenu, setContextMenu, addNode }) => {
  if (!contextMenu.visible) return null

  return (
    <div
      className={`fixed z-50 w-28 rounded-lg shadow-xl border ${'bg-[#18181b] border-zinc-800'}`}
      style={{ left: contextMenu.x, top: contextMenu.y, transform: 'translate(-50%, -50%)' }}
      onMouseLeave={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
    >
      <div className="p-1">
        {[
          // { type: 'text-node', label: '文字节点' },
          { type: 'gen-image', label: 'AI 绘图' },
          { type: 'gen-video', label: 'AI 视频' },
          { type: 'alchemy-node', label: '炼丹炉' }
          // { type: 'audio-input', label: '音频参考' },
        ].map((item) => (
          <button
            key={item.type}
            className={`w-full text-left px-3 py-2 text-xs rounded transition-colors ${'text-zinc-300 hover:bg-zinc-800'}`}
            onClick={() =>
              addNode(
                item.type,
                contextMenu.worldX,
                contextMenu.worldY,
                contextMenu.sourceNodeId,
                undefined,
                undefined,
                contextMenu.targetNodeId,
                contextMenu.inputType
              )
            }
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

import { FileText, Trash2 } from '../../utils/icons.jsx'

export const NovelInputNode = ({
  node,
  apiConfigs,
  deleteNode,
  updateNodeSettings,
  setNodes,
  setConnections
}) => {
  return (
    <div className="relative w-full h-full flex flex-col transition-colors pointer-events-auto bg-transparent">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)] text-xs font-semibold shrink-0 bg-[var(--bg-secondary)] text-[var(--text-primary)]">
        <div className="flex items-center gap-1.5">
          <FileText size={12} className="text-[var(--text-secondary)]" />
          <span>Sora 流程</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            deleteNode(node.id)
          }}
          className="p-1 rounded bg-red-500/10 text-red-500 hover:text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors active:scale-95"
          title="删除节点"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="flex-1 flex flex-col gap-2 p-3 overflow-hidden min-h-0">
        <textarea
          value={node.settings?.content || ''}
          onChange={(e) => {
            const newValue = e.target.value
            if (newValue.length <= 10000) {
              updateNodeSettings(node.id, { content: newValue })
            }
          }}
          placeholder="输入剧本或故事内容（支持长文本）..."
          maxLength={10000}
          className="nodrag nowheel w-full h-full resize-none outline-none text-[13px] p-3 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:border-[var(--primary-color)]/50 transition-colors placeholder-[var(--text-muted)] custom-scrollbar shadow-sm leading-relaxed"
          onMouseDown={(e) => e.stopPropagation()}
        />
        <div className="text-right text-[10px] text-[var(--text-muted)] shrink-0 font-medium">
          {(node.settings?.content || '').length}/10,000
        </div>
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border-color)] shrink-0 bg-[var(--bg-base)]">
        <button
          className="flex-1 px-3 py-2 rounded text-xs font-mono font-bold transition-all bg-[var(--primary-color)]/10 text-[var(--primary-color)] hover:bg-[var(--primary-color)]/20 border border-[var(--primary-color)]/20 shadow-sm active:scale-95"
          onMouseDown={(e) => e.stopPropagation()}
          type="button"
          onClick={() => {
            if (!node.settings?.content || node.settings.content.trim().length === 0) {
              alert('请输入剧本内容')
              return
            }
            // 创建提取角色和场景节点
            // node.x/node.y 本身就是 world 坐标，不应再 screenToWorld，否则会导致新节点“飞到”视野外
            const worldX = node.x + node.width + 100
            const worldY = node.y + node.height / 2
            const extractNodeId = `node-${Date.now()}`
            const extractNode = {
              id: extractNodeId,
              type: 'extract-characters-scenes',
              x: worldX - 200,
              y: worldY - 200,
              width: 400,
              height: 500,
              settings: {
                model: apiConfigs.find((c) => c.type === 'Chat')?.id || '',
                content: node.settings.content
              }
            }
            setNodes((prev) => [...prev, extractNode])
            // 创建连接
            setConnections((prev) => [
              ...prev,
              {
                id: `conn-${Date.now()}`,
                from: node.id,
                to: extractNodeId
              }
            ])

            // 自动触发提取（延迟100ms确保节点已渲染）
            setTimeout(() => {
              const extractButton = document.getElementById(`extract-button-${extractNodeId}`)
              if (extractButton) {
                extractButton.click()
              }
            }, 100)
          }}
        >
          [ &gt; EXTRACT_CHARACTERS_SCENES ]
        </button>
      </div>
    </div>
  )
}

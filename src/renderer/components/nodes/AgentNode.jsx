import { Trash2, MessageSquare, User, Bot, Zap, Layout } from '../../utils/icons.jsx'
import { DEFAULT_BASE_URL } from '../../utils/constants.js'
import { apiClient } from '../../services/apiClient.js'

export const AgentNode = ({
  node,
  apiConfigs,
  deleteNode,
  updateNodeSettings,
  setNodes,
  setConnections,
  globalApiKey,
  setSettingsOpen
}) => {
  const handleRunAgent = async () => {
    const { role, template, input, chatModel } = node.settings || {}

    if (!input) {
      alert('请输入用户输入')
      return
    }

    // 1. 获取模型配置
    const modelId = chatModel || apiConfigs.find((c) => c.type === 'Chat')?.id
    if (!modelId) {
      alert('请选择或配置 Chat 模型')
      return
    }

    const config = apiConfigs.find((c) => c.id === modelId)
    if (!config) {
      alert('未找到选中的模型配置')
      return
    }

    const apiKey = config.key || globalApiKey
    if (!apiKey) {
      alert('请配置 API Key')
      setSettingsOpen(true)
      return
    }

    // 2. 构造消息
    const content = template ? template.replace(/{input}/g, input) : input

    const messages = []
    if (role) {
      messages.push({ role: 'system', content: role })
    }
    messages.push({ role: 'user', content: content })

    // 3. 创建新的文本节点用于接收输出
    const textNodeId = `node-${Date.now()}`
    const worldX = node.x + node.width + 100
    const worldY = node.y

    const newTextNode = {
      id: textNodeId,
      type: 'text-node',
      x: worldX,
      y: worldY,
      width: 300,
      height: 200, // 默认高度
      settings: { text: '' }
    }

    // 添加节点和连接
    setNodes((prev) => [...prev, newTextNode])
    setConnections((prev) => [
      ...prev,
      {
        id: `conn-${Date.now()}`,
        from: node.id,
        to: textNodeId
      }
    ])

    // 初始化日志
    let currentLogs = [...(node.settings.logs || [])]
    const addLog = (msg) => {
      currentLogs = [...currentLogs, msg]
      return currentLogs
    }

    updateNodeSettings(node.id, {
      status: 'running',
      logs: addLog(`开始任务...`)
    })
    updateNodeSettings(node.id, {
      logs: addLog(`使用模型: ${config.provider}`)
    })

    try {
      const baseUrl = (config.url || DEFAULT_BASE_URL).replace(/\/+$/, '')

      updateNodeSettings(node.id, {
        logs: addLog(`发送请求...`)
      })

      const responseData = await apiClient(
        '/v1/chat/completions',
        {
          method: 'POST',
          body: JSON.stringify({
            model: config.modelName || config.id || 'gpt-3.5-turbo', // Use config.modelName or config.id
            messages: messages,
            temperature: 0.7 // Assuming a default temperature
          })
        },
        { baseUrl, apiKey }
      )

      let resultText = responseData.choices?.[0]?.message?.content || ''

      updateNodeSettings(textNodeId, { text: resultText })

      updateNodeSettings(node.id, {
        status: 'completed',
        logs: addLog('任务完成。')
      })
    } catch (error) {
      console.error('Agent execution failed:', error)
      updateNodeSettings(node.id, {
        status: 'error',
        logs: addLog(`错误: ${error.message}`)
      })
      // 同时在文本节点显示错误，方便查看
      updateNodeSettings(textNodeId, { text: `生成出错: ${error.message}` })
    }
  }

  const handleStopAgent = () => {
    updateNodeSettings(node.id, {
      status: 'idle',
      logs: [...(node.settings.logs || []), '任务已停止。']
    })
  }

  return (
    <div className="flex flex-col h-full pointer-events-auto">
      {/* Header */}
      <div className="px-3 py-2 border-b flex justify-between items-center shrink-0 border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-[var(--text-muted)]" />
          <span className="font-bold text-xs text-[var(--text-primary)]">智能代理 Agent</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              node.settings?.status === 'running'
                ? 'bg-green-500/20 text-green-500'
                : node.settings?.status === 'failed'
                  ? 'bg-red-500/20 text-red-500'
                  : 'bg-[var(--border-color)] text-[var(--text-muted)]'
            }`}
          >
            {node.settings?.status === 'running'
              ? '运行中'
              : node.settings?.status === 'idle'
                ? '空闲'
                : node.settings?.status === 'completed'
                  ? '已完成'
                  : node.settings?.status === 'error' || node.settings?.status === 'failed'
                    ? '失败'
                    : node.settings?.status || '空闲'}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              deleteNode(node.id)
            }}
            className="p-1 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 transition-colors"
            title="删除节点"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 min-h-0">
        {/* Model Selection */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold flex items-center gap-1 text-[var(--text-muted)]">
            <Zap size={10} /> 选择模型 (Chat Model)
          </label>
          <select
            value={node.settings?.chatModel || ''}
            onChange={(e) => updateNodeSettings(node.id, { chatModel: e.target.value })}
            className="nodrag w-full p-2 text-xs border-b outline-none bg-black/20 border-[var(--border-color)] text-[var(--text-secondary)] font-mono focus:border-[var(--primary-color)] transition-all"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="">自动选择 (Auto)</option>
            {apiConfigs
              .filter((c) => c.type === 'Chat')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.provider}
                </option>
              ))}
          </select>
        </div>

        {/* Role Definition */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold flex items-center gap-1 text-[var(--text-muted)]">
            <User size={10} /> 角色设定 / 系统提示词
          </label>
          <textarea
            value={node.settings?.role || ''}
            onChange={(e) => updateNodeSettings(node.id, { role: e.target.value })}
            placeholder="定义智能体的角色设定 (例如: 你是一个 Python 专家...)"
            className="nodrag nowheel w-full h-16 p-2 text-xs border-b resize-none outline-none bg-black/20 border-[var(--border-color)] text-[var(--text-secondary)] font-mono focus:border-[var(--primary-color)] transition-all"
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>

        {/* Template */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold flex items-center gap-1 text-[var(--text-muted)]">
            <Layout size={10} /> 提示词模板
          </label>
          <textarea
            value={node.settings?.template || ''}
            onChange={(e) => updateNodeSettings(node.id, { template: e.target.value })}
            placeholder="包含占位符的模板 (例如: 用简单的语言解释 {input})"
            className="nodrag nowheel w-full h-16 p-2 text-xs border-b resize-none outline-none bg-black/20 border-[var(--border-color)] text-[var(--text-secondary)] font-mono focus:border-[var(--primary-color)] transition-all"
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>

        {/* User Input */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold flex items-center gap-1 text-[var(--text-muted)]">
            <MessageSquare size={10} /> 用户输入
          </label>
          <textarea
            value={node.settings?.input || ''}
            onChange={(e) => updateNodeSettings(node.id, { input: e.target.value })}
            placeholder="需要处理的具体内容..."
            className="nodrag nowheel w-full h-20 p-2 text-xs border-b resize-none outline-none bg-black/20 border-[var(--border-color)] text-[var(--text-secondary)] font-mono focus:border-[var(--primary-color)] transition-all"
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>

        {/* Auto Mode Toggle */}
        <div className="flex items-center justify-between">
          <label className="text-xs flex items-center gap-2 cursor-pointer text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={node.settings?.autoMode || false}
              onChange={(e) => updateNodeSettings(node.id, { autoMode: e.target.checked })}
              className="w-3 h-3 rounded border-gray-300 text-[var(--primary-color)] shadow-sm focus:border-[var(--primary-color)] focus:ring focus:ring-[var(--primary-color)]/50 focus:ring-opacity-50"
              onMouseDown={(e) => e.stopPropagation()}
            />
            自动模式
          </label>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-1 w-full justify-center">
          <button
            onClick={handleRunAgent}
            disabled={node.settings?.status === 'running'}
            className="w-full py-2 mt-2 border-t border-[var(--border-color)] text-[10px] font-mono tracking-widest text-[var(--text-muted)] hover:text-[var(--primary-color)] hover:bg-[var(--primary-color)]/10 transition-all uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {node.settings?.status === 'running' ? '[ > 执行中... ]' : '[ > 执行智能代理 ]'}
          </button>
          {node.settings?.status === 'running' && (
            <button
              onClick={handleStopAgent}
              className="w-full py-2 border-t border-[var(--border-color)] text-[10px] font-mono tracking-widest text-red-500/80 hover:text-red-400 hover:bg-red-500/10 transition-all uppercase"
              onMouseDown={(e) => e.stopPropagation()}
            >
              [ {'>'} ABORT ]
            </button>
          )}
        </div>

        {/* Logs */}
        {node.settings?.logs?.length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
              执行日志
            </label>
            <div className="p-2 rounded border max-h-32 overflow-y-auto text-[10px] font-mono bg-black/20 border-[var(--border-color)] text-[var(--text-muted)]">
              {node.settings.logs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {node.settings?.result && (
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
              运行结果
            </label>
            <div className="p-2 rounded border text-xs whitespace-pre-wrap bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)]">
              {node.settings.result}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

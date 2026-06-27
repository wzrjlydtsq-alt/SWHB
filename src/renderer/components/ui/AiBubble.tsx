import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { Send, X, Sparkles, Minimize2 } from 'lucide-react'

/**
 * 浮动 AI 画布助手气泡
 * 画布右下角，可展开为迷你对话框
 */
export const AiBubble = memo(function AiBubble({ onSendMessage }: any) {
  const aiBubbleOpen = useAppStore((s) => s.aiBubbleOpen)
  const setAiBubbleOpen = useAppStore((s) => s.setAiBubbleOpen)

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const inputRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (aiBubbleOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [aiBubbleOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return
    const userMsg = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }])
    setIsSending(true)

    try {
      // 通过回调发送消息到主聊天系统
      if (onSendMessage) {
        const reply = await onSendMessage(userMsg)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: reply || '✨ 已执行'
          }
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '⚠️ AI 通道未连接，请打开侧边栏对话'
          }
        ])
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `❌ ${err.message || '请求失败'}`
        }
      ])
    }
    setIsSending(false)
  }, [input, isSending, onSendMessage])

  return (
    <div
      className="fixed z-[60]"
      style={{
        right: 24,
        bottom: 80
      }}
    >
      {/* 展开的迷你对话面板 */}
      {aiBubbleOpen && (
        <div
          className="mb-3 rounded-2xl overflow-hidden flex flex-col"
          style={{
            width: 320,
            height: 380,
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border-default)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
            animation: 'bubblePanelIn 0.3s var(--ease-out) forwards'
          }}
        >
          <style>{`
            @keyframes bubblePanelIn {
              from { opacity: 0; transform: translateY(12px) scale(0.95); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>

          {/* 标题栏 */}
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} style={{ color: 'var(--primary-color)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                AI 助手
              </span>
            </div>
            <button
              onClick={() => setAiBubbleOpen(false)}
              className="p-1 rounded-md transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <Minimize2 size={13} />
            </button>
          </div>

          {/* 消息列表 */}
          <div
            className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
            style={{ scrollbarWidth: 'thin' }}
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full opacity-40">
                <Sparkles size={24} style={{ color: 'var(--primary-color)' }} />
                <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                  在这里快速与 AI 交互
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[85%] px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed"
                  style={{
                    backgroundColor:
                      msg.role === 'user' ? 'var(--primary-color)' : 'var(--bg-secondary)',
                    color: msg.role === 'user' ? 'var(--text-on-primary)' : 'var(--text-primary)'
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div
                  className="px-2.5 py-1.5 rounded-lg text-[11px]"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                >
                  <span className="animate-pulse">思考中...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 输入框 */}
          <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                  if (e.key === 'Escape') setAiBubbleOpen(false)
                }}
                placeholder="输入指令..."
                className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)'
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                className="p-1.5 rounded-lg transition-all"
                style={{
                  backgroundColor: input.trim() ? 'var(--primary-color)' : 'var(--bg-secondary)',
                  color: input.trim() ? 'var(--text-on-primary)' : 'var(--text-muted)',
                  opacity: isSending ? 0.5 : 1
                }}
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 浮动气泡按钮 */}
      <button
        onClick={() => setAiBubbleOpen(!aiBubbleOpen)}
        className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
        style={{
          backgroundColor: 'var(--primary-color)',
          color: 'var(--text-on-primary)',
          boxShadow: `0 4px 16px ${aiBubbleOpen ? 'var(--primary-glow)' : 'rgba(0,0,0,0.3)'}`,
          animation: !aiBubbleOpen ? 'bubbleBreathe 3s ease-in-out infinite' : 'none'
        }}
        title="AI 画布助手"
      >
        <style>{`
          @keyframes bubbleBreathe {
            0%, 100% { box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
            50% { box-shadow: 0 4px 24px var(--primary-glow); }
          }
        `}</style>
        {aiBubbleOpen ? <X size={20} /> : <Sparkles size={20} />}
      </button>
    </div>
  )
})

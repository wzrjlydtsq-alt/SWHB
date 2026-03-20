import {
  X,
  Bot,
  User,
  History,
  Plus,
  ChevronRight,
  Send,
  Paperclip,
  FileText,
  FileAudio
} from '../../utils/icons.jsx'
import { marked } from 'marked'
import { getXingheMediaSrc } from '../../utils/fileHelpers.js'
import { useAppStore } from '../../store/useAppStore.js'

export const ChatSidebar = ({
  isChatOpen,
  setIsChatOpen,
  chatWidth,
  handleChatResizeStart,
  chatModel,
  setChatModel,
  apiConfigs,
  createNewChat,
  chatSessions,
  chatSessionDropdownOpen,
  setChatSessionDropdownOpen,
  currentChatId,
  setCurrentChatId,
  deleteChatSession,
  currentSession,
  chatFiles,
  removeChatFile,
  handleChatFileUpload,
  chatInput,
  setChatInput,
  sendChatMessage,
  isChatSending,
  chatEndRef
}) => {
  const getStatusColor = (modelId) => {
    if (!modelId) return 'bg-yellow-500'
    const config = (Array.isArray(apiConfigs) ? apiConfigs : []).find((c) => c.id === modelId)
    if (!config || !config.key) return 'bg-red-500'
    return 'bg-green-500'
  }

  const assetLibraryOpen = useAppStore((s) => s.assetLibraryOpen)

  return (
    <div
      className={`fixed right-0 bottom-0 border-l shadow-2xl flex flex-col z-50 transition-all duration-300 ease-in-out select-text text-scale-target bg-[var(--bg-base)] border-[var(--border-color)] ${isChatOpen ? 'translate-x-0' : 'translate-x-full'}`}
      style={{
        width: chatWidth,
        top: assetLibraryOpen ? '18vh' : '48px',
        pointerEvents: isChatOpen ? 'auto' : 'none'
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize transition-colors z-50 flex items-center justify-center group hover:bg-[var(--primary-color)]/50"
        onMouseDown={handleChatResizeStart}
      >
        <div className="h-8 w-1 rounded transition-colors bg-[var(--border-color)] group-hover:bg-[var(--primary-color)]"></div>
      </div>
      <div className="h-12 flex items-center justify-between px-3 shrink-0 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="relative">
            <select
              value={chatModel}
              onChange={(e) => setChatModel(e.target.value)}
              className="text-xs border rounded pl-2 pr-6 py-1 appearance-none outline-none focus:border-[var(--primary-color)] cursor-pointer max-w-[180px] truncate bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)]"
            >
              {(Array.isArray(apiConfigs) ? apiConfigs : [])
                .filter((c) => c.type === 'Chat')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.provider} ({c.modelName})
                  </option>
                ))}
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(chatModel)}`}></div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={createNewChat}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
            title="新对话"
          >
            <Plus size={16} />
          </button>
          {chatSessions.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setChatSessionDropdownOpen(!chatSessionDropdownOpen)}
                className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
              >
                <History size={16} />
              </button>
              {chatSessionDropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-48 rounded-lg shadow-xl py-1 z-50 border bg-[var(--bg-secondary)] border-[var(--border-color)]"
                  onMouseLeave={() => setChatSessionDropdownOpen(false)}
                >
                  {chatSessions.map((s) => (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer ${
                        currentChatId === s.id
                          ? 'bg-[var(--bg-panel)] text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)] hover:bg-[var(--bg-panel)]'
                      }`}
                      onClick={() => {
                        setCurrentChatId(s.id)
                        setChatSessionDropdownOpen(false)
                      }}
                    >
                      <span className="truncate flex-1">{s.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteChatSession(e, s.id)
                        }}
                        className="p-1 text-[var(--text-muted)] hover:text-red-500"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setIsChatOpen(false)}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 select-text">
        {currentSession?.messages.map((msg) => (
          <div
            key={msg.id || msg.timestamp || `msg-${Math.random()}`}
            className={`flex gap-3 select-text ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 select-none ${msg.role === 'user' ? 'bg-[var(--primary-color)]' : 'bg-green-600'}`}
            >
              {msg.role === 'user' ? (
                <User size={16} className="text-white" />
              ) : (
                <Bot size={16} className="text-white" />
              )}
            </div>
            <div
              className={`flex flex-col gap-1 max-w-[85%] select-text ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {msg.files && msg.files.length > 0 && (
                <div
                  className={`flex flex-wrap gap-2 mb-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.files.map((f, i) => (
                    <div
                      key={i}
                      className="rounded p-1 border flex items-center gap-1 bg-[var(--bg-secondary)] border-[var(--border-color)]"
                    >
                      {f.isImage ? (
                        <img
                          src={getXingheMediaSrc(f.content)}
                          className="w-16 h-16 object-cover rounded"
                          alt={f.name}
                        />
                      ) : f.isVideo ? (
                        <video
                          src={getXingheMediaSrc(f.content)}
                          controls
                          className="max-w-full rounded-lg bg-black max-h-[300px] border border-[var(--border-color)]"
                          playsInline
                        />
                      ) : f.isAudio ? (
                        <div className="flex items-center gap-2 px-2 py-1">
                          <FileAudio size={16} className="text-[var(--text-muted)]" />
                          <audio src={f.content} controls className="h-8 w-48" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-2 py-1">
                          <FileText size={16} className="text-[var(--text-muted)]" />
                          <span className="text-xs text-[var(--text-secondary)]">{f.name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {(msg.content || (msg.files && msg.files.length > 0)) && (
                <div
                  className={`rounded-2xl px-4 py-2 text-sm select-text break-words whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-tr-none'
                      : 'bg-[var(--bg-panel)] text-[var(--text-secondary)] rounded-tl-none border border-[var(--border-color)]'
                  }`}
                  style={{ userSelect: 'text', cursor: 'text' }}
                >
                  {msg.isError ? (
                    <span
                      className="text-red-500 select-text cursor-text"
                      style={{ userSelect: 'text', cursor: 'text' }}
                    >
                      {msg.content}
                    </span>
                  ) : msg.content ? (
                    <div
                      className="markdown-body"
                      dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }}
                      style={{ userSelect: 'text', cursor: 'text' }}
                    ></div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ))}
        {isChatSending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center shrink-0">
              <Bot size={16} className="text-white" />
            </div>
            <div className="rounded-2xl rounded-tl-none px-4 py-2 border flex items-center bg-[var(--bg-panel)] border-[var(--border-color)]">
              <div className="flex gap-1">
                <div
                  className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce"
                  style={{ animationDelay: '0s' }}
                ></div>
                <div
                  className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                ></div>
                <div
                  className="w-1.5 h-1.5 bg-[var(--text-muted)] rounded-full animate-bounce"
                  style={{ animationDelay: '0.4s' }}
                ></div>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div className="p-3 border-t border-[var(--border-color)] bg-[var(--bg-base)]">
        {chatFiles.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2 custom-scrollbar">
            {chatFiles.map((f, i) => (
              <div key={i} className="relative group shrink-0">
                {f.isImage ? (
                  <img
                    src={getXingheMediaSrc(f.content)}
                    className="w-12 h-12 object-cover rounded border border-[var(--border-color)]"
                    alt={f.name}
                  />
                ) : f.isVideo ? (
                  <video
                    src={getXingheMediaSrc(f.content)}
                    className="w-16 h-12 object-cover rounded border bg-black border-[var(--border-color)]"
                    muted
                    playsInline
                  />
                ) : f.isAudio ? (
                  <div className="w-12 h-12 rounded flex flex-col items-center justify-center bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-muted)]">
                    <FileAudio size={16} />
                    <span className="text-[8px] mt-1">音频</span>
                  </div>
                ) : f.isPDF ? (
                  <div className="w-12 h-12 rounded flex flex-col items-center justify-center bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-muted)]">
                    <FileText size={16} />
                    <span className="text-[8px] mt-1">PDF</span>
                  </div>
                ) : f.isDoc ? (
                  <div className="w-12 h-12 rounded flex flex-col items-center justify-center bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-muted)]">
                    <FileText size={16} />
                    <span className="text-[8px] mt-1">DOC</span>
                  </div>
                ) : f.isExcel ? (
                  <div className="w-12 h-12 rounded flex flex-col items-center justify-center bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-muted)]">
                    <FileText size={16} />
                    <span className="text-[8px] mt-1">XLS</span>
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded flex flex-col items-center justify-center bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-muted)]">
                    <FileText size={16} />
                    <span className="text-[8px] mt-1 max-w-full truncate px-1">
                      {f.fileExt || f.name.split('.').pop() || '文件'}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => removeChatFile(i)}
                  className="absolute -top-1 -right-1 rounded-full p-0.5 border opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-white border-[var(--border-color)]"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="relative rounded-xl flex items-end p-2 focus-within:border-[var(--primary-color)]/50 transition-colors border bg-[var(--bg-secondary)] border-[var(--border-color)]">
          <label
            className="p-2 cursor-pointer transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            title="上传文件"
          >
            <Paperclip size={18} />
            <input
              type="file"
              multiple
              className="hidden"
              onChange={handleChatFileUpload}
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.js,.py,.html,.css,.json,.csv"
            />
          </label>
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendChatMessage()
              }
            }}
            placeholder="发送消息..."
            className="w-full bg-transparent text-sm resize-none outline-none max-h-32 py-2 px-1 custom-scrollbar text-[var(--text-primary)] placeholder-[var(--text-muted)]"
            rows={1}
            style={{ minHeight: '36px' }}
          />
          <button
            onClick={sendChatMessage}
            disabled={(!chatInput.trim() && chatFiles.length === 0) || isChatSending}
            className={`p-2 rounded-lg transition-all mb-0.5 ${
              (!chatInput.trim() && chatFiles.length === 0) || isChatSending
                ? 'opacity-50 bg-transparent text-[var(--text-muted)]'
                : 'bg-[var(--primary-color)] text-white hover:brightness-110'
            }`}
          >
            <Send size={16} />
          </button>
        </div>
        <div className="text-[10px] text-center mt-2 text-[var(--text-muted)]">
          支持 MP4/MP3/PDF/Doc/Excel/Code 等格式 • Enter 发送
        </div>
      </div>
    </div>
  )
}

import { useState, useCallback, useRef } from 'react'
import {
  X,
  Upload,
  Film,
  ImageIcon,
  ChevronDown,
  ChevronRight,
  FileText
} from '../../../utils/icons.jsx'
import { parseScript } from '../../../utils/parseScript.js'

/**
 * ScriptImportModal - 剧本导入悬浮面板
 *
 * 流程：用户选择 .txt 文件 → 解析镜头 → 展示结果 → 选择生成视频/图片节点
 */
export function ScriptImportModal({ open, onClose, onCreateNodes }) {
  const [file, setFile] = useState(null)
  const [pasteText, setPasteText] = useState('')
  const [parseResult, setParseResult] = useState(null)
  const [expandedShots, setExpandedShots] = useState(new Set())
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const reset = useCallback(() => {
    setFile(null)
    setPasteText('')
    setParseResult(null)
    setExpandedShots(new Set())
    setDragOver(false)
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const handleFileSelect = useCallback((selectedFile) => {
    if (!selectedFile || !selectedFile.name.endsWith('.txt')) {
      return
    }

    setFile(selectedFile)

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const result = parseScript(text)
      setParseResult(result)
    }
    reader.readAsText(selectedFile, 'utf-8')
  }, [])

  const handleParsePaste = useCallback(() => {
    if (!pasteText.trim()) return
    setFile({ name: '粘贴文本' })
    setParseResult(parseScript(pasteText))
  }, [pasteText])

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) handleFileSelect(droppedFile)
    },
    [handleFileSelect]
  )

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleFileInput = useCallback(
    (e) => {
      const selectedFile = e.target.files[0]
      if (selectedFile) handleFileSelect(selectedFile)
    },
    [handleFileSelect]
  )

  const toggleShot = useCallback((index) => {
    setExpandedShots((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const handleCreateNodes = useCallback(
    (type) => {
      if (!parseResult?.shots?.length) return
      onCreateNodes(type, parseResult.shots)
      handleClose()
    },
    [parseResult, onCreateNodes, handleClose]
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      {/* 面板 */}
      <div
        className="relative w-[520px] max-h-[80vh] rounded-2xl shadow-2xl border flex flex-col animate-in fade-in zoom-in-95 duration-200"
        style={{
          background: 'var(--bg-panel)',
          borderColor: 'var(--border-color)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)'
        }}
      >
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b shrink-0"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(167,139,250,0.15)' }}
            >
              <FileText size={16} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">剧本导入</h3>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                导入 TXT 文件，自动解析镜头内容
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
          {!parseResult ? (
            /* ===== 文件选择 + 粘贴文本 ===== */
            <div className="flex flex-col gap-4">
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 cursor-pointer ${
                  dragOver
                    ? 'border-purple-400 bg-purple-500/10'
                    : 'border-[var(--border-color)] hover:border-purple-400/50 hover:bg-[var(--bg-hover)]'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(167,139,250,0.15)' }}
                  >
                    <Upload size={20} className="text-purple-400" />
                  </div>
                  <p className="text-xs font-medium text-[var(--text-primary)]">
                    拖拽或点击选择 TXT 文件
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    文件中需包含「镜头一」「镜头1」等标记
                  </p>
                </div>
              </div>

              {/* 分隔线 */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-[var(--border-color)]" />
                <span className="text-[10px] text-[var(--text-muted)]">或者粘贴文本</span>
                <div className="flex-1 h-px bg-[var(--border-color)]" />
              </div>

              {/* 粘贴区 */}
              <textarea
                className="w-full h-32 bg-[var(--bg-secondary)] text-xs outline-none resize-none custom-scrollbar text-[var(--text-primary)] placeholder-[var(--text-muted)] leading-relaxed p-3 rounded-xl border border-[var(--border-color)] focus:border-purple-400/50 transition-colors"
                placeholder={'粘贴包含「镜头1」「镜头2」等标记的内容...\n\n例如：\n镜头一\n我正在喝水\n\n镜头二\n我正在吃饭'}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              {pasteText.trim() && (
                <button
                  onClick={handleParsePaste}
                  className="self-end flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium transition-all duration-200 hover:scale-105"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                    color: '#fff',
                    boxShadow: '0 2px 12px rgba(124,58,237,0.3)'
                  }}
                >
                  解析镜头
                </button>
              )}
            </div>
          ) : (
            /* ===== 解析结果状态 ===== */
            <div className="flex flex-col gap-4">
              {/* 结果摘要 */}
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{
                  background:
                    parseResult.count > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${parseResult.count > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
                }}
              >
                <span className="text-lg">{parseResult.count > 0 ? '✅' : '⚠️'}</span>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {parseResult.count > 0
                      ? `成功读取到 ${parseResult.count} 个镜头`
                      : '未检测到镜头标记'}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {file?.name || '未知文件'}
                  </p>
                </div>
                {/* 重新选择按钮 */}
                <button
                  onClick={() => {
                    reset()
                    fileInputRef.current?.click()
                  }}
                  className="ml-auto text-[11px] px-2.5 py-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  重新选择
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>

              {/* 镜头列表预览 */}
              {parseResult.count > 0 && (
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  <div
                    className="px-3 py-2 text-[11px] font-medium text-[var(--text-secondary)] border-b"
                    style={{
                      borderColor: 'var(--border-color)',
                      background: 'var(--bg-secondary)'
                    }}
                  >
                    镜头预览
                  </div>
                  <div className="max-h-[240px] overflow-y-auto">
                    {parseResult.shots.map((shot) => (
                      <div
                        key={shot.index}
                        className="border-b last:border-b-0"
                        style={{ borderColor: 'var(--border-color)' }}
                      >
                        <button
                          className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors"
                          onClick={() => toggleShot(shot.index)}
                        >
                          {expandedShots.has(shot.index) ? (
                            <ChevronDown size={12} className="text-[var(--text-muted)] shrink-0" />
                          ) : (
                            <ChevronRight size={12} className="text-[var(--text-muted)] shrink-0" />
                          )}
                          <span className="text-[11px] font-semibold text-purple-400 shrink-0">
                            {shot.title}
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)] truncate">
                            {shot.content.replace(shot.title, '').trim().slice(0, 50)}
                            {shot.content.length > 50 ? '...' : ''}
                          </span>
                        </button>
                        {expandedShots.has(shot.index) && (
                          <div className="px-8 pb-2.5 text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                            {shot.content}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        {parseResult?.count > 0 && (
          <div
            className="flex items-center justify-end gap-3 px-5 py-3.5 border-t shrink-0"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <button
              onClick={() => handleCreateNodes('gen-video')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-medium transition-all duration-200 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
                color: '#fff',
                boxShadow: '0 2px 12px rgba(124,58,237,0.3)'
              }}
            >
              <Film size={14} />
              生成 AI 视频节点
            </button>
            <button
              onClick={() => handleCreateNodes('gen-image')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-medium transition-all duration-200 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #059669, #3b82f6)',
                color: '#fff',
                boxShadow: '0 2px 12px rgba(5,150,105,0.3)'
              }}
            >
              <ImageIcon size={14} />
              生成 AI 绘图节点
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

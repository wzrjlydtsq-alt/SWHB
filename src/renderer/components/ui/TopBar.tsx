import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore.ts'
import { setSetting } from '../../services/dbService.ts'
import { copyDiagnosticReportToClipboard } from '../../services/diagnostics.ts'
import { ClipboardCopy } from '../../utils/icons.tsx'

const OPEN_SETTINGS_LABEL = '\u6253\u5f00\u8bbe\u7f6e'
const EDIT_PROJECT_NAME_LABEL = '\u70b9\u51fb\u7f16\u8f91\u9879\u76ee\u540d\u79f0'
const COPY_DIAGNOSTICS_LABEL = '\u590d\u5236\u8bca\u65ad\u4fe1\u606f'
const COPY_DIAGNOSTICS_COPYING = '\u6b63\u5728\u590d\u5236\u8bca\u65ad\u4fe1\u606f...'
const COPY_DIAGNOSTICS_DONE =
  '\u8bca\u65ad\u4fe1\u606f\u5df2\u590d\u5236\uff0c\u53ef\u4ee5\u76f4\u63a5\u7c98\u8d34\u53d1\u7ed9\u6211'
const COPY_DIAGNOSTICS_FAILED = '\u590d\u5236\u5931\u8d25\uff1a'

export function TopBar() {
  const projectName = useAppStore((state) => state.projectName)
  const setProjectName = useAppStore((state) => state.setProjectName)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const historyOpen = useAppStore((state) => state.historyOpen)
  const projectListOpen = useAppStore((state) => state.projectListOpen)

  const [isEditingProjectName, setIsEditingProjectName] = useState(false)
  const [diagnosticsStatus, setDiagnosticsStatus] = useState('')

  const handleCopyDiagnostics = async () => {
    setDiagnosticsStatus(COPY_DIAGNOSTICS_COPYING)
    try {
      await copyDiagnosticReportToClipboard()
      setDiagnosticsStatus(COPY_DIAGNOSTICS_DONE)
    } catch (error) {
      setDiagnosticsStatus(`${COPY_DIAGNOSTICS_FAILED}${error?.message || error}`)
    } finally {
      window.setTimeout(() => setDiagnosticsStatus(''), 3200)
    }
  }

  if (historyOpen || projectListOpen) return null

  return (
    <div className="fixed bottom-4 left-4 flex items-center gap-0 z-50 rounded-full bg-[var(--bg-panel)]/80 shadow-sm transition-all duration-300 hover:shadow-md pl-1 pr-4 py-1 backdrop-blur-sm">
      <button
        onClick={() => setSettingsOpen(true)}
        className="w-9 h-9 rounded-full bg-[var(--bg-base)] border border-[var(--border-color)] flex items-center justify-center text-lg hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer shrink-0"
        title={OPEN_SETTINGS_LABEL}
      >
        <span role="img" aria-label="logo" style={{ fontSize: '18px', lineHeight: 1 }}>
          {'\u661f'}
        </span>
      </button>

      <button
        type="button"
        onClick={handleCopyDiagnostics}
        className="ml-1 w-8 h-8 rounded-full border border-transparent flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] hover:border-[var(--border-color)] active:scale-95 transition-all"
        title={COPY_DIAGNOSTICS_LABEL}
        aria-label={COPY_DIAGNOSTICS_LABEL}
      >
        <ClipboardCopy className="w-4 h-4" />
      </button>

      {isEditingProjectName ? (
        <input
          autoFocus
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          onBlur={() => {
            setIsEditingProjectName(false)
            try {
              setSetting('tapnow_project_name', projectName)
            } catch (e) {
              console.error(e)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setIsEditingProjectName(false)
              try {
                setSetting('tapnow_project_name', projectName)
              } catch (e) {
                console.error(e)
              }
            }
          }}
          className="ml-2 px-2 py-0.5 text-sm rounded-lg outline-none border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:border-[var(--primary-color)] transition-colors"
          style={{ minWidth: '80px', maxWidth: '180px' }}
        />
      ) : (
        <span
          onClick={() => setIsEditingProjectName(true)}
          className="ml-2 text-sm font-medium cursor-pointer hover:text-[var(--primary-color)] text-[var(--text-primary)] transition-colors"
          title={EDIT_PROJECT_NAME_LABEL}
        >
          {projectName}
        </span>
      )}

      {diagnosticsStatus && (
        <div className="absolute bottom-full left-2 mb-2 max-w-[260px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2 text-xs text-[var(--text-primary)] shadow-lg">
          {diagnosticsStatus}
        </div>
      )}
    </div>
  )
}

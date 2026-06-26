import { X } from '../../utils/icons.tsx'
import { createPortal } from 'react-dom'

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  lightweight = false
}) => {
  if (!isOpen) return null
  const modalNode = (
    <div
      className={`fixed inset-0 z-[200000] flex items-center justify-center modal-overlay ${lightweight ? 'modal-overlay-light' : ''}`}
      style={{
        animation: lightweight ? 'none' : 'modal-overlay-in var(--duration-fast) var(--ease-out) both'
      }}
      onClick={onClose}
    >
      <div
        className={`modal-container ${lightweight ? 'modal-container-light' : ''} overflow-hidden flex flex-col max-h-[85vh] ${className || 'w-[680px]'} max-w-[90vw]`}
        style={{
          animation: lightweight ? 'none' : 'modal-content-in var(--duration-normal) var(--ease-out) both'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-[var(--radius-xs)]">
            <X size={18} />
          </button>
        </div>
        <div
          className="overflow-y-auto custom-scrollbar flex-1"
          style={{ background: 'var(--bg-base)' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
  return createPortal(modalNode, document.body)
}

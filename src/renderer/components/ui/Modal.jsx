import { X } from '../../utils/icons.jsx'

export const Modal = ({ isOpen, onClose, title, children, className = '' }) => {
  if (!isOpen) return null
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`rounded-xl shadow-2xl ${className || 'w-[680px]'} max-w-[90vw] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh] border bg-[var(--bg-secondary)] border-[var(--border-color)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between p-5 border-b shrink-0 border-[var(--border-color)]`}
        >
          <h3 className={`font-bold text-lg text-[var(--text-primary)]`}>{title}</h3>
          <button
            onClick={onClose}
            className={
              'text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors'
            }
          >
            <X size={20} />
          </button>
        </div>
        <div className={`p-0 overflow-y-auto custom-scrollbar flex-1 bg-[var(--bg-base)]`}>
          {children}
        </div>
      </div>
    </div>
  )
}

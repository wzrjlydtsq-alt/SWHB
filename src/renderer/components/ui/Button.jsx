import React from 'react'

export const Button = React.memo(
  ({
    children,
    onClick,
    className = '',
    variant = 'primary',
    icon: Icon,
    disabled = false,
    title = ''
  }) => {
    const baseStyle =
      'flex items-center justify-center px-3 py-1.5 rounded-lg transition-all duration-200 font-medium text-xs select-none disabled:opacity-50 disabled:cursor-not-allowed'
    const variants = {
      primary:
        'bg-[var(--primary-color)] hover:brightness-110 text-white shadow-lg active:scale-95',
      secondary:
        'bg-[var(--bg-secondary)] hover:brightness-125 text-[var(--text-secondary)] border border-[var(--border-color)] active:scale-95',
      ghost:
        'bg-transparent hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
      danger: 'bg-red-900/30 hover:bg-red-800 text-red-200 border border-red-800 active:scale-95'
    }
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`${baseStyle} ${variants[variant]} ${className}`}
        title={title}
      >
        {Icon && <Icon size={14} className={children ? 'mr-1.5' : ''} />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

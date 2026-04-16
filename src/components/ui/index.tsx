import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

// ─── BUTTON ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize    = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?:    ButtonSize
  loading?: boolean
}

const variantClass: Record<ButtonVariant, string> = {
  primary:   'bg-[var(--gp-orange)] hover:bg-[var(--gp-orange-hover)] text-white font-semibold shadow-[var(--shadow-gp)] active:scale-[0.98]',
  secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700',
  ghost:     'hover:bg-gray-100 text-gray-600',
  danger:    'bg-red-500 hover:bg-red-600 text-white',
}

const sizeClass: Record<ButtonSize, string> = {
  sm:  'px-3 py-1.5 text-xs rounded-lg',
  md:  'px-4 py-2.5 text-sm rounded-xl',
  lg:  'px-5 py-3 text-base rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, children, className = '', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-disabled={disabled || loading}
      aria-busy={loading}
      className={`
        inline-flex items-center justify-center gap-2 transition-all duration-150
        focus-visible:outline-[2.5px] focus-visible:outline-gp-orange
        focus-visible:outline-offset-3
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClass[variant]} ${sizeClass[size]} ${className}
      `}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
      {loading && <span className="sr-only">Cargando...</span>}
      {children}
    </button>
  )
)
Button.displayName = 'Button'

// ─── INPUT ────────────────────────────────────────────────────────────────────

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:       string
  error?:       string
  hint?:        string
  hideLabel?:   boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, hideLabel = false, className = '', id: propId, ...props }, ref) => {
    const autoId   = useId()
    const id       = propId ?? autoId
    const errorId  = `${id}-error`
    const hintId   = `${id}-hint`

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className={`text-xs font-semibold text-gp-text-3 uppercase tracking-wider
                        ${hideLabel ? 'sr-only' : ''}`}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          aria-describedby={[error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined}
          aria-invalid={!!error}
          className={`
            w-full border-[1.5px] rounded-xl px-3 py-2.5
            text-gp-text-1 placeholder-gp-text-3
            outline-none transition-all duration-150
            focus:border-gp-orange focus:shadow-[0_0_0_3px_var(--focus-ring)]
            hover:border-gray-300
            ${error
              ? 'border-red-400 bg-red-50 focus:border-red-500'
              : 'border-gp-border bg-white'
            }
            ${className}
          `}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-xs text-gp-text-3">{hint}</p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-600 font-medium flex items-center gap-1">
            <span aria-hidden="true">⚠</span> {error}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

// ─── SELECT ───────────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?:     string
  error?:     string
  hideLabel?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hideLabel = false, className = '', id: propId, children, ...props }, ref) => {
    const autoId  = useId()
    const id      = propId ?? autoId
    const errorId = `${id}-error`

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className={`text-xs font-semibold text-gp-text-3 uppercase tracking-wider
                        ${hideLabel ? 'sr-only' : ''}`}
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={!!error}
          className={`
            w-full border-[1.5px] rounded-xl px-3 py-2.5
            text-gp-text-1 outline-none transition-all duration-150 bg-white
            focus:border-gp-orange focus:shadow-[0_0_0_3px_var(--focus-ring)]
            hover:border-gray-300 cursor-pointer
            ${error ? 'border-red-400' : 'border-gp-border'}
            ${className}
          `}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-600 font-medium">
            ⚠ {error}
          </p>
        )}
      </div>
    )
  }
)
Select.displayName = 'Select'

// ─── TEXTAREA ─────────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?:     string
  error?:     string
  hint?:      string
  hideLabel?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, hideLabel = false, className = '', id: propId, ...props }, ref) => {
    const autoId  = useId()
    const id      = propId ?? autoId
    const errorId = `${id}-error`
    const hintId  = `${id}-hint`

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className={`text-xs font-semibold text-gp-text-3 uppercase tracking-wider
                        ${hideLabel ? 'sr-only' : ''}`}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          aria-describedby={[error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined}
          aria-invalid={!!error}
          rows={3}
          className={`
            w-full border-[1.5px] rounded-xl px-3 py-2.5
            text-gp-text-1 placeholder-gp-text-3
            outline-none transition-all duration-150 resize-none
            focus:border-gp-orange focus:shadow-[0_0_0_3px_var(--focus-ring)]
            hover:border-gray-300
            ${error
              ? 'border-red-400 bg-red-50'
              : 'border-gp-border bg-white'
            }
            ${className}
          `}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-xs text-gp-text-3">{hint}</p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-600 font-medium">
            ⚠ {error}
          </p>
        )}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

// ─── BADGE ────────────────────────────────────────────────────────────────────

interface BadgeProps {
  children:   React.ReactNode
  className?: string
}

export function Badge({ children, className = '' }: BadgeProps) {
  return (
    <span className={`
      inline-flex items-center px-2.5 py-1 rounded-full
      text-xs font-semibold leading-none ${className}
    `}>
      {children}
    </span>
  )
}

// ─── CARD ─────────────────────────────────────────────────────────────────────

interface CardProps {
  children:   React.ReactNode
  className?: string
  onClick?:   () => void
  as?:        'div' | 'article' | 'section' | 'li'
}

export function Card({ children, className = '', onClick, as: Tag = 'div' }: CardProps) {
  return (
    <Tag
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
      } : undefined}
      className={`
        bg-white rounded-lg border border-gp-border
        shadow-gp-sm
        ${onClick
          ? 'card-interactive focus-visible:outline-[2.5px] focus-visible:outline-gp-orange focus-visible:outline-offset-2'
          : ''
        }
        ${className}
      `}
    >
      {children}
    </Tag>
  )
}

// ─── SPINNER ──────────────────────────────────────────────────────────────────

export function Spinner({ size = 24, label = 'Cargando...' }: { size?: number; label?: string }) {
  return (
    <div className="flex items-center justify-center p-8" role="status" aria-label={label}>
      <Loader2
        size={size}
        className="animate-spin text-gp-orange"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}

// ─── PAGE HEADER ─────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title:     string
  subtitle?: string
  action?:   React.ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <header className="flex items-start justify-between mb-6 gap-4">
      <div>
        <h1 className="text-xl font-bold text-gp-text-1">{title}</h1>
        {subtitle && (
          <p className="text-sm text-gp-text-3 mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?:        React.ReactNode
  title:        string
  description?: string
  action?:      React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 text-center animate-fadein"
      role="status"
      aria-label={title}
    >
      {icon && (
        <div className="text-gp-text-4 mb-4 opacity-40" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="text-gp-text-2 font-semibold text-base mb-1">
        {title}
      </h2>
      {description && (
        <p className="text-gp-text-3 text-sm mb-5 max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {action}
    </div>
  )
}

// ─── ICON BUTTON — botón accesible solo con ícono ─────────────────────────────

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string   // OBLIGATORIO — aria-label visible para screen readers
  size?: 'sm' | 'md'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size = 'md', className = '', children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={`
        inline-flex items-center justify-center rounded-xl transition-all duration-150
        text-gp-text-3 hover:text-gp-text-1 hover:bg-gray-100
        focus-visible:outline-[2.5px] focus-visible:outline-gp-orange
        focus-visible:outline-offset-2
        ${size === 'sm' ? 'w-8 h-8' : 'w-10 h-10'}
        ${className}
      `}
      {...props}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
)
IconButton.displayName = 'IconButton'

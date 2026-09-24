import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { IconBack, IconX } from './icons'
import SyncBadge from './SyncBadge'

const cx = (...a) => a.filter(Boolean).join(' ')

export function Btn({ variant = 'primary', size = 'md', full, className, children, ...p }) {
  const v = {
    primary: 'bg-accent text-accent-ink border-accent',
    surface: 'bg-surface2 text-ink border-line',
    ghost: 'bg-transparent text-ink border-line',
    danger: 'bg-ng text-white border-ng',
  }[variant]
  const s = { sm: 'min-h-10 px-3 text-sm', md: 'min-h-12 px-4 text-base', lg: 'min-h-16 px-5 text-lg' }[size]
  return (
    <button
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl border-2 font-display font-bold tracking-wide',
        'active:scale-[.98] transition disabled:opacity-40', v, s, full && 'w-full', className)}
      {...p}
    >
      {children}
    </button>
  )
}

export function IconBtn({ label, className, children, ...p }) {
  return (
    <button aria-label={label} title={label}
      className={cx('inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-ink active:bg-surface2', className)} {...p}>
      {children}
    </button>
  )
}

export function TopBar({ title, subtitle, back, right }) {
  const nav = useNavigate()
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
      <div className="flex min-h-16 items-center gap-1 px-2">
        {back ? (
          <IconBtn label="Voltar" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}><IconBack size={26} /></IconBtn>
        ) : <div className="w-2" />}
        <div className="min-w-0 flex-1">
          {subtitle && <div className="truncate text-xs uppercase tracking-widest text-muted">{subtitle}</div>}
          <h1 className="truncate font-display text-xl font-extrabold leading-tight">{title}</h1>
        </div>
        <SyncBadge />
        {right}
      </div>
    </header>
  )
}

export function Sheet({ open, onClose, title, children, footer, tall }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="anim-fade absolute inset-0 bg-black/70" onClick={onClose} />
      <div className={cx('anim-sheet safe-bottom relative flex flex-col rounded-t-3xl border-t-2 border-accent bg-surface md:mx-auto md:mb-6 md:w-full md:max-w-2xl md:rounded-3xl md:border-2',
        tall ? 'h-[92dvh] md:h-[85dvh]' : 'max-h-[92dvh] md:max-h-[85dvh]')}>
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <h2 className="flex-1 font-display text-lg font-extrabold uppercase tracking-wide">{title}</h2>
          <IconBtn label="Fechar" onClick={onClose}><IconX /></IconBtn>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// Grupo de botões (chips) com título — não é <label> para o toque no título não acionar o 1º botão
export function Field({ label, hint, children }) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1 text-xs uppercase tracking-widest text-muted">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  )
}

function Labeled({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-widest text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

const inputCls = 'w-full min-h-12 rounded-xl border-2 border-line bg-bg px-3 py-2 text-ink outline-none focus:border-accent placeholder:text-muted/60'

export function TextInput({ label, hint, ...p }) {
  const el = <input className={inputCls} {...p} />
  return label ? <Labeled label={label} hint={hint}>{el}</Labeled> : el
}

export function TextArea({ label, hint, rows = 3, ...p }) {
  const el = <textarea rows={rows} className={cx(inputCls, 'resize-none')} {...p} />
  return label ? <Labeled label={label} hint={hint}>{el}</Labeled> : el
}

export function ChipSelect({ options, value, onChange, allowEmpty = true }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value
        const lab = typeof o === 'string' ? o : o.label
        const on = value === val
        return (
          <button type="button" key={val}
            onClick={() => onChange(on && allowEmpty ? null : val)}
            className={cx('min-h-11 rounded-lg border-2 px-3 font-display text-sm font-bold',
              on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface2 text-ink')}>
            {lab}
          </button>
        )
      })}
    </div>
  )
}

export function Empty({ title, children }) {
  return (
    <div className="mx-auto max-w-md px-6 py-14 text-center">
      <div className="font-display text-xl font-extrabold">{title}</div>
      <div className="mt-2 text-sm text-muted">{children}</div>
    </div>
  )
}

export function Card({ className, children, ...p }) {
  return <div className={cx('rounded-2xl border-2 border-line bg-surface', className)} {...p}>{children}</div>
}

// ---------- Diálogos (confirmação, ações, aviso rápido) ----------
const DialogCtx = createContext(null)

export function DialogProvider({ children }) {
  const [confirmState, setConfirm] = useState(null)
  const [actions, setActions] = useState(null)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef()

  const confirm = useCallback((opts) => new Promise((resolve) => setConfirm({ ...opts, resolve })), [])
  const actionSheet = useCallback((title, items) => setActions({ title, items }), [])
  const notify = useCallback((msg, kind = 'info') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, kind })
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  const closeConfirm = (v) => { confirmState?.resolve(v); setConfirm(null) }

  return (
    <DialogCtx.Provider value={{ confirm, actionSheet, notify }}>
      {children}
      <Sheet open={!!confirmState} onClose={() => closeConfirm(false)} title={confirmState?.title || 'Confirmar'}>
        <p className="mb-5 whitespace-pre-line text-base">{confirmState?.message}</p>
        <div className="grid grid-cols-2 gap-3">
          <Btn variant="ghost" onClick={() => closeConfirm(false)}>Cancelar</Btn>
          <Btn variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => closeConfirm(true)}>
            {confirmState?.confirmLabel || 'OK'}
          </Btn>
        </div>
      </Sheet>
      <Sheet open={!!actions} onClose={() => setActions(null)} title={actions?.title || ''}>
        <div className="grid grid-cols-1 gap-2">
          {actions?.items.filter(Boolean).map((it) => (
            <button key={it.label} onClick={() => { setActions(null); it.onClick() }}
              className={cx('flex min-h-14 items-center gap-3 rounded-xl border-2 border-line bg-surface2 px-4 text-left font-display text-base font-bold',
                it.danger && 'text-ng')}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      </Sheet>
      {toast && createPortal(
        <div className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4" style={{ top: 'calc(4.5rem + env(safe-area-inset-top))' }}>
          <div className={cx('anim-fade rounded-xl border-2 px-4 py-3 font-display text-sm font-bold shadow-xl',
            toast.kind === 'error' ? 'border-ng bg-ng text-white' : 'border-accent bg-surface text-ink')}>
            {toast.msg}
          </div>
        </div>, document.body)}
    </DialogCtx.Provider>
  )
}

export const useDialog = () => useContext(DialogCtx)

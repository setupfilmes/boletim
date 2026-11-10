import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { IconBack, IconX } from './icons'
import { Icon } from '../ds/components'
import SyncBadge from './SyncBadge'

const cx = (...a) => a.filter(Boolean).join(' ')

export function Btn({ variant = 'primary', size = 'md', full, className, children, ...p }) {
  // Estilo do design system: contorno 2px "borda", primário preenchido com "ação", perigo em NG
  const v = {
    primary: 'bg-accent text-accent-ink border-accent active:opacity-85',
    surface: 'bg-surface text-ink border-borda active:bg-surface2',
    ghost: 'bg-transparent text-ink border-borda active:bg-surface2',
    danger: 'bg-surface text-ng border-ng active:bg-ng-soft',
  }[variant]
  const s = { sm: 'min-h-12 px-4 text-[15px] rounded-[10px]', md: 'min-h-14 px-5 text-[17px] rounded-[10px]', lg: 'min-h-[72px] px-6 text-xl rounded-2xl' }[size]
  return (
    <button
      className={cx('inline-flex items-center justify-center gap-2 border-2 font-sans font-bold',
        'transition disabled:cursor-not-allowed disabled:opacity-45', v, s, full && 'w-full', className)}
      {...p}
    >
      {children}
    </button>
  )
}

export function IconBtn({ label, className, children, ...p }) {
  return (
    <button aria-label={label} title={label}
      className={cx('inline-flex h-12 min-w-12 shrink-0 items-center justify-center rounded-[10px] text-ink active:bg-surface2', className)} {...p}>
      {children}
    </button>
  )
}

export function TopBar({ title, subtitle, back, right }) {
  const nav = useNavigate()
  return (
    <header className="safe-top sticky top-0 z-30 border-b-2 border-line bg-bg">
      <div className="flex min-h-16 items-center gap-1 px-2">
        {back ? (
          <IconBtn label="Voltar" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}><IconBack size={26} /></IconBtn>
        ) : <div className="w-2" />}
        <div className="min-w-0 flex-1">
          {subtitle && <div className="truncate text-[13px] font-bold uppercase leading-4 tracking-[.07em] text-muted">{subtitle}</div>}
          <h1 className="truncate text-xl font-bold leading-[26px]">{title}</h1>
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
      <div className="anim-fade absolute inset-0" style={{ background: 'var(--veu)' }} onClick={onClose} />
      <div className={cx('sheet-box anim-sheet safe-bottom relative flex flex-col rounded-t-2xl border-2 border-b-0 border-line bg-surface md:mx-auto md:mb-6 md:w-full md:max-w-2xl md:rounded-2xl md:border-b-2',
        tall ? 'h-[92dvh] md:h-[85dvh]' : 'max-h-[92dvh] md:max-h-[85dvh]')}>
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-line" aria-hidden="true" />
        <div className="flex items-center gap-2 px-4 pt-2 pb-2">
          <h2 className="flex-1 text-xl font-bold leading-[26px]">{title}</h2>
          <IconBtn label="Fechar" onClick={onClose}><IconX /></IconBtn>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="border-t-2 border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// Grupo de botões (chips) com título — não é <label> para o toque no título não acionar o 1º botão
export function Field({ label, hint, children }) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1.5 text-[13px] font-bold uppercase leading-4 tracking-[.07em] text-muted">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[15px] leading-5 text-muted">{hint}</div>}
    </div>
  )
}

function Labeled({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-bold uppercase leading-4 tracking-[.07em] text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[15px] leading-5 text-muted">{hint}</span>}
    </label>
  )
}

const inputCls = 'w-full min-h-14 rounded-[10px] border-2 border-borda bg-surface px-3 py-2 text-[17px] text-ink outline-none focus:border-ink placeholder:text-faint'

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
            aria-pressed={on}
            className={cx('min-h-12 rounded-[10px] border-2 px-4 text-[15px] font-bold',
              on ? 'border-accent bg-accent text-accent-ink' : 'border-borda bg-surface text-ink')}>
            {lab}
          </button>
        )
      })}
    </div>
  )
}

export function Empty({ title, children, icon = 'clapperboard', action }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-borda text-muted" aria-hidden="true">
        <Icon name={icon} size={36} strokeWidth={2} />
      </span>
      <div className="text-2xl font-bold leading-[30px]">{title}</div>
      <div className="mt-2 text-[15px] leading-5 text-muted">{children}</div>
      {action && <div className="mt-5">{action}</div>}
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
              className={cx('flex min-h-14 items-center gap-3 rounded-[10px] border-2 bg-surface px-4 text-left text-[17px] font-bold active:bg-surface2',
                it.danger ? 'border-ng text-ng' : 'border-borda')}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      </Sheet>
      {toast && createPortal(
        <div className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4" style={{ top: 'calc(4.5rem + env(safe-area-inset-top))' }}>
          <div role="status" className={cx('anim-fade max-w-md rounded-[10px] border-2 px-4 py-3 text-[15px] font-bold leading-5',
            toast.kind === 'error' ? 'border-ng bg-ng text-on-ng' : 'border-ink bg-surface text-ink')}>
            {toast.msg}
          </div>
        </div>, document.body)}
    </DialogCtx.Provider>
  )
}

export const useDialog = () => useContext(DialogCtx)

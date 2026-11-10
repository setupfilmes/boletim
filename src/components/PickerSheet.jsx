import { useEffect, useState } from 'react'
import { Btn, Sheet } from './ui'
import { Icon, Stepper } from '../ds/components'
import { addKitItem, update } from '../lib/repo'
import { vibrate } from '../lib/util'

const NUMERIC = new Set(['iso', 'fps', 'tstop', 'focus'])

// Gaveta com o seletor rápido do design system: chips grandes, o valor do take anterior marcado como "anterior",
// "Outro" para digitar (salva no kit para as próximas vezes). T-Stop ganha os botões − / + (passo a passo).
// persist=false: campos extras do projeto (não existem no kit; os valores já usados viram as opções).
export default function PickerSheet({ open, onClose, title, category, value, multi, options, onApply, project, canEdit = true,
  persist = true, numeric, anterior }) {
  const [sel, setSel] = useState([])
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    if (open) {
      setSel(multi ? (Array.isArray(value) ? value : value ? [value] : []) : [])
      setDraft('')
      setTyping(false)
    }
  }, [open, multi, value])

  const choose = (v) => {
    vibrate()
    if (multi) setSel((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))
    else { onApply(v === value ? null : v); onClose() }
  }

  const addNew = async () => {
    const v = draft.trim()
    if (!v) return
    if (persist) await addKitItem(category, v)
    if (persist && project && canEdit && (category === 'lens' || category === 'filter')) {
      const list = project.kit?.[category]
      if (Array.isArray(list) && list.length && !list.includes(v)) {
        await update('projects', project.id, { kit: { ...project.kit, [category]: [...list, v] } })
      }
    }
    setDraft('')
    setTyping(false)
    choose(v)
  }

  const list = [...options]
  // valor atual fora da lista (ex.: veio de outro aparelho) continua visível
  for (const v of multi ? sel : [value]) if (v && !list.includes(v)) list.push(v)
  const prevVals = [].concat(anterior ?? [])
  const stepIdx = list.indexOf(value)
  const step = (d) => {
    const i = stepIdx < 0 ? 0 : Math.min(list.length - 1, Math.max(0, stepIdx + d))
    if (list[i] && list[i] !== value) { vibrate(); onApply(list[i]) }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={multi ? (
        <div className="grid grid-cols-3 gap-3">
          <Btn variant="ghost" onClick={() => setSel([])}>Limpar</Btn>
          <Btn className="col-span-2" onClick={() => { onApply(sel); onClose() }}>
            Pronto{sel.length ? ` (${sel.length})` : ''}
          </Btn>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Btn variant="ghost" onClick={() => { onApply(null); onClose() }}>Limpar</Btn>
          <Btn className="col-span-2" onClick={onClose}>Pronto</Btn>
        </div>
      )}>
      {category === 'tstop' && !multi && list.length > 1 && (
        <div className="mb-3"><Stepper value={value || '—'} onPrev={() => step(-1)} onNext={() => step(1)} /></div>
      )}
      <div className="bc-qp__lista" data-testid="picker-options" role="listbox" aria-label={title}>
        {list.map((v) => {
          const on = multi ? sel.includes(v) : v === value
          return (
            <button key={v} type="button" role="option" aria-selected={on} onClick={() => choose(v)} className={`bc-chip${on ? ' is-on' : ''}`}>
              <span>{v}</span>
              {prevVals.includes(v) && <span className="bc-chip__nota">anterior</span>}
            </button>
          )
        })}
        {!typing && (
          <button type="button" className="bc-chip bc-chip--outro" onClick={() => setTyping(true)} data-testid="picker-other">
            <Icon name="pencil" size={20} /><span>Outro</span>
          </button>
        )}
      </div>
      {!list.length && !typing && <div className="py-3 text-center text-[15px] text-muted">Nenhum item no kit. Toque em Outro para digitar.</div>}
      {typing && (
        <div className="mt-4 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Digite o valor…" autoFocus
            inputMode={numeric ?? NUMERIC.has(category) ? 'decimal' : 'text'}
            onKeyDown={(e) => e.key === 'Enter' && addNew()} aria-label="Outro valor"
            className="min-h-14 min-w-0 flex-1 rounded-[10px] border-2 border-borda bg-surface px-3 font-mono text-xl text-ink outline-none focus:border-ink" />
          <Btn onClick={addNew} disabled={!draft.trim()}>Usar</Btn>
        </div>
      )}
    </Sheet>
  )
}

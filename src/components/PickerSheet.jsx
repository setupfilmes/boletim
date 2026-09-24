import { useEffect, useState } from 'react'
import { Btn, Sheet } from './ui'
import { addKitItem, update } from '../lib/repo'
import { vibrate } from '../lib/util'
import { IconPlus } from './icons'

const NUMERIC = new Set(['iso', 'fps', 'tstop', 'focus'])

// Gaveta inferior com botões grandes para escolher um valor sem teclado.
// "Adicionar novo" aplica o valor e já salva no kit para as próximas vezes.
export default function PickerSheet({ open, onClose, title, category, value, multi, options, onApply, project, canEdit = true }) {
  const [sel, setSel] = useState([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (open) {
      setSel(multi ? (Array.isArray(value) ? value : []) : [])
      setDraft('')
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
    await addKitItem(category, v)
    if (project && canEdit && (category === 'lens' || category === 'filter')) {
      const list = project.kit?.[category]
      if (Array.isArray(list) && list.length && !list.includes(v)) {
        await update('projects', project.id, { kit: { ...project.kit, [category]: [...list, v] } })
      }
    }
    setDraft('')
    choose(v)
  }

  const list = [...options]
  // valor atual fora da lista (ex.: veio de outro aparelho) continua visível
  for (const v of multi ? sel : [value]) if (v && !list.includes(v)) list.push(v)

  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={multi ? (
        <div className="grid grid-cols-3 gap-3">
          <Btn variant="ghost" onClick={() => setSel([])}>Limpar</Btn>
          <Btn className="col-span-2" onClick={() => { onApply(sel); onClose() }}>
            Aplicar{sel.length ? ` (${sel.length})` : ''}
          </Btn>
        </div>
      ) : (
        <Btn variant="ghost" full onClick={() => { onApply(null); onClose() }}>Limpar campo</Btn>
      )}>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-5" data-testid="picker-options">
        {list.map((v) => {
          const on = multi ? sel.includes(v) : v === value
          return (
            <button key={v} onClick={() => choose(v)}
              className={`min-h-16 rounded-xl border-2 px-1 font-mono text-lg font-medium leading-tight break-words ${
                on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface2 text-ink active:border-accent'}`}>
              {v}
            </button>
          )
        })}
        {!list.length && <div className="col-span-3 py-4 text-center text-sm text-muted">Nenhum item no kit. Adicione abaixo.</div>}
      </div>
      <div className="mt-4 flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Adicionar novo…"
          inputMode={NUMERIC.has(category) ? 'decimal' : 'text'}
          onKeyDown={(e) => e.key === 'Enter' && addNew()}
          className="min-h-14 min-w-0 flex-1 rounded-xl border-2 border-line bg-bg px-3 text-ink outline-none focus:border-accent" />
        <Btn onClick={addNew} disabled={!draft.trim()} aria-label="Adicionar"><IconPlus /></Btn>
      </div>
    </Sheet>
  )
}

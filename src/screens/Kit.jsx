import { useState } from 'react'
import { TopBar, Btn, useDialog } from '../components/ui'
import { IconPlus, IconX } from '../components/icons'
import { useKit } from '../lib/hooks'
import { KIT_CATEGORIES } from '../lib/kit'
import { addKitItem, removeKitItem, restoreDefaultKit } from '../lib/repo'

export default function Kit() {
  const kit = useKit()
  const [cat, setCat] = useState('lens')
  const [draft, setDraft] = useState('')
  const { confirm, notify } = useDialog()
  const items = kit.filter((k) => k.category === cat)
  const label = KIT_CATEGORIES.find((c) => c.key === cat)?.label

  const add = async () => {
    const values = draft.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    for (const v of values) await addKitItem(cat, v)
    setDraft('')
  }

  return (
    <>
      <TopBar title="Equipamentos" subtitle="Kit / presets" />
      <div className="sticky z-20 overflow-x-auto border-b border-line bg-bg" style={{ top: 'calc(4rem + env(safe-area-inset-top))' }}>
        <div className="flex gap-2 px-4 py-2">
          {KIT_CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => setCat(c.key)}
              className={`min-h-11 shrink-0 rounded-lg border-2 px-3 font-display text-sm font-bold ${cat === c.key ? 'border-accent bg-accent text-accent-ink' : 'border-line text-muted'}`}>
              {c.label} <span className="font-mono text-xs opacity-70">{kit.filter((k) => k.category === c.key).length}</span>
            </button>
          ))}
        </div>
      </div>
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-40">
        <p className="mb-4 text-sm text-muted">
          Estes são os botões que aparecem ao tocar em “{label}” no take. Itens novos adicionados durante a filmagem também entram aqui.
        </p>
        <div className="mb-4 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={`Novo item (${label})`} aria-label="Novo item"
            className="min-h-14 min-w-0 flex-1 rounded-xl border-2 border-line bg-bg px-3 outline-none focus:border-accent" />
          <Btn onClick={add} disabled={!draft.trim()} aria-label="Adicionar"><IconPlus /></Btn>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((k) => (
            <div key={k.id} className="flex min-h-14 items-center rounded-xl border-2 border-line bg-surface pl-3">
              <span className="min-w-0 flex-1 truncate font-mono text-lg">{k.value}</span>
              <button aria-label={`Remover ${k.value}`} className="h-14 w-11 text-muted active:text-ng" onClick={() => removeKitItem(k.id)}>
                <IconX size={18} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Btn variant="ghost" full onClick={async () => {
            if (await confirm({ title: 'Restaurar padrões', message: 'Adiciona de volta os itens padrão que foram removidos. Seus itens personalizados continuam.', confirmLabel: 'Restaurar' })) {
              const n = await restoreDefaultKit(); notify(n ? `${n} itens restaurados` : 'Nada para restaurar')
            }
          }}>Restaurar itens padrão</Btn>
        </div>
      </main>
    </>
  )
}

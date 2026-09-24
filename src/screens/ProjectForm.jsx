import { useEffect, useState } from 'react'
import { Btn, ChipSelect, Field, Sheet, TextArea, TextInput, useDialog } from '../components/ui'
import { createProject, update } from '../lib/repo'
import { useKit } from '../lib/hooks'
import { IconMinus, IconPlus } from '../components/icons'
import { useAuth } from '../auth'

const MAX_CAMERAS = 26
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const PROJECT_TYPES = ['Curta', 'Longa', 'Série', 'Publicidade', 'Clipe', 'Documentário', 'Institucional', 'Outro']

const EMPTY = { title: '', production_type: 'Curta', company: '', director: '', dop: '', first_ac: '', second_ac: '',
  logger: '', camera_body: '', notes: '', kit: {} }

export default function ProjectForm({ open, onClose, project, onSaved }) {
  const { user } = useAuth()
  const kit = useKit()
  const { notify } = useDialog()
  const [f, setF] = useState(EMPTY)

  const [countDraft, setCountDraft] = useState('1')

  useEffect(() => {
    if (!open) return
    const base = project ? { ...EMPTY, ...project, kit: project.kit || {} } : { ...EMPTY, first_ac: user?.name || '' }
    // projeto antigo sem kit.cameras = 1 câmera com o corpo que estava em camera_body
    const cams = base.kit.cameras?.length ? base.kit.cameras : [{ id: 'A', body: base.camera_body || '' }]
    setF({ ...base, kit: { ...base.kit, cameras: cams } })
    setCountDraft(String(cams.length))
  }, [open, project, user])

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }))
  const toggleKit = (cat, v) => setF((s) => {
    const cur = s.kit?.[cat] || []
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
    return { ...s, kit: { ...s.kit, [cat]: next } }
  })

  // Câmeras do projeto: kit.cameras = [{ id: 'A', body: 'Alexa Mini LF' }, …] — letras em sequência; 2+ = multicâmera
  const camList = f.kit?.cameras || []
  const setCount = (n) => {
    const count = Math.max(1, Math.min(MAX_CAMERAS, n))
    setCountDraft(String(count))
    setF((s) => {
      const cur = s.kit?.cameras || []
      const next = Array.from({ length: count }, (_, i) => cur[i] || { id: LETTERS[i], body: '' })
      return { ...s, kit: { ...s.kit, cameras: next } }
    })
  }
  const setBody = (id, body) => setF((s) => ({
    ...s, kit: { ...s.kit, cameras: (s.kit?.cameras || []).map((c) => (c.id === id ? { ...c, body } : c)) },
  }))

  const save = async () => {
    if (!f.title.trim()) return notify('Dê um nome ao projeto', 'error')
    const data = {
      title: f.title.trim(), production_type: f.production_type, company: f.company, director: f.director, dop: f.dop,
      first_ac: f.first_ac, second_ac: f.second_ac, logger: f.logger, notes: f.notes, kit: f.kit,
      // camera_body continua preenchido (aba Info e projetos de 1 câmera)
      camera_body: camList.length === 1 ? camList[0].body : camList.filter((c) => c.body).map((c) => `${c.id}: ${c.body}`).join(', '),
    }
    const saved = project ? await update('projects', project.id, data) : await createProject(data)
    onClose()
    onSaved?.(saved)
  }

  const KitPick = ({ cat, label }) => {
    const items = kit.filter((k) => k.category === cat).map((k) => k.value)
    const sel = f.kit?.[cat] || []
    return (
      <Field label={`${label} do projeto`} hint={sel.length ? `${sel.length} selecionado(s)` : 'Nenhum marcado = usa o kit inteiro'}>
        <div className="flex flex-wrap gap-2">
          {items.map((v) => (
            <button type="button" key={v} onClick={() => toggleKit(cat, v)}
              className={`min-h-10 rounded-lg border-2 px-3 font-mono text-sm ${sel.includes(v) ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface2'}`}>
              {v}
            </button>
          ))}
        </div>
      </Field>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={project ? 'Editar projeto' : 'Novo projeto'} tall
      footer={<Btn full size="lg" onClick={save}>{project ? 'Salvar' : 'Criar projeto'}</Btn>}>
      <div className="grid gap-4">
        <TextInput label="Nome do projeto *" value={f.title} onChange={set('title')} placeholder="Ex: A Tela" />
        <Field label="Tipo"><ChipSelect options={PROJECT_TYPES} value={f.production_type} onChange={set('production_type')} /></Field>
        <TextInput label="Produtora" value={f.company || ''} onChange={set('company')} />
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Direção" value={f.director || ''} onChange={set('director')} />
          <TextInput label="Dir. Fotografia" value={f.dop || ''} onChange={set('dop')} />
          <TextInput label="1º AC" value={f.first_ac || ''} onChange={set('first_ac')} />
          <TextInput label="2º AC" value={f.second_ac || ''} onChange={set('second_ac')} />
          <TextInput label="DIT / Logger" value={f.logger || ''} onChange={set('logger')} />
        </div>
        <Field label="Câmeras"
          hint={camList.length >= 2 ? 'Multicâmera: cada take é registrado por câmera, com status próprio.' : 'Aumente para 2 ou mais para registrar multicâmera.'}>
          <div className="flex items-center gap-2">
            <Btn variant="surface" className="w-14 shrink-0" aria-label="Menos uma câmera" data-testid="cams-minus"
              disabled={camList.length <= 1} onClick={() => setCount(camList.length - 1)}><IconMinus size={26} /></Btn>
            <input value={countDraft} inputMode="numeric" aria-label="Quantidade de câmeras" data-testid="cams-count"
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 2)
                setCountDraft(v)
                if (parseInt(v, 10) >= 1) setCount(parseInt(v, 10))
              }}
              onBlur={() => setCountDraft(String(camList.length))}
              onFocus={(e) => e.target.select()}
              className="min-h-12 w-16 shrink-0 rounded-xl border-2 border-line bg-bg text-center font-mono text-2xl font-medium text-ink outline-none focus:border-accent" />
            <Btn variant="surface" className="w-14 shrink-0" aria-label="Mais uma câmera" data-testid="cams-plus"
              disabled={camList.length >= MAX_CAMERAS} onClick={() => setCount(camList.length + 1)}><IconPlus size={26} /></Btn>
            <span className="text-sm text-muted">{camList.length === 1 ? 'câmera' : 'câmeras'}</span>
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2" data-testid="cams-list">
          {camList.map((c) => (
            <label key={c.id} className="flex items-center gap-2">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent font-display text-xl font-extrabold text-accent-ink">{c.id}</span>
              <input value={c.body || ''} onChange={(e) => setBody(c.id, e.target.value)} aria-label={`Câmera ${c.id}`}
                placeholder={camList.length === 1 ? 'Modelo da câmera (ex.: Alexa Mini LF)' : `Câmera ${c.id} — modelo ou nome`}
                className="min-h-12 w-full min-w-0 rounded-xl border-2 border-line bg-bg px-3 py-2 text-ink outline-none placeholder:text-muted/60 focus:border-accent" />
            </label>
          ))}
        </div>
        <KitPick cat="lens" label="Lentes" />
        <KitPick cat="filter" label="Filtros" />
        <TextArea label="Observações" value={f.notes || ''} onChange={set('notes')} />
      </div>
    </Sheet>
  )
}

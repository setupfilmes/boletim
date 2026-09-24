import { useEffect, useState } from 'react'
import { Btn, ChipSelect, Field, Sheet, TextArea, TextInput, useDialog } from '../components/ui'
import { createProject, update } from '../lib/repo'
import { useKit } from '../lib/hooks'
import { useAuth } from '../auth'

export const PROJECT_TYPES = ['Curta', 'Longa', 'Série', 'Publicidade', 'Clipe', 'Documentário', 'Institucional', 'Outro']

const EMPTY = { title: '', production_type: 'Curta', company: '', director: '', dop: '', first_ac: '', second_ac: '',
  logger: '', camera_body: '', notes: '', kit: {} }

export default function ProjectForm({ open, onClose, project, onSaved }) {
  const { user } = useAuth()
  const kit = useKit()
  const { notify } = useDialog()
  const [f, setF] = useState(EMPTY)

  useEffect(() => {
    if (open) setF(project ? { ...EMPTY, ...project, kit: project.kit || {} } : { ...EMPTY, first_ac: user?.name || '' })
  }, [open, project, user])

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }))
  const toggleKit = (cat, v) => setF((s) => {
    const cur = s.kit?.[cat] || []
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
    return { ...s, kit: { ...s.kit, [cat]: next } }
  })

  const save = async () => {
    if (!f.title.trim()) return notify('Dê um nome ao projeto', 'error')
    const data = {
      title: f.title.trim(), production_type: f.production_type, company: f.company, director: f.director, dop: f.dop,
      first_ac: f.first_ac, second_ac: f.second_ac, logger: f.logger, camera_body: f.camera_body, notes: f.notes, kit: f.kit,
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
          <TextInput label="Câmera" value={f.camera_body || ''} onChange={set('camera_body')} placeholder="Alexa Mini LF" />
        </div>
        <KitPick cat="lens" label="Lentes" />
        <KitPick cat="filter" label="Filtros" />
        <TextArea label="Observações" value={f.notes || ''} onChange={set('notes')} />
      </div>
    </Sheet>
  )
}

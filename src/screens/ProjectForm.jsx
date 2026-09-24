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

  // Câmeras do projeto (multicâmera com 2+): kit.cameras = [{ id: 'A', body: 'Alexa Mini LF' }]
  const camList = f.kit?.cameras || []
  const toggleCam = (id) => setF((s) => {
    const cur = s.kit?.cameras || []
    const next = cur.some((c) => c.id === id) ? cur.filter((c) => c.id !== id) : [...cur, { id, body: '' }]
    const order = kit.filter((k) => k.category === 'camera').map((k) => k.value)
    next.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    return { ...s, kit: { ...s.kit, cameras: next } }
  })
  const setBody = (id, body) => setF((s) => ({
    ...s, kit: { ...s.kit, cameras: (s.kit?.cameras || []).map((c) => (c.id === id ? { ...c, body } : c)) },
  }))

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
          {camList.length < 2 && (
            <TextInput label="Câmera" value={f.camera_body || ''} onChange={set('camera_body')} placeholder="Alexa Mini LF" />
          )}
        </div>
        <Field label="Câmeras do projeto"
          hint={camList.length >= 2 ? 'Multicâmera: cada take é registrado por câmera, com status próprio.' : 'Marque 2 ou mais para registrar multicâmera.'}>
          <div className="flex flex-wrap gap-2">
            {kit.filter((k) => k.category === 'camera').map((k) => (
              <button type="button" key={k.value} onClick={() => toggleCam(k.value)} data-testid={`project-cam-${k.value}`}
                className={`min-h-11 min-w-12 rounded-lg border-2 px-3 font-display font-bold ${camList.some((c) => c.id === k.value) ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface2'}`}>
                {k.value}
              </button>
            ))}
          </div>
        </Field>
        {camList.length >= 2 && (
          <div className="grid grid-cols-2 gap-3">
            {camList.map((c) => (
              <TextInput key={c.id} label={`Câmera ${c.id}`} value={c.body || ''} onChange={(e) => setBody(c.id, e.target.value)}
                placeholder={c.id === camList[0].id ? 'Alexa Mini LF' : 'FX6'} />
            ))}
          </div>
        )}
        <KitPick cat="lens" label="Lentes" />
        <KitPick cat="filter" label="Filtros" />
        <TextArea label="Observações" value={f.notes || ''} onChange={set('notes')} />
      </div>
    </Sheet>
  )
}

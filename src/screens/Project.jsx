import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { TopBar, Btn, Empty, Card, Sheet, TextInput, TextArea, ChipSelect, Field, IconBtn, useDialog } from '../components/ui'
import { IconPlus, IconMore, IconEdit, IconTrash, IconChevron } from '../components/icons'
import { useProject, useScenes, useShotsByProject, useTakesByProject, useRole } from '../lib/hooks'
import { createScene, createScenesBatch, deleteProject, deleteScene, update } from '../lib/repo'
import { useAuth } from '../auth'
import { fmtDate, plural } from '../lib/util'
import { countTakes } from '../lib/cameras'
import ProjectForm from './ProjectForm'
import Reports from './Reports'
import Team from './Team'

const TABS = [
  { key: 'cenas', label: 'Cenas' },
  { key: 'diarias', label: 'Diárias' },
  { key: 'equipe', label: 'Equipe' },
  { key: 'info', label: 'Info' },
]

export const INT_EXT = ['INT', 'EXT', 'INT/EXT']
export const PERIODS = ['DIA', 'NOITE', 'AMANHECER', 'ENTARDECER']

export default function Project() {
  const { projectId } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'cenas'
  const project = useProject(projectId)
  const { user } = useAuth()
  const role = useRole(project, user?.id)
  const nav = useNavigate()

  if (project === undefined) return null
  if (!project || project.deleted) {
    return (<><TopBar title="Projeto" back="/" /><Empty title="Projeto não encontrado">Ele pode ter sido excluído.</Empty></>)
  }

  return (
    <>
      <TopBar title={project.title} subtitle={project.production_type || 'Projeto'} back="/" />
      <nav className="sticky top-16 z-20 grid grid-cols-4 border-b border-line bg-bg" style={{ top: 'calc(4rem + env(safe-area-inset-top))' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={`min-h-12 border-b-4 font-display text-sm font-bold uppercase tracking-wide ${tab === t.key ? 'border-accent text-accent' : 'border-transparent text-muted'}`}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-28">
        {tab === 'cenas' && <ScenesTab project={project} canEdit={role !== 'viewer'} />}
        {tab === 'diarias' && <Reports project={project} />}
        {tab === 'equipe' && <Team project={project} role={role} />}
        {tab === 'info' && <InfoTab project={project} role={role} onDeleted={() => nav('/')} />}
      </main>
    </>
  )
}

function ScenesTab({ project, canEdit }) {
  const scenes = useScenes(project.id)
  const shots = useShotsByProject(project.id)
  const takes = useTakesByProject(project.id)
  const nav = useNavigate()
  const { actionSheet, confirm, notify } = useDialog()
  const [edit, setEdit] = useState(null) // null | 'new' | scene
  const [batch, setBatch] = useState(false)

  const counts = useMemo(() => {
    const c = {}
    for (const s of shots || []) (c[s.scene_id] ||= { shots: 0, takes: 0, good: 0 }).shots++
    const byScene = {}
    for (const t of takes || []) (byScene[t.scene_id] ||= []).push(t)
    for (const [id, list] of Object.entries(byScene)) Object.assign((c[id] ||= { shots: 0, takes: 0, good: 0 }), countTakes(list))
    return c
  }, [shots, takes])

  if (!scenes) return null

  return (
    <>
      {scenes.length === 0 && (
        <Empty title="Sem cenas">Adicione as cenas do roteiro. Dá para criar várias de uma vez (ex: 1 a 32).</Empty>
      )}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
        {scenes.map((s) => {
          const c = counts[s.id] || { shots: 0, takes: 0, good: 0 }
          return (
            <Card key={s.id} className="flex items-stretch">
              <button className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left" onClick={() => nav(`/p/${project.id}/s/${s.id}`)}>
                <div className="w-16 shrink-0 font-display text-3xl font-extrabold text-accent">{s.number}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display font-bold">{[s.int_ext, s.period].filter(Boolean).join(' · ') || 'Cena'}</div>
                  {s.location && <div className="truncate text-sm">{s.location}</div>}
                  <div className="truncate font-mono text-xs text-muted">
                    {plural(c.shots, 'plano')} · {plural(c.takes, 'take')}{c.good ? ` · ${c.good} good` : ''}{s.description ? ` · ${s.description}` : ''}
                  </div>
                </div>
                <IconChevron className="text-muted" />
              </button>
              {canEdit && (
                <IconBtn label="Opções da cena" className="h-auto" onClick={() => actionSheet(`Cena ${s.number}`, [
                  { label: 'Editar cena', icon: <IconEdit />, onClick: () => setEdit(s) },
                  { label: 'Excluir cena', icon: <IconTrash />, danger: true, onClick: async () => {
                    if (await confirm({ title: 'Excluir cena', danger: true, confirmLabel: 'Excluir',
                      message: `Excluir a cena ${s.number} com ${c.shots} planos e ${c.takes} takes?` })) {
                      await deleteScene(s.id); notify('Cena excluída')
                    }
                  } },
                ])}><IconMore /></IconBtn>
              )}
            </Card>
          )
        })}
      </div>
      {canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-xl grid-cols-3 gap-3 bg-gradient-to-t from-bg via-bg to-transparent px-4 pt-6 pb-bar">
          <Btn size="lg" className="col-span-2" onClick={() => setEdit('new')}><IconPlus /> Cena</Btn>
          <Btn size="lg" variant="surface" onClick={() => setBatch(true)}>Várias</Btn>
        </div>
      )}
      <SceneForm open={!!edit} scene={edit === 'new' ? null : edit} project={project} scenes={scenes}
        onClose={() => setEdit(null)} onCreated={(s) => nav(`/p/${project.id}/s/${s.id}`)} />
      <BatchScenes open={batch} onClose={() => setBatch(false)} project={project} scenes={scenes} />
    </>
  )
}

function suggestNextScene(scenes) {
  const nums = scenes.map((s) => parseInt(s.number, 10)).filter((n) => !Number.isNaN(n))
  return String(nums.length ? Math.max(...nums) + 1 : 1)
}

export function SceneForm({ open, onClose, scene, project, scenes, onCreated }) {
  const [f, setF] = useState({})
  const { notify } = useDialog()
  const init = () => setF(scene ? { ...scene } : { number: suggestNextScene(scenes || []), int_ext: 'INT', period: 'DIA', location: '', description: '' })
  // reinicia o formulário ao abrir
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) { setLastOpen(open); if (open) init() }

  const save = async () => {
    const number = String(f.number || '').trim()
    if (!number) return notify('Informe o número da cena', 'error')
    if ((scenes || []).some((s) => s.number.toLowerCase() === number.toLowerCase() && s.id !== scene?.id)) {
      return notify(`A cena ${number} já existe`, 'error')
    }
    const data = { number, int_ext: f.int_ext || null, period: f.period || null, location: f.location || null, description: f.description || null }
    if (scene) await update('scenes', scene.id, data)
    else { const s = await createScene(project.id, data); onCreated?.(s) }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={scene ? `Editar cena ${scene.number}` : 'Nova cena'}
      footer={<Btn full size="lg" onClick={save}>{scene ? 'Salvar' : 'Criar cena'}</Btn>}>
      <div className="grid gap-4">
        <TextInput label="Número da cena" value={f.number || ''} onChange={(e) => setF({ ...f, number: e.target.value })} inputMode="text" />
        <Field label="INT / EXT"><ChipSelect options={INT_EXT} value={f.int_ext} onChange={(v) => setF({ ...f, int_ext: v })} /></Field>
        <Field label="Período"><ChipSelect options={PERIODS} value={f.period} onChange={(v) => setF({ ...f, period: v })} /></Field>
        <TextInput label="Locação" value={f.location || ''} onChange={(e) => setF({ ...f, location: e.target.value })} />
        <TextArea label="Descrição" rows={2} value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
    </Sheet>
  )
}

function BatchScenes({ open, onClose, project, scenes }) {
  const [from, setFrom] = useState('1')
  const [to, setTo] = useState('32')
  const { notify } = useDialog()
  const create = async () => {
    const a = parseInt(from, 10), b = parseInt(to, 10)
    if (!(a > 0 && b >= a && b - a < 500)) return notify('Intervalo inválido', 'error')
    const existing = new Set((scenes || []).map((s) => s.number))
    const nums = []
    for (let n = a; n <= b; n++) if (!existing.has(String(n))) nums.push(n)
    await createScenesBatch(project.id, nums)
    notify(`${nums.length} cenas criadas`)
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Criar várias cenas"
      footer={<Btn full size="lg" onClick={create}>Criar cenas</Btn>}>
      <p className="mb-4 text-sm text-muted">Cria as cenas numeradas em sequência. Números que já existem são pulados.</p>
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Da cena" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextInput label="Até a cena" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
    </Sheet>
  )
}

function InfoTab({ project, role, onDeleted }) {
  const [edit, setEdit] = useState(false)
  const { confirm, notify } = useDialog()
  const rows = [
    ['Tipo', project.production_type], ['Produtora', project.company], ['Direção', project.director],
    ['Dir. Fotografia', project.dop], ['1º AC', project.first_ac], ['2º AC', project.second_ac],
    ['DIT / Logger', project.logger], ['Câmera', project.camera_body],
    ['Lentes do projeto', (project.kit?.lens || []).join(', ') || 'Kit inteiro'],
    ['Filtros do projeto', (project.kit?.filter || []).join(', ') || 'Kit inteiro'],
    ['Criado em', fmtDate(project.created_at)], ['Observações', project.notes],
  ]
  return (
    <>
      <Card className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 px-4 py-3">
            <div className="w-36 shrink-0 text-xs uppercase tracking-widest text-muted">{k}</div>
            <div className="min-w-0 flex-1 break-words">{v || '—'}</div>
          </div>
        ))}
      </Card>
      <div className="mt-4 grid gap-3">
        {role !== 'viewer' && <Btn variant="surface" onClick={() => setEdit(true)}><IconEdit /> Editar projeto</Btn>}
        {role === 'owner' && (
          <Btn variant="ghost" className="text-ng" onClick={async () => {
            if (await confirm({ title: 'Excluir projeto', danger: true, confirmLabel: 'Excluir',
              message: `Excluir “${project.title}” com todas as cenas, planos e takes?\nIsso também remove para quem tem o projeto compartilhado.` })) {
              await deleteProject(project.id); notify('Projeto excluído'); onDeleted()
            }
          }}><IconTrash /> Excluir projeto</Btn>
        )}
        {role === 'viewer' && <p className="text-center text-sm text-muted">Você tem acesso somente leitura a este projeto.</p>}
      </div>
      <ProjectForm open={edit} onClose={() => setEdit(false)} project={project} />
    </>
  )
}


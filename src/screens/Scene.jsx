import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { TopBar, Btn, Empty, Card, Sheet, TextInput, TextArea, ChipSelect, Field, IconBtn, useDialog } from '../components/ui'
import { IconPlus, IconMore, IconEdit, IconTrash, IconChevron } from '../components/icons'
import { useProject, useScene, useShots, useTakesByProject, useRole, useScenes } from '../lib/hooks'
import { createShot, deleteShot, update } from '../lib/repo'
import { useAuth } from '../auth'
import { nextCode, plural } from '../lib/util'
import { groupTakes } from '../lib/cameras'
import { SceneForm } from './Project'

export const SHOT_TYPES = ['PG', 'PC', 'PA', 'PM', 'PP', 'PPP', 'Detalhe', 'Insert', 'Plongée', 'Contra-plongée', 'Plano-sequência', 'Master']

export const STATUS = {
  good: { label: 'GOOD', cls: 'bg-good text-black border-good' },
  ng: { label: 'NG', cls: 'bg-ng text-white border-ng' },
  check: { label: 'CHECK', cls: 'bg-check text-black border-check' },
}

export default function Scene() {
  const { projectId, sceneId } = useParams()
  const project = useProject(projectId)
  const scene = useScene(sceneId)
  const scenes = useScenes(projectId)
  const shots = useShots(sceneId)
  const takes = useTakesByProject(projectId)
  const { user } = useAuth()
  const canEdit = useRole(project, user?.id) !== 'viewer'
  const nav = useNavigate()
  const { actionSheet, confirm, notify } = useDialog()
  const [form, setForm] = useState(null)
  const [editScene, setEditScene] = useState(false)

  // Por plano: nº de takes (claquete), último take (todas as câmeras) e câmeras que rodaram juntas
  const byShot = useMemo(() => {
    const rows = {}
    for (const t of takes || []) if (t.scene_id === sceneId) (rows[t.shot_id] ||= []).push(t)
    const m = {}
    for (const [id, list] of Object.entries(rows)) {
      const groups = groupTakes(list, project)
      const multi = new Set(groups.filter((g) => g.rows.length > 1).flatMap((g) => g.rows.map((r) => r.camera)))
      m[id] = { n: groups.length, last: groups[0], multicam: [...multi].sort().join('+') }
    }
    return m
  }, [takes, sceneId, project])

  if (scene === undefined || project === undefined) return null
  if (!scene || scene.deleted) return (<><TopBar title="Cena" back={`/p/${projectId}`} /><Empty title="Cena não encontrada" /></>)

  const sub = [project?.title, [scene.int_ext, scene.period].filter(Boolean).join(' · ')].filter(Boolean).join(' — ')

  return (
    <>
      <TopBar title={`Cena ${scene.number}`} subtitle={sub} back={`/p/${projectId}`}
        right={canEdit && <IconBtn label="Editar cena" onClick={() => setEditScene(true)}><IconEdit /></IconBtn>} />
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-32">
        {(scene.location || scene.description) && (
          <div className="mb-4 text-sm text-muted">{scene.location}{scene.location && scene.description ? ' — ' : ''}{scene.description}</div>
        )}
        {shots?.length === 0 && <Empty title="Sem planos">Crie o primeiro plano desta cena para começar a registrar os takes.</Empty>}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {shots?.map((s) => {
            const info = byShot[s.id]
            const last = info?.last
            return (
              <Card key={s.id} className="flex items-stretch">
                <button className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left" onClick={() => nav(`/p/${projectId}/s/${sceneId}/sh/${s.id}`)}>
                  <div className="min-w-16 shrink-0 font-display text-3xl font-extrabold text-accent">{scene.number}{/^\d/.test(s.code) ? '.' : ''}{s.code}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display font-bold">{s.shot_type || 'Plano'}{s.description ? ` — ${s.description}` : ''}</div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted">
                      <span className="whitespace-nowrap">{plural(info?.n || 0, 'take')}</span>
                      {last && last.rows.some((r) => r.status) && (
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          T{last.number}
                          {last.rows.map((r) => r.status && (
                            <span key={r.id} className={`rounded border px-1 font-medium ${STATUS[r.status].cls}`}>
                              {last.rows.length > 1 ? `${r.camera} ` : ''}{STATUS[r.status].label}
                            </span>
                          ))}
                        </span>
                      )}
                      {info?.multicam && <span className="shrink-0 rounded border border-accent px-1 font-medium text-accent" title="Rodou com mais de uma câmera">{info.multicam}</span>}
                    </div>
                  </div>
                  <IconChevron className="text-muted" />
                </button>
                {canEdit && (
                  <IconBtn label="Opções do plano" className="h-auto" onClick={() => actionSheet(`Plano ${s.code}`, [
                    { label: 'Editar plano', icon: <IconEdit />, onClick: () => setForm(s) },
                    { label: 'Excluir plano', icon: <IconTrash />, danger: true, onClick: async () => {
                      if (await confirm({ title: 'Excluir plano', danger: true, confirmLabel: 'Excluir',
                        message: `Excluir o plano ${s.code} e seus ${info?.n || 0} takes?` })) { await deleteShot(s.id); notify('Plano excluído') }
                    } },
                  ])}><IconMore /></IconBtn>
                )}
              </Card>
            )
          })}
        </div>
      </main>
      {canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-xl bg-gradient-to-t from-bg via-bg to-transparent px-4 pt-6 pb-bar">
          <Btn full size="lg" onClick={() => setForm('new')}><IconPlus /> Novo plano</Btn>
        </div>
      )}
      <ShotForm open={!!form} shot={form === 'new' ? null : form} scene={scene} shots={shots || []}
        onClose={() => setForm(null)} onCreated={(s) => nav(`/p/${projectId}/s/${sceneId}/sh/${s.id}`)} />
      <SceneForm open={editScene} onClose={() => setEditScene(false)} scene={scene} project={project} scenes={scenes} />
    </>
  )
}

export function ShotForm({ open, onClose, shot, scene, shots, onCreated }) {
  const [f, setF] = useState({})
  const { notify } = useDialog()
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) setF(shot ? { ...shot } : { code: nextCode(shots.map((s) => s.code)), shot_type: null, description: '' })
  }
  const save = async () => {
    const code = String(f.code || '').trim()
    if (!code) return notify('Informe o código do plano', 'error')
    if (shots.some((s) => s.code.toLowerCase() === code.toLowerCase() && s.id !== shot?.id)) return notify(`O plano ${code} já existe`, 'error')
    const data = { code, shot_type: f.shot_type || null, description: f.description || null }
    if (shot) await update('shots', shot.id, data)
    else { const s = await createShot(scene, data); onCreated?.(s) }
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title={shot ? `Editar plano ${shot.code}` : `Novo plano — cena ${scene.number}`}
      footer={<Btn full size="lg" onClick={save}>{shot ? 'Salvar' : 'Criar e abrir'}</Btn>}>
      <div className="grid gap-4">
        <TextInput label="Plano (número ou letra)" value={f.code || ''} onChange={(e) => setF({ ...f, code: e.target.value })} />
        <Field label="Enquadramento"><ChipSelect options={SHOT_TYPES} value={f.shot_type} onChange={(v) => setF({ ...f, shot_type: v })} /></Field>
        <TextArea label="Descrição (opcional)" rows={2} value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
    </Sheet>
  )
}

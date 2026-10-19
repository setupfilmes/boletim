import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { TopBar, Btn, Empty, Card, Sheet, TextInput, TextArea, IconBtn, useDialog } from '../components/ui'
import { IconPlus, IconMore, IconEdit, IconTrash, IconChevron, IconFile } from '../components/icons'
import { useProject, useRole, useScenes, useShotsByProject, useTakesByProject } from '../lib/hooks'
import { useDays, dayLabel, addScenesToDay, removeSceneFromDay, moveSceneInDay, createDay, updateDay, deleteDay } from '../lib/days'
import { buildPdf, shareFile } from '../lib/export'
import { useAuth } from '../auth'
import { countTakes } from '../lib/cameras'
import { fmtDate, plural, todayISO } from '../lib/util'
import { SceneForm } from './Project'

export const weekday = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '')

// Pasta da diária: as cenas daquele dia na ordem de gravação (arrumável) e o que foi gravado em cada uma
export default function Day() {
  const { projectId, dayId } = useParams()
  const project = useProject(projectId)
  const days = useDays(projectId)
  const scenes = useScenes(projectId)
  const shots = useShotsByProject(projectId)
  const takes = useTakesByProject(projectId)
  const { user } = useAuth()
  const canEdit = useRole(project, user?.id) !== 'viewer'
  const nav = useNavigate()
  const { actionSheet, confirm, notify } = useDialog()
  const [reorder, setReorder] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newScene, setNewScene] = useState(false)
  const [editDay, setEditDay] = useState(false)
  const [busy, setBusy] = useState(false)

  const day = days?.find((d) => d.id === dayId)
  const sceneById = useMemo(() => Object.fromEntries((scenes || []).map((s) => [s.id, s])), [scenes])
  const counts = useMemo(() => {
    if (!day) return {}
    const shotsById = Object.fromEntries((shots || []).map((s) => [s.id, s]))
    const by = {}
    for (const t of takes || []) if (t.shoot_date === day.date) (by[t.scene_id] ||= []).push(t)
    return Object.fromEntries(Object.entries(by).map(([sid, list]) => [sid, {
      ...countTakes(list, shotsById), shots: new Set(list.map((t) => t.shot_id)).size,
    }]))
  }, [takes, shots, day])

  if (project === undefined || days === undefined) return null
  if (!day) return (<><TopBar title="Diária" back={`/p/${projectId}`} /><Empty title="Diária não encontrada" /></>)

  const list = day.scenes.filter((s) => sceneById[s.scene_id])
  const pdf = async () => {
    setBusy(true)
    try {
      const r = await shareFile(await buildPdf(projectId, day.date))
      if (r === 'downloaded') notify('Arquivo salvo em Downloads')
    } catch (e) { notify(`Erro ao gerar: ${e.message}`, 'error') } finally { setBusy(false) }
  }

  return (
    <>
      <TopBar title={dayLabel(day.number)}
        subtitle={`${fmtDate(day.date)} · ${weekday(day.date)}${day.date === todayISO() ? ' · hoje' : ''}`}
        back={`/p/${projectId}`}
        right={canEdit && <IconBtn label="Editar diária" onClick={() => setEditDay(true)}><IconEdit /></IconBtn>} />
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-32">
        {day.notes && <div className="mb-3 whitespace-pre-wrap text-sm text-muted">{day.notes}</div>}
        {list.length === 0 && (
          <Empty title="Nenhuma cena nesta diária">Adicione as cenas da ordem do dia. Ao gravar um take, a cena entra aqui sozinha.</Empty>
        )}
        {list.length > 1 && canEdit && (
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-widest text-muted">Ordem de gravação</span>
            <Btn size="sm" variant={reorder ? 'primary' : 'ghost'} onClick={() => setReorder(!reorder)} data-testid="reorder">
              {reorder ? 'Pronto' : 'Reordenar'}
            </Btn>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2" data-testid="day-scenes">
          {list.map((ds, i) => {
            const s = sceneById[ds.scene_id]
            const c = counts[s.id]
            return (
              <Card key={ds.id} className="flex items-stretch">
                <div className="flex w-10 shrink-0 items-center justify-center font-mono text-sm text-muted">{i + 1}º</div>
                <button className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 pr-2 text-left" disabled={reorder}
                  onClick={() => nav(`/p/${projectId}/s/${s.id}?dia=${day.id}`)}>
                  <div className="w-14 shrink-0 font-display text-3xl font-extrabold text-accent">{s.number}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display font-bold">{[s.int_ext, s.period].filter(Boolean).join(' · ') || 'Cena'}</div>
                    {s.location && <div className="truncate text-sm">{s.location}</div>}
                    <div className="truncate font-mono text-xs text-muted">
                      {c ? `${plural(c.shots, 'plano')} · ${plural(c.takes, 'take')}${c.good ? ` · ${c.good} good` : ''}` : 'nada gravado ainda'}
                    </div>
                  </div>
                  {!reorder && <IconChevron className="text-muted" />}
                </button>
                {reorder ? (
                  <div className="flex shrink-0 flex-col justify-center">
                    <IconBtn label="Subir" disabled={i === 0} className="h-9 disabled:opacity-25" onClick={() => moveSceneInDay(day, s.id, -1)}>▲</IconBtn>
                    <IconBtn label="Descer" disabled={i === list.length - 1} className="h-9 disabled:opacity-25" onClick={() => moveSceneInDay(day, s.id, 1)}>▼</IconBtn>
                  </div>
                ) : canEdit && (
                  <IconBtn label="Opções da cena" className="h-auto" onClick={() => actionSheet(`Cena ${s.number}`, [
                    { label: 'Tirar desta diária', icon: <IconTrash />, danger: true, onClick: async () => {
                      try { await removeSceneFromDay(day, s.id); notify(`Cena ${s.number} saiu do ${dayLabel(day.number)}`) } catch (e) { notify(e.message, 'error') }
                    } },
                  ])}><IconMore /></IconBtn>
                )}
              </Card>
            )
          })}
        </div>
        {list.length > 0 && (
          <Btn variant="ghost" full className="mt-4" disabled={busy} onClick={pdf}><IconFile size={18} /> {busy ? 'Gerando…' : 'Relatório desta diária (PDF)'}</Btn>
        )}
      </main>
      {canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-xl grid-cols-3 gap-3 bg-gradient-to-t from-bg via-bg to-transparent px-4 pt-6 pb-bar">
          <Btn size="lg" className="col-span-2" onClick={() => setAdding(true)} data-testid="day-add-scene"><IconPlus /> Cena</Btn>
          <Btn size="lg" variant="surface" onClick={() => setNewScene(true)}>Nova</Btn>
        </div>
      )}
      <AddScenesSheet open={adding} onClose={() => setAdding(false)} scenes={scenes || []} day={day} days={days}
        onNew={() => { setAdding(false); setNewScene(true) }} />
      <SceneForm open={newScene} project={project} scenes={scenes} onClose={() => setNewScene(false)}
        onCreated={async (s) => { await addScenesToDay(day, [s.id]); notify(`Cena ${s.number} criada no ${dayLabel(day.number)}`) }} />
      <DayForm open={editDay} onClose={() => setEditDay(false)} project={project} days={days} day={day}
        onDeleted={() => nav(`/p/${projectId}`)} confirm={confirm} />
    </>
  )
}

// Escolher cenas do roteiro para a diária (as que já estão nela não aparecem)
function AddScenesSheet({ open, onClose, scenes, day, days, onNew }) {
  const [sel, setSel] = useState([])
  const { notify } = useDialog()
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) { setLastOpen(open); if (open) setSel([]) }
  const inDay = new Set(day.scenes.map((s) => s.scene_id))
  const avail = scenes.filter((s) => !inDay.has(s.id))
  const otherDays = (sid) => days.filter((d) => d.id !== day.id && d.scenes.some((x) => x.scene_id === sid)).map((d) => dayLabel(d.number))
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
  const save = async () => {
    // na ordem em que foram tocadas = ordem de gravação
    await addScenesToDay(day, sel)
    notify(sel.length > 1 ? `${sel.length} cenas adicionadas` : 'Cena adicionada')
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Cenas do ${dayLabel(day.number)}`} tall
      footer={<Btn full size="lg" disabled={!sel.length} onClick={save} data-testid="day-add-save">
        {sel.length ? `Adicionar ${plural(sel.length, 'cena')}` : 'Escolha as cenas'}</Btn>}>
      <p className="mb-3 text-sm text-muted">Toque nas cenas na ordem em que serão gravadas. Dá para reordenar depois.</p>
      {avail.length === 0 && <p className="py-6 text-center text-sm text-muted">Todas as cenas do roteiro já estão nesta diária.</p>}
      <div className="grid gap-2">
        {avail.map((s) => {
          const k = sel.indexOf(s.id)
          const other = otherDays(s.id)
          return (
            <button key={s.id} onClick={() => toggle(s.id)} data-testid="pick-scene"
              className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 text-left ${k >= 0 ? 'border-accent bg-accent/10' : 'border-line'}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-mono text-sm font-bold ${k >= 0 ? 'border-accent bg-accent text-accent-ink' : 'border-line text-muted'}`}>
                {k >= 0 ? k + 1 : ''}
              </span>
              <span className="w-12 shrink-0 font-display text-2xl font-extrabold text-accent">{s.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{[s.int_ext, s.period].filter(Boolean).join(' · ')}{s.location ? ` — ${s.location}` : ''}</span>
                {other.length > 0 && <span className="block truncate font-mono text-xs text-muted">também em {other.join(', ')}</span>}
              </span>
            </button>
          )
        })}
      </div>
      <Btn variant="ghost" full className="mt-3" onClick={onNew}><IconPlus /> Cena nova (fora do roteiro)</Btn>
    </Sheet>
  )
}

// Criar / editar diária (número, data, notas da ordem do dia)
export function DayForm({ open, onClose, project, days, day, onCreated, onDeleted, confirm }) {
  const { notify } = useDialog()
  const [f, setF] = useState({})
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      if (day) setF({ number: String(day.number), date: day.date, notes: day.notes || '' })
      else {
        const maxN = Math.max(0, ...days.map((d) => d.number))
        const today = todayISO()
        setF({ number: String(maxN + 1), date: days.some((d) => d.date === today) ? '' : today, notes: '' })
      }
    }
  }
  const save = async () => {
    const n = parseInt(f.number, 10)
    if (!(n > 0)) return notify('Informe o número da diária', 'error')
    if (!f.date) return notify('Informe a data', 'error')
    try {
      if (day) await updateDay(day, { number: n, date: f.date, notes: f.notes })
      else { const d = await createDay(project.id, { number: n, date: f.date, notes: f.notes }); onCreated?.(d) }
      onClose()
    } catch (e) { notify(e.message, 'error') }
  }
  const remove = async () => {
    if (!(await confirm({ title: 'Excluir diária', danger: true, confirmLabel: 'Excluir',
      message: `Excluir o ${dayLabel(day.number)}? As cenas continuam no roteiro.` }))) return
    try { await deleteDay(day); onClose(); onDeleted?.() } catch (e) { notify(e.message, 'error') }
  }
  return (
    <Sheet open={open} onClose={onClose} title={day ? `Editar ${dayLabel(day.number)}` : 'Nova diária'}
      footer={<div className="grid gap-2">
        <Btn full size="lg" onClick={save} data-testid="day-save">{day ? 'Salvar' : 'Criar diária'}</Btn>
        {day && <Btn full variant="ghost" className="text-ng" onClick={remove}><IconTrash /> Excluir diária</Btn>}
      </div>}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Diária nº" inputMode="numeric" value={f.number || ''} onChange={(e) => setF({ ...f, number: e.target.value })} data-testid="day-number" />
          <TextInput label="Data" type="date" value={f.date || ''} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="day-date" />
        </div>
        {day && f.date && f.date !== day.date && (
          <p className="text-sm text-check">Os takes gravados nesta diária passam para a nova data.</p>
        )}
        <TextArea label="Observações (ordem do dia, locação, chamada…)" rows={3} value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
    </Sheet>
  )
}

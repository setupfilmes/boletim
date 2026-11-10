import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { TopBar, Btn, Empty, Sheet, TextInput, TextArea, IconBtn, useDialog } from '../components/ui'
import { IconEdit, IconTrash } from '../components/icons'
import { Button, CenaCard, Banner } from '../ds/components'
import { useProject, useRole, useScenes, useShotsByProject, useTakesByProject } from '../lib/hooks'
import { useDays, dayLabel, addScenesToDay, removeSceneFromDay, moveSceneInDay, createDay, updateDay, deleteDay } from '../lib/days'
import { buildPdf, shareFile } from '../lib/export'
import { useAuth } from '../auth'
import { statsByScene, sceneCardProps } from '../lib/stats'
import { fmtDate, plural, todayISO } from '../lib/util'
import { SceneForm } from './Project'

export const weekday = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '')

// Tela de uma diária (vinda da aba Diárias). A aba Hoje usa o mesmo DayBody com a diária de hoje.
export default function Day() {
  const { projectId, dayId } = useParams()
  const project = useProject(projectId)
  const days = useDays(projectId)
  const { user } = useAuth()
  const canEdit = useRole(project, user?.id) !== 'viewer'
  const nav = useNavigate()
  const [editDay, setEditDay] = useState(false)
  const { confirm } = useDialog()

  if (project === undefined || days === undefined) return null
  const day = days.find((d) => d.id === dayId)
  if (!day) return (<><TopBar title="Diária" back={`/p/${projectId}?tab=diarias`} /><Empty title="Diária não encontrada" /></>)

  return (
    <>
      <TopBar title={dayLabel(day.number)}
        subtitle={`${fmtDate(day.date)} · ${weekday(day.date)}${day.date === todayISO() ? ' · hoje' : ''}`}
        back={`/p/${projectId}?tab=diarias`}
        right={canEdit && <IconBtn label="Editar diária" onClick={() => setEditDay(true)}><IconEdit /></IconBtn>} />
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-28">
        <DayBody project={project} day={day} days={days} canEdit={canEdit} />
      </main>
      <DayForm open={editDay} onClose={() => setEditDay(false)} project={project} days={days} day={day}
        onDeleted={() => nav(`/p/${projectId}?tab=diarias`)} confirm={confirm} />
    </>
  )
}

// Cenas da diária na ordem de gravação (arrumável), adicionar do roteiro, editar diária e boletim do dia
export function DayBody({ project, day, days, canEdit, onEditDay }) {
  const scenes = useScenes(project.id)
  const shots = useShotsByProject(project.id)
  const takes = useTakesByProject(project.id)
  const nav = useNavigate()
  const { notify } = useDialog()
  const [reorder, setReorder] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newScene, setNewScene] = useState(false)
  const [busy, setBusy] = useState(false)

  const sceneById = useMemo(() => Object.fromEntries((scenes || []).map((s) => [s.id, s])), [scenes])
  const stats = useMemo(() => statsByScene(takes, shots, day.date), [takes, shots, day.date])
  const list = day.scenes.filter((s) => sceneById[s.scene_id])
  const others = (sid) => days.filter((d) => d.id !== day.id && d.scenes.some((x) => x.scene_id === sid)).map((d) => dayLabel(d.number))
  const total = list.reduce((n, ds) => n + (stats[ds.scene_id]?.takes || 0), 0)

  const pdf = async () => {
    setBusy(true)
    try {
      const r = await shareFile(await buildPdf(project.id, day.date))
      if (r === 'downloaded') notify('Arquivo salvo em Downloads')
    } catch (e) { notify(`Erro ao gerar: ${e.message}`, 'error') } finally { setBusy(false) }
  }

  if (!scenes) return null
  return (
    <div className="grid gap-3">
      {day.notes && <Banner tone="info" title="Ordem do dia">{day.notes}</Banner>}
      {list.length === 0 ? (
        <Empty icon="calendar-days" title={`Nenhuma cena no ${dayLabel(day.number)}`}
          action={canEdit && <Btn onClick={() => setAdding(true)} data-testid="day-add-scene">Adicionar do roteiro</Btn>}>
          Escolha as cenas que serão gravadas. A ordem pode mudar depois. Ao gravar um take, a cena entra aqui sozinha.
        </Empty>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-2xl font-bold leading-[30px]">Ordem de gravação</div>
              <div className="text-[15px] leading-5 text-muted">{plural(list.length, 'cena')} · {plural(total, 'take')}</div>
            </div>
            {canEdit && list.length > 1 && (
              <Button size="p" icon={reorder ? 'check' : 'grip-vertical'} onClick={() => setReorder(!reorder)} data-testid="reorder">
                {reorder ? 'Pronto' : 'Reordenar'}
              </Button>
            )}
          </div>
          <div className="grid gap-2" data-testid="day-scenes">
            {list.map((ds, i) => {
              const s = sceneById[ds.scene_id]
              const st = stats[s.id]
              const o = others(s.id)
              return (
                <div key={ds.id} className="grid gap-1.5">
                  <CenaCard {...sceneCardProps(s)} arrastavel={canEdit} ordem={i + 1}
                    planos={st?.planos || 0} takes={st?.takes || 0} circulados={st?.circulados || 0}
                    naoGravada={!st} outrosDias={o.length ? o.join(', ') : undefined}
                    onPress={() => !reorder && nav(`/p/${project.id}/s/${s.id}?dia=${day.id}`)} />
                  {reorder && (
                    <div className="grid grid-cols-3 gap-2">
                      <Button size="p" icon="chevron-left" disabled={i === 0} onClick={() => moveSceneInDay(day, s.id, -1)}>Subir</Button>
                      <Button size="p" icon="chevron-right" disabled={i === list.length - 1} onClick={() => moveSceneInDay(day, s.id, 1)}>Descer</Button>
                      <Button size="p" variant="perigo" icon="x" onClick={async () => {
                        try { await removeSceneFromDay(day, s.id); notify(`Cena ${s.number} saiu do ${dayLabel(day.number)}`) } catch (e) { notify(e.message, 'error') }
                      }}>Tirar</Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {canEdit && (
            <div className="grid gap-2">
              <Button block icon="plus" onClick={() => setAdding(true)} data-testid="day-add-scene">Adicionar cena do roteiro</Button>
              <Button block variant="fantasma" icon="plus" onClick={() => setNewScene(true)}>Cena nova (fora do roteiro)</Button>
              {onEditDay && <Button block variant="fantasma" icon="calendar-days" onClick={onEditDay}>Editar diária (número e data)</Button>}
            </div>
          )}
          <Button block variant="fantasma" icon="file-text" disabled={busy} onClick={pdf}>{busy ? 'Gerando…' : 'Boletim desta diária (PDF)'}</Button>
        </>
      )}
      <AddScenesSheet open={adding} onClose={() => setAdding(false)} scenes={scenes} day={day} days={days} stats={statsByScene(takes, shots)}
        onNew={() => { setAdding(false); setNewScene(true) }} />
      <SceneForm open={newScene} project={project} scenes={scenes} onClose={() => setNewScene(false)}
        onCreated={async (s) => { await addScenesToDay(day, [s.id]); notify(`Cena ${s.number} criada no ${dayLabel(day.number)}`) }} />
    </div>
  )
}

// Escolher cenas do roteiro: não gravadas primeiro, depois as gravadas em outro dia. Ordem do toque = ordem de gravação.
function AddScenesSheet({ open, onClose, scenes, day, days, stats, onNew }) {
  const [sel, setSel] = useState([])
  const [q, setQ] = useState('')
  const { notify } = useDialog()
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) { setLastOpen(open); if (open) { setSel([]); setQ('') } }
  const inDay = new Set(day.scenes.map((s) => s.scene_id))
  const match = (s) => !q || [s.number, s.location, s.description].some((x) => String(x || '').toLowerCase().includes(q.toLowerCase()))
  const avail = scenes.filter((s) => !inDay.has(s.id) && match(s))
  const otherDays = (sid) => days.filter((d) => d.id !== day.id && d.scenes.some((x) => x.scene_id === sid)).map((d) => dayLabel(d.number))
  const novas = avail.filter((s) => !stats[s.id])
  const gravadas = avail.filter((s) => stats[s.id])
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
  const save = async () => {
    await addScenesToDay(day, sel)
    notify(sel.length > 1 ? `${sel.length} cenas adicionadas` : 'Cena adicionada')
    onClose()
  }
  const card = (s) => {
    const st = stats[s.id]
    const o = otherDays(s.id)
    return (
      <div key={s.id} data-testid="pick-scene">
        <CenaCard {...sceneCardProps(s)} selecionada={sel.includes(s.id)} naoGravada={!st}
          planos={st?.planos || 0} takes={st?.takes || 0} circulados={st?.circulados || 0}
          outrosDias={o.length ? o.join(', ') : undefined} onPress={() => toggle(s.id)} />
      </div>
    )
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Cenas do ${dayLabel(day.number)}`} tall
      footer={<Btn full size="lg" disabled={!sel.length} onClick={save} data-testid="day-add-save">
        {sel.length ? `Adicionar ${plural(sel.length, 'cena')}` : 'Escolha as cenas'}</Btn>}>
      <div className="grid gap-3">
        <TextInput placeholder="Buscar cena, locação…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cena" />
        <p className="text-[15px] leading-5 text-muted">Toque nas cenas na ordem em que serão gravadas. Dá para reordenar depois.</p>
        {avail.length === 0 && <p className="py-6 text-center text-[15px] text-muted">{q ? 'Nenhuma cena encontrada.' : 'Todas as cenas do roteiro já estão nesta diária.'}</p>}
        {novas.length > 0 && <div className="text-[13px] font-bold uppercase tracking-[.07em] text-muted">Ainda não gravadas</div>}
        {novas.map(card)}
        {gravadas.length > 0 && <div className="text-[13px] font-bold uppercase tracking-[.07em] text-muted">Gravadas em outro dia</div>}
        {gravadas.map(card)}
        <Button block variant="fantasma" icon="plus" onClick={onNew}>Cena nova (fora do roteiro)</Button>
      </div>
    </Sheet>
  )
}

// Criar / editar diária (número, data, notas da ordem do dia)
export function DayForm({ open, onClose, project, days, day, onCreated, onDeleted, confirm, presetDate }) {
  const { notify } = useDialog()
  const [f, setF] = useState({})
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      if (day) setF({ number: String(day.number), date: day.date, notes: day.notes || '' })
      else {
        const maxN = Math.max(0, ...days.map((d) => d.number))
        const today = presetDate || todayISO()
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
        {day && <Btn full variant="danger" onClick={remove}><IconTrash /> Excluir diária</Btn>}
      </div>}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Diária nº" inputMode="numeric" value={f.number || ''} onChange={(e) => setF({ ...f, number: e.target.value })} data-testid="day-number" />
          <TextInput label="Data" type="date" value={f.date || ''} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="day-date" />
        </div>
        {day && f.date && f.date !== day.date && (
          <p className="text-[15px] text-check-ink">Os takes gravados nesta diária passam para a nova data.</p>
        )}
        <TextArea label="Observações (ordem do dia, locação, chamada…)" rows={3} value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
    </Sheet>
  )
}

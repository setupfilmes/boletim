import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Navigate } from 'react-router'
import { TopBar, Btn, Empty, Sheet, TextInput, TextArea, ChipSelect, Field, IconBtn, useDialog } from '../components/ui'
import { IconMore, IconTrash } from '../components/icons'
import { Button, CenaCard, DiariaCard, TabBar, Banner } from '../ds/components'
import { useProject, useScenes, useShotsByProject, useTakesByProject, useRole } from '../lib/hooks'
import { createScene, createScenesBatch, deleteScene, update } from '../lib/repo'
import { useAuth } from '../auth'
import { fmtDate, plural, todayISO } from '../lib/util'
import Reports from './Reports'
import Desk from './Desk'
import ThemePicker from '../components/ThemePicker'
import { DayForm, DayBody, weekday } from './Day'
import { useDays, ensureDays, dayLabel, createDay } from '../lib/days'
import { statsByScene, sceneCardProps } from '../lib/stats'

// Tela larga (≥ 1024 px): layout de computador
function useWide() {
  const q = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches)
  useEffect(() => {
    const m = matchMedia(q)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

export const INT_EXT = ['INT', 'EXT', 'INT/EXT']
export const PERIODS = ['DIA', 'NOITE', 'AMANHECER', 'ENTARDECER']

// Abas do projeto, na ordem de uso no set (design system): Hoje · Diárias · Roteiro · Relatórios.
// Ficha técnica, equipe e tema ficam no menu ⋮. Endereços antigos (?tab=cenas/info/equipe) ainda funcionam.
const TAB_IDS = ['hoje', 'diarias', 'roteiro', 'relatorios']
function resolveTab(params) {
  const t = params.get('tab')
  if (TAB_IDS.includes(t)) return t
  if (t === 'cenas') return params.get('ver') === 'roteiro' ? 'roteiro' : 'diarias'
  return 'hoje'
}

export default function Project() {
  const { projectId } = useParams()
  const [params, setParams] = useSearchParams()
  const project = useProject(projectId)
  const { user } = useAuth()
  const role = useRole(project, user?.id)
  const canEdit = role !== 'viewer'
  const [menu, setMenu] = useState(false)
  const nav = useNavigate()
  // diárias que surgiram de takes gravados viram linhas de verdade (para reordenar e sincronizar)
  useEffect(() => { if (project && canEdit) ensureDays(project.id) }, [project?.id, canEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  const wide = useWide()
  const legacy = params.get('tab')
  if (legacy === 'info') return <Navigate to={`/p/${projectId}/ficha`} replace />
  if (legacy === 'equipe') return <Navigate to={`/p/${projectId}/equipe`} replace />
  const tab = resolveTab(params)

  if (project === undefined) return null
  if (!project || project.deleted) {
    return (<><TopBar title="Projeto" back="/" /><Empty title="Projeto não encontrado">Ele pode ter sido excluído.</Empty></>)
  }

  // computador: três colunas (lateral · cenas · plano com a tabela de takes)
  if (wide) return <Desk project={project} canEdit={canEdit} role={role} />

  return (
    <>
      <TopBar title={project.title} subtitle={project.production_type || 'Projeto'} back="/"
        right={<IconBtn label="Menu do projeto" onClick={() => setMenu(true)} data-testid="project-menu"><IconMore /></IconBtn>} />
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-36">
        {role === 'viewer' && (
          <div className="mb-3"><Banner tone="compartilhado" title="Você só pode visualizar este projeto">Dá para ver tudo e gerar o boletim. Registrar e mudar takes fica com quem pode editar.</Banner></div>
        )}
        {tab === 'hoje' && <TodayTab project={project} canEdit={canEdit} onTab={(t) => setParams({ tab: t }, { replace: true })} />}
        {tab === 'diarias' && <DaysList project={project} canEdit={canEdit} />}
        {tab === 'roteiro' && <ScriptTab project={project} canEdit={canEdit} />}
        {tab === 'relatorios' && <Reports project={project} />}
      </main>
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t-0 bg-surface" data-testid="tabbar">
        <div className="mx-auto max-w-3xl">
          <TabBar value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} />
        </div>
      </div>
      <Sheet open={menu} onClose={() => setMenu(false)} title="Menu">
        <div className="grid gap-2">
          <Button block icon="folder-open" onClick={() => nav('/')}>Projetos</Button>
          <Button block icon="file-text" onClick={() => nav(`/p/${project.id}/ficha`)} data-testid="menu-ficha">Ficha técnica</Button>
          <Button block icon="users" onClick={() => nav(`/p/${project.id}/equipe`)} data-testid="menu-equipe">Equipe</Button>
          <Button block icon="folder-open" onClick={() => nav(`/p/${project.id}/cartao`)} data-testid="menu-cartao">Conferir cartão (DIT)</Button>
          <Button block icon="settings" onClick={() => nav('/conta')}>Conta e sincronização</Button>
          <div className="mt-2 text-[13px] font-bold uppercase tracking-[.07em] text-muted">Tema</div>
          <ThemePicker />
        </div>
      </Sheet>
    </>
  )
}

// Aba Hoje: a diária de hoje (cenas na ordem de gravação). Sem diária hoje: cria com um toque.
function TodayTab({ project, canEdit, onTab }) {
  const days = useDays(project.id)
  const { notify, confirm } = useDialog()
  const [edit, setEdit] = useState(false)
  if (!days) return null
  const today = todayISO()
  const day = days.find((d) => d.date === today)
  if (!day) {
    const next = Math.max(0, ...days.map((d) => d.number)) + 1
    return (
      <Empty icon="calendar-days" title="Nenhuma diária hoje"
        action={<div className="grid gap-2">
          {canEdit && <Btn onClick={async () => { try { await createDay(project.id, { number: next, date: today }); notify(`${dayLabel(next)} criado`) } catch (e) { notify(e.message, 'error') } }}
            data-testid="create-today">Começar o {dayLabel(next)} hoje</Btn>}
          {days.length > 0 && <Btn variant="ghost" onClick={() => onTab('diarias')}>Ver as diárias</Btn>}
        </div>}>
        {fmtDate(today)} · {weekday(today)}. {canEdit ? 'Crie a diária e escolha as cenas do roteiro. Se gravar um take sem criar, ela aparece sozinha.' : 'Nada foi gravado hoje neste projeto.'}
      </Empty>
    )
  }
  return (
    <>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-[40px] font-bold leading-[44px]">{String(day.number).padStart(2, '0')}</span>
        <span className="min-w-0">
          <span className="block text-[13px] font-bold uppercase tracking-[.07em] text-muted">Dia · hoje</span>
          <span className="block truncate text-[17px] font-bold">{fmtDate(day.date)} · {weekday(day.date)}</span>
        </span>
      </div>
      <DayBody project={project} day={day} days={days} canEdit={canEdit} onEditDay={canEdit ? () => setEdit(true) : null} />
      <DayForm open={edit} onClose={() => setEdit(false)} project={project} days={days} day={day} confirm={confirm} />
    </>
  )
}

// Aba Diárias: Dia 01, Dia 02… da mais recente para a mais antiga; + Nova diária; cenas ainda sem diária
function DaysList({ project, canEdit }) {
  const days = useDays(project.id)
  const scenes = useScenes(project.id)
  const shots = useShotsByProject(project.id)
  const takes = useTakesByProject(project.id)
  const nav = useNavigate()
  const { confirm } = useDialog()
  const [form, setForm] = useState(false)
  const stats = useMemo(() => {
    const out = {}
    for (const d of days || []) {
      const st = statsByScene(takes, shots, d.date)
      out[d.id] = Object.values(st).reduce((n, x) => n + x.takes, 0)
    }
    return out
  }, [days, takes, shots])
  if (!days || !scenes) return null
  const today = todayISO()
  const scheduled = new Set(days.flatMap((d) => d.scenes.map((x) => x.scene_id)))
  const loose = scenes.filter((s) => !scheduled.has(s.id))
  const ordered = [...days].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.number - a.number)
  return (
    <div className="grid gap-2">
      {days.length === 0 && (
        <Empty icon="calendar-days" title="Nenhuma diária ainda">
          Crie o Dia 01 e escolha as cenas da ordem do dia. Se você gravar sem criar, a diária aparece sozinha com a data do take.
        </Empty>
      )}
      <div className="grid gap-2" data-testid="days">
        {ordered.map((d) => (
          <DiariaCard key={d.id} dia={d.number} data={`${fmtDate(d.date)} · ${weekday(d.date)}`} cenas={d.scenes.length}
            takes={stats[d.id] || 0} hoje={d.date === today} onPress={() => nav(`/p/${project.id}/d/${d.id}`)} />
        ))}
      </div>
      {canEdit && <Button block icon="plus" onClick={() => setForm(true)} data-testid="new-day">Nova diária</Button>}
      {loose.length > 0 && (
        <div className="mt-3" data-testid="loose-scenes">
          <Banner tone="info" title={`Cenas sem diária (${loose.length})`}>
            Ainda não gravadas nem colocadas em um dia: {loose.map((s) => s.number).join(', ')}. Estão no Roteiro.
          </Banner>
          <div className="mt-2 flex flex-wrap gap-2">
            {loose.map((s) => (
              <Button key={s.id} size="p" onClick={() => nav(`/p/${project.id}/s/${s.id}`)}>Cena {s.number}</Button>
            ))}
          </div>
        </div>
      )}
      <DayForm open={form} onClose={() => setForm(false)} project={project} days={days} confirm={confirm}
        onCreated={(d) => nav(`/p/${project.id}/d/${d.id}`)} />
    </div>
  )
}

// Aba Roteiro: todas as cenas, com busca; as não gravadas com borda tracejada
function ScriptTab({ project, canEdit }) {
  const scenes = useScenes(project.id)
  const shots = useShotsByProject(project.id)
  const takes = useTakesByProject(project.id)
  const days = useDays(project.id)
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [batch, setBatch] = useState(false)
  const stats = useMemo(() => statsByScene(takes, shots), [takes, shots])
  if (!scenes) return null
  const daysOf = (sid) => (days || []).filter((d) => d.scenes.some((x) => x.scene_id === sid)).map((d) => dayLabel(d.number))
  const match = (s) => !q || [s.number, s.location, s.description].some((x) => String(x || '').toLowerCase().includes(q.toLowerCase()))
  const list = scenes.filter(match)
  return (
    <div className="grid gap-2">
      {scenes.length === 0 ? (
        <Empty icon="list" title="Roteiro vazio">Adicione as cenas do roteiro. Dá para criar várias de uma vez (ex.: 1 a 32).</Empty>
      ) : (
        <>
          <TextInput placeholder="Buscar cena, locação…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cena" />
          <div className="text-[15px] text-muted">{plural(scenes.length, 'cena')} · {Object.keys(stats).length} gravadas</div>
        </>
      )}
      <div className="grid gap-2" data-testid="scenes">
        {list.map((s) => {
          const st = stats[s.id]
          const ds = daysOf(s.id)
          return (
            <CenaCard key={s.id} {...sceneCardProps(s)} naoGravada={!st} planos={st?.planos || 0} takes={st?.takes || 0}
              circulados={st?.circulados || 0} outrosDias={ds.length ? ds.join(', ') : undefined}
              onPress={() => nav(`/p/${project.id}/s/${s.id}`)} />
          )
        })}
      </div>
      {canEdit && (
        <div className="grid grid-cols-3 gap-2">
          <Button className="col-span-2" icon="plus" onClick={() => setEdit('new')} data-testid="new-scene">Cena</Button>
          <Button onClick={() => setBatch(true)}>Várias</Button>
        </div>
      )}
      <SceneForm open={!!edit} scene={null} project={project} scenes={scenes}
        onClose={() => setEdit(null)} onCreated={(s) => nav(`/p/${project.id}/s/${s.id}`)} />
      <BatchScenes open={batch} onClose={() => setBatch(false)} project={project} scenes={scenes} />
    </div>
  )
}

function suggestNextScene(scenes) {
  const nums = scenes.map((s) => parseInt(s.number, 10)).filter((n) => !Number.isNaN(n))
  return String(nums.length ? Math.max(...nums) + 1 : 1)
}

// Criar / editar cena (com Excluir)
export function SceneForm({ open, onClose, scene, project, scenes, onCreated, onDeleted }) {
  const [f, setF] = useState({})
  const { notify, confirm } = useDialog()
  const init = () => setF(scene ? { ...scene } : { number: suggestNextScene(scenes || []), int_ext: 'INT', period: 'DIA', location: '', description: '' })
  // reinicia o formulário ao abrir
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) { setLastOpen(open); if (open) init() }

  const save = async () => {
    const number = String(f.number || '').trim()
    if (!number) return notify('Informe o número da cena', 'error')
    if ((scenes || []).some((s) => s.number.toLowerCase() === number.toLowerCase() && s.id !== scene?.id)) {
      return notify(`A cena ${number} já existe no roteiro`, 'error')
    }
    const data = { number, int_ext: f.int_ext || null, period: f.period || null, location: f.location || null, description: f.description || null }
    // os planos mostram "número da cena + código" (7A, 7.1): mudar a cena já renomeia todos
    if (scene) await update('scenes', scene.id, data)
    else { const s = await createScene(project.id, data); onCreated?.(s) }
    onClose()
  }
  const remove = async () => {
    if (!(await confirm({ title: 'Excluir cena', danger: true, confirmLabel: 'Excluir',
      message: `Excluir a cena ${scene.number}? Apaga os planos e takes dela e tira a cena de todas as diárias. Não dá para desfazer.` }))) return
    await deleteScene(scene.id)
    notify('Cena excluída')
    onClose()
    onDeleted?.()
  }

  return (
    <Sheet open={open} onClose={onClose} title={scene ? `Editar cena ${scene.number}` : 'Nova cena'}
      footer={<div className="grid gap-2">
        <Btn full size="lg" onClick={save}>{scene ? 'Salvar' : 'Criar cena'}</Btn>
        {scene && <Btn full variant="danger" onClick={remove}><IconTrash /> Excluir cena</Btn>}
      </div>}>
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
      <p className="mb-4 text-[15px] text-muted">Cria as cenas numeradas em sequência. Números que já existem são pulados.</p>
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Da cena" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextInput label="Até a cena" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
    </Sheet>
  )
}

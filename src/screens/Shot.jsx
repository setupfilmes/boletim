import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { TopBar, Btn, Empty, Card, Sheet, TextInput, TextArea, IconBtn, useDialog } from '../components/ui'
import { IconPlus, IconMore, IconEdit, IconTrash, IconBack, IconChevron } from '../components/icons'
import PickerSheet from '../components/PickerSheet'
import { useProject, useScene, useShot, useTakesByShot, useKit, useRole, kitOptions, useShots } from '../lib/hooks'
import { createNextTake, deleteTake, update } from '../lib/repo'
import { useAuth } from '../auth'
import { fmtDate, fmtTime, joinFilters, vibrate, incrCode } from '../lib/util'
import { STATUS, ShotForm } from './Scene'

// Campos do take que abrem a gaveta de presets
const PICK_FIELDS = {
  camera: { label: 'Cam', cat: 'camera' },
  lens: { label: 'Lente', cat: 'lens' },
  t_stop: { label: 'T-Stop', cat: 'tstop' },
  filters: { label: 'Filtros', cat: 'filter', multi: true },
  focus: { label: 'Foco', cat: 'focus' },
  iso: { label: 'ISO', cat: 'iso' },
  shutter: { label: 'Shutter', cat: 'shutter' },
  fps: { label: 'FPS', cat: 'fps' },
  wb: { label: 'WB', cat: 'wb' },
}

// Campos de câmera que quase não mudam entre takes — ficam no resumo recolhível
const CAMERA_FIELDS = ['camera', 'lens', 't_stop', 'filters', 'focus', 'iso', 'shutter', 'fps', 'wb']

const shotCode = (scene, shot) => `${scene?.number ?? ''}${/^\d/.test(shot.code) ? '.' : ''}${shot.code}`

export default function Shot() {
  const { projectId, sceneId, shotId } = useParams()
  const project = useProject(projectId)
  const scene = useScene(sceneId)
  const shot = useShot(shotId)
  const shots = useShots(sceneId)
  const takes = useTakesByShot(shotId)
  const kit = useKit()
  const { user } = useAuth()
  const canEdit = useRole(project, user?.id) !== 'viewer'
  const { notify } = useDialog()
  const [openId, setOpenId] = useState(null)
  const [picker, setPicker] = useState(null) // { take, field }
  const [text, setText] = useState(null) // { take, field }
  const [editTake, setEditTake] = useState(null)
  const [editShot, setEditShot] = useState(false)
  const [newShot, setNewShot] = useState(false)
  const nav = useNavigate()

  const latestId = takes?.[0]?.id
  useEffect(() => { setOpenId(latestId || null) }, [latestId])

  if (shot === undefined || scene === undefined) return null
  if (!shot || shot.deleted) return (<><TopBar title="Plano" back={`/p/${projectId}/s/${sceneId}`} /><Empty title="Plano não encontrado" /></>)

  const nextNumber = takes?.length ? takes[0].take_number + 1 : 1
  const shotLabel = shotCode(scene, shot)
  const idx = shots ? shots.findIndex((s) => s.id === shot.id) : -1
  const prev = idx > 0 ? shots[idx - 1] : null
  const next = idx >= 0 ? shots[idx + 1] : null
  const goShot = (s) => nav(`/p/${projectId}/s/${sceneId}/sh/${s.id}`, { replace: true })

  const addTake = async () => {
    vibrate(25)
    const t = await createNextTake(shot)
    setOpenId(t.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const setField = (take, field, value) => update('takes', take.id, { [field]: value })

  const pf = picker && PICK_FIELDS[picker.field]

  return (
    <>
      <TopBar title={`Plano ${shotLabel}`} subtitle={`${project?.title || ''} — Cena ${scene?.number || ''}${shot.shot_type ? ` · ${shot.shot_type}` : ''}`}
        back={`/p/${projectId}/s/${sceneId}`}
        right={canEdit && <IconBtn label="Editar plano" onClick={() => setEditShot(true)}><IconEdit /></IconBtn>} />
      <main className="mx-auto max-w-4xl px-3 pt-3 pb-32">
        {shots && (
          <ShotNav scene={scene} prev={prev} next={next} pos={idx + 1} total={shots.length}
            onGo={goShot} onNew={canEdit ? () => setNewShot(true) : null} />
        )}
        {shot.description && <div className="mb-3 px-1 text-sm text-muted">{shot.description}</div>}
        {takes?.length === 0 && (
          <Empty title="Nenhum take">Toque em <b>+ TAKE 1</b>. Os valores de câmera vêm preenchidos do último take registrado no projeto.</Empty>
        )}
        <div className="grid grid-cols-1 gap-3" data-testid="takes">
          {takes?.map((t) => (t.id === openId ? (
            <TakeCard key={t.id} take={t} canEdit={canEdit}
              onPick={(field) => setPicker({ take: t, field })}
              onText={(field) => setText({ take: t, field })}
              onStatus={(s) => { vibrate(); setField(t, 'status', t.status === s ? null : s) }}
              onMenu={() => setEditTake(t)} />
          ) : (
            <TakeRow key={t.id} take={t} onClick={() => setOpenId(t.id)}
              onStatus={canEdit ? (s) => { vibrate(); setField(t, 'status', t.status === s ? null : s) } : null} />
          )))}
        </div>
      </main>

      {canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-xl bg-gradient-to-t from-bg via-bg to-transparent px-3 pt-6 pb-bar">
          <Btn full size="lg" className="min-h-18 text-2xl" onClick={addTake} data-testid="add-take"><IconPlus size={28} /> TAKE {nextNumber}</Btn>
        </div>
      )}

      <PickerSheet open={!!picker} onClose={() => setPicker(null)} title={pf?.label || ''} category={pf?.cat}
        multi={pf?.multi} value={picker ? picker.take[picker.field] : null}
        options={pf ? kitOptions(kit, project, pf.cat) : []} project={project} canEdit={canEdit}
        onApply={(v) => { setField(picker.take, picker.field, pf.multi ? v || [] : v); if (!pf.multi && v) notify(`${pf.label}: ${v}`) }} />

      <TextSheet state={text} onClose={() => setText(null)} takes={takes || []}
        onSave={(v) => setField(text.take, text.field, v || null)} />

      <TakeEditSheet take={editTake} onClose={() => setEditTake(null)} takes={takes || []} />
      <ShotForm open={editShot} onClose={() => setEditShot(false)} shot={shot} scene={scene} shots={shots || []} />
      <ShotForm open={newShot} onClose={() => setNewShot(false)} shot={null} scene={scene} shots={shots || []} onCreated={goShot} />
    </>
  )
}

// Anterior / próximo plano da cena sem voltar à lista; no último plano, "+ Plano"
function ShotNav({ scene, prev, next, pos, total, onGo, onNew }) {
  const side = 'flex min-h-12 min-w-0 items-center gap-1 rounded-xl border-2 border-line bg-surface2 px-2 font-display font-bold active:border-accent'
  return (
    <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2" data-testid="shot-nav">
      {prev ? (
        <button className={side} onClick={() => onGo(prev)} aria-label={`Plano anterior ${shotCode(scene, prev)}`}>
          <IconBack size={20} className="shrink-0 text-muted" /><span className="truncate">{shotCode(scene, prev)}</span>
        </button>
      ) : <div />}
      <div className="px-1 text-center font-mono text-xs text-muted">{pos} / {total}</div>
      {next ? (
        <button className={`${side} justify-end`} onClick={() => onGo(next)} aria-label={`Próximo plano ${shotCode(scene, next)}`}>
          <span className="truncate">{shotCode(scene, next)}</span><IconChevron size={20} className="shrink-0 text-muted" />
        </button>
      ) : onNew ? (
        <button className={`${side} justify-center text-accent`} onClick={onNew} data-testid="new-shot">
          <IconPlus size={20} className="shrink-0" /><span className="truncate">Plano</span>
        </button>
      ) : <div />}
    </div>
  )
}

function StatusButtons({ value, onChange, size = 'lg' }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {Object.entries(STATUS).map(([k, s]) => (
        <button key={k} disabled={!onChange} onClick={() => onChange?.(k)} data-testid={`status-${k}`}
          className={`${size === 'lg' ? 'min-h-14 text-lg' : 'min-h-10 text-xs'} rounded-xl border-2 font-mono font-medium tracking-wide ${
            value === k ? s.cls : 'border-line bg-surface2 text-muted'}`}>
          {s.label}
        </button>
      ))}
    </div>
  )
}

function Chip({ label, value, onClick, wide, disabled }) {
  const empty = value == null || value === '' || (Array.isArray(value) && !value.length)
  return (
    <button onClick={onClick} disabled={disabled}
      className={`min-h-16 rounded-xl border-2 border-line bg-surface2 px-3 py-1 text-left active:border-accent ${wide ? 'col-span-2' : ''}`}>
      <div className="text-[11px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`truncate font-mono text-xl font-medium ${empty ? 'text-muted/50' : 'text-ink'}`}>
        {empty ? '—' : Array.isArray(value) ? joinFilters(value) : value}
      </div>
    </button>
  )
}

function TakeCard({ take: t, canEdit, onPick, onText, onStatus, onMenu }) {
  const d = !canEdit
  // Take 1 costuma ter câmera nova (plano novo) — começa aberto; nos seguintes, só o resumo.
  // No tablet (md+) os campos ficam sempre abertos.
  const [open, setOpen] = useState(t.take_number === 1)
  const summary = CAMERA_FIELDS.map((f) => {
    const v = t[f]
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null
    if (f === 'filters') return joinFilters(v)
    if (f === 'iso') return `ISO ${v}`
    if (f === 'fps') return `${v}fps`
    if (f === 'camera') return `Cam ${v}`
    return v
  }).filter(Boolean)
  return (
    <Card className="border-accent p-3" data-testid="take-card">
      <div className="mb-3 flex items-center gap-2">
        <div className="font-display text-3xl font-extrabold">TAKE {t.take_number}</div>
        <div className="flex-1 font-mono text-xs text-muted">{fmtTime(t.recorded_at)} · {fmtDate(t.shoot_date)}</div>
        {canEdit && <IconBtn label="Opções do take" onClick={onMenu}><IconMore /></IconBtn>}
      </div>
      <StatusButtons value={t.status} onChange={canEdit ? onStatus : null} />
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Chip label="Cartão / Rolo" value={t.roll} onClick={() => onText('roll')} disabled={d} />
        <Chip label="Clipe" value={t.clip} onClick={() => onText('clip')} disabled={d} />
        <button onClick={() => onText('notes')} disabled={d}
          className="col-span-2 block min-h-16 rounded-xl border-2 border-dashed border-line px-3 py-1 text-left">
          <div className="text-[11px] uppercase tracking-widest text-muted">Notas de pós / VFX</div>
          <div className={`whitespace-pre-wrap text-sm ${t.notes ? 'text-ink' : 'text-muted/50'}`}>{t.notes || 'Tocar para anotar'}</div>
        </button>
      </div>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="camera-toggle"
        className="mt-2 flex min-h-14 w-full items-center gap-2 rounded-xl border-2 border-line bg-surface2 px-3 py-1 text-left md:hidden">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-widest text-muted">Câmera</div>
          {!open && <div className={`font-mono text-sm leading-snug ${summary.length ? 'text-ink' : 'text-muted/50'}`}>{summary.join(' · ') || '—'}</div>}
        </div>
        <span className="shrink-0 font-display text-xs font-bold uppercase text-accent">{open ? 'Recolher' : 'Editar'}</span>
        <IconChevron size={20} className={`shrink-0 text-accent transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      <div className={`mt-2 grid-cols-2 gap-2 md:grid md:grid-cols-4 ${open ? 'grid' : 'hidden'}`} data-testid="camera-fields">
        <Chip label="Cam" value={t.camera} onClick={() => onPick('camera')} disabled={d} />
        <Chip label="Lente" value={t.lens} onClick={() => onPick('lens')} disabled={d} />
        <Chip label="T-Stop" value={t.t_stop} onClick={() => onPick('t_stop')} disabled={d} />
        <Chip label="Foco" value={t.focus} onClick={() => onPick('focus')} disabled={d} />
        <Chip label="Filtros" value={t.filters} onClick={() => onPick('filters')} wide disabled={d} />
        <Chip label="ISO" value={t.iso} onClick={() => onPick('iso')} disabled={d} />
        <Chip label="Shutter" value={t.shutter} onClick={() => onPick('shutter')} disabled={d} />
        <Chip label="FPS" value={t.fps} onClick={() => onPick('fps')} disabled={d} />
        <Chip label="WB" value={t.wb} onClick={() => onPick('wb')} disabled={d} />
      </div>
    </Card>
  )
}

function TakeRow({ take: t, onClick, onStatus }) {
  const s = t.status && STATUS[t.status]
  return (
    <Card className="flex items-center gap-2 p-2">
      <button onClick={onClick} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-2 text-left">
        <div className="w-12 font-display text-2xl font-extrabold">T{t.take_number}</div>
        <div className="min-w-0 flex-1 truncate font-mono text-sm text-muted">
          {[t.lens, t.t_stop, joinFilters(t.filters), t.fps && `${t.fps}fps`].filter(Boolean).join(' · ') || '—'}
          {t.notes ? ' · ✎' : ''}
        </div>
      </button>
      {onStatus ? (
        <button onClick={() => onStatus(t.status === 'good' ? 'ng' : t.status === 'ng' ? 'check' : t.status === 'check' ? null : 'good')}
          className={`min-h-11 w-20 shrink-0 rounded-lg border-2 font-mono text-xs font-medium ${s ? s.cls : 'border-line text-muted'}`}>
          {s ? s.label : 'STATUS'}
        </button>
      ) : s && <span className={`rounded-lg border-2 px-2 py-1 font-mono text-xs font-medium ${s.cls}`}>{s.label}</span>}
    </Card>
  )
}

const TEXT_FIELDS = {
  roll: { title: 'Cartão / Rolo', placeholder: 'A001' },
  clip: { title: 'Clipe', placeholder: 'A001C003' },
  notes: { title: 'Notas de pós / VFX', placeholder: 'Ex: tracking markers no fundo, flare no final…', multiline: true },
}
const NOTE_TAGS = ['VFX', 'Tracking', 'Clean plate', 'Flare', 'Foco suave', 'Boom no quadro', 'Reflexo', 'Som ruim', 'Pickup', 'Wild track']

function TextSheet({ state, onClose, onSave, takes }) {
  const [v, setV] = useState('')
  const field = state?.field
  const cfg = field ? TEXT_FIELDS[field] : null
  useEffect(() => { if (state) setV(state.take[state.field] || '') }, [state])
  if (!state) return null

  // sugestões rápidas para não precisar digitar
  const quick = []
  if (field === 'roll') {
    const prev = takes.map((t) => t.roll).filter(Boolean)
    const cur = state.take.roll || prev[0]
    if (cur) quick.push(cur, incrCode(cur))
  }
  if (field === 'clip') {
    const others = takes.filter((t) => t.id !== state.take.id && t.clip).sort((a, b) => b.take_number - a.take_number)
    if (others[0]) quick.push(incrCode(others[0].clip))
    else if (state.take.roll) quick.push(`${state.take.roll}C001`)
  }

  const save = (val = v) => { onSave(val.trim()); onClose() }

  return (
    <Sheet open onClose={onClose} title={cfg.title}
      footer={<Btn full size="lg" onClick={() => save()}>Salvar</Btn>}>
      {quick.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {[...new Set(quick)].map((q) => (
            <button key={q} onClick={() => save(q)} className="min-h-14 rounded-xl border-2 border-line bg-surface2 font-mono text-lg">{q}</button>
          ))}
        </div>
      )}
      {field === 'notes' && (
        <div className="mb-3 flex flex-wrap gap-2">
          {NOTE_TAGS.map((tag) => (
            <button key={tag} onClick={() => setV((s) => (s ? `${s.trim()} · ${tag}` : tag))}
              className="min-h-10 rounded-lg border-2 border-line bg-surface2 px-3 text-sm">{tag}</button>
          ))}
        </div>
      )}
      {cfg.multiline
        ? <TextArea rows={4} value={v} onChange={(e) => setV(e.target.value)} placeholder={cfg.placeholder} autoFocus />
        : <TextInput value={v} onChange={(e) => setV(e.target.value.toUpperCase())} placeholder={cfg.placeholder}
            onKeyDown={(e) => e.key === 'Enter' && save()} autoCapitalize="characters" />}
    </Sheet>
  )
}

function TakeEditSheet({ take, onClose, takes }) {
  const { confirm, notify } = useDialog()
  const [num, setNum] = useState('')
  const [date, setDate] = useState('')
  useEffect(() => { if (take) { setNum(String(take.take_number)); setDate(take.shoot_date) } }, [take])
  if (!take) return null
  const save = async () => {
    const n = parseInt(num, 10)
    if (!(n > 0)) return notify('Número inválido', 'error')
    if (takes.some((t) => t.take_number === n && t.id !== take.id)) return notify(`Já existe o take ${n}`, 'error')
    await update('takes', take.id, { take_number: n, shoot_date: date || take.shoot_date })
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={`Take ${take.take_number}`}
      footer={<Btn full size="lg" onClick={save}>Salvar</Btn>}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Nº do take" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} />
          <TextInput label="Diária" type="date" value={date || ''} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Btn variant="ghost" className="text-ng" onClick={async () => {
          if (await confirm({ title: 'Excluir take', danger: true, confirmLabel: 'Excluir', message: `Excluir o take ${take.take_number}?` })) {
            await deleteTake(take.id); notify('Take excluído'); onClose()
          }
        }}><IconTrash /> Excluir take</Btn>
      </div>
    </Sheet>
  )
}

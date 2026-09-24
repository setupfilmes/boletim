import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { TopBar, Btn, Empty, Card, Sheet, TextInput, TextArea, IconBtn, useDialog } from '../components/ui'
import { IconPlus, IconMore, IconEdit, IconTrash, IconBack, IconChevron, IconX } from '../components/icons'
import PickerSheet from '../components/PickerSheet'
import { useProject, useScene, useShot, useTakesByShot, useKit, useRole, kitOptions, useShots } from '../lib/hooks'
import { createNextTake, addCameraToTake, deleteTakes, update } from '../lib/repo'
import { groupTakes, isMulticam, projectCameras, cameraOrder } from '../lib/cameras'
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

const nextStatus = (s) => (s === 'good' ? 'ng' : s === 'ng' ? 'check' : s === 'check' ? null : 'good')

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
  const [openNum, setOpenNum] = useState(null)
  const [cam, setCam] = useState(null) // câmera selecionada nas abas (multicâmera)
  const [picker, setPicker] = useState(null) // { take, field }
  const [text, setText] = useState(null) // { take, field }
  const [editGroup, setEditGroup] = useState(null)
  const [editShot, setEditShot] = useState(false)
  const [newShot, setNewShot] = useState(false)
  const nav = useNavigate()

  // Cada grupo = um take da claquete; no multicâmera tem uma linha por câmera
  const groups = useMemo(() => groupTakes(takes, project), [takes, project])
  const multi = isMulticam(project)
  const cams = projectCameras(project).map((c) => c.id)
  const camSel = cam ?? cams[0] ?? null

  const latestNum = groups[0]?.number
  useEffect(() => { setOpenNum(latestNum ?? null) }, [latestNum])

  if (shot === undefined || scene === undefined) return null
  if (!shot || shot.deleted) return (<><TopBar title="Plano" back={`/p/${projectId}/s/${sceneId}`} /><Empty title="Plano não encontrado" /></>)

  const nextNumber = groups.length ? groups[0].number + 1 : 1
  const shotLabel = shotCode(scene, shot)
  const idx = shots ? shots.findIndex((s) => s.id === shot.id) : -1
  const prev = idx > 0 ? shots[idx - 1] : null
  const next = idx >= 0 ? shots[idx + 1] : null
  const goShot = (s) => nav(`/p/${projectId}/s/${sceneId}/sh/${s.id}`, { replace: true })

  const addTake = async () => {
    vibrate(25)
    const rows = await createNextTake(shot, project)
    setOpenNum(rows[0].take_number)
    if (multi && !rows.some((r) => r.camera === camSel)) setCam(rows[0].camera)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const setField = (take, field, value) => update('takes', take.id, { [field]: value })
  const setStatus = (take, st) => { vibrate(); setField(take, 'status', take.status === st ? null : st) }

  const pf = picker && PICK_FIELDS[picker.field]
  // sugestões de cartão/clipe olham só a mesma câmera
  const textTakes = (takes || []).filter((t) => !multi || !text || (t.camera || null) === (text.take.camera || null))

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
          <Empty title="Nenhum take">
            Toque em <b>+ TAKE 1</b>.{multi ? ` O take é criado para as câmeras ${cams.join(', ')} — cada uma com seus valores e status.` : ''} Os
            valores de câmera vêm preenchidos do último take registrado no projeto.
          </Empty>
        )}
        <div className="grid grid-cols-1 gap-3" data-testid="takes">
          {groups.map((g) => {
            if (g.number !== openNum) {
              return (
                <TakeRow key={g.number} group={g} multi={multi} onClick={() => setOpenNum(g.number)}
                  onStatus={canEdit ? (t) => { vibrate(); setField(t, 'status', nextStatus(t.status)) } : null} />
              )
            }
            const t = g.rows.find((r) => r.camera === camSel) || g.rows[0]
            return (
              <TakeCard key={g.number} group={g} take={t} multi={multi} cams={cams} project={project} canEdit={canEdit}
                onCam={(c) => { vibrate(); setCam(c) }}
                onAddCam={async (c) => { vibrate(); await addCameraToTake(shot, g, c); setCam(c); notify(`Câmera ${c} incluída no take ${g.number}`) }}
                onPick={(field) => setPicker({ take: t, field })}
                onText={(field) => setText({ take: t, field })}
                onStatus={(st) => setStatus(t, st)}
                onMenu={() => setEditGroup(g)} />
            )
          })}
        </div>
      </main>

      {canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-xl bg-gradient-to-t from-bg via-bg to-transparent px-3 pt-6 pb-bar">
          <Btn full size="lg" className="min-h-18 text-2xl" onClick={addTake} data-testid="add-take"><IconPlus size={28} /> TAKE {nextNumber}</Btn>
        </div>
      )}

      <PickerSheet open={!!picker} onClose={() => setPicker(null)}
        title={pf ? `${pf.label}${multi && picker.take.camera ? ` — Cam ${picker.take.camera}` : ''}` : ''} category={pf?.cat}
        multi={pf?.multi} value={picker ? picker.take[picker.field] : null}
        options={pf ? kitOptions(kit, project, pf.cat) : []} project={project} canEdit={canEdit}
        onApply={(v) => { setField(picker.take, picker.field, pf.multi ? v || [] : v); if (!pf.multi && v) notify(`${pf.label}: ${v}`) }} />

      <TextSheet state={text} onClose={() => setText(null)} takes={textTakes}
        title={text && multi && text.take.camera ? ` — Cam ${text.take.camera}` : ''}
        onSave={(v) => setField(text.take, text.field, v || null)} />

      <TakeEditSheet group={editGroup} onClose={() => setEditGroup(null)} groups={groups} />
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

// Abas das câmeras do take: câmera que rodou mostra o status; câmera do projeto que não está no take vira "+ B"
function CameraTabs({ group, take, cams, project, canEdit, onCam, onAddCam }) {
  const ids = [...new Set([...cams, ...group.rows.map((r) => r.camera)])].sort(cameraOrder(project))
  return (
    <div className="mb-3 flex gap-2" data-testid="camera-tabs">
      {ids.map((c) => {
        const row = group.rows.find((r) => r.camera === c)
        if (!row) {
          return canEdit && cams.includes(c) ? (
            <button key={c ?? '-'} onClick={() => onAddCam(c)} aria-label={`Incluir câmera ${c} neste take`}
              className="flex min-h-14 min-w-14 flex-1 items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line font-display font-bold text-muted">
              <IconPlus size={18} />{c}
            </button>
          ) : null
        }
        const st = row.status && STATUS[row.status]
        const on = row.id === take.id
        return (
          <button key={c ?? '-'} onClick={() => onCam(c)} aria-pressed={on} data-testid={`cam-${c}`}
            className={`flex min-h-14 min-w-14 flex-1 flex-col items-center justify-center rounded-xl border-2 ${
              on ? 'border-accent bg-surface2' : 'border-line bg-bg'}`}>
            <span className={`font-display text-xl font-extrabold leading-none ${on ? 'text-accent' : 'text-ink'}`}>{c || '—'}</span>
            <span className={`mt-1 rounded px-1 font-mono text-[10px] font-medium leading-tight ${st ? st.cls : 'text-muted'}`}>{st ? st.label : '—'}</span>
          </button>
        )
      })}
    </div>
  )
}

function TakeCard({ group, take: t, multi, cams, project, canEdit, onCam, onAddCam, onPick, onText, onStatus, onMenu }) {
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
    if (f === 'camera') return multi ? null : `Cam ${v}`
    return v
  }).filter(Boolean)
  return (
    <Card className="border-accent p-3" data-testid="take-card">
      <div className="mb-3 flex items-center gap-2">
        <div className="font-display text-3xl font-extrabold">TAKE {t.take_number}</div>
        <div className="min-w-0 flex-1 font-mono text-xs text-muted">
          {fmtTime(t.recorded_at)} · {fmtDate(t.shoot_date)}
          {group.rows.length > 1 && <span className="ml-1 rounded border border-accent px-1 text-accent">{group.rows.map((r) => r.camera).join('+')}</span>}
        </div>
        {canEdit && <IconBtn label="Opções do take" onClick={onMenu}><IconMore /></IconBtn>}
      </div>
      {(multi || group.rows.length > 1) && (
        <CameraTabs group={group} take={t} cams={cams} project={project} canEdit={canEdit} onCam={onCam} onAddCam={onAddCam} />
      )}
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
          <div className="text-[11px] uppercase tracking-widest text-muted">Câmera{multi && t.camera ? ` ${t.camera}` : ''}</div>
          {!open && <div className={`font-mono text-sm leading-snug ${summary.length ? 'text-ink' : 'text-muted/50'}`}>{summary.join(' · ') || '—'}</div>}
        </div>
        <span className="shrink-0 font-display text-xs font-bold uppercase text-accent">{open ? 'Recolher' : 'Editar'}</span>
        <IconChevron size={20} className={`shrink-0 text-accent transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      <div className={`mt-2 grid-cols-2 gap-2 md:grid md:grid-cols-4 ${open ? 'grid' : 'hidden'}`} data-testid="camera-fields">
        {!multi && <Chip label="Cam" value={t.camera} onClick={() => onPick('camera')} disabled={d} />}
        <Chip label="Lente" value={t.lens} onClick={() => onPick('lens')} disabled={d} />
        <Chip label="T-Stop" value={t.t_stop} onClick={() => onPick('t_stop')} disabled={d} />
        <Chip label="Foco" value={t.focus} onClick={() => onPick('focus')} disabled={d} />
        {multi && <Chip label="ISO" value={t.iso} onClick={() => onPick('iso')} disabled={d} />}
        <Chip label="Filtros" value={t.filters} onClick={() => onPick('filters')} wide disabled={d} />
        {!multi && <Chip label="ISO" value={t.iso} onClick={() => onPick('iso')} disabled={d} />}
        <Chip label="Shutter" value={t.shutter} onClick={() => onPick('shutter')} disabled={d} />
        <Chip label="FPS" value={t.fps} onClick={() => onPick('fps')} disabled={d} />
        <Chip label="WB" value={t.wb} onClick={() => onPick('wb')} disabled={d} />
      </div>
    </Card>
  )
}

// Take fechado. 1 câmera: resumo + botão de status (toque alterna GOOD → NG → CHECK → vazio).
// Multicâmera: um botão de status por câmera.
function TakeRow({ group, multi, onClick, onStatus }) {
  const t = group.rows[0]
  const StatusBtn = ({ row, label }) => {
    const s = row.status && STATUS[row.status]
    const cls = s ? s.cls : 'border-line text-muted'
    const body = label
      ? <><span className="font-display text-sm font-extrabold leading-none">{label}</span><span className="text-[10px] leading-tight">{s ? s.label : '—'}</span></>
      : (s ? s.label : 'STATUS')
    const size = label ? 'w-14 flex flex-col items-center justify-center' : 'w-20'
    return onStatus ? (
      <button onClick={() => onStatus(row)} aria-label={label ? `Status da câmera ${label}` : 'Status'}
        className={`min-h-11 shrink-0 rounded-lg border-2 font-mono text-xs font-medium ${size} ${cls}`}>{body}</button>
    ) : (s || label) ? <span className={`min-h-11 shrink-0 rounded-lg border-2 font-mono text-xs font-medium ${size} ${cls}`}>{body}</span> : null
  }
  const many = multi || group.rows.length > 1
  return (
    <Card className="flex items-center gap-2 p-2">
      <button onClick={onClick} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-2 text-left">
        <div className="w-12 shrink-0 font-display text-2xl font-extrabold">T{group.number}</div>
        <div className="min-w-0 flex-1 truncate font-mono text-sm text-muted">
          {many ? '' : [t.lens, t.t_stop, joinFilters(t.filters), t.fps && `${t.fps}fps`].filter(Boolean).join(' · ') || '—'}
          {group.rows.some((r) => r.notes) ? (many ? '✎' : ' · ✎') : ''}
        </div>
      </button>
      {many
        ? group.rows.map((r) => <StatusBtn key={r.id} row={r} label={r.camera || '—'} />)
        : <StatusBtn row={t} />}
    </Card>
  )
}

const TEXT_FIELDS = {
  roll: { title: 'Cartão / Rolo', placeholder: 'A001' },
  clip: { title: 'Clipe', placeholder: 'A001C003' },
  notes: { title: 'Notas de pós / VFX', placeholder: 'Ex: tracking markers no fundo, flare no final…', multiline: true },
}
const NOTE_TAGS = ['VFX', 'Tracking', 'Clean plate', 'Flare', 'Foco suave', 'Boom no quadro', 'Reflexo', 'Som ruim', 'Pickup', 'Wild track']

function TextSheet({ state, onClose, onSave, takes, title = '' }) {
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
    <Sheet open onClose={onClose} title={`${cfg.title}${title}`}
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

// Opções do take: número e diária valem para todas as câmeras do take
function TakeEditSheet({ group, onClose, groups }) {
  const { confirm, notify } = useDialog()
  const [num, setNum] = useState('')
  const [date, setDate] = useState('')
  useEffect(() => { if (group) { setNum(String(group.number)); setDate(group.rows[0].shoot_date) } }, [group])
  if (!group) return null
  const ids = group.rows.map((r) => r.id)
  const save = async () => {
    const n = parseInt(num, 10)
    if (!(n > 0)) return notify('Número inválido', 'error')
    if (groups.some((g) => g.number === n && g !== group)) return notify(`Já existe o take ${n}`, 'error')
    for (const r of group.rows) await update('takes', r.id, { take_number: n, shoot_date: date || r.shoot_date })
    onClose()
  }
  const many = group.rows.length > 1
  return (
    <Sheet open onClose={onClose} title={`Take ${group.number}`}
      footer={<Btn full size="lg" onClick={save}>Salvar</Btn>}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Nº do take" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} />
          <TextInput label="Diária" type="date" value={date || ''} onChange={(e) => setDate(e.target.value)} />
        </div>
        {many && group.rows.map((r) => (
          <Btn key={r.id} variant="ghost" onClick={async () => {
            if (await confirm({ title: `Remover câmera ${r.camera}`, danger: true, confirmLabel: 'Remover',
              message: `A câmera ${r.camera} não rodou no take ${group.number}? Os dados dela neste take serão apagados.` })) {
              await deleteTakes([r.id]); notify(`Câmera ${r.camera} removida do take`); onClose()
            }
          }}><IconX /> Câmera {r.camera} não rodou</Btn>
        ))}
        <Btn variant="ghost" className="text-ng" onClick={async () => {
          if (await confirm({ title: 'Excluir take', danger: true, confirmLabel: 'Excluir',
            message: `Excluir o take ${group.number}${many ? ` de todas as câmeras (${group.rows.map((r) => r.camera).join(', ')})` : ''}?` })) {
            await deleteTakes(ids); notify('Take excluído'); onClose()
          }
        }}><IconTrash /> Excluir take{many ? ' (todas as câmeras)' : ''}</Btn>
      </div>
    </Sheet>
  )
}

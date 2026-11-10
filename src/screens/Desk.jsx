import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useDialog } from '../components/ui'
import { Button, CenaCard, Tag, Icon, TakeNumber, StatusBadge, CameraBadge, EmptyState } from '../ds/components'
import SyncBadge from '../components/SyncBadge'
import TakePhotos from '../components/TakePhotos'
import ThemePicker from '../components/ThemePicker'
import { useScenes, useShotsByProject, useTakesByProject } from '../lib/hooks'
import { useDays, dayLabel } from '../lib/days'
import { useTakePhotos } from '../lib/photos'
import { update, updateExtra } from '../lib/repo'
import { groupTakes, isMulticam, linkedShots, shotLabel } from '../lib/cameras'
import { statsByScene, sceneCardProps } from '../lib/stats'
import { MARKS } from '../lib/fields'
import { buildPdf, buildCsv, buildDitCsv, buildAle, shareFile, downloadFile } from '../lib/export'
import { fmtDate, fmtTime, todayISO, plural, joinFilters, nowISO } from '../lib/util'
import { weekday, DayForm } from './Day'
import { SceneForm } from './Project'
import { ShotForm } from './Scene'
import Reports from './Reports'

// Computador (≥ 1024 px): a mesma hierarquia lado a lado — lateral (projeto, navegação, diárias) · cenas da diária ·
// plano selecionado com a tabela de takes editável célula a célula (Enter edita/salva, Tab avança, Esc cancela).
// No computador o foco é revisar e arrumar; gravar no set continua pelo celular (botão Gravar abre o registro).
const UP = { good: 'GOOD', ng: 'NG', check: 'CHECK' }

export default function Desk({ project, canEdit, role }) {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const days = useDays(project.id)
  const scenes = useScenes(project.id)
  const shots = useShotsByProject(project.id)
  const takes = useTakesByProject(project.id)
  const { confirm } = useDialog()
  const [dayForm, setDayForm] = useState(false)
  const [sceneForm, setSceneForm] = useState(null)
  const [shotForm, setShotForm] = useState(null)

  const view = params.get('ver') || 'dia' // dia | roteiro | relatorios
  const today = todayISO()
  const day = (days || []).find((d) => d.id === params.get('dia')) || (days || []).find((d) => d.date === today)
    || [...(days || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null
  const sceneById = useMemo(() => Object.fromEntries((scenes || []).map((s) => [s.id, s])), [scenes])
  const colScenes = view === 'roteiro' ? scenes || [] : (day?.scenes || []).map((x) => sceneById[x.scene_id]).filter(Boolean)
  const scene = sceneById[params.get('cena')] || colScenes[0] || null
  const sceneShots = (shots || []).filter((s) => s.scene_id === scene?.id).sort((a, b) => String(a.code).localeCompare(String(b.code), 'pt-BR', { numeric: true }))
  const shot = sceneShots.find((s) => s.id === params.get('plano')) || sceneShots[0] || null
  const stats = useMemo(() => statsByScene(takes, shots, view === 'roteiro' ? null : day?.date), [takes, shots, view, day?.date])

  const go = (patch) => {
    const next = { ver: view, ...(day ? { dia: day.id } : {}), ...(scene ? { cena: scene.id } : {}), ...(shot ? { plano: shot.id } : {}), ...patch }
    for (const k of Object.keys(next)) if (next[k] == null) delete next[k]
    setParams(next, { replace: true })
  }

  const navItem = (id, icon, label, onClick, on) => (
    <button type="button" onClick={onClick} aria-current={on ? 'page' : undefined}
      className={`flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[17px] font-bold ${on ? 'bg-accent text-accent-ink' : 'text-ink hover:bg-surface2'}`}>
      <Icon name={icon} size={22} />{label}
    </button>
  )

  return (
    <div className="grid h-dvh grid-cols-[232px_344px_minmax(0,1fr)] overflow-hidden bg-bg" data-testid="desk">
      {/* Lateral */}
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-r-2 border-line bg-surface p-3">
        <button type="button" onClick={() => nav('/')} className="flex items-center gap-1 text-[13px] font-bold uppercase tracking-[.07em] text-muted hover:text-ink">
          <Icon name="chevron-left" size={18} /> Projetos
        </button>
        <div>
          <div className="text-[13px] font-bold uppercase tracking-[.07em] text-muted">{project.production_type || 'Projeto'}</div>
          <div className="text-xl font-extrabold leading-[26px]">{project.title}</div>
        </div>
        <div className="desk-sync min-w-0"><SyncBadge compact={false} /></div>
        <nav className="grid gap-1" aria-label="Navegação do projeto">
          {navItem('hoje', 'clapperboard', 'Hoje', () => { const d = (days || []).find((x) => x.date === today); go({ ver: 'dia', dia: d?.id || null, cena: null, plano: null }) }, view === 'dia' && day?.date === today)}
          {navItem('dia', 'calendar-days', 'Diárias', () => go({ ver: 'dia' }), view === 'dia' && day?.date !== today)}
          {navItem('roteiro', 'list', 'Roteiro', () => go({ ver: 'roteiro', cena: null, plano: null }), view === 'roteiro')}
          {navItem('relatorios', 'file-text', 'Relatórios', () => go({ ver: 'relatorios' }), view === 'relatorios')}
          {navItem('equipe', 'users', 'Equipe', () => nav(`/p/${project.id}/equipe`), false)}
          {navItem('ficha', 'settings', 'Ficha técnica', () => nav(`/p/${project.id}/ficha`), false)}
        </nav>
        <div className="mt-2 text-[13px] font-bold uppercase tracking-[.07em] text-muted">Diárias</div>
        <div className="grid gap-1" data-testid="desk-days">
          {[...(days || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((d) => (
            <button key={d.id} type="button" onClick={() => go({ ver: 'dia', dia: d.id, cena: null, plano: null })}
              className={`flex min-h-12 items-center gap-2 rounded-[10px] border-2 px-3 text-left ${view === 'dia' && day?.id === d.id ? 'border-ink border-[3px]' : 'border-line'}`}>
              <span className="font-mono text-xl font-bold">{String(d.number).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1 text-[15px] leading-5">{fmtDate(d.date)}<span className="block text-[13px] text-muted">{weekday(d.date)}</span></span>
              {d.date === today && <Tag forte>HOJE</Tag>}
            </button>
          ))}
          {canEdit && <Button size="p" icon="plus" variant="fantasma" onClick={() => setDayForm(true)}>Nova diária</Button>}
        </div>
        <div className="mt-auto pt-3"><ThemePicker /></div>
      </aside>

      {/* Cenas */}
      <section className="flex min-h-0 flex-col overflow-y-auto border-r-2 border-line p-3" aria-label="Cenas">
        {view === 'relatorios' ? (
          <p className="p-2 text-[15px] text-muted">Escolha a diária e o arquivo ao lado.</p>
        ) : (
          <>
            <div className="mb-2">
              <div className="text-2xl font-bold leading-[30px]">{view === 'roteiro' ? 'Roteiro' : day ? `${dayLabel(day.number)} · ${fmtDate(day.date)}` : 'Sem diárias'}</div>
              <div className="text-[15px] text-muted">{view === 'roteiro' ? plural(colScenes.length, 'cena') : day ? `Ordem de gravação · ${plural(colScenes.length, 'cena')}` : ''}</div>
            </div>
            <div className="grid gap-2" data-testid="desk-scenes">
              {colScenes.map((s, i) => {
                const st = stats[s.id]
                return (
                  <div key={s.id} className={scene?.id === s.id ? 'rounded-2xl outline outline-[3px] outline-ink' : ''}>
                    <CenaCard {...sceneCardProps(s)} arrastavel={view !== 'roteiro'} ordem={i + 1} naoGravada={!st}
                      planos={st?.planos || 0} takes={st?.takes || 0} circulados={st?.circulados || 0}
                      onPress={() => go({ cena: s.id, plano: null })} />
                  </div>
                )
              })}
              {colScenes.length === 0 && <p className="py-6 text-center text-[15px] text-muted">{view === 'roteiro' ? 'Roteiro vazio.' : 'Nenhuma cena nesta diária.'}</p>}
            </div>
            {canEdit && <div className="mt-3"><Button block icon="plus" onClick={() => setSceneForm('new')}>Cena</Button></div>}
          </>
        )}
      </section>

      {/* Trabalho */}
      <main className="min-h-0 overflow-y-auto p-5">
        {view === 'relatorios' ? (
          <div className="mx-auto max-w-3xl"><h1 className="mb-4 text-2xl font-bold">Relatórios</h1><Reports project={project} /></div>
        ) : !scene ? (
          <EmptyState icon="film" title="Escolha uma cena">As cenas da diária estão na coluna do meio.</EmptyState>
        ) : (
          <SceneWork project={project} scene={scene} shots={sceneShots} shot={shot} day={view === 'roteiro' ? null : day} takes={takes}
            canEdit={canEdit} onShot={(s) => go({ plano: s.id })} onEditScene={() => setSceneForm(scene)}
            onEditShot={(s) => setShotForm(s)} onNewShot={() => setShotForm('new')}
            onRecord={(s) => nav(`/p/${project.id}/s/${scene.id}/sh/${s.id}${view !== 'roteiro' && day ? `?dia=${day.id}` : ''}`)} />
        )}
      </main>

      <DayForm open={dayForm} onClose={() => setDayForm(false)} project={project} days={days || []} confirm={confirm}
        onCreated={(d) => go({ ver: 'dia', dia: d.id, cena: null, plano: null })} />
      <SceneForm open={!!sceneForm} scene={sceneForm === 'new' ? null : sceneForm} project={project} scenes={scenes}
        onClose={() => setSceneForm(null)} onCreated={(s) => go({ cena: s.id, plano: null })} onDeleted={() => go({ cena: null, plano: null })} />
      {scene && <ShotForm open={!!shotForm} shot={shotForm === 'new' ? null : shotForm} scene={scene} shots={sceneShots} project={project}
        onClose={() => setShotForm(null)} onCreated={(s) => go({ plano: s.id })} />}
    </div>
  )
}

function SceneWork({ project, scene, shots, shot, day, takes, canEdit, onShot, onEditScene, onEditShot, onNewShot, onRecord }) {
  const { notify } = useDialog()
  const [busy, setBusy] = useState(null)
  const [allDays, setAllDays] = useState(false)
  const linked = shot ? linkedShots(shot, shots) : []
  const ids = new Set(linked.map((s) => s.id))
  const shotTakes = (takes || []).filter((t) => ids.has(t.shot_id))
  const visible = day && !allDays ? shotTakes.filter((t) => t.shoot_date === day.date) : shotTakes
  const photos = useTakePhotos(shotTakes.map((t) => t.id))
  const next = shotTakes.reduce((m, t) => Math.max(m, t.take_number), 0) + 1

  const file = async (key, fn, mode) => {
    setBusy(key)
    try {
      const f = await fn(project.id, day?.date || null)
      if (mode === 'share') { const r = await shareFile(f); if (r === 'downloaded') notify('Arquivo salvo em Downloads') } else { downloadFile(f); notify('Arquivo salvo em Downloads') }
    } catch (e) { notify(`Erro ao gerar: ${e.message}`, 'error') } finally { setBusy(null) }
  }

  return (
    <div className="grid gap-4">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-3xl font-extrabold">Cena {scene.number}</span>
            {scene.int_ext && <Tag>{scene.int_ext}</Tag>}
            {scene.period && <Tag icon={scene.period === 'NOITE' ? 'moon' : 'sun'}>{scene.period}</Tag>}
          </div>
          {(scene.location || scene.description) && <div className="text-[17px] text-muted">{[scene.location, scene.description].filter(Boolean).join(' — ')}</div>}
        </div>
        {canEdit && <Button size="p" icon="pencil" onClick={onEditScene}>Editar cena</Button>}
        </div>
        <div className="flex flex-wrap gap-2">
        <Button size="p" variant="primario" icon="file-text" disabled={!!busy} onClick={() => file('pdf', buildPdf, 'download')}>{busy === 'pdf' ? 'Gerando…' : 'Gerar boletim'}</Button>
        <Button size="p" icon="file-spreadsheet" disabled={!!busy} onClick={() => file('csv', buildCsv, 'download')}>Planilha</Button>
        <Button size="p" disabled={!!busy} onClick={() => file('dit', buildDitCsv, 'download')}>CSV DIT</Button>
        <Button size="p" disabled={!!busy} onClick={() => file('ale', buildAle, 'download')}>ALE</Button>
        <span className="self-center text-[13px] text-muted">{day ? `Arquivos do ${dayLabel(day.number)}` : 'Arquivos do projeto todo'}</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Planos">
        {shots.map((s) => {
          const on = shot?.id === s.id
          return (
            <button key={s.id} type="button" role="tab" aria-selected={on} onClick={() => onShot(s)}
              className={`min-h-12 rounded-[10px] border-2 px-4 font-mono text-lg font-bold ${on ? 'border-accent bg-accent text-accent-ink' : 'border-borda bg-surface'}`}>
              {shotLabel(scene, s)}{s.shot_type ? <span className="ml-2 font-sans text-[13px]">{s.shot_type}</span> : null}
            </button>
          )
        })}
        {canEdit && <Button size="p" variant="fantasma" icon="plus" onClick={onNewShot}>Plano</Button>}
      </div>

      {!shot ? (
        <EmptyState icon="film" title="Nenhum plano ainda">Crie o primeiro plano desta cena.</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold">Plano {shotLabel(scene, shot)}</span>
            {shot.description && <span className="text-muted">— {shot.description}</span>}
            {linked.length > 1 && <Tag>roda com {linked.filter((s) => s.id !== shot.id).map((s) => shotLabel(scene, s)).join(', ')}</Tag>}
            <span className="flex-1" />
            {day && shotTakes.length !== visible.length && <Button size="p" variant="fantasma" onClick={() => setAllDays(true)}>Ver takes de outras diárias</Button>}
            {canEdit && <Button size="p" icon="pencil" variant="fantasma" onClick={() => onEditShot(shot)}>Editar plano</Button>}
            {canEdit && <Button size="p" icon="clapperboard" onClick={() => onRecord(shot)}>Gravar {next}</Button>}
          </div>
          <TakesTable project={project} scene={scene} shots={shots} takes={visible} canEdit={canEdit} photos={photos} />
          {photos.length > 0 && (
            <section>
              <h2 className="mb-2 text-xl font-bold">Fotos de referência</h2>
              <div className="grid gap-3 xl:grid-cols-2">
                {groupTakes(shotTakes, project).flatMap((g) => g.rows).filter((r) => photos.some((p) => p.take_id === r.id)).map((r) => (
                  <div key={r.id} className="rounded-2xl border-2 border-line bg-surface p-3">
                    <div className="text-[13px] font-bold uppercase tracking-[.07em] text-muted">Take {r.take_number}{r.camera ? ` · câmera ${r.camera}` : ''}</div>
                    <TakePhotos take={r} photos={photos.filter((p) => p.take_id === r.id)} canEdit={false}
                      caption={`Plano ${shotLabel(scene, shots.find((x) => x.id === r.shot_id) || shot)} · Take ${r.take_number}`} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

// Tabela de takes: célula a célula. Enter (ou clique) edita; Enter salva e desce; Tab salva e vai para a direita; Esc cancela.
const COLS = [
  { k: 'status', label: 'Status', w: 'min-w-32', kind: 'status' },
  { k: 'circled', label: '★', w: 'w-12', kind: 'circle' },
  { k: 'roll', label: 'Rolo', w: 'w-20' },
  { k: 'clip', label: 'Clipe', w: 'w-28' },
  { k: 'lens', label: 'Lente', w: 'w-24' },
  { k: 't_stop', label: 'T-Stop', w: 'w-20' },
  { k: 'focus', label: 'Foco', w: 'w-20' },
  { k: 'filters', label: 'Filtros', w: 'w-32', kind: 'list' },
  { k: 'iso', label: 'ISO', w: 'w-16' },
  { k: 'shutter', label: 'Shutter', w: 'w-20' },
  { k: 'fps', label: 'FPS', w: 'w-16' },
  { k: 'wb', label: 'WB', w: 'w-20' },
  { k: 'sound', label: 'Som', w: 'w-16', kind: 'sound' },
  { k: 'marks', label: 'Claq.', w: 'w-24', kind: 'marks' },
  { k: 'notes', label: 'Nota', w: 'min-w-48' },
]
const markCode = (k) => MARKS.find((m) => m.key === k)?.code || k
const markKey = (c) => MARKS.find((m) => m.code === c.toUpperCase())?.key || null

function TakesTable({ project, scene, shots, takes, canEdit, photos }) {
  const multi = isMulticam(project)
  const rows = groupTakes(takes, project).slice().reverse().flatMap((g) => g.rows)
  const [edit, setEdit] = useState(null) // { id, k }
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  const moving = useRef(false) // Enter/Tab já salvaram: o blur da célula antiga não salva de novo
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select?.() }, [edit])
  const editable = COLS.filter((c) => !['circle', 'sound'].includes(c.kind))
  const text = (r, c) => {
    const v = r[c.k]
    if (c.kind === 'list') return joinFilters(v)
    if (c.kind === 'marks') return (v || []).map(markCode).join(' ')
    if (c.kind === 'status') return UP[v] || ''
    return v ?? ''
  }
  const parse = (c, s) => {
    const t = s.trim()
    if (c.kind === 'list') return t ? t.split('+').map((x) => x.trim()).filter(Boolean) : []
    if (c.kind === 'marks') { const ks = t.split(/[\s,]+/).map(markKey).filter(Boolean); return ks.length ? ks : null }
    if (c.kind === 'status') return { GOOD: 'good', NG: 'ng', CHECK: 'check', G: 'good', N: 'ng', C: 'check' }[t.toUpperCase()] || null
    return t || null
  }
  const save = async (r, c, value) => {
    await update('takes', r.id, { [c.k]: value })
    await updateExtra(r.id, 'corrigido_em', nowISO()) // corrigido depois de gravado (sai no boletim com *)
  }
  const start = (r, c) => { if (!canEdit) return; setEdit({ id: r.id, k: c.k }); setDraft(String(text(r, c))) }
  const commitAnd = async (move) => {
    const r = rows.find((x) => x.id === edit.id)
    const c = COLS.find((x) => x.k === edit.k)
    if (r && String(text(r, c)) !== draft) await save(r, c, parse(c, draft))
    if (!move) return setEdit(null)
    const ri = rows.findIndex((x) => x.id === edit.id)
    const ci = editable.findIndex((x) => x.k === edit.k)
    let nr = ri, nc = ci
    if (move === 'down') nr = Math.min(rows.length - 1, ri + 1)
    if (move === 'right') { nc = ci + 1; if (nc >= editable.length) { nc = 0; nr = Math.min(rows.length - 1, ri + 1) } }
    if (move === 'left') { nc = ci - 1; if (nc < 0) { nc = editable.length - 1; nr = Math.max(0, ri - 1) } }
    const target = rows[nr]
    if (target) start(target, editable[nc]); else setEdit(null)
  }
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); moving.current = true; commitAnd('down') }
    if (e.key === 'Tab') { e.preventDefault(); moving.current = true; commitAnd(e.shiftKey ? 'left' : 'right') }
    if (e.key === 'Escape') { moving.current = true; setEdit(null) }
  }
  const onBlur = () => { if (moving.current) { moving.current = false; return } if (edit) commitAnd(null) }
  if (!rows.length) return <p className="rounded-2xl border-2 border-dashed border-line p-6 text-center text-muted">Nenhum take {canEdit ? 'ainda — use Gravar para registrar pelo celular, ou o registro abre aqui também.' : 'ainda.'}</p>
  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-line bg-surface" data-testid="takes-table">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-line text-[13px] font-bold uppercase tracking-[.05em] text-muted">
            <th className="sticky left-0 bg-surface px-3 py-2">Take</th>
            {multi && <th className="px-2 py-2">Cam</th>}
            {COLS.map((c) => <th key={c.k} className={`px-2 py-2 ${c.w}`}>{c.label}</th>)}
            <th className="px-2 py-2">Hora</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const nPhotos = photos.filter((p) => p.take_id === r.id).length
            const firstOfTake = i === 0 || rows[i - 1].take_number !== r.take_number
            return (
              <tr key={r.id} className={`border-b border-line font-mono text-[15px] ${r.take_number % 2 ? 'bg-surface' : 'bg-surface2/50'}`}>
                <td className="sticky left-0 bg-inherit px-3 py-1">{firstOfTake && <TakeNumber numero={r.take_number} circulado={!!r.circled} size="p" label={false} />}</td>
                {multi && <td className="px-2"><CameraBadge cam={r.camera || '—'} size="p" /></td>}
                {COLS.map((c) => {
                  const editing = edit?.id === r.id && edit?.k === c.k
                  if (c.kind === 'circle') {
                    return (
                      <td key={c.k} className="px-2">
                        <button type="button" disabled={!canEdit} aria-pressed={!!r.circled} aria-label={`Circular take ${r.take_number}`}
                          onClick={() => save(r, c, !r.circled)} className="flex h-10 w-10 items-center justify-center rounded-[10px] border-2 border-borda">
                          <Icon name="star" size={18} strokeWidth={2.5} style={r.circled ? { fill: 'currentColor' } : undefined} />
                        </button>
                      </td>
                    )
                  }
                  if (c.kind === 'sound') {
                    return (
                      <td key={c.k} className="px-2">
                        <button type="button" disabled={!canEdit} onClick={() => save(r, c, r.sound === 'mos' ? 'sync' : 'mos')}
                          className={`min-h-10 rounded-[10px] border-2 px-2 text-[13px] font-bold ${r.sound === 'mos' ? 'border-check-ink bg-check text-on-check' : 'border-borda'}`}>
                          {r.sound === 'mos' ? 'MOS' : 'SYNC'}
                        </button>
                      </td>
                    )
                  }
                  return (
                    <td key={c.k} className={`px-1 ${c.w}`}>
                      {editing ? (
                        c.kind === 'status' ? (
                          <select ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Status"
                            onKeyDown={onKey}
                            onBlur={onBlur} className="min-h-10 w-full rounded-[8px] border-2 border-ink bg-surface px-1 font-sans font-bold">
                            <option value="">—</option><option value="GOOD">GOOD</option><option value="NG">NG</option><option value="CHECK">CHECK</option>
                          </select>
                        ) : (
                          <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={c.label}
                            onKeyDown={onKey}
                            onBlur={onBlur} className="min-h-10 w-full min-w-16 rounded-[8px] border-2 border-ink bg-surface px-2" />
                        )
                      ) : (
                        <button type="button" onClick={() => start(r, c)} disabled={!canEdit} data-testid={`cell-${c.k}`}
                          className="flex min-h-10 w-full items-center rounded-[8px] px-1 text-left hover:bg-surface2 focus:outline-[3px] focus:outline-foco">
                          {c.kind === 'status' ? <StatusBadge status={UP[r.status] || null} compact /> : (
                            <span className={c.k === 'notes' ? 'font-sans whitespace-normal' : 'whitespace-nowrap'}>{text(r, c) || <span className="text-faint">—</span>}</span>
                          )}
                        </button>
                      )}
                    </td>
                  )
                })}
                <td className="whitespace-nowrap px-2 text-muted">{fmtTime(r.recorded_at)}{r.extra?.corrigido_em ? ' ✎' : ''}{nPhotos ? <span className="ml-2 inline-flex items-center gap-1"><Icon name="image" size={16} />{nPhotos}</span> : null}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="border-t-2 border-line px-3 py-2 font-sans text-[13px] text-muted">
        Clique numa célula (ou Enter) para editar · Enter salva e desce · Tab vai para a direita · Esc cancela · Status: digite G, N ou C · Claquete: PU SER TAIL AFS NS · Filtros separados por +
      </p>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { TopBar, Btn, Empty, Sheet, TextInput, TextArea, IconBtn, useDialog } from '../components/ui'
import { IconEdit, IconTrash, IconX } from '../components/icons'
import {
  Button, StatusPicker, StarRating, TakeNumber, SegmentToggle, MarkChips, FieldTile, CameraTabs, CameraBadge,
  TakeRow, Icon, EmptyState,
} from '../ds/components'
import PickerSheet from '../components/PickerSheet'
import TakePhotos from '../components/TakePhotos'
import ContinuityBlock from '../components/ContinuityBlock'
import { visao } from '../lib/funcao'
import { useTakePhotos } from '../lib/photos'
import { useProject, useScene, useShot, useTakesByShots, useTakesByProject, useKit, useRole, kitOptions, useShots } from '../lib/hooks'
import { createNextTake, previewNextTake, addCameraToTake, deleteTakes, update, updateExtra, planClipShift } from '../lib/repo'
import { projectFields, extraField, extraText, isEmpty, MARKS, formatTc, ratingOf, CLIP_TYPES, clipTypeLabel } from '../lib/fields'
import { groupTakes, findTake, isMulticam, projectCameras, linkedShots, shotCameras, shotLabel as labelOf } from '../lib/cameras'
import { useAuth } from '../auth'
import { fmtDate, fmtTime, joinFilters, vibrate, incrCode, todayISO, nowISO } from '../lib/util'
import { useDays, dayLabel, whenForDay } from '../lib/days'
import { ShotForm } from './Scene'
import CameraBtBar from '../components/CameraBtBar'
import * as btLink from '../lib/bmd/link'
import * as bt from '../lib/bmd/session'

// Status: no banco 'good' | 'ng' | 'check'; no design system 'GOOD' | 'NG' | 'CHECK'
const UP = { good: 'GOOD', ng: 'NG', check: 'CHECK' }
const DOWN = { GOOD: 'good', NG: 'ng', CHECK: 'check' }
const STATUS_TXT = { good: 'GOOD', ng: 'NG', check: 'CHECK' }
const markCodeOf = (k) => MARKS.find((m) => m.key === k)?.code || k
const markKeyOf = (c) => MARKS.find((m) => m.code === c)?.key || c

// Dados de câmera da grade, na ordem do design system
const BASE_FIELDS = [
  { k: 'roll', label: 'ROLO', text: true },
  { k: 'clip', label: 'CLIPE', text: true, span: 2 },
  { k: 'lens', label: 'LENTE', cat: 'lens' },
  { k: 't_stop', label: 'T-STOP', cat: 'tstop' },
  { k: 'focus', label: 'FOCO', cat: 'focus' },
  { k: 'filters', label: 'FILTROS', cat: 'filter', multi: true },
  { k: 'iso', label: 'ISO', cat: 'iso' },
  { k: 'shutter', label: 'SHUTTER', cat: 'shutter' },
  { k: 'fps', label: 'FPS', cat: 'fps' },
  { k: 'wb', label: 'WB', cat: 'wb' },
]
const show = (v) => (v == null || v === '' || (Array.isArray(v) && !v.length) ? '' : Array.isArray(v) ? joinFilters(v) : String(v))
const same = (a, b) => show(a) === show(b)

// Tela do plano. Três modos:
//  - registro (padrão, "Gravar N"): o take em andamento; GOOD/NG/CHECK e "Próximo" fixos no rodapé
//  - ?take=N: um take já gravado, para conferir e corrigir
//  - ?lista=1: todos os takes do plano
export default function Shot() {
  const { projectId, sceneId, shotId } = useParams()
  const project = useProject(projectId)
  const scene = useScene(sceneId)
  const shot = useShot(shotId)
  const shots = useShots(sceneId)
  // planos vinculados (rodam juntos, mesma claquete): a tela mostra os takes de todos eles
  const linked = useMemo(() => (shot && !shot.deleted ? linkedShots(shot, shots) : []), [shot, shots])
  const allTakes = useTakesByShots(linked.length ? linked.map((s) => s.id) : [shotId])
  const projectTakes = useTakesByProject(projectId) // valores já usados nos campos extras viram opções
  const kit = useKit()
  const { user } = useAuth()
  const canEdit = useRole(project, user?.id) !== 'viewer'
  const { notify, confirm } = useDialog()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const days = useDays(projectId)
  const day = days?.find((d) => d.id === params.get('dia')) || null
  const q = day ? `?dia=${day.id}` : ''
  const takeParam = Number(params.get('take')) || null
  const mode = takeParam ? 'take' : params.get('lista') === '1' || !canEdit ? 'lista' : 'registro'

  const groups = useMemo(() => groupTakes(allTakes, project), [allTakes, project])
  const photos = useTakePhotos((allTakes || []).map((t) => t.id))
  const multi = isMulticam(project)

  // ---- registro: rascunho do próximo take até o primeiro toque ----
  const [curNum, setCurNum] = useState(null) // número do take já criado nesta tela; null = rascunho
  const [cam, setCam] = useState(null) // câmera ativa nas abas (multicâmera)
  const [draft, setDraft] = useState(null)
  const [draftKey, setDraftKey] = useState(0)
  const [salvo, setSalvo] = useState(null)
  const creating = useRef(null)
  useEffect(() => { setCurNum(null); setSalvo(null); setCam(null) }, [shotId])
  useEffect(() => { setCam(params.get('cam') || null) }, [takeParam]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode !== 'registro' || !canEdit || !shot || !project || !linked.length || curNum) return
    let alive = true
    previewNextTake(shot, project, linked, whenForDay(day, todayISO())).then((rows) => { if (alive) setDraft(rows) })
    return () => { alive = false }
  }, [mode, canEdit, shot, project, linked, curNum, draftKey, allTakes?.length, day]) // eslint-disable-line react-hooks/exhaustive-deps

  const [picker, setPicker] = useState(null) // { row, f }
  const [text, setText] = useState(null) // { row, field }
  const [photoRowId, setPhotoRowId] = useState(null)
  const [editGroup, setEditGroup] = useState(null)
  const [editShot, setEditShot] = useState(false)
  const [showAll, setShowAll] = useState(false)

  // ---- câmera Bluetooth (lib/bmd/session.js): REC cria o take no último plano aberto ----
  const btState = useSyncExternalStore(btLink.subscribe, btLink.getState)
  const btSession = useSyncExternalStore(bt.subscribe, bt.getState)
  // último REC já visto por esta tela (começa no atual: só RECs novos fazem a tela pular)
  const btSeq = useRef(bt.getState().current?.seq ?? 0)
  // calculado no desenho da tela, aplicado depois (efeito sem lista: roda a cada desenho)
  const btPlan = useRef(null)
  btPlan.current = null
  useEffect(() => {
    const p = btPlan.current
    if (!p) return
    bt.setOpenTake(p.open)
    if (p.slate) bt.syncSlate(p.slate.scene, p.slate.take)
  })
  // este plano passa a ser o "último plano aberto"
  useEffect(() => {
    if (mode !== 'registro' || !canEdit || !shot || !scene || shot.deleted) return
    bt.setContext({ projectId, sceneId, shotId: shot.id, dayDate: day?.date || null, label: labelOf(scene, shot) })
  }, [mode, canEdit, shot?.id, shot?.code, scene?.number, day?.date]) // eslint-disable-line react-hooks/exhaustive-deps
  // REC na câmera criou (ou usou) um take deste plano: a tela vai para ele
  useEffect(() => {
    const c = btSession.current
    if (!c || c.seq === btSeq.current) return
    btSeq.current = c.seq
    if (mode !== 'registro' || !linked.some((x) => x.id === c.shotId)) return
    // o take que estava na tela fica salvo; a tela vai para o take novo, limpo
    if (curNum && curNum !== c.number) {
      const g = groups.find((x) => x.number === curNum && !x.clipType)
      const resumo = g ? g.rows.map((r) => `${multi ? `${r.camera} ` : ''}${STATUS_TXT[r.status] || 'sem status'}`).join(' · ') : 'salvo'
      setSalvo({ number: curNum, resumo })
    } else setSalvo(null)
    setCurNum(c.number)
    setCam(null)
    window.scrollTo({ top: 0 })
  }, [btSession.current, mode, linked]) // eslint-disable-line react-hooks/exhaustive-deps

  if (shot === undefined || scene === undefined || project === undefined) return null
  if (!shot || shot.deleted) return (<><TopBar title="Plano" back={`/p/${projectId}/s/${sceneId}${q}`} /><Empty title="Plano não encontrado" /></>)

  const label = labelOf(scene, shot)
  // o que esta pessoa vê: função definida pelo dono na aba Equipe (sem função = tudo)
  const v = visao(project, user?.id)
  const backTo = `/p/${projectId}/s/${sceneId}${q}`
  const nextNumber = (allTakes || []).filter((t) => !t.clip_type).reduce((m, t) => Math.max(m, t.take_number), 0) + 1

  // linhas (uma por câmera) do take mostrado
  const realGroup = mode === 'take' ? findTake(groups, takeParam) : curNum ? findTake(groups, curNum) : null
  const rows = realGroup?.rows || (mode === 'registro' ? draft : null) || []
  const number = realGroup?.number ?? rows[0]?.take_number
  const active = rows.find((r) => r.camera === cam) || rows[0]
  const isDraft = !!active?._draft
  // Bluetooth: o take mostrado (já criado, sem REC) recebe o próximo REC; a claquete da câmera recebe cena + nº
  const btLetter = multi ? bt.cameraLetter(projectId) || projectCameras(project)[0]?.id : undefined
  const btMine = (r) => btLetter === undefined || r.camera === btLetter
  const btRecorded = !!realGroup && rows.some((r) => btMine(r) && r.extra?.bt_rec)
  if (mode === 'registro') {
    btPlan.current = {
      // só um take ainda "em branco" (sem REC, sem status, sem estrelas) recebe o próximo REC
      open: realGroup && !btRecorded && !rows.some((r) => r.status || r.rating) ? { shotId: shot.id, number, takeIds: rows.map((r) => r.id) } : null,
      slate: canEdit && btState.status === 'connected' && number ? { scene: label, take: btRecorded ? number + 1 : number } : null,
    }
  }
  const btRecHere = btState.camera.recording && btSession.current?.takeId && rows.some((r) => r.id === btSession.current.takeId)
  // Em que ponto este take está, com a câmera conectada: gravando / último gravado (avaliar) / esperando o REC
  const btOn = btState.status === 'connected' && !btState.noData
  const btPhase = mode !== 'registro' ? null
    : btRecHere ? 'rec'
    : btRecorded && btSession.lastRecTakeId && rows.some((r) => r.id === btSession.lastRecTakeId) ? 'ultimo'
    : btOn && !btRecorded ? 'espera' : null

  // cria o take do rascunho (uma vez só, mesmo com toques rápidos) e devolve as linhas reais
  const materialize = async () => {
    if (realGroup) return realGroup.rows
    if (!creating.current) {
      creating.current = createNextTake(shot, project, linked, whenForDay(day, todayISO())).then((created) => {
        setCurNum(created[0].take_number)
        return created
      }).finally(() => { setTimeout(() => { creating.current = null }, 0) })
    }
    return creating.current
  }
  const withRow = async (row, fn) => {
    if (!row._draft) return fn(row)
    const created = await materialize()
    const real = created.find((r) => r.shot_id === row.shot_id && (r.camera || null) === (row.camera || null)) || created[0]
    return fn(real)
  }
  // Mudança feita na tela de um take já gravado (?take=N) marca "Corrigido às" (sai no boletim com *)
  const stamp = (id) => (mode === 'take' ? updateExtra(id, 'corrigido_em', nowISO()) : null)
  const setField = (row, field, value) => withRow(row, async (r) => { await update('takes', r.id, { [field]: value }); await stamp(r.id) })
  const setExtra = (row, key, value) => withRow(row, async (r) => { await updateExtra(r.id, key, value); await stamp(r.id) })
  const setExtraAll = async (key, value) => {
    const list = isDraft ? await materialize() : rows
    for (const r of list) { await updateExtra(r.id, key, value); await stamp(r.id) }
  }
  const setAll = async (field, value) => {
    const list = isDraft ? await materialize() : rows
    for (const r of list) { await update('takes', r.id, { [field]: value }); await stamp(r.id) }
  }

  // take anterior da mesma câmera (para a marca MUDOU)
  const prevOf = (row) => {
    if (!row) return null
    for (const g of groups) {
      if (g.clipType || g.number >= row.take_number) continue
      const p = g.rows.find((r) => (r.camera || null) === (row.camera || null) && r.shot_id === row.shot_id) || g.rows.find((r) => (r.camera || null) === (row.camera || null))
      if (p) return p
    }
    return null
  }
  const prev = prevOf(active)

  const fields = projectFields(project)
  const gridFields = [
    ...BASE_FIELDS,
    ...(!multi ? [{ k: 'camera', label: 'CAM', cat: 'camera' }] : []),
    ...fields.map((f) => ({ x: f, k: `x:${f.key}`, label: (f.short || f.label).toUpperCase(), text: f.input === 'tc', multi: f.input === 'multi', span: f.input === 'multi' ? 2 : 1 })),
  ]
  const valueOf = (row, f) => (row ? (f.x ? row.extra?.[f.x.key] : row[f.k]) : null)

  const openField = (f) => {
    if (!active || !canEdit) return
    if (f.text) setText({ row: active, field: f.k })
    else setPicker({ row: active, f })
  }
  const extraOptions = (f) => {
    const used = (projectTakes || []).flatMap((t) => [].concat(t.extra?.[f.key] ?? []))
    return [...new Set([...f.presets, ...used])]
  }

  // Próximo: o take atual fica gravado (com ou sem status) e a tela vai para o rascunho do seguinte
  // Falso REC / ensaio / wild / insert: o clipe atual vira registro à parte e o take continua com o mesmo número
  const marcarClipe = async (tipo) => {
    vibrate(30)
    const created = await materialize()
    for (const r of created) await update('takes', r.id, { clip_type: tipo, status: null })
    setSalvo({ number, resumo: `${clipTypeLabel(tipo)} registrado (${created.map((r) => r.clip).filter(Boolean).join(', ') || 'sem clipe'}) · o take continua ${number}` })
    setCurNum(null); setDraft(null); setDraftKey((k) => k + 1); setCam(null)
  }
  const proximo = async () => {
    vibrate(30)
    const shown = rows
    await materialize()
    const resumo = shown.map((r) => `${multi ? `${r.camera} ` : ''}${STATUS_TXT[r.status] || 'sem status'}`).join(' · ')
    setSalvo({ number, resumo })
    setCurNum(null)
    setDraft(null)
    setDraftKey((k) => k + 1)
    setCam(null)
    window.scrollTo({ top: 0 })
  }

  // ---------- modo lista ----------
  if (mode === 'lista') {
    const visible = day && !showAll ? (allTakes || []).filter((t) => t.shoot_date === day.date) : allTakes || []
    const others = day ? (allTakes || []).filter((t) => t.shoot_date !== day.date) : []
    const g2 = groupTakes(visible, project)
    return (
      <>
        <TopBar title={`Takes · Plano ${label}`} subtitle={`${day ? `${dayLabel(day.number)} · ` : ''}Cena ${scene.number}${shot.shot_type ? ` · ${shot.shot_type}` : ''}`} back={backTo} />
        <main className="mx-auto max-w-3xl pt-2 pb-36">
          {day && others.length > 0 && (
            <div className="px-4 pb-2">
              <Button block size="p" variant="fantasma" onClick={() => setShowAll(!showAll)} data-testid="other-days">
                {showAll ? `Mostrar só os takes do ${dayLabel(day.number)}` : `Ver também ${new Set(others.map((t) => t.take_number)).size} takes de outras diárias`}
              </Button>
            </div>
          )}
          {g2.length === 0 && <EmptyState icon="clapperboard" title="Nenhum take ainda">{canEdit ? `Toque em Gravar ${nextNumber} para registrar o primeiro.` : 'Ainda não há takes neste plano.'}</EmptyState>}
          <div className="border-t-2 border-line" data-testid="takes">
            {g2.map((g) => g.rows.map((r) => (
              <TakeRow key={r.id} take={g.number} status={UP[r.status] || null} estrelas={ratingOf(r)} cam={g.rows.length > 1 || multi ? r.camera || undefined : undefined}
                clipe={r.clip} lente={r.lens} tstop={r.t_stop} som={r.sound === 'mos' ? 'MOS' : 'SYNC'} marcas={(r.marks || []).map(markCodeOf)}
                hora={`${fmtTime(r.recorded_at)}${r.extra?.corrigido_em ? ' ✎' : ''}`}
                nota={g.clipType ? [clipTypeLabel(g.clipType).toUpperCase(), r.notes].filter(Boolean).join(' · ') : r.notes || undefined}
                fotos={photos.filter((p) => p.take_id === r.id).length}
                onPress={() => (g.clipType ? canEdit && setEditGroup(g)
                  : setParams({ ...(day ? { dia: day.id } : {}), take: String(g.number), ...(r.camera ? { cam: r.camera } : {}) }))} />
            )))}
          </div>
        </main>
        {canEdit && (
          <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t-2 border-line bg-bg px-4 pt-3 pb-3">
            <div className="mx-auto max-w-3xl">
              <Button block variant="primario" size="g" icon="clapperboard" onClick={() => setParams(day ? { dia: day.id } : {})} data-testid="record">Gravar {nextNumber}</Button>
            </div>
          </div>
        )}
      </>
    )
  }

  // ---------- registro / take ----------
  if (mode === 'take' && !realGroup && allTakes) {
    return (<><TopBar title={`Plano ${label}`} back={backTo} /><Empty title={`Take ${takeParam} não encontrado`}>Ele pode ter sido excluído ou renumerado.</Empty></>)
  }

  const tabs = rows.map((r) => ({ id: r.camera || '—', plano: labelOf(scene, linked.find((s) => s.id === r.shot_id) || shot), status: UP[r.status] || null }))
  const missingCams = multi ? projectCameras(project).map((c) => c.id).filter((c) => !rows.some((r) => r.camera === c)) : []
  const activePhotos = active && !active._draft ? photos.filter((p) => p.take_id === active.id) : []
  const photoRow = photoRowId ? (allTakes || []).find((t) => t.id === photoRowId) : null

  return (
    <>
      <TopBar title={`Plano ${label}${shot.shot_type ? ` · ${shot.shot_type}` : ''}`}
        subtitle={`${day ? `${dayLabel(day.number)} › ` : ''}Cena ${scene.number}${linked.length > 1 ? ` · roda com ${linked.filter((s) => s.id !== shot.id).map((s) => labelOf(scene, s)).join(', ')}` : ''}`}
        back={mode === 'take' ? -1 : backTo}
        right={<>
          <IconBtn label="Todos os takes do plano" onClick={() => setParams({ ...(day ? { dia: day.id } : {}), lista: '1' })} data-testid="list-takes"><Icon name="list" size={24} /></IconBtn>
          {canEdit && <IconBtn label="Editar plano" onClick={() => setEditShot(true)}><IconEdit /></IconBtn>}
        </>} />
      {!active ? (
        <main className="px-4 py-10 text-center text-muted">Carregando…</main>
      ) : (
        <div className="bc-rec mx-auto max-w-3xl pb-0" data-testid="recorder">
          {(rows.length > 1 || multi) && (
            <div className="bc-rec__cams" style={{ top: 'calc(4rem + env(safe-area-inset-top) + 2px)' }} data-testid="camera-tabs">
              <CameraTabs cameras={tabs} value={active.camera || '—'} onChange={(c) => { vibrate(); setCam(c) }} />
              {canEdit && missingCams.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {missingCams.map((c) => (
                    <Button key={c} size="p" variant="fantasma" icon="plus" onClick={async () => {
                      vibrate()
                      const list = isDraft ? await materialize() : rows
                      const target = linked.find((s) => shotCameras(s)?.includes(c)) || shot
                      await addCameraToTake(target, { number: list[0].take_number, rows: list }, c)
                      setCam(c)
                      notify(`Câmera ${c} incluída no take ${list[0].take_number}`)
                    }}>Câmera {c} também rodou</Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'registro' && canEdit && v.camera && <CameraBtBar project={project} />}

          {salvo && mode === 'registro' && (
            <div className="bc-rec__salvo" role="status" data-testid="saved">
              <Icon name="check" size={20} strokeWidth={3} />
              <span className="flex-1">Take {salvo.number} salvo no aparelho · {salvo.resumo}</span>
              <button type="button" className="bc-link" onClick={() => setParams({ ...(day ? { dia: day.id } : {}), take: String(salvo.number) })}>Corrigir</button>
            </div>
          )}
          {mode === 'take' && active.extra?.corrigido_em && (
            <div className="rounded-[10px] border-2 border-check-ink bg-check-soft px-3 py-2 text-[15px] font-bold">
              Corrigido às {fmtTime(active.extra.corrigido_em)} de {fmtDate(active.extra.corrigido_em)}
            </div>
          )}

          {btPhase === 'rec' && (
            <div className="rounded-[10px] bg-ng px-3 py-2 text-[17px] font-bold text-white" data-testid="bt-phase">
              ● GRAVANDO · Take {number}
            </div>
          )}
          {btPhase === 'ultimo' && (
            <div className="rounded-[10px] border-2 border-check-ink bg-check-soft px-3 py-2 text-[15px]" data-testid="bt-phase">
              <b>ÚLTIMO TAKE GRAVADO · Take {number}.</b> Avalie GOOD / NG e as estrelas. O próximo REC da câmera abre o take {number + 1}.
            </div>
          )}
          {btPhase === 'espera' && (
            <div className="rounded-[10px] border-2 border-line px-3 py-2 text-[15px] text-muted" data-testid="bt-phase">
              <b className="text-ink">PRÓXIMO TAKE · Take {number}.</b> Começa quando a câmera der REC.
            </div>
          )}

          <div className="bc-rec__take">
            <div>
              <TakeNumber numero={number} />
              <div className="mt-1 pl-1 font-mono text-[15px] text-muted">
                {isDraft ? 'em andamento' : `${fmtTime(active.recorded_at)} · ${fmtDate(active.shoot_date)}`}
              </div>
              {(active.extra?.tc_in || btRecHere) && (
                <div className="mt-0.5 pl-1 font-mono text-[15px]" data-testid="take-tc">
                  {btRecHere && <span className="mr-2 rounded bg-ng px-1.5 font-bold text-white">● REC</span>}
                  TC {active.extra?.tc_in || '—'} → {active.extra?.tc_out || '…'}{active.duration ? ` · ${active.duration}` : ''}
                </div>
              )}
              {active.extra?.bt_offline && <div className="mt-0.5 pl-1 text-[13px] text-muted">rodou sem conexão com a câmera · sem TC</div>}
            </div>
            <div className="bc-rec__takedir">
              <SegmentToggle label="Som" value={active.sound === 'mos' ? 'MOS' : 'SYNC'}
                onChange={(x) => canEdit && v.continuidade && (vibrate(), setAll('sound', x === 'MOS' ? 'mos' : 'sync'))}
                options={[{ value: 'SYNC', icon: 'mic' }, { value: 'MOS', icon: 'mic-off' }]} />
            </div>
          </div>

          {v.camera && (
          <div className="bc-rec__bloco" data-testid="marks">
            <MarkChips compacto value={(active.marks || []).map(markCodeOf)}
              onChange={(codes) => canEdit && (vibrate(), setAll('marks', codes.length ? codes.map(markKeyOf) : null))} />
          </div>
          )}

          {!v.camera && (
            <div className="font-mono text-[17px]" data-testid="clip-line">
              {[active.camera && multi ? `Cam ${active.camera}` : null, active.roll, active.clip].filter(Boolean).join(' · ') || 'Rolo e clipe ainda não anotados'}
            </div>
          )}
          {v.continuidade && <ContinuityBlock project={project} active={active} canEdit={canEdit} setAll={setAll} setExtraAll={setExtraAll} />}

          {v.camera && (
          <div className="bc-rec__bloco">
            <div className="bc-rec__secrot">
              <span>Dados {multi ? `da câmera ${active.camera}` : 'de câmera'}</span>
              <span className="bc-rec__dica">{prev ? `Iguais ao take ${prev.take_number} · toque para mudar` : 'Toque para preencher'}</span>
            </div>
            <div className="bc-rec__grade" data-testid="camera-fields">
              {gridFields.map((f) => {
                const v = valueOf(active, f)
                const pv = prev ? valueOf(prev, f) : undefined
                return (
                  <FieldTile key={f.k} label={f.label} value={f.x ? extraText(f.x, v) || '' : show(v)} span={f.span}
                    changed={!!prev && f.k !== 'clip' && !f.x?.input?.startsWith('tc') && !same(v, pv)}
                    onPress={() => openField(f)} />
                )
              })}
            </div>
          </div>
          )}

          <div className="bc-rec__extras">
            {v.continuidade && (
            <Button block icon={active.notes ? 'check' : 'notebook-pen'} disabled={!canEdit && !active.notes}
              onClick={() => setText({ row: active, field: 'notes' })} data-testid="note">
              {active.notes ? 'Observação escrita' : 'Observação'}
            </Button>
            )}
            <Button block icon="camera" onClick={() => withRow(active, (r) => setPhotoRowId(r.id))} data-testid="photo">
              {activePhotos.length ? `Fotos · ${activePhotos.length}` : 'Foto'}
            </Button>
          </div>
          {v.continuidade && active.notes && <p className="-mt-2 whitespace-pre-wrap text-[15px] text-muted">{active.notes}</p>}
          {active.comments && <p className="-mt-2 whitespace-pre-wrap text-[15px] text-muted" data-testid="comments"><b>Correção / pós:</b> {active.comments}</p>}
          {mode === 'registro' && canEdit && (
            <div className="grid grid-cols-2 gap-2" data-testid="clip-types">
              <Button size="p" variant="fantasma" onClick={() => marcarClipe('falso_rec')} data-testid="falso-rec">Foi falso REC</Button>
              <Button size="p" variant="fantasma" onClick={() => marcarClipe('ensaio')}>Foi ensaio</Button>
            </div>
          )}
          {!isDraft && canEdit && (
            <Button block variant="fantasma" size="p" icon="pencil" onClick={() => setEditGroup(realGroup)} data-testid="take-options">
              Número, diária, câmeras ou excluir o take {number}
            </Button>
          )}

          <div className="bc-rec__rodape safe-bottom" data-testid="footer">
            {canEdit && v.continuidade && rows.length > 1 && (
              <div className="bc-rec__camrot">
                <span>Status da câmera <CameraBadge cam={active.camera} size="p" /></span>
                {active.status && <button type="button" className="bc-link" onClick={() => { vibrate(); setAll('status', active.status) }}>Usar em todas</button>}
              </div>
            )}
            {v.continuidade && (<>
            <StatusPicker value={UP[active.status] || null} disabled={!canEdit}
              onChange={(x) => { vibrate(); setField(active, 'status', DOWN[x] || null); if (!active._draft) bt.statusChanged(active.id, DOWN[x] || null) }} />
            <StarRating value={ratingOf(active)} disabled={!canEdit}
              rotulo={active.status === 'good' ? (ratingOf(active) >= 5 ? 'VALEU' : 'RESERVA') : ''}
              onChange={(n) => { vibrate(); setField(active, 'rating', n) }} />
            </>)}
            {mode === 'registro' ? (
              <Button variant="primario" size="g" block iconRight="arrow-right" onClick={proximo} data-testid="next-take">
                Próximo · Take {(number || nextNumber) + 1}
              </Button>
            ) : (
              <Button size="p" block onClick={() => setParams(day ? { dia: day.id } : {})}>Ir para o registro · Gravar {nextNumber}</Button>
            )}
          </div>
        </div>
      )}

      {picker && (() => {
        const { row, f } = picker
        const ex = f.x
        const cur = ex ? row.extra?.[ex.key] ?? (f.multi ? [] : null) : row[f.k]
        const value = f.multi && cur != null && !Array.isArray(cur) ? [cur] : cur
        const pv = prevOf(row)
        return (
          <PickerSheet open onClose={() => setPicker(null)}
            title={`${ex ? ex.label : f.label.charAt(0) + f.label.slice(1).toLowerCase()}${multi && row.camera ? ` · câmera ${row.camera}` : ''}`}
            category={ex ? ex.key : f.cat} multi={f.multi} value={value} persist={!ex} numeric={ex?.numeric}
            anterior={pv ? (ex ? pv.extra?.[ex.key] : pv[f.k]) : undefined}
            options={ex ? extraOptions(ex) : kitOptions(kit, project, f.cat)} project={project} canEdit={canEdit}
            onApply={(v) => {
              // ND: "Clear" sai quando algum ND de verdade é marcado junto
              if (ex?.key === 'nd_int' && Array.isArray(v) && v.length > 1) v = v.filter((x) => x !== 'Clear')
              if (ex) setExtra(row, ex.key, v)
              else setField(row, f.k, f.multi ? v || [] : v)
            }} />
        )
      })()}

      <TextSheet state={text} onClose={() => setText(null)} takes={(allTakes || []).filter((t) => !text || (t.camera || null) === (text.row.camera || null))}
        title={text && multi && text.row.camera ? ` · câmera ${text.row.camera}` : ''} readOnly={!canEdit}
        onSave={async (v) => {
          const { row, field } = text
          if (field.startsWith('x:')) return setExtra(row, field.slice(2), v || null)
          await setField(row, field, v || null)
          // clipe corrigido (ex.: rec falso): oferece corrigir junto os clipes seguintes do mesmo rolo
          if (field === 'clip' && v && row.clip && v !== row.clip && !row._draft) {
            const shift = await planClipShift(row, row.clip, v)
            if (shift && await confirm({ title: 'Corrigir os clipes seguintes?', confirmLabel: `Corrigir ${shift.list.length}`,
              message: `Há ${shift.list.length} ${shift.list.length === 1 ? 'clipe gravado depois' : 'clipes gravados depois'} deste no rolo ${row.roll || ''}${multi && row.camera ? ` (câmera ${row.camera})` : ''}.\n`
                + `Somar ${shift.delta > 0 ? '+' : ''}${shift.delta} em todos? (rec falso / clipe pulado)\n\n`
                + shift.list.slice(0, 4).map((x) => `${x.from} → ${x.to}`).join('\n')
                + (shift.list.length > 4 ? `\n… até ${shift.list.at(-1).from} → ${shift.list.at(-1).to}` : '') })) {
              await shift.apply()
              notify(`${shift.list.length} ${shift.list.length === 1 ? 'clipe corrigido' : 'clipes corrigidos'}`)
            }
          }
        }} />

      {photoRow && (
        <Sheet open onClose={() => setPhotoRowId(null)} title={`Fotos · Take ${photoRow.take_number}${multi && photoRow.camera ? ` · câmera ${photoRow.camera}` : ''}`}>
          <TakePhotos take={photoRow} photos={photos.filter((p) => p.take_id === photoRow.id)} canEdit={canEdit}
            caption={`Plano ${labelOf(scene, linked.find((x) => x.id === photoRow.shot_id) || shot)} · Take ${photoRow.take_number}${multi && photoRow.camera ? ` · Cam ${photoRow.camera}` : ''}`} />
        </Sheet>
      )}
      {editGroup && <TakeEditSheet group={editGroup} onClose={() => setEditGroup(null)} groups={groups}
        onDeleted={() => { setCurNum(null); setDraftKey((k) => k + 1); if (mode === 'take') nav(-1) }} />}
      <ShotForm open={editShot} onClose={() => setEditShot(false)} shot={shot} scene={scene} shots={shots || []} project={project} />
    </>
  )
}

const TEXT_FIELDS = {
  roll: { title: 'Rolo', placeholder: 'A001' },
  clip: { title: 'Clipe', placeholder: 'A001C003', hint: 'Avança sozinho a cada take: A001C004 → A001C005' },
  notes: { title: 'Nota de pós / VFX', placeholder: 'Ex.: atriz errou o texto no fim', multiline: true },
}
const NOTE_TAGS = ['VFX', 'Tracking', 'Clean plate', 'Flare', 'Foco suave', 'Boom no quadro', 'Reflexo', 'Som ruim', 'Pickup', 'Wild track']

function TextSheet({ state, onClose, onSave, takes, title = '', readOnly }) {
  const [v, setV] = useState('')
  const field = state?.field
  const xf = field?.startsWith('x:') ? extraField(field.slice(2)) : null
  const cfg = xf ? { title: xf.label, placeholder: '01:00:00:00', tc: true } : field ? TEXT_FIELDS[field] : null
  useEffect(() => {
    if (!state) return
    const k = state.field.startsWith('x:') ? state.field.slice(2) : null
    setV((k ? state.row.extra?.[k] : state.row[state.field]) || '')
  }, [state])
  if (!state) return null
  const row = state.row

  // sugestões rápidas para não precisar digitar
  const quick = []
  if (field === 'roll') {
    const prev = takes.map((t) => t.roll).filter(Boolean)
    const cur = row.roll || prev[0]
    if (cur) quick.push(cur, incrCode(cur))
  }
  if (field === 'clip') {
    const others = takes.filter((t) => t.id !== row.id && t.clip).sort((a, b) => b.take_number - a.take_number)
    if (others[0]) quick.push(incrCode(others[0].clip))
    else if (row.roll) quick.push(`${row.roll}C001`)
  }
  // TC in: sugere o TC out do take anterior (mesma câmera)
  if (xf?.key === 'tc_in') {
    const prev = takes.filter((t) => t.take_number < row.take_number && t.extra?.tc_out).sort((a, b) => b.take_number - a.take_number)[0]
    if (prev) quick.push(prev.extra.tc_out)
  }
  const save = (val = v) => { onSave(cfg.tc ? formatTc(val) : val.trim()); onClose() }

  if (readOnly) {
    return (
      <Sheet open onClose={onClose} title={`${cfg.title}${title}`}>
        <p className="whitespace-pre-wrap text-[17px]">{v || '—'}</p>
      </Sheet>
    )
  }
  return (
    <Sheet open onClose={onClose} title={`${cfg.title}${title}`}
      footer={<Btn full size="lg" onClick={() => save()}>Salvar</Btn>}>
      {quick.length > 0 && (
        <div className="bc-qp__lista mb-3">
          {[...new Set(quick)].map((qv) => (
            <button key={qv} type="button" onClick={() => save(qv)} className="bc-chip"><span>{qv}</span></button>
          ))}
        </div>
      )}
      {field === 'notes' && (
        <div className="mb-3 flex flex-wrap gap-2">
          {NOTE_TAGS.map((tag) => (
            <button key={tag} type="button" onClick={() => setV((s) => (s ? `${s.trim()} · ${tag}` : tag))}
              className="min-h-12 rounded-[10px] border-2 border-borda bg-surface px-3 text-[15px] font-bold">{tag}</button>
          ))}
        </div>
      )}
      {cfg.tc
        ? <TextInput value={v} onChange={(e) => setV(e.target.value.replace(/[^\d:]/g, ''))} placeholder={cfg.placeholder}
            inputMode="numeric" onKeyDown={(e) => e.key === 'Enter' && save()} label="Timecode" autoFocus
            hint={`Digite só os números: 1020304 → ${formatTc('1020304')}`} />
        : cfg.multiline
        ? <TextArea rows={4} value={v} onChange={(e) => setV(e.target.value)} placeholder={cfg.placeholder} autoFocus />
        : <TextInput value={v} onChange={(e) => setV(e.target.value.toUpperCase())} placeholder={cfg.placeholder} hint={cfg.hint}
            onKeyDown={(e) => e.key === 'Enter' && save()} autoCapitalize="characters" className="font-mono" />}
    </Sheet>
  )
}

// Opções do take: número e diária valem para todas as câmeras do take
function TakeEditSheet({ group, onClose, groups, onDeleted }) {
  const { confirm, notify } = useDialog()
  const [num, setNum] = useState(String(group.number))
  const [date, setDate] = useState(group.rows[0].shoot_date)
  const [kind, setKind] = useState(group.clipType || '')
  const ids = group.rows.map((r) => r.id)
  const save = async () => {
    const n = parseInt(num, 10)
    if (!(n > 0)) return notify('Número inválido', 'error')
    if (!kind && groups.some((g) => g.number === n && !g.clipType && g !== group)) return notify(`O take ${n} já existe neste plano`, 'error')
    for (const r of group.rows) {
      await update('takes', r.id, { take_number: n, shoot_date: date || r.shoot_date, clip_type: kind || null })
      await updateExtra(r.id, 'corrigido_em', nowISO())
    }
    onClose()
  }
  const many = group.rows.length > 1
  return (
    <Sheet open onClose={onClose} title={group.clipType ? `${clipTypeLabel(group.clipType)} (take ${group.number})` : `Take ${group.number}`}
      footer={<Btn full size="lg" onClick={save}>Salvar</Btn>}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Nº do take" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} />
          <TextInput label="Diária (data)" type="date" value={date || ''} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div role="group" aria-label="Tipo do clipe">
          <div className="mb-1.5 text-[13px] font-bold uppercase tracking-[.07em] text-muted">Tipo do clipe</div>
          <div className="flex flex-wrap gap-2">
            {[{ key: '', label: 'Take' }, ...CLIP_TYPES].map((c) => (
              <button key={c.key} type="button" aria-pressed={kind === c.key} onClick={() => setKind(c.key)}
                className={`min-h-12 rounded-[10px] border-2 px-3 font-bold ${kind === c.key ? 'border-ink bg-ink text-bg' : 'border-borda bg-surface'}`}>{c.label}</button>
            ))}
          </div>
          <p className="mt-1 text-[15px] text-muted">Falso REC, ensaio, wild e insert gastam número de clipe, não de take.</p>
        </div>
        {many && group.rows.map((r) => (
          <Btn key={r.id} variant="ghost" onClick={async () => {
            if (await confirm({ title: `Câmera ${r.camera} não rodou`, danger: true, confirmLabel: 'Tirar do take',
              message: `A câmera ${r.camera} não rodou no take ${group.number}? Os dados dela neste take serão apagados.` })) {
              await deleteTakes([r.id]); notify(`Câmera ${r.camera} tirada do take`); onClose()
            }
          }}><IconX /> Câmera {r.camera} não rodou</Btn>
        ))}
        <Btn variant="danger" onClick={async () => {
          if (await confirm({ title: 'Excluir take', danger: true, confirmLabel: 'Excluir',
            message: `Excluir o take ${group.number}${many ? ` de todas as câmeras (${group.rows.map((r) => r.camera).join(', ')})` : ''}? Apaga também as fotos e notas dele. Não dá para desfazer.` })) {
            await deleteTakes(ids); notify(`Take ${group.number} excluído`); onClose(); onDeleted?.()
          }
        }}><IconTrash /> Excluir take{many ? ' (todas as câmeras)' : ''}</Btn>
      </div>
    </Sheet>
  )
}


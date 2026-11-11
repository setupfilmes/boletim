// Liga a câmera Bluetooth aos takes do Boletim (decisões do Antonio, 11/11/2026 — ver CLAUDE.md):
//  - REC na câmera cria o take no ÚLTIMO PLANO ABERTO (mesmo fora da tela do take);
//    se a tela do take já criou o take e ele ainda não teve REC, usa esse.
//  - ISO, WB, shutter, FPS, codec e resolução vêm da câmera e valem mais que os "grudados".
//  - CORTA preenche TC out e duração.
//  - A claquete da câmera recebe cena + plano ("12A") e o nº do take que o próximo REC vai criar.
//  - GOOD/NG no take recém-gravado marca o good take na câmera.
// Fica ligado enquanto o usuário está logado (start() no App), fora das telas.
import * as link from './link'
import { cmd, cameraFields, tcDuration } from './protocol'
import { getDb } from '../db'
import { createNextTake, addCameraToTake, update } from '../repo'
import { linkedShots, isMulticam, projectCameras } from '../cameras'
import { todayISO } from '../util'

const CTX_KEY = 'boletim.bt.context' // último plano aberto: { projectId, sceneId, shotId, dayDate, label }
const LETTER_KEY = 'boletim.bt.letter' // { [projectId]: 'A' } — qual câmera do projeto é a câmera Bluetooth
const DONE_KEY = 'boletim.bt.done' // { [recordingId]: { takeId, stopped } } — gravações já transformadas em take
const GAPS_KEY = 'boletim.bt.gaps' // clipes que rodaram sem conexão, esperando o AC criar os takes

const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* sem espaço */ } }

let state = {
  context: load(CTX_KEY, null),
  current: null, // { seq, shotId, number, takeId } — último take criado/usado por um REC
  lastRecTakeId: null,
  gaps: load(GAPS_KEY, []),
  message: '', // aviso curto para a tela (ex.: "REC sem plano aberto")
}
const listeners = new Set()
let done = load(DONE_KEY, {})
let openTake = null // { shotId, number, takeIds } — take mostrado na tela, já criado, ainda sem REC
let started = false
let seq = 0
let busy = Promise.resolve() // uma gravação de cada vez, na ordem

function set(patch) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
export const getState = () => state
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }

// ---- chamado pelas telas ----
export function setContext(ctx) {
  const same = state.context && ctx && ['projectId', 'shotId', 'dayDate', 'label'].every((k) => state.context[k] === ctx[k])
  if (same) return
  save(CTX_KEY, ctx)
  set({ context: ctx })
}
export function setOpenTake(t) { openTake = t }
export const cameraLetter = (projectId) => load(LETTER_KEY, {})[projectId] || null
export function setCameraLetter(projectId, letter) {
  save(LETTER_KEY, { ...load(LETTER_KEY, {}), [projectId]: letter })
  set({}) // avisa as telas
}

// ---- câmera → takes ----
export function start() {
  if (started) return
  started = true
  // Gravações que já estavam na lista antes desta sessão não viram take (só as novas)
  const now = link.getState().recordings
  for (const r of now) if (!done[r.id]) done[r.id] = { skipped: true, stopped: true }
  save(DONE_KEY, trimDone(done))
  link.subscribe(onLink)
}

function trimDone(d) {
  const ids = new Set(link.getState().recordings.map((r) => r.id))
  return Object.fromEntries(Object.entries(d).filter(([id]) => ids.has(id)))
}

function onLink() {
  for (const r of link.getState().recordings) {
    const d = done[r.id]
    if (!d) {
      done[r.id] = { pending: true }
      if (r.offline) { addGap(r); done[r.id] = { gap: true, stopped: true } } else busy = busy.then(() => recStart(r)).catch(report)
    } else if (!d.stopped && d.takeId && r.stopAt) {
      d.stopped = true
      busy = busy.then(() => recStop(r, d.takeId)).catch(report)
    }
  }
  save(DONE_KEY, done)
}

function report(err) {
  console.error('[câmera bluetooth]', err)
  set({ message: `Não deu para registrar o take: ${err.message}` })
}

async function loadContext(ctx = state.context) {
  if (!ctx) return null
  let db
  try { db = getDb() } catch { return null } // sem conta aberta (tela de teste sem login)
  const shot = await db.shots.get(ctx.shotId)
  const project = await db.projects.get(ctx.projectId)
  if (!shot || shot.deleted || !project || project.deleted) return null
  const shots = await db.shots.where('scene_id').equals(shot.scene_id).toArray()
  return { db, ctx, shot, project, linked: linkedShots(shot, shots) }
}

const letterFor = (project) => {
  if (!isMulticam(project)) return undefined
  const ids = projectCameras(project).map((c) => c.id)
  const l = cameraLetter(project.id)
  return ids.includes(l) ? l : ids[0]
}
const hasRec = (row) => !!row?.extra?.bt_rec

async function recStart(r) {
  const c = await loadContext()
  if (!c) return set({ message: 'REC na câmera, mas nenhum plano aberto: abra um plano no Boletim.' })
  const { db, ctx, shot, project, linked } = c
  const letter = letterFor(project)
  const mine = (row) => (letter === undefined || row.camera === letter)

  // 1) take que a tela já criou e ainda não teve REC desta câmera
  let rows = null
  if (openTake?.shotId === shot.id) {
    rows = (await Promise.all(openTake.takeIds.map((id) => db.takes.get(id)))).filter((t) => t && !t.deleted)
    // só reaproveita take "em branco": sem REC desta câmera e sem avaliação (status/estrelas são do take anterior)
    if (!rows.length || rows.some((t) => (mine(t) && hasRec(t)) || t.status || t.rating)) rows = null
  }
  // 2) senão, o próximo take do plano
  if (!rows) {
    const when = ctx.dayDate && ctx.dayDate !== todayISO() ? { date: ctx.dayDate, at: new Date(r.startAt).toISOString() } : null
    rows = await createNextTake(shot, project, linked, when)
  }
  let target = rows.find((t) => mine(t) && t.shot_id === shot.id) || rows.find(mine)
  if (!target && letter !== undefined) target = await addCameraToTake(shot, { number: rows[0].take_number, rows }, letter)
  target ||= rows[0]

  const cur = await db.takes.get(target.id)
  const { fields, extra } = cameraFields(link.getState().camera)
  await update('takes', target.id, {
    ...fields,
    extra: { ...(cur?.extra || {}), ...extra, ...(r.startTc ? { tc_in: r.startTc } : {}), bt_rec: r.id },
  })
  done[r.id] = { takeId: target.id, stopped: false }
  save(DONE_KEY, done)
  openTake = { shotId: shot.id, number: target.take_number, takeIds: rows.map((t) => t.id) }
  set({ current: { seq: ++seq, shotId: shot.id, number: target.take_number, takeId: target.id }, lastRecTakeId: target.id, message: '' })
}

async function recStop(r, takeId) {
  const db = getDb()
  const cur = await db.takes.get(takeId)
  if (!cur || cur.deleted) return
  const extra = { ...(cur.extra || {}) }
  if (r.stopTc) extra.tc_out = r.stopTc
  const cam = link.getState().camera
  const dur = tcDuration(extra.tc_in, r.stopTc, cam.fps)
    || (r.stopAt && r.startAt && !r.interrupted ? mmss(r.stopAt - r.startAt) : null)
  await update('takes', takeId, { extra, ...(dur && !cur.duration ? { duration: dur } : {}) })
}

const mmss = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

// ---- clipes que rodaram sem conexão ----
function addGap(r) {
  const gaps = [...state.gaps, { ...r, context: state.context }]
  save(GAPS_KEY, gaps)
  set({ gaps })
}
export function dismissGap(id) {
  const gaps = state.gaps.filter((g) => g.id !== id)
  save(GAPS_KEY, gaps)
  set({ gaps })
}
/** Cria um take para cada clipe que rodou sem conexão (sem timecode), no plano em que o AC estava. */
export async function createGapTakes(gap) {
  const c = await loadContext(gap.context || state.context)
  if (!c) throw new Error('o plano daquele momento não existe mais')
  const letter = letterFor(c.project)
  const n = gap.takes?.length || 1
  for (let i = 0; i < n; i++) {
    const rows = await createNextTake(c.shot, c.project, c.linked, null)
    for (const t of rows) {
      if (letter !== undefined && t.camera !== letter) continue
      await update('takes', t.id, { extra: { ...(t.extra || {}), bt_offline: true } })
    }
  }
  dismissGap(gap.id)
  openTake = null
  return n
}

// ---- Boletim → claquete da câmera ----
let lastSlate = { scene: null, take: null, at: 0 }
/** Deixa a claquete da câmera com a cena e o nº do take que o próximo REC vai criar. */
export async function syncSlate(scene, take) {
  const ls = link.getState()
  if (ls.status !== 'connected' || ls.noData || ls.camera.recording || !take) return
  const slate = ls.camera.slate || {}
  const sc = String(scene || '').slice(0, 5)
  try {
    // não reenvia o mesmo valor enquanto a câmera não confirma (evita mandar em dobro)
    const recent = Date.now() - lastSlate.at < 3000
    if (sc && slate.scene !== sc && !(recent && lastSlate.scene === sc)) {
      lastSlate = { ...lastSlate, scene: sc, at: Date.now() }
      await link.send(cmd.scene(sc), 'Cena')
    }
    if (slate.take !== take && !(recent && lastSlate.take === take)) {
      lastSlate = { ...lastSlate, take, at: Date.now() }
      await link.send(cmd.take(take), 'Take')
    }
  } catch (err) { console.warn('[câmera bluetooth] claquete', err) }
}

/** GOOD/NG/CHECK no take que acabou de ser gravado: marca o good take na câmera (vale para o último clipe). */
export async function statusChanged(takeId, status) {
  const ls = link.getState()
  if (takeId !== state.lastRecTakeId || ls.status !== 'connected' || ls.camera.recording) return
  try { await link.send(cmd.goodTake(status === 'good'), status === 'good' ? 'Good take' : 'Good take não') } catch { /* sem conexão */ }
}

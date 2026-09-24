// Todas as gravações passam por aqui: salvam no aparelho na hora e marcam para sincronizar depois.
import { getDb, currentUserId, getMeta, setMeta } from './db'
import { scheduleSync } from './sync'
import { uuid, nowISO, todayISO, natCompare, incrCode } from './util'
import { DEFAULT_KIT, kitItemId } from './kit'
import { isMulticam, projectCameras, shotCameras } from './cameras'
import { EXTRA_FIELDS } from './fields'

function mark(row) {
  return { ...row, _dirty: 1, _rev: (row._rev || 0) + 1, _err: null }
}

export async function create(table, data) {
  const db = getDb()
  const row = mark({ id: uuid(), deleted: false, created_at: nowISO(), ...data })
  await db[table].put(row)
  scheduleSync()
  return row
}

export async function update(table, id, patch) {
  const db = getDb()
  let out
  await db.transaction('rw', db[table], async () => {
    const cur = await db[table].get(id)
    if (!cur) return
    out = mark({ ...cur, ...patch })
    await db[table].put(out)
  })
  scheduleSync()
  return out
}

async function softDeleteMany(table, rows) {
  const db = getDb()
  await db[table].bulkPut(rows.map((r) => mark({ ...r, deleted: true })))
}

// ---------- Projetos ----------
export async function createProject(data) {
  return create('projects', { owner_id: currentUserId(), kit: {}, ...data })
}

export async function deleteProject(id) {
  const db = getDb()
  await db.transaction('rw', db.projects, db.scenes, db.shots, db.takes, async () => {
    await db.scenes.where('project_id').equals(id).delete()
    await db.shots.where('project_id').equals(id).delete()
    await db.takes.where('project_id').equals(id).delete()
    const p = await db.projects.get(id)
    if (p) await db.projects.put(mark({ ...p, deleted: true }))
  })
  scheduleSync()
}

// ---------- Cenas ----------
export async function createScene(projectId, data) {
  return create('scenes', { project_id: projectId, created_by: currentUserId(), sort_order: Date.now(), ...data })
}

export async function createScenesBatch(projectId, numbers, common = {}) {
  const db = getDb()
  const uid = currentUserId()
  const base = Date.now()
  const rows = numbers.map((n, i) =>
    mark({ id: uuid(), project_id: projectId, number: String(n), created_by: uid, sort_order: base + i,
      deleted: false, created_at: nowISO(), ...common }))
  await db.scenes.bulkPut(rows)
  scheduleSync()
  return rows
}

export async function deleteScene(id) {
  const db = getDb()
  await db.transaction('rw', db.scenes, db.shots, db.takes, async () => {
    const shots = await db.shots.where('scene_id').equals(id).toArray()
    const takes = await db.takes.where('scene_id').equals(id).toArray()
    await softDeleteMany('takes', takes)
    await softDeleteMany('shots', shots)
    const s = await db.scenes.get(id)
    if (s) await db.scenes.put(mark({ ...s, deleted: true }))
  })
  scheduleSync()
}

// ---------- Planos ----------
export async function createShot(scene, data) {
  return create('shots', { project_id: scene.project_id, scene_id: scene.id, created_by: currentUserId(),
    sort_order: Date.now(), ...data })
}

export async function deleteShot(id) {
  const db = getDb()
  await db.transaction('rw', db.shots, db.takes, async () => {
    const takes = await db.takes.where('shot_id').equals(id).toArray()
    await softDeleteMany('takes', takes)
    const s = await db.shots.get(id)
    if (s) await db.shots.put(mark({ ...s, deleted: true }))
  })
  scheduleSync()
}

// ---------- Takes ----------
export const STICKY_FIELDS = ['camera', 'roll', 'lens', 't_stop', 'filters', 'focus', 'iso', 'shutter', 'fps', 'wb', 'sound']
const STICKY_EXTRA = EXTRA_FIELDS.filter((f) => f.sticky).map((f) => f.key)

// Campos que costumam ser iguais entre as câmeras do set: câmera sem histórico herda de qualquer câmera
const SHARED_FIELDS = ['iso', 'shutter', 'fps', 'wb', 'sound']
const byRecent = (a, b) => String(b.recorded_at || b.created_at).localeCompare(String(a.recorded_at || a.created_at))
const emptyOf = (f) => (f === 'filters' ? [] : null)

async function projectTakes(projectId) {
  return (await getDb().takes.where('project_id').equals(projectId).toArray()).filter((t) => !t.deleted).sort(byRecent)
}

// Monta uma linha de take com as configurações "grudadas".
// camera === undefined → projeto de 1 câmera: tudo (inclusive a câmera) vem do take anterior
// do mesmo plano; se for o 1º take do plano, do último take gravado no projeto.
// Multicâmera: o mesmo, mas olhando só os takes daquela câmera.
// Clipe: continua a sequência do take gravado por último no mesmo cartão (e mesma câmera), em qualquer
// plano — só se esse take tiver clipe (não pula números com base em takes antigos).
function takeRow(shot, inProject, number, camera, when) {
  const multi = camera !== undefined
  const same = multi ? (t) => (t.camera || null) === camera : () => true
  const shotRows = inProject.filter((t) => t.shot_id === shot.id && same(t))
  const source = shotRows.length ? shotRows.reduce((a, b) => (b.take_number > a.take_number ? b : a)) : inProject.find(same) || null
  const sticky = {}
  for (const f of STICKY_FIELDS) sticky[f] = source ? source[f] ?? emptyOf(f) : emptyOf(f)
  if (multi) {
    sticky.camera = camera
    if (!source && inProject[0]) for (const f of SHARED_FIELDS) sticky[f] = inProject[0][f] ?? null
  }
  sticky.sound ||= 'sync' // a maioria dos takes tem som; MOS é a exceção marcada
  // campos extras "grudados" (LUT, codec, ND interno, altura…); os outros (TC, VFX) começam vazios
  const extra = {}
  for (const k of STICKY_EXTRA) if (source?.extra?.[k] != null) extra[k] = source.extra[k]
  sticky.extra = Object.keys(extra).length ? extra : null
  const lastOnCard = inProject.find((t) => same(t) && (t.roll || null) === (sticky.roll || null))
  return {
    project_id: shot.project_id, scene_id: shot.scene_id, shot_id: shot.id, take_number: number,
    shoot_date: when.date, recorded_at: when.at, status: null, notes: null, circled: false, marks: null,
    clip: lastOnCard?.clip ? incrCode(lastOnCard.clip) : null,
    created_by: currentUserId(), ...sticky,
  }
}

// Novo take (próximo número da claquete). Retorna as linhas criadas — uma por câmera no multicâmera.
// Câmeras de cada plano: as definidas no plano (shot.cameras); senão as que rodaram no take anterior do plano
// (no 1º take, as do último take do projeto); sem histórico, todas as do projeto que nenhum plano vinculado reservou.
// `linked` = planos que rodam juntos (mesmo link_id): todos recebem o mesmo número, cada um com suas câmeras.
export async function createNextTake(shot, project, linked = [shot]) {
  const inProject = await projectTakes(shot.project_id)
  const ids = new Set(linked.map((s) => s.id))
  const inGroup = inProject.filter((t) => ids.has(t.shot_id))
  const last = inGroup.length ? Math.max(...inGroup.map((t) => t.take_number)) : 0
  const when = { date: todayISO(), at: nowISO() }
  if (!isMulticam(project)) return [await create('takes', takeRow(shot, inProject, last + 1, undefined, when))]
  const all = projectCameras(project).map((c) => c.id)
  const reserved = new Set(linked.flatMap((s) => shotCameras(s) || []))
  const out = []
  for (const s of linked) {
    let cams = shotCameras(s)?.filter((c) => all.includes(c))
    if (!cams?.length) {
      const inShot = inProject.filter((t) => t.shot_id === s.id)
      const lastInShot = inShot.length ? Math.max(...inShot.map((t) => t.take_number)) : 0
      const ref = lastInShot ? inShot.filter((t) => t.take_number === lastInShot)
        : linked.length === 1 && inProject[0] ? inProject.filter((t) => t.shot_id === inProject[0].shot_id && t.take_number === inProject[0].take_number) : []
      cams = all.filter((id) => ref.some((t) => t.camera === id))
      if (!cams.length && s.id === shot.id) cams = all.filter((c) => !reserved.has(c))
      if (!cams.length && s.id === shot.id) cams = all
    }
    for (const c of cams) out.push(await create('takes', takeRow(s, inProject, last + 1, c, when)))
  }
  return out.sort((a, b) => (a.shot_id === shot.id ? 0 : 1) - (b.shot_id === shot.id ? 0 : 1))
}

// Inclui uma câmera num take que já existe (ela também rodou)
export async function addCameraToTake(shot, group, camera) {
  const inProject = await projectTakes(shot.project_id)
  const first = group.rows[0]
  return create('takes', takeRow(shot, inProject, group.number, camera, { date: first.shoot_date, at: first.recorded_at }))
}

export async function deleteTakes(ids) {
  const db = getDb()
  const rows = (await db.takes.bulkGet(ids)).filter(Boolean)
  await softDeleteMany('takes', rows)
  scheduleSync()
}

export async function deleteTake(id) {
  const t = await getDb().takes.get(id)
  if (t) {
    await getDb().takes.put(mark({ ...t, deleted: true }))
    scheduleSync()
  }
}

// ---------- Kit ----------
export async function addKitItem(category, value) {
  const v = String(value || '').trim()
  if (!v) return null
  const db = getDb()
  const uid = currentUserId()
  const id = kitItemId(uid, category, v)
  const cur = await db.kit_items.get(id)
  if (cur && !cur.deleted) return cur
  const row = mark({ ...(cur || {}), id, owner_id: uid, category, value: v, sort_order: Date.now(), deleted: false,
    created_at: cur?.created_at || nowISO() })
  await db.kit_items.put(row)
  scheduleSync()
  return row
}

export async function removeKitItem(id) {
  return update('kit_items', id, { deleted: true })
}

export async function restoreDefaultKit() {
  const db = getDb()
  const uid = currentUserId()
  const rows = []
  let order = 0
  for (const [category, values] of Object.entries(DEFAULT_KIT)) {
    for (const value of values) {
      const id = kitItemId(uid, category, value)
      const cur = await db.kit_items.get(id)
      if (cur && !cur.deleted) continue
      rows.push(mark({ ...(cur || {}), id, owner_id: uid, category, value, sort_order: order++, deleted: false,
        created_at: cur?.created_at || nowISO() }))
    }
  }
  if (rows.length) await db.kit_items.bulkPut(rows)
  scheduleSync()
  return rows.length
}

// Primeira vez neste usuário (sem kit nenhum): cria o kit padrão
export async function ensureKitSeeded() {
  if (await getMeta('kitSeeded')) return
  const count = await getDb().kit_items.count()
  if (count === 0) await restoreDefaultKit()
  await setMeta('kitSeeded', true)
}

export function sortKit(items) {
  return [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || natCompare(a.value, b.value))
}

// Grava um campo extra do take (takes.extra é um objeto; lê a versão atual para não perder outro campo)
export async function updateExtra(id, key, value) {
  const cur = await getDb().takes.get(id)
  if (!cur) return
  const extra = { ...(cur.extra || {}) }
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) delete extra[key]
  else extra[key] = value
  return update('takes', id, { extra: Object.keys(extra).length ? extra : null })
}

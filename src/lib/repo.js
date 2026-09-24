// Todas as gravações passam por aqui: salvam no aparelho na hora e marcam para sincronizar depois.
import { getDb, currentUserId, getMeta, setMeta } from './db'
import { scheduleSync } from './sync'
import { uuid, nowISO, todayISO, natCompare, incrCode } from './util'
import { DEFAULT_KIT, kitItemId } from './kit'

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
export const STICKY_FIELDS = ['camera', 'roll', 'lens', 't_stop', 'filters', 'focus', 'iso', 'shutter', 'fps', 'wb']

// Novo take: número seguinte e configurações "grudadas" do take anterior
// (do mesmo plano; se for o primeiro take do plano, do último take gravado no projeto).
// Clipe: continua a sequência do take gravado por último no mesmo cartão, em qualquer plano
// (só se esse take tiver clipe — não pula números com base em takes mais antigos).
export async function createNextTake(shot) {
  const db = getDb()
  const inProject = (await db.takes.where('project_id').equals(shot.project_id).toArray())
    .filter((t) => !t.deleted)
    .sort((a, b) => String(b.recorded_at || b.created_at).localeCompare(String(a.recorded_at || a.created_at)))
  const inShot = inProject.filter((t) => t.shot_id === shot.id)
  const source = inShot.length ? inShot.reduce((a, b) => (b.take_number > a.take_number ? b : a)) : inProject[0] || null
  const next = inShot.length ? Math.max(...inShot.map((t) => t.take_number)) + 1 : 1
  const sticky = {}
  for (const f of STICKY_FIELDS) sticky[f] = source ? source[f] ?? (f === 'filters' ? [] : null) : f === 'filters' ? [] : null
  const lastOnCard = inProject.find((t) => (t.roll || null) === (sticky.roll || null))
  const clip = lastOnCard?.clip ? incrCode(lastOnCard.clip) : null
  return create('takes', {
    project_id: shot.project_id, scene_id: shot.scene_id, shot_id: shot.id, take_number: next,
    shoot_date: todayISO(), recorded_at: nowISO(), status: null, notes: null, clip,
    created_by: currentUserId(), ...sticky,
  })
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

// ---------- Projeto de exemplo ----------
export async function createExampleProject(userName) {
  const p = await createProject({
    title: 'A Tela', production_type: 'Curta', company: 'Setup Filmes', director: 'Direção Exemplo',
    dop: 'DoP Exemplo', first_ac: userName || '', second_ac: '', logger: '', camera_body: 'ARRI Alexa Mini',
    notes: 'Projeto fictício para testar o app. Pode excluir quando quiser.',
  })
  const combos = [['INT', 'DIA'], ['EXT', 'DIA'], ['INT', 'NOITE'], ['EXT', 'NOITE']]
  const numbers = Array.from({ length: 32 }, (_, i) => i + 1)
  const db = getDb()
  const uid = currentUserId()
  const base = Date.now()
  const scenes = numbers.map((n, i) => mark({
    id: uuid(), project_id: p.id, number: String(n), int_ext: combos[i % 4][0], period: combos[i % 4][1],
    location: i % 3 === 0 ? 'Apartamento' : i % 3 === 1 ? 'Rua' : 'Estúdio', description: null,
    created_by: uid, sort_order: base + i, deleted: false, created_at: nowISO(),
  }))
  await db.scenes.bulkPut(scenes)
  scheduleSync()
  return p
}

// Diárias (Dia 01, Dia 02…): pastas que organizam as cenas por dia de filmagem, na ordem de gravação.
// - shoot_days: uma linha por diária (data + número). Os takes pertencem à diária pela data (takes.shoot_date).
// - day_scenes: cenas de cada diária com a ordem arrumada pela equipe. Uma cena gravada em 2 dias aparece nos 2.
// Diária e cena-na-diária que surgem de takes gravados (sem ninguém ter criado) são "virtuais": aparecem na tela
// com o mesmo id que teriam se fossem gravadas (stableUuid), e quem pode editar as grava (ensureDays). Assim dois
// aparelhos criando a mesma diária ao mesmo tempo geram a mesma linha, sem duplicar.
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb, currentUserId } from './db'
import { scheduleSync } from './sync'
import { nowISO, stableUuid } from './util'

export const dayIdFor = (projectId, date) => stableUuid(`day|${projectId}|${date}`)
export const daySceneIdFor = (dayId, sceneId) => stableUuid(`dayscene|${dayId}|${sceneId}`)
export const dayLabel = (n) => `Dia ${String(n ?? '?').padStart(2, '0')}`

const mark = (row) => ({ ...row, _dirty: 1, _rev: (row._rev || 0) + 1, _err: null })

async function loadRaw(projectId) {
  const db = getDb()
  const [days, dayScenes, takes] = await Promise.all([
    db.shoot_days.where('project_id').equals(projectId).toArray(),
    db.day_scenes.where('project_id').equals(projectId).toArray(),
    db.takes.where('project_id').equals(projectId).toArray(),
  ])
  return { days, dayScenes, takes: takes.filter((t) => !t.deleted) }
}

// Diárias efetivas (gravadas + virtuais), em ordem de data. Cada uma: { id, number, date, notes, virtual,
// scenes: [{ id, scene_id, sort_order, virtual }] } — cenas na ordem de gravação arrumada.
export function deriveDays(projectId, { days, dayScenes, takes }) {
  const firstAt = {} // data -> cena -> 1ª hora gravada
  for (const t of takes) {
    if (!t.shoot_date) continue
    const m = (firstAt[t.shoot_date] ||= {})
    const at = t.recorded_at || t.created_at || ''
    if (!m[t.scene_id] || at < m[t.scene_id]) m[t.scene_id] = at
  }
  const alive = days.filter((d) => !d.deleted)
  const out = alive.map((d) => ({ ...d, virtual: false }))
  const byDate = new Set(alive.map((d) => d.date))
  for (const date of Object.keys(firstAt)) {
    if (!byDate.has(date)) out.push({ id: dayIdFor(projectId, date), project_id: projectId, date, number: null, notes: null, virtual: true })
  }
  out.sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.number ?? 0) - (b.number ?? 0))
  // diária virtual: número seguinte ao da diária anterior
  let maxBefore = 0
  for (const d of out) {
    if (d.number == null) d.number = maxBefore + 1
    maxBefore = Math.max(maxBefore, d.number)
  }
  const dsByDay = {}
  for (const ds of dayScenes) (dsByDay[ds.day_id] ||= []).push(ds)
  for (const d of out) {
    const rows = dsByDay[d.id] || []
    const withTakes = firstAt[d.date] || {}
    // cena com takes no dia nunca some da pasta (mesmo se a linha foi removida)
    const list = rows.filter((r) => !r.deleted || withTakes[r.scene_id]).map((r) => ({ ...r, deleted: false, virtual: !!r.deleted }))
    const have = new Set(list.map((r) => r.scene_id))
    list.sort((a, b) => a.sort_order - b.sort_order)
    let next = list.length ? list[list.length - 1].sort_order + 1 : 1
    const extra = Object.entries(withTakes).filter(([sid]) => !have.has(sid)).sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    for (const [sid] of extra) list.push({ id: daySceneIdFor(d.id, sid), project_id: projectId, day_id: d.id, scene_id: sid, sort_order: next++, virtual: true })
    d.scenes = list
  }
  return out
}

export async function loadDays(projectId) {
  return deriveDays(projectId, await loadRaw(projectId))
}

export const useDays = (projectId) => useLiveQuery(() => (projectId ? loadDays(projectId) : []), [projectId])

// Grava as diárias/cenas virtuais (só quem pode editar). Chamado ao abrir o projeto e ao criar takes.
export async function ensureDays(projectId) {
  const derived = await loadDays(projectId)
  const db = getDb()
  const uid = currentUserId()
  const dayRows = []
  const dsRows = []
  for (const d of derived) {
    if (d.virtual) {
      const cur = await db.shoot_days.get(d.id)
      dayRows.push(mark({ ...(cur || {}), id: d.id, project_id: projectId, number: d.number, date: d.date, notes: cur?.notes ?? null,
        created_by: cur?.created_by || uid, deleted: false, created_at: cur?.created_at || nowISO() }))
    }
    for (const s of d.scenes) {
      if (!s.virtual) continue
      const cur = await db.day_scenes.get(s.id)
      dsRows.push(mark({ ...(cur || {}), id: s.id, project_id: projectId, day_id: d.id, scene_id: s.scene_id, sort_order: s.sort_order,
        created_by: cur?.created_by || uid, deleted: false, created_at: cur?.created_at || nowISO() }))
    }
  }
  if (!dayRows.length && !dsRows.length) return 0
  await db.transaction('rw', db.shoot_days, db.day_scenes, async () => {
    if (dayRows.length) await db.shoot_days.bulkPut(dayRows)
    if (dsRows.length) await db.day_scenes.bulkPut(dsRows)
  })
  scheduleSync()
  return dayRows.length + dsRows.length
}

export async function createDay(projectId, { number, date, notes }) {
  const db = getDb()
  const all = await loadDays(projectId)
  if (all.some((d) => d.date === date && !d.virtual)) throw new Error('Já existe uma diária nesta data')
  const id = dayIdFor(projectId, date)
  const cur = await db.shoot_days.get(id)
  const row = mark({ ...(cur || {}), id, project_id: projectId, number: Number(number), date, notes: notes || null,
    created_by: cur?.created_by || currentUserId(), deleted: false, created_at: cur?.created_at || nowISO() })
  await db.shoot_days.put(row)
  scheduleSync()
  return row
}

// Editar número/data/notas. Mudar a data leva junto os takes daquele dia.
export async function updateDay(day, { number, date, notes }) {
  const db = getDb()
  const all = await loadDays(day.project_id)
  if (date !== day.date && all.some((d) => d.id !== day.id && d.date === date)) throw new Error('Já existe uma diária nesta data')
  await materializeDay(day)
  await db.transaction('rw', db.shoot_days, db.takes, async () => {
    const cur = await db.shoot_days.get(day.id)
    await db.shoot_days.put(mark({ ...cur, number: Number(number), date, notes: notes || null }))
    if (date !== day.date) {
      const takes = await db.takes.where('project_id').equals(day.project_id).toArray()
      const moved = takes.filter((t) => !t.deleted && t.shoot_date === day.date).map((t) => mark({ ...t, shoot_date: date }))
      if (moved.length) await db.takes.bulkPut(moved)
    }
  })
  scheduleSync()
}

export async function deleteDay(day) {
  const db = getDb()
  const takes = (await db.takes.where('project_id').equals(day.project_id).toArray()).filter((t) => !t.deleted && t.shoot_date === day.date)
  if (takes.length) throw new Error('Esta diária tem takes gravados. Exclua ou mude a data dos takes antes.')
  await db.transaction('rw', db.shoot_days, db.day_scenes, async () => {
    const cur = await db.shoot_days.get(day.id)
    if (cur) await db.shoot_days.put(mark({ ...cur, deleted: true }))
    const ds = await db.day_scenes.where('day_id').equals(day.id).toArray()
    if (ds.length) await db.day_scenes.bulkPut(ds.map((r) => mark({ ...r, deleted: true })))
  })
  scheduleSync()
}

// Grava a diária (se virtual) e a ordem atual de todas as cenas dela
async function materializeDay(day, order = day.scenes) {
  const db = getDb()
  const uid = currentUserId()
  await db.transaction('rw', db.shoot_days, db.day_scenes, async () => {
    const cur = await db.shoot_days.get(day.id)
    if (!cur || cur.deleted) {
      await db.shoot_days.put(mark({ ...(cur || {}), id: day.id, project_id: day.project_id, number: day.number, date: day.date,
        notes: day.notes ?? null, created_by: cur?.created_by || uid, deleted: false, created_at: cur?.created_at || nowISO() }))
    }
    for (const [i, s] of order.entries()) {
      const r = await db.day_scenes.get(s.id)
      const sort = (i + 1) * 10
      if (r && !r.deleted && r.sort_order === sort) continue
      await db.day_scenes.put(mark({ ...(r || {}), id: s.id, project_id: day.project_id, day_id: day.id, scene_id: s.scene_id,
        sort_order: sort, created_by: r?.created_by || uid, deleted: false, created_at: r?.created_at || nowISO() }))
    }
  })
  scheduleSync()
}

export async function addScenesToDay(day, sceneIds) {
  const have = new Set(day.scenes.map((s) => s.scene_id))
  const add = sceneIds.filter((id) => !have.has(id)).map((sid) => ({ id: daySceneIdFor(day.id, sid), scene_id: sid }))
  if (add.length) await materializeDay(day, [...day.scenes, ...add])
}

// Tira a cena da pasta (a cena continua no roteiro). Cena com takes no dia não sai.
export async function removeSceneFromDay(day, sceneId) {
  const db = getDb()
  const takes = (await db.takes.where('scene_id').equals(sceneId).toArray()).filter((t) => !t.deleted && t.shoot_date === day.date)
  if (takes.length) throw new Error('Esta cena tem takes gravados nesta diária.')
  await materializeDay(day, day.scenes.filter((s) => s.scene_id !== sceneId))
  const id = daySceneIdFor(day.id, sceneId)
  const row = (await db.day_scenes.get(id)) || (await db.day_scenes.where('day_id').equals(day.id).toArray()).find((r) => r.scene_id === sceneId)
  if (row) await db.day_scenes.put(mark({ ...row, deleted: true }))
  scheduleSync()
}

export async function moveSceneInDay(day, sceneId, dir) {
  const list = [...day.scenes]
  const i = list.findIndex((s) => s.scene_id === sceneId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  await materializeDay(day, list)
}

// Data e hora para um take novo criado dentro de uma diária (registro depois do dia usa a data da diária)
export function whenForDay(day, today, now = new Date()) {
  if (!day || day.date === today) return null
  const [y, m, d] = day.date.split('-').map(Number)
  return { date: day.date, at: new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString() }
}

// Grava no aparelho o projeto lido do CSV do Resolve (resolveCsv.js). Só depois da confirmação na tela.
import { getDb, currentUserId } from './db'
import { scheduleSync } from './sync'
import { uuid, nowISO } from './util'
import { dayIdFor, ensureDays } from './days'
import { tcTime } from './resolveCsv'

export { decodeCsv, analyzeResolveCsv } from './resolveCsv'

// ---------- gravação (depois da confirmação) ----------
const mark = (row) => ({ deleted: false, created_at: nowISO(), ...row, _dirty: 1, _rev: 1, _err: null })

// Hora do take = data da diária + TC de início (o TC estava no relógio do dia; o relógio interno da câmera não)
const recordedAt = (t) => {
  const hm = tcTime(t.tc_in)
  return t.shoot_date && hm ? new Date(`${t.shoot_date}T${hm}-03:00`).toISOString() : null
}

// keys = diárias marcadas na prévia (dayGroups[].key); sem keys, as marcadas por padrão
export async function importResolvePlan(plan, title, keys) {
  const on = new Set(keys || plan.dayGroups.filter((g) => g.include).map((g) => g.key))
  const chosen = plan.takes.filter((t) => on.has(t.shoot_date || 'sem-data'))
  const db = getDb()
  const uid = currentUserId()
  const p = plan.project
  const projectId = uuid()
  const project = mark({
    id: projectId, owner_id: uid, title: title || p.title, production_type: 'Longa', director: p.director, dop: p.dop,
    first_ac: p.first_ac, logger: p.logger, camera_body: p.camera_body,
    kit: {
      cameras: p.cameras,
      fields: ['tc_in', 'tc_out', 'lut', 'codec', 'resolution'],
      ficha: Object.fromEntries(Object.entries({ ...p.ficha, continuidade: p.scriptSupervisor, operador: p.operator }).filter(([, v]) => v)),
      importado: { de: 'DaVinci Resolve', em: nowISO(), clipes: chosen.length },
    },
    notes: null,
  })
  const scenes = new Map(), shots = new Map(), days = new Map()
  const takes = []
  let order = 0
  // cenas e planos na ordem em que foram gravados
  const ordered = chosen.slice().sort((a, b) => String(a.shoot_date).localeCompare(String(b.shoot_date)) || String(a.tc_in).localeCompare(String(b.tc_in)))
  for (const t of ordered) {
    if (!scenes.has(t.scene)) {
      scenes.set(t.scene, mark({ id: uuid(), project_id: projectId, number: t.scene, int_ext: t.scene === 'AVULSOS' ? null : t.int_ext,
        period: t.scene === 'AVULSOS' ? null : t.period, location: t.scene === 'AVULSOS' ? null : t.location,
        description: t.scene === 'AVULSOS' ? 'Clipes sem take: falso REC, ensaio e sem claquete' : null, sort_order: order++, created_by: uid }))
    }
    const scene = scenes.get(t.scene)
    const sk = `${t.scene}|${t.shot}`
    if (!shots.has(sk)) shots.set(sk, mark({ id: uuid(), project_id: projectId, scene_id: scene.id, code: t.shot || '1', shot_type: null, description: null, sort_order: order++, created_by: uid }))
    const shot = shots.get(sk)
    if (t.shoot_date && !days.has(t.shoot_date)) {
      days.set(t.shoot_date, mark({ id: dayIdFor(projectId, t.shoot_date), project_id: projectId, number: t.day, date: t.shoot_date, notes: null, created_by: uid }))
    }
    const extra = Object.fromEntries(Object.entries({ tc_in: t.tc_in, tc_out: t.tc_out, lut: t.lut, codec: p.ficha.codec, resolution: p.ficha.resolucao }).filter(([, v]) => v))
    takes.push(mark({
      id: uuid(), project_id: projectId, scene_id: scene.id, shot_id: shot.id, take_number: t.take_number,
      shoot_date: t.shoot_date || nowISO().slice(0, 10), camera: t.camera, roll: t.roll, clip: t.clip, lens: t.lens, t_stop: t.t_stop,
      filters: t.filters, focus: null, iso: t.iso, shutter: t.shutter, fps: t.fps, wb: t.wb, status: t.status, rating: t.rating,
      notes: t.notes, comments: t.comments, recorded_at: recordedAt(t), created_by: uid, sound: t.sound, marks: null, extra,
      clip_type: t.clip_type, duration: t.duration, file_name: t.file_name,
    }))
  }
  await db.transaction('rw', [db.projects, db.scenes, db.shots, db.takes, db.shoot_days], async () => {
    await db.projects.put(project)
    await db.scenes.bulkPut([...scenes.values()])
    await db.shots.bulkPut([...shots.values()])
    await db.shoot_days.bulkPut([...days.values()])
    await db.takes.bulkPut(takes)
  })
  await ensureDays(projectId) // cenas de cada diária, na ordem de gravação
  scheduleSync()
  return projectId
}

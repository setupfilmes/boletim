import Dexie from 'dexie'

// Um banco local (IndexedDB) por usuário — contas diferentes no mesmo aparelho não se misturam.
let current = null

export function openDb(userId) {
  if (current?.userId === userId) return current.db
  current?.db.close()
  const db = new Dexie(`boletim_${userId}`)
  db.version(1).stores({
    projects: 'id, _dirty',
    scenes: 'id, project_id, _dirty',
    shots: 'id, scene_id, project_id, _dirty',
    takes: 'id, shot_id, scene_id, project_id, shoot_date, _dirty',
    kit_items: 'id, category, _dirty',
    meta: 'key',
  })
  // v2: fotos por take. photo_blobs é só local (a imagem em si); pending=1 = ainda não subiu para o Storage
  db.version(2).stores({
    take_photos: 'id, take_id, project_id, _dirty',
    photo_blobs: 'id, pending',
  })
  current = { userId, db }
  return db
}

export function getDb() {
  if (!current) throw new Error('Banco local não aberto')
  return current.db
}

export function currentUserId() {
  return current?.userId || null
}

export function closeDb() {
  current?.db.close()
  current = null
}

// Colunas que existem no servidor (o resto é controle local: _dirty, _rev, _err)
export const COLUMNS = {
  projects: ['id', 'owner_id', 'title', 'production_type', 'company', 'director', 'dop', 'first_ac', 'second_ac',
    'logger', 'camera_body', 'kit', 'notes', 'deleted', 'created_at'],
  scenes: ['id', 'project_id', 'number', 'int_ext', 'period', 'location', 'description', 'sort_order', 'created_by',
    'deleted', 'created_at'],
  // link_id/cameras só vão no envio quando existem na linha (planos antigos/sem vínculo não mandam essas colunas)
  shots: ['id', 'project_id', 'scene_id', 'code', 'shot_type', 'description', 'sort_order', 'created_by', 'deleted',
    'created_at', 'link_id', 'cameras'],
  takes: ['id', 'project_id', 'scene_id', 'shot_id', 'take_number', 'shoot_date', 'camera', 'roll', 'clip', 'lens',
    't_stop', 'filters', 'focus', 'iso', 'shutter', 'fps', 'wb', 'status', 'notes', 'recorded_at', 'created_by',
    'deleted', 'created_at', 'sound', 'circled', 'marks', 'extra'],
  kit_items: ['id', 'owner_id', 'category', 'value', 'sort_order', 'deleted', 'created_at'],
  take_photos: ['id', 'project_id', 'take_id', 'path', 'width', 'height', 'caption', 'created_by', 'deleted', 'created_at'],
}

export const TABLES = ['projects', 'kit_items', 'scenes', 'shots', 'takes', 'take_photos'] // ordem de envio: pais antes dos filhos

export async function getMeta(key, fallback = null) {
  const r = await getDb().meta.get(key)
  return r ? r.value : fallback
}
export async function setMeta(key, value) {
  await getDb().meta.put({ key, value })
}

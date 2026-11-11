// Sincronização "local primeiro": o aparelho é a fonte de trabalho; a nuvem recebe quando houver internet.
import { supabase } from './supabase'
import { getDb, currentUserId, COLUMNS, TABLES, getMeta, setMeta } from './db'

const PAGE = 1000
const PHOTO_BUCKET = 'take-photos'
const OVERLAP_MS = 60_000 // relê o último minuto para não perder nada por diferença de relógio/transação

// ---------- estado observável (para o indicador na tela) ----------
let state = { status: 'idle', lastSync: null, error: null, canSync: false }
const listeners = new Set()
function setState(patch) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
export const syncStore = {
  subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
  get: () => state,
}

let online = typeof navigator === 'undefined' ? true : navigator.onLine
let enabled = false // só sincroniza com sessão válida
let running = false
let again = false
let timer = null
let claimed = false // convites guardados: pede uma vez por sessão (o gatilho do banco já cuida no cadastro)

export function setSyncEnabled(v) {
  enabled = v
  setState({ canSync: v })
  if (v) scheduleSync(300)
}

export function scheduleSync(delay = 1500) {
  clearTimeout(timer)
  timer = setTimeout(() => { syncNow() }, delay)
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { online = true; scheduleSync(500) })
  window.addEventListener('offline', () => { online = false; setState({ status: 'offline' }) })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(500) })
  setInterval(() => { if (online && enabled) syncNow() }, 60_000)
}

export async function syncNow() {
  if (!supabase || !currentUserId()) return
  if (!online) return setState({ status: 'offline' })
  if (!enabled) return
  if (running) { again = true; return }
  running = true
  setState({ status: 'syncing', error: null })
  try {
    // recebe antes de enviar: as mudanças dos outros são mescladas campo a campo nas linhas pendentes
    // daqui (mergeRow), e o envio leva só o que mudou neste aparelho
    await pull()
    await push()
    setState({ status: 'idle', lastSync: new Date().toISOString(), error: null })
  } catch (e) {
    const msg = e?.message || String(e)
    const netErr = /fetch|network|Failed to|Load failed/i.test(msg)
    setState({ status: netErr ? 'offline' : 'error', error: netErr ? null : msg })
  } finally {
    running = false
    if (again) { again = false; scheduleSync(300) }
  }
}

const pick = (row, cols) => Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c] ?? null]))

// ---------- MESCLA POR CAMPO ----------
// Cada linha guarda em `_base` os valores que o servidor tinha da última vez que conversamos com ele.
// Campo diferente da base = mudou neste aparelho. Assim duas pessoas editando o mesmo take (o AC muda a lente,
// a continuidade marca GOOD) não apagam o trabalho uma da outra: cada uma envia só os campos que mexeu.
// Linhas sem `_base` (criadas aqui e nunca enviadas, ou de antes desta versão) vão inteiras, como antes.
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const baseOf = (table, row) => pick(row, COLUMNS[table])

// Campos que mudaram aqui desde a base
export function changedFields(table, row) {
  if (!row._base) return null
  return COLUMNS[table].filter((c) => c in row && !same(row[c], row._base[c]))
}

// Linha pendente aqui + versão nova do servidor: fica com o servidor, menos o que mudou aqui.
// Em colunas jsonb de objeto (extra, kit) a mescla é por chave: a LUT de um e a ficha do outro convivem.
export function mergeRow(table, local, server) {
  const out = { ...server }
  for (const c of changedFields(table, local) || []) {
    const lv = local[c], bv = local._base[c], sv = server[c]
    if (isObj(lv) && (isObj(bv) || bv == null) && (isObj(sv) || sv == null)) {
      const m = { ...(sv || {}) }
      for (const k of new Set([...Object.keys(lv), ...Object.keys(bv || {})])) {
        if (same(lv[k], bv?.[k])) continue
        if (lv[k] === undefined) delete m[k]
        else m[k] = lv[k]
      }
      out[c] = m
    } else out[c] = lv
  }
  return { ...out, _dirty: 1, _rev: local._rev || 0, _err: local._err || null, _base: baseOf(table, server) }
}

// ---------- ENVIO ----------
// Fotos: a imagem sobe para o Storage antes do registro (quem baixar o registro já encontra o arquivo)
async function uploadPhotos() {
  const db = getDb()
  const pending = await db.photo_blobs.where('pending').equals(1).toArray()
  for (const b of pending) {
    const row = await db.take_photos.get(b.id)
    if (!row || row.deleted) { await db.photo_blobs.delete(b.id); continue }
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(row.path, b.blob, { upsert: true, contentType: 'image/jpeg' })
    if (!error) await db.photo_blobs.update(b.id, { pending: 0 })
    else if (isNetwork(error)) throw error
    else await db.take_photos.update(b.id, { _err: error.message })
  }
}

async function push() {
  const db = getDb()
  await uploadPhotos()
  const waiting = new Set(await db.photo_blobs.where('pending').equals(1).primaryKeys())
  for (const table of TABLES) {
    let dirty = await db[table].where('_dirty').equals(1).toArray()
    if (table === 'take_photos') dirty = dirty.filter((r) => !waiting.has(r.id))
    // linhas que o servidor já conhece: só os campos alterados (update por linha)
    const known = dirty.filter((r) => r._base)
    dirty = dirty.filter((r) => !r._base)
    for (let i = 0; i < known.length; i += 8) {
      const part = known.slice(i, i + 8)
      const again = await Promise.all(part.map((r) => pushChanged(table, r)))
      dirty.push(...part.filter((_, k) => again[k]))
    }
    for (let i = 0; i < dirty.length; i += 200) {
      const chunk = dirty.slice(i, i + 200)
      const payload = chunk.map((r) => pick(r, COLUMNS[table]))
      const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' })
      if (missingTable(error)) break // tabela nova ainda não criada no banco: fica pendente até rodar o SQL
      if (!error) {
        await markClean(table, chunk)
        if (table === 'take_photos') await removeDeletedPhotoFiles(chunk)
        continue
      }
      if (isNetwork(error)) throw error
      // lote recusado: tenta um a um para isolar a linha com problema
      for (const r of chunk) {
        const { error: e1 } = await supabase.from(table).upsert(pick(r, COLUMNS[table]), { onConflict: 'id' })
        if (!e1) { await markClean(table, [r]); if (table === 'take_photos') await removeDeletedPhotoFiles([r]) }
        else if (isNetwork(e1)) throw e1
        else await db[table].update(r.id, { _err: e1.message })
      }
    }
  }
}

// Envia só os campos alterados. Devolve true quando a linha não existe no servidor (vai inteira no upsert).
async function pushChanged(table, r) {
  const db = getDb()
  const fields = changedFields(table, r)
  if (!fields.length) { await markClean(table, [r]); return false }
  const { data, error } = await supabase.from(table).update(pick(r, fields)).eq('id', r.id).select('id')
  if (!error && !data?.length) return true
  if (!error) {
    await markClean(table, [r])
    if (table === 'take_photos') await removeDeletedPhotoFiles([r])
    return false
  }
  if (isNetwork(error)) throw error
  await db[table].update(r.id, { _err: error.message })
  return false
}

// Foto excluída e já registrada na nuvem: apaga o arquivo do Storage e a cópia local
async function removeDeletedPhotoFiles(rows) {
  const gone = rows.filter((r) => r.deleted)
  if (!gone.length) return
  await supabase.storage.from(PHOTO_BUCKET).remove(gone.map((r) => r.path)).catch(() => {})
  await getDb().photo_blobs.bulkDelete(gone.map((r) => r.id))
}

// Tabela que ainda não existe no servidor (atualização do banco não rodada): não trava o resto da sincronização
const missingTable = (err) => err && (err.code === 'PGRST205' || err.code === '42P01')

function isNetwork(err) {
  return /fetch|network|Failed to|Load failed/i.test(err?.message || '') && !err?.code
}

async function markClean(table, rows) {
  const db = getDb()
  await db.transaction('rw', db[table], async () => {
    for (const sent of rows) {
      const cur = await db[table].get(sent.id)
      if (!cur || cur._rev !== sent._rev) continue // mudou durante o envio: continua pendente
      if (cur.deleted) await db[table].delete(sent.id)
      else await db[table].update(sent.id, { _dirty: 0, _err: null, _base: baseOf(table, sent) })
    }
  })
}

// ---------- RECEBIMENTO ----------
async function pull() {
  const db = getDb()
  const firstSync = !(await getMeta('cursor:takes'))

  // convites guardados para o meu e-mail viram participação (sem a função no banco, só ignora)
  if (!claimed) {
    const { error: ec } = await supabase.rpc('claim_my_invites')
    if (!ec || ec.code === 'PGRST202') claimed = true
  }
  // avisos de compartilhamento já vistos neste aparelho
  const seenPending = await getMeta('sharesSeenPending', [])
  if (seenPending.length) {
    const { error: es } = await supabase.rpc('mark_shares_seen', { p_projects: seenPending })
    if (!es || es.code === 'PGRST202') await setMeta('sharesSeenPending', [])
  }

  // 1) Projetos: sempre a lista completa (é pequena) — detecta projetos novos, compartilhados ou removidos
  const { data: projects, error } = await supabase.from('projects').select('*')
  if (error) throw error
  const serverIds = new Set(projects.map((p) => p.id))
  const localProjects = await db.projects.toArray()
  const knownIds = new Set(localProjects.map((p) => p.id))

  for (const p of projects) await applyRow('projects', p)

  // minhas permissões nos projetos compartilhados (editor / viewer)
  const { data: mine, error: e2 } = await supabase.from('project_members').select('*').eq('user_id', currentUserId())
  if (e2) throw e2
  await setMeta('roles', Object.fromEntries(mine.map((m) => [m.project_id, m.role])))
  // compartilhamentos ainda não vistos -> aviso na tela (seen_at só existe depois da atualização de 19/10/2026)
  const stillPending = await getMeta('sharesSeenPending', [])
  await setMeta('newShares', mine.filter((m) => 'seen_at' in m && !m.seen_at && !stillPending.includes(m.project_id) && serverIds.has(m.project_id))
    .map((m) => ({ project_id: m.project_id, role: m.role, by: m.added_by_email || null, at: m.created_at })))
  // perdeu o acesso (ou foi excluído no servidor): remove do aparelho, se não houver nada pendente
  for (const lp of localProjects) {
    if (!serverIds.has(lp.id) && !lp._dirty) await removeProjectLocal(lp.id)
  }

  // 2) Projeto que apareceu agora (ex.: alguém compartilhou): baixa tudo dele
  if (!firstSync) {
    for (const p of projects) {
      if (!knownIds.has(p.id) && !p.deleted) {
        for (const t of ['scenes', 'shoot_days', 'day_scenes', 'shots', 'takes', 'take_photos']) await pullAll(t, (q) => q.eq('project_id', p.id))
      }
    }
  }

  // 3) Incremental por tabela
  for (const t of ['kit_items', 'scenes', 'shoot_days', 'day_scenes', 'shots', 'takes', 'take_photos']) {
    const cursor = await getMeta(`cursor:${t}`)
    const since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null
    const maxSeen = await pullAll(t, (q) => (since ? q.gt('updated_at', since) : q))
    if (maxSeen && (!cursor || Date.parse(maxSeen) > Date.parse(cursor))) await setMeta(`cursor:${t}`, maxSeen)
    else if (!cursor) await setMeta(`cursor:${t}`, new Date(0).toISOString())
  }
}

async function pullAll(table, filter) {
  let from = 0
  let maxSeen = null
  for (;;) {
    const q = filter(supabase.from(table).select('*')).order('updated_at', { ascending: true }).order('id').range(from, from + PAGE - 1)
    const { data, error } = await q
    if (missingTable(error)) return maxSeen
    if (error) throw error
    for (const row of data) {
      await applyRow(table, row)
      if (!maxSeen || Date.parse(row.updated_at) > Date.parse(maxSeen)) maxSeen = row.updated_at
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return maxSeen
}

async function applyRow(table, row) {
  const db = getDb()
  const local = await db[table].get(row.id)
  if (local?._dirty) {
    // pendente aqui: com base conhecida, mescla campo a campo; sem base (linha antiga), a local vence
    if (local._base && !row.deleted) await db[table].put(mergeRow(table, local, row))
    return
  }
  if (row.deleted) {
    if (table === 'projects') await removeProjectLocal(row.id)
    else if (local) await db[table].delete(row.id)
    if (table === 'take_photos') await db.photo_blobs.delete(row.id)
    return
  }
  await db[table].put({ ...row, _dirty: 0, _rev: local?._rev || 0, _err: null, _base: baseOf(table, row) })
}

async function removeProjectLocal(id) {
  const db = getDb()
  const photoIds = await db.take_photos.where('project_id').equals(id).primaryKeys()
  await db.transaction('rw', [db.projects, db.scenes, db.shoot_days, db.day_scenes, db.shots, db.takes, db.take_photos, db.photo_blobs], async () => {
    await db.photo_blobs.bulkDelete(photoIds)
    await db.day_scenes.where('project_id').equals(id).delete()
    await db.shoot_days.where('project_id').equals(id).delete()
    await db.take_photos.where('project_id').equals(id).delete()
    await db.takes.where('project_id').equals(id).delete()
    await db.shots.where('project_id').equals(id).delete()
    await db.scenes.where('project_id').equals(id).delete()
    await db.projects.delete(id)
  })
}

export async function pendingCount() {
  const db = getDb()
  let n = 0
  for (const t of TABLES) n += await db[t].where('_dirty').equals(1).count()
  return n
}

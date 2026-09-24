// Sincronização "local primeiro": o aparelho é a fonte de trabalho; a nuvem recebe quando houver internet.
import { supabase } from './supabase'
import { getDb, currentUserId, COLUMNS, TABLES, getMeta, setMeta } from './db'

const PAGE = 1000
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
    await push()
    await pull()
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

// ---------- ENVIO ----------
async function push() {
  const db = getDb()
  for (const table of TABLES) {
    const dirty = await db[table].where('_dirty').equals(1).toArray()
    for (let i = 0; i < dirty.length; i += 200) {
      const chunk = dirty.slice(i, i + 200)
      const payload = chunk.map((r) => pick(r, COLUMNS[table]))
      const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' })
      if (!error) {
        await markClean(table, chunk)
        continue
      }
      if (isNetwork(error)) throw error
      // lote recusado: tenta um a um para isolar a linha com problema
      for (const r of chunk) {
        const { error: e1 } = await supabase.from(table).upsert(pick(r, COLUMNS[table]), { onConflict: 'id' })
        if (!e1) await markClean(table, [r])
        else if (isNetwork(e1)) throw e1
        else await db[table].update(r.id, { _err: e1.message })
      }
    }
  }
}

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
      else await db[table].update(sent.id, { _dirty: 0, _err: null })
    }
  })
}

// ---------- RECEBIMENTO ----------
async function pull() {
  const db = getDb()
  const firstSync = !(await getMeta('cursor:takes'))

  // 1) Projetos: sempre a lista completa (é pequena) — detecta projetos novos, compartilhados ou removidos
  const { data: projects, error } = await supabase.from('projects').select('*')
  if (error) throw error
  const serverIds = new Set(projects.map((p) => p.id))
  const localProjects = await db.projects.toArray()
  const knownIds = new Set(localProjects.map((p) => p.id))

  for (const p of projects) await applyRow('projects', p)

  // minhas permissões nos projetos compartilhados (editor / viewer)
  const { data: mine, error: e2 } = await supabase.from('project_members').select('project_id, role').eq('user_id', currentUserId())
  if (e2) throw e2
  await setMeta('roles', Object.fromEntries(mine.map((m) => [m.project_id, m.role])))
  // perdeu o acesso (ou foi excluído no servidor): remove do aparelho, se não houver nada pendente
  for (const lp of localProjects) {
    if (!serverIds.has(lp.id) && !lp._dirty) await removeProjectLocal(lp.id)
  }

  // 2) Projeto que apareceu agora (ex.: alguém compartilhou): baixa tudo dele
  if (!firstSync) {
    for (const p of projects) {
      if (!knownIds.has(p.id) && !p.deleted) {
        for (const t of ['scenes', 'shots', 'takes']) await pullAll(t, (q) => q.eq('project_id', p.id))
      }
    }
  }

  // 3) Incremental por tabela
  for (const t of ['kit_items', 'scenes', 'shots', 'takes']) {
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
  if (local?._dirty) return // alteração local pendente vence; será enviada no próximo ciclo
  if (row.deleted) {
    if (table === 'projects') await removeProjectLocal(row.id)
    else if (local) await db[table].delete(row.id)
    return
  }
  await db[table].put({ ...row, _dirty: 0, _rev: local?._rev || 0, _err: null })
}

async function removeProjectLocal(id) {
  const db = getDb()
  await db.transaction('rw', db.projects, db.scenes, db.shots, db.takes, async () => {
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

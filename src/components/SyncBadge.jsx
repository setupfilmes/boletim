import { useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { syncStore } from '../lib/sync'
import { getDb, TABLES } from '../lib/db'
import { useAuth } from '../auth'
import { SyncIndicator } from '../ds/components'

export function usePending() {
  return useLiveQuery(async () => {
    const db = getDb()
    let n = 0
    for (const t of TABLES) n += await db[t].where('_dirty').equals(1).count()
    return n
  }, [], 0)
}

// Registros que o servidor recusou (ficam no aparelho com _err)
export function useErrored() {
  return useLiveQuery(async () => {
    const db = getDb()
    let n = 0
    for (const t of TABLES) n += (await db[t].where('_dirty').equals(1).toArray()).filter((r) => r._err).length
    return n
  }, [], 0)
}

export function useSyncState() {
  return useSyncExternalStore(syncStore.subscribe, syncStore.get)
}

// Estado no vocabulário do design system: enviado | pendente | enviando | offline | erro
export function useSyncView() {
  const s = useSyncState()
  const pending = usePending()
  const errored = useErrored()
  const { sessionOk } = useAuth()
  if (!sessionOk || s.status === 'offline') return { state: 'offline', count: pending }
  if (s.status === 'error' || errored) return { state: 'erro', count: errored || 1 }
  if (s.status === 'syncing' && pending) return { state: 'enviando', count: pending }
  if (pending) return { state: 'pendente', count: pending }
  return { state: 'enviado', count: 0 }
}

export default function SyncBadge({ compact = true }) {
  const v = useSyncView()
  const nav = useNavigate()
  return (
    <span data-testid="sync-badge" className="inline-flex">
      <SyncIndicator compact={compact} state={v.state} count={v.count} onPress={() => nav('/conta')} />
    </span>
  )
}

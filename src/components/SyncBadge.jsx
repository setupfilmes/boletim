import { useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { syncStore } from '../lib/sync'
import { getDb, TABLES } from '../lib/db'
import { useAuth } from '../auth'
import { IconCloud, IconCloudOff, IconSync } from './icons'

export function usePending() {
  return useLiveQuery(async () => {
    const db = getDb()
    let n = 0
    for (const t of TABLES) n += await db[t].where('_dirty').equals(1).count()
    return n
  }, [], 0)
}

export function useSyncState() {
  return useSyncExternalStore(syncStore.subscribe, syncStore.get)
}

export default function SyncBadge() {
  const s = useSyncState()
  const pending = usePending()
  const { sessionOk } = useAuth()
  const nav = useNavigate()

  let icon, color, label
  if (!sessionOk) { icon = <IconCloudOff size={20} />; color = 'text-check'; label = 'Sessão expirada — só no aparelho' }
  else if (s.status === 'syncing') { icon = <IconSync size={20} className="animate-spin" />; color = 'text-accent'; label = 'Sincronizando' }
  else if (s.status === 'error') { icon = <IconCloudOff size={20} />; color = 'text-ng'; label = 'Erro de sincronização' }
  else if (s.status === 'offline') { icon = <IconCloudOff size={20} />; color = 'text-muted'; label = 'Sem internet — salvo no aparelho' }
  else if (pending > 0) { icon = <IconCloud size={20} />; color = 'text-check'; label = 'Alterações aguardando envio' }
  else { icon = <IconCloud size={20} />; color = 'text-good'; label = 'Tudo sincronizado' }

  return (
    <button onClick={() => nav('/conta')} aria-label={label} title={label} data-testid="sync-badge"
      className={`relative inline-flex h-12 min-w-12 items-center justify-center gap-1 rounded-xl px-2 ${color}`}>
      {icon}
      {pending > 0 && <span className="font-mono text-xs font-medium">{pending}</span>}
    </button>
  )
}

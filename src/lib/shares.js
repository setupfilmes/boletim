// Aviso "projeto compartilhado com você". A sincronização guarda em meta.newShares os compartilhamentos que a
// pessoa ainda não viu (project_members.seen_at vazio); ao dispensar, marca como visto no servidor (com ou sem
// internet: fica em meta.sharesSeenPending até a próxima sincronização).
import { useLiveQuery } from 'dexie-react-hooks'
import { getDb, getMeta, setMeta } from './db'
import { scheduleSync } from './sync'

export const useNewShares = () =>
  useLiveQuery(async () => (await getDb().meta.get('newShares'))?.value || [], [], [])

export async function dismissShares(projectIds) {
  const ids = [].concat(projectIds)
  const cur = await getMeta('newShares', [])
  await setMeta('newShares', cur.filter((s) => !ids.includes(s.project_id)))
  const pending = await getMeta('sharesSeenPending', [])
  await setMeta('sharesSeenPending', [...new Set([...pending, ...ids])])
  scheduleSync(300)
}

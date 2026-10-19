import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDialog } from './ui'
import { getDb } from '../lib/db'
import { useNewShares } from '../lib/shares'

// Aviso rápido quando um projeto é compartilhado com você enquanto o app está aberto (em qualquer tela).
// O cartão com "Abrir / OK" fica na lista de projetos até ser dispensado.
export default function ShareWatcher() {
  const shares = useNewShares()
  const projects = useLiveQuery(() => getDb().projects.toArray(), [], [])
  const { notify } = useDialog()
  const told = useRef(new Set())
  useEffect(() => {
    for (const s of shares) {
      const p = projects.find((x) => x.id === s.project_id)
      if (!p || told.current.has(s.project_id)) continue
      told.current.add(s.project_id)
      notify(`Novo projeto compartilhado com você: ${p.title}${s.by ? ` (por ${s.by})` : ''}`)
    }
  }, [shares, projects, notify])
  return null
}

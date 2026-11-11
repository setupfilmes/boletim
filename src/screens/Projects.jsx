import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { TopBar, Btn, Empty } from '../components/ui'
import { Button, ProjetoCard, Banner } from '../ds/components'
import { useProjects } from '../lib/hooks'
import { getDb, TABLES } from '../lib/db'
import { createDemoProject } from '../lib/demo'
import { useAuth } from '../auth'
import { fmtDate, todayISO, plural } from '../lib/util'
import { takeKey, projectCameras } from '../lib/cameras'
import { useSyncState } from '../components/SyncBadge'
import ProjectForm from './ProjectForm'
import InstallHint from '../components/InstallHint'
import { dismissShares, useNewShares } from '../lib/shares'
import { useDialog } from '../components/ui'

// Início do app: um cartão por projeto (papel, tipo, direção, câmeras, última diária, pendências).
// O projeto com diária hoje vem primeiro, com contorno forte e a etiqueta HOJE.
export default function Projects() {
  const projects = useProjects()
  const { user } = useAuth()
  const nav = useNavigate()
  const { notify } = useDialog()
  const [form, setForm] = useState(false)
  const newShares = useNewShares()
  const sync = useSyncState()

  const info = useLiveQuery(async () => {
    const db = getDb()
    const out = {}
    const today = todayISO()
    const takes = await db.takes.toArray()
    const shotsById = Object.fromEntries((await db.shots.toArray()).map((s) => [s.id, s]))
    const days = (await db.shoot_days.toArray()).filter((d) => !d.deleted)
    for (const t of takes) {
      if (t.deleted) continue
      const o = (out[t.project_id] ||= { keys: new Set(), byDate: {}, last: null, pend: 0 })
      const k = takeKey(t, shotsById)
      o.keys.add(k)
      ;(o.byDate[t.shoot_date] ||= new Set()).add(k)
      if (!o.last || t.shoot_date > o.last) o.last = t.shoot_date
    }
    for (const d of days) {
      const o = (out[d.project_id] ||= { keys: new Set(), byDate: {}, last: null, pend: 0 })
      ;(o.days ||= []).push(d)
      if (d.date === today) o.today = d
    }
    // pendências de envio por projeto (o próprio projeto e tudo dentro dele)
    for (const t of TABLES) {
      if (t === 'kit_items') continue
      for (const r of await db[t].where('_dirty').equals(1).toArray()) {
        const pid = t === 'projects' ? r.id : r.project_id
        ;(out[pid] ||= { keys: new Set(), byDate: {}, last: null, pend: 0 }).pend++
      }
    }
    return out
  }, [], {})
  const roles = useLiveQuery(async () => (await getDb().meta.get('roles'))?.value || {}, [], {})

  const today = todayISO()
  const isToday = (p) => !!(info?.[p.id]?.today || info?.[p.id]?.byDate?.[today])
  const list = [...(projects || [])].sort((a, b) => Number(isToday(b)) - Number(isToday(a)))

  const card = (p) => {
    const o = info?.[p.id]
    const papel = p.owner_id === user?.id ? 'dono' : roles?.[p.id] === 'viewer' ? 'visualizar' : 'editar'
    const cams = projectCameras(p).map((c) => c.id)
    const detalhe = [p.director && `Dir. ${p.director}`, cams.length > 1 && `Câm. ${cams.join('+')}`].filter(Boolean).join(' · ')
    let atividade = null
    if (o) {
      const hoje = isToday(p)
      const date = hoje ? today : o.last
      const dayN = o.days?.find((d) => d.date === date)?.number
      const n = date ? o.byDate[date]?.size || 0 : 0
      if (date) atividade = `${dayN ? `Dia ${String(dayN).padStart(2, '0')} · ` : ''}${hoje ? 'hoje' : fmtDate(date)} · ${plural(n, 'take')}`
      if (!date && o.keys.size === 0) atividade = null
    }
    return (
      <ProjetoCard key={p.id} nome={p.title} papel={papel} tipo={p.production_type || 'Projeto'} detalhe={detalhe || undefined}
        atividade={atividade || 'Nenhum take ainda'} pendentes={o?.pend || 0} offline={sync.status === 'offline'}
        hoje={isToday(p)} onPress={() => nav(`/p/${p.id}`)} />
    )
  }

  return (
    <>
      <TopBar title="Projetos" subtitle={user?.name || user?.email} />
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-28">
        <InstallHint />
        {newShares.map((s) => {
          const p = projects?.find((x) => x.id === s.project_id)
          if (!p) return null
          return (
            <div key={s.project_id} className="mb-3" data-testid="share-notice">
              <Banner tone="compartilhado" title={`${s.by || 'Alguém'} compartilhou “${p.title}” com você`}>
                {s.role === 'viewer' ? 'Você pode visualizar e gerar relatórios.' : 'Você pode registrar e editar takes.'}
              </Banner>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button size="p" variant="primario" onClick={() => { dismissShares(s.project_id); nav(`/p/${p.id}`) }}>Abrir</Button>
                <Button size="p" onClick={() => dismissShares(s.project_id)} data-testid="share-ok">OK</Button>
              </div>
            </div>
          )
        })}
        {projects && projects.length === 0 && (
          <Empty icon="folder-open" title="Nenhum projeto ainda"
            action={<div className="grid gap-3">
              <Btn size="lg" onClick={() => setForm(true)}>Criar projeto</Btn>
              <Btn variant="ghost" onClick={async () => {
                const p = await createDemoProject(user?.name)
                notify('Projeto de demonstração criado')
                nav(`/p/${p.id}`)
              }} data-testid="empty-demo">Ver demonstração preenchida (5 diárias)</Btn>
              <Btn variant="ghost" onClick={() => nav('/importar')} data-testid="empty-import">Importar do DaVinci Resolve</Btn>
            </div>}>
            Crie seu primeiro projeto. Tudo fica salvo no celular e sincroniza quando houver internet.
          </Empty>
        )}
        <div className="grid grid-cols-1 gap-2" data-testid="projects">{list.map(card)}</div>
        {projects?.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button block icon="plus" onClick={() => setForm(true)} data-testid="new-project">Novo projeto</Button>
            <Button block icon="file-spreadsheet" onClick={() => nav('/importar')} data-testid="import-project">Importar do Resolve</Button>
          </div>
        )}
      </main>
      <ProjectForm open={form} onClose={() => setForm(false)} onSaved={(p) => nav(`/p/${p.id}`)} />
    </>
  )
}

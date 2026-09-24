import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { TopBar, Btn, Empty, Card, useDialog } from '../components/ui'
import { IconPlus, IconChevron } from '../components/icons'
import { useProjects } from '../lib/hooks'
import { getDb } from '../lib/db'
import { createExampleProject } from '../lib/repo'
import { useAuth } from '../auth'
import { fmtDate } from '../lib/util'
import { takeKey } from '../lib/cameras'
import ProjectForm from './ProjectForm'

export default function Projects() {
  const projects = useProjects()
  const { user } = useAuth()
  const nav = useNavigate()
  const { notify } = useDialog()
  const [form, setForm] = useState(false)

  const stats = useLiveQuery(async () => {
    const db = getDb()
    const out = {}
    const scenes = await db.scenes.toArray()
    const takes = await db.takes.toArray()
    for (const s of scenes) if (!s.deleted) (out[s.project_id] ||= { scenes: 0, takes: 0, last: null }).scenes++
    for (const t of takes) {
      if (t.deleted) continue
      const o = (out[t.project_id] ||= { scenes: 0, takes: 0, last: null })
      ;(o.keys ||= new Set()).add(takeKey(t))
      o.takes = o.keys.size
      if (!o.last || t.shoot_date > o.last) o.last = t.shoot_date
    }
    return out
  }, [], {})

  return (
    <>
      <TopBar title="Projetos" subtitle={user?.name || user?.email} />
      <main className="mx-auto max-w-5xl px-4 pt-4 pb-28">
        {projects && projects.length === 0 && (
          <Empty title="Nenhum projeto ainda">
            Crie seu primeiro projeto. Tudo fica salvo no celular e sincroniza quando houver internet.
            <div className="mt-6 grid gap-3">
              <Btn size="lg" onClick={() => setForm(true)}><IconPlus /> Novo projeto</Btn>
              <Btn variant="ghost" onClick={async () => {
                const p = await createExampleProject(user?.name)
                notify('Projeto de exemplo criado')
                nav(`/p/${p.id}`)
              }}>Criar exemplo “A Tela” (32 cenas)</Btn>
            </div>
          </Empty>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {projects?.map((p) => {
            const st = stats?.[p.id] || { scenes: 0, takes: 0 }
            const shared = p.owner_id !== user?.id
            return (
              <Card key={p.id} className="active:border-accent">
                <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => nav(`/p/${p.id}`)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted">
                      <span>{p.production_type || 'Projeto'}</span>
                      {shared && <span className="rounded border border-accent px-1 text-accent">Compartilhado</span>}
                      {p._err && <span className="text-ng">Erro ao enviar</span>}
                    </div>
                    <div className="truncate font-display text-2xl font-extrabold">{p.title}</div>
                    <div className="mt-1 font-mono text-sm text-muted">
                      {st.scenes} cenas · {st.takes} takes{st.last ? ` · última diária ${fmtDate(st.last)}` : ''}
                    </div>
                  </div>
                  <IconChevron className="text-muted" />
                </button>
              </Card>
            )
          })}
        </div>
      </main>
      {projects?.length > 0 && (
        <div className="fixed inset-x-0 z-20 mx-auto max-w-xl px-4 pb-3" style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}>
          <Btn full size="lg" onClick={() => setForm(true)}><IconPlus /> Novo projeto</Btn>
        </div>
      )}
      <ProjectForm open={form} onClose={() => setForm(false)} onSaved={(p) => nav(`/p/${p.id}`)} />
    </>
  )
}

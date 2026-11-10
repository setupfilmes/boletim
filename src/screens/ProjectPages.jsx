import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { TopBar, Btn, Empty, Card, useDialog } from '../components/ui'
import { IconEdit, IconTrash } from '../components/icons'
import { useProject, useRole } from '../lib/hooks'
import { deleteProject } from '../lib/repo'
import { useAuth } from '../auth'
import { fmtDate } from '../lib/util'
import ProjectForm from './ProjectForm'
import Team from './Team'

// Páginas do menu ⋮ do projeto: Equipe (acesso) e Ficha técnica
function useProjectPage() {
  const { projectId } = useParams()
  const project = useProject(projectId)
  const { user } = useAuth()
  const role = useRole(project, user?.id)
  return { projectId, project, role }
}

export function EquipePage() {
  const { projectId, project, role } = useProjectPage()
  if (project === undefined) return null
  if (!project) return (<><TopBar title="Equipe" back="/" /><Empty title="Projeto não encontrado" /></>)
  return (
    <>
      <TopBar title="Equipe" subtitle={project.title} back={`/p/${projectId}`} />
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-28"><Team project={project} role={role} /></main>
    </>
  )
}

export function FichaPage() {
  const { projectId, project, role } = useProjectPage()
  const nav = useNavigate()
  const [edit, setEdit] = useState(false)
  const { confirm, notify } = useDialog()
  if (project === undefined) return null
  if (!project) return (<><TopBar title="Ficha técnica" back="/" /><Empty title="Projeto não encontrado" /></>)
  const rows = [
    ['Nome do projeto', project.title], ['Tipo', project.production_type], ['Produtora', project.company], ['Direção', project.director],
    ['Dir. de foto', project.dop], ['1º AC', project.first_ac], ['2º AC', project.second_ac],
    ['DIT / Logger', project.logger], ['Câmera', project.camera_body],
    ['Lentes do projeto', (project.kit?.lens || []).join(', ') || 'Kit inteiro'],
    ['Filtros do projeto', (project.kit?.filter || []).join(', ') || 'Kit inteiro'],
    ['Criado em', fmtDate(project.created_at)], ['Observações', project.notes],
  ]
  return (
    <>
      <TopBar title="Ficha técnica" subtitle={project.title} back={`/p/${projectId}`} />
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-28">
        <Card className="divide-y-2 divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-3 px-4 py-3">
              <div className="w-36 shrink-0 text-[13px] font-bold uppercase tracking-[.07em] text-muted">{k}</div>
              <div className="min-w-0 flex-1 break-words">{v || '—'}</div>
            </div>
          ))}
        </Card>
        <div className="mt-4 grid gap-3">
          {role !== 'viewer' && <Btn variant="surface" onClick={() => setEdit(true)}><IconEdit /> Editar projeto</Btn>}
          {role === 'owner' && (
            <Btn variant="danger" onClick={async () => {
              if (await confirm({ title: 'Excluir projeto', danger: true, confirmLabel: 'Excluir',
                message: `Excluir “${project.title}” com todas as cenas, planos e takes?\nIsso também remove para quem tem o projeto compartilhado.` })) {
                await deleteProject(project.id); notify('Projeto excluído'); nav('/')
              }
            }}><IconTrash /> Excluir projeto</Btn>
          )}
        </div>
      </main>
      <ProjectForm open={edit} onClose={() => setEdit(false)} project={project} />
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { TopBar, Btn, Empty, Field, ChipSelect, useDialog } from '../components/ui'
import { CameraBadge, Icon } from '../ds/components'
import { ficha, FORMAT_FIELDS, NUMERACOES, numeracao } from '../lib/ficha'
import { IconEdit, IconTrash } from '../components/icons'
import { useProject, useRole } from '../lib/hooks'
import { deleteProject, update } from '../lib/repo'
import { useAuth } from '../auth'
import { fmtDate } from '../lib/util'
import ProjectForm, { PROJECT_TYPES } from './ProjectForm'
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
  const ro = role === 'viewer'
  const f = ficha(project)
  const saveCol = (k) => (v) => update('projects', project.id, { [k]: v || null })
  const saveFicha = (k) => (v) => update('projects', project.id, { kit: { ...project.kit, ficha: { ...ficha(project), [k]: v || null } } })
  const cams = project.kit?.cameras?.length ? project.kit.cameras : [{ id: 'A', body: project.camera_body || '' }]
  const saveCam = (id, k) => (v) => {
    const next = cams.map((c) => (c.id === id ? { ...c, [k]: v || '' } : c))
    const body = next.length === 1 ? next[0].body : next.filter((c) => c.body).map((c) => `${c.id}: ${c.body}`).join(', ')
    return update('projects', project.id, { kit: { ...project.kit, cameras: next }, camera_body: body || null })
  }
  const conv = numeracao(project)
  return (
    <>
      <TopBar title="Ficha técnica" subtitle={project.title} back={`/p/${projectId}`} />
      <main className="mx-auto grid max-w-3xl gap-4 px-4 pt-4 pb-28" data-testid="ficha">
        <p className="text-[15px] text-muted">{ro ? 'Você pode ver a ficha técnica deste projeto.' : 'Cada campo salva sozinho. A ficha vai para o cabeçalho do boletim e para os arquivos da pós.'}</p>
        <Bloco titulo="Projeto">
          <AutoField label="Título" value={project.title} onSave={(v) => v && update('projects', project.id, { title: v })} readOnly={ro} required />
          <AutoField label="Código ou título provisório" value={f.codigo} onSave={saveFicha('codigo')} readOnly={ro} />
          <Field label="Tipo"><ChipSelect options={PROJECT_TYPES} value={project.production_type} onChange={(v) => !ro && update('projects', project.id, { production_type: v })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <AutoField label="Produtora" value={project.company} onSave={saveCol('company')} readOnly={ro} />
            <AutoField label="Ano" value={f.ano} onSave={saveFicha('ano')} readOnly={ro} inputMode="numeric" mono />
          </div>
          <AutoField label="Direção" value={project.director} onSave={saveCol('director')} readOnly={ro} />
        </Bloco>
        <Bloco titulo="Equipe de câmera">
          <div className="grid grid-cols-2 gap-3">
            <AutoField label="Dir. de foto" value={project.dop} onSave={saveCol('dop')} readOnly={ro} />
            <AutoField label="1º AC" value={project.first_ac} onSave={saveCol('first_ac')} readOnly={ro} />
            <AutoField label="2º AC" value={project.second_ac} onSave={saveCol('second_ac')} readOnly={ro} />
            <AutoField label="DIT" value={project.logger} onSave={saveCol('logger')} readOnly={ro} />
          </div>
          <AutoField label="Logger / vídeo assist" value={f.video_assist} onSave={saveFicha('video_assist')} readOnly={ro} />
        </Bloco>
        <Bloco titulo="Câmeras" dica={cams.length >= 2 ? 'Multicâmera: cada take é registrado por câmera, com status próprio.' : undefined}>
          {cams.map((c) => (
            <div key={c.id} className="grid grid-cols-[auto_1fr] items-end gap-3" data-testid="ficha-cam">
              <span className="mb-3"><CameraBadge cam={c.id} /></span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[3fr_2fr]">
                <AutoField label={`Câmera ${c.id} · corpo`} value={c.body} onSave={saveCam(c.id, 'body')} readOnly={ro} />
                <AutoField label="Nº de série" id={`serie-${c.id}`} value={c.serial} onSave={saveCam(c.id, 'serial')} readOnly={ro} mono />
              </div>
            </div>
          ))}
        </Bloco>
        <Bloco titulo="Formato de captação">
          <div className="grid grid-cols-2 gap-3">
            {FORMAT_FIELDS.map((x) => <AutoField key={x.k} label={x.label} value={f[x.k]} onSave={saveFicha(x.k)} readOnly={ro} mono />)}
          </div>
        </Bloco>
        <Bloco titulo="Numeração dos planos" dica="Só muda o que o app sugere para o próximo plano. Os planos que já existem ficam como estão.">
          <div className="grid gap-2" role="radiogroup" aria-label="Numeração dos planos">
            {NUMERACOES.map((n) => {
              const on = conv === n.id
              return (
                <button key={n.id} type="button" role="radio" aria-checked={on} disabled={ro}
                  onClick={() => update('projects', project.id, { kit: { ...project.kit, numeracao: n.id } })}
                  className={`flex min-h-14 flex-col items-start justify-center rounded-[10px] border-2 px-3 py-2 text-left ${on ? 'border-ink border-[3px] bg-surface' : 'border-borda bg-surface'}`}>
                  <span className="flex items-center gap-2 text-[17px] font-bold">{on && <Icon name="check" size={18} strokeWidth={3} />}{n.label}</span>
                  <span className="font-mono text-[15px] text-muted">{n.exemplo}</span>
                </button>
              )
            })}
          </div>
        </Bloco>
        <div className="grid gap-3">
          {!ro && <Btn variant="surface" onClick={() => setEdit(true)}><IconEdit /> Câmeras, campos extras e kit de lentes</Btn>}
          {role === 'owner' && (
            <Btn variant="danger" onClick={async () => {
              if (await confirm({ title: 'Excluir projeto', danger: true, confirmLabel: 'Excluir',
                message: `Excluir “${project.title}” com todas as cenas, planos e takes?\nIsso também remove para quem tem o projeto compartilhado.` })) {
                await deleteProject(project.id); notify('Projeto excluído'); nav('/')
              }
            }}><IconTrash /> Excluir projeto</Btn>
          )}
          <p className="text-center text-[13px] text-muted">Criado em {fmtDate(project.created_at)}</p>
        </div>
      </main>
      <ProjectForm open={edit} onClose={() => setEdit(false)} project={project} />
    </>
  )
}

function Bloco({ titulo, dica, children }) {
  return (
    <section className="grid gap-3 rounded-2xl border-2 border-line bg-surface p-4">
      <div>
        <h2 className="text-xl font-bold leading-[26px]">{titulo}</h2>
        {dica && <p className="text-[15px] leading-5 text-muted">{dica}</p>}
      </div>
      {children}
    </section>
  )
}

// Campo que salva sozinho ao sair dele (sem botão Salvar)
function AutoField({ label, id = label, value, onSave, readOnly, mono, required, inputMode }) {
  const [v, setV] = useState(value || '')
  const [ok, setOk] = useState(false)
  const last = useRef(value || '')
  useEffect(() => { if (document.activeElement?.dataset?.field !== id) { setV(value || ''); last.current = value || '' } }, [value, id])
  const commit = async () => {
    const t = v.trim()
    if (t === last.current.trim()) return
    if (required && !t) { setV(last.current); return }
    last.current = t
    await onSave(t)
    setOk(true)
    setTimeout(() => setOk(false), 1500)
  }
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex items-center gap-2 text-[13px] font-bold uppercase leading-4 tracking-[.07em] text-muted">
        <span className="truncate">{label}</span>{ok && <span className="text-good normal-case tracking-normal">salvo</span>}
      </span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        readOnly={readOnly} inputMode={inputMode} data-field={id}
        className={`min-h-14 w-full min-w-0 rounded-[10px] border-2 border-borda bg-surface px-3 py-2 text-[17px] text-ink outline-none focus:border-ink ${mono ? 'font-mono' : ''}`} />
    </label>
  )
}

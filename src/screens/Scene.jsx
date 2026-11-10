import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { TopBar, Btn, Empty, Card, Sheet, TextInput, TextArea, ChipSelect, Field, IconBtn, useDialog } from '../components/ui'
import { IconPlus, IconMore, IconEdit, IconTrash, IconChevron } from '../components/icons'
import { useProject, useScene, useShots, useTakesByProject, useRole, useScenes } from '../lib/hooks'
import { createShot, deleteShot, update } from '../lib/repo'
import { useAuth } from '../auth'
import { nextCode, plural, uuid, fmtDate, todayISO } from '../lib/util'
import { getDb } from '../lib/db'
import { suggestShotCodes } from '../lib/ficha'
import { Button, PlanoCard, Tag, EmptyState } from '../ds/components'
import { groupTakes, isMulticam, projectCameras, linkedShots, shotCameras, shotLabel } from '../lib/cameras'
import { SceneForm } from './Project'
import { useDays, dayLabel } from '../lib/days'

export const SHOT_TYPES = ['PG', 'PC', 'PA', 'PM', 'PP', 'PPP', 'Detalhe', 'Insert', 'Plongée', 'Contra-plongée', 'Plano-sequência', 'Master']

export const STATUS = {
  good: { label: 'GOOD', cls: 'bg-good text-on-good border-good' },
  ng: { label: 'NG', cls: 'bg-ng text-on-ng border-ng' },
  check: { label: 'CHECK', cls: 'bg-check text-on-check border-check-ink' },
}

export default function Scene() {
  const { projectId, sceneId } = useParams()
  const project = useProject(projectId)
  const scene = useScene(sceneId)
  const scenes = useScenes(projectId)
  const shots = useShots(sceneId)
  const takes = useTakesByProject(projectId)
  const { user } = useAuth()
  const canEdit = useRole(project, user?.id) !== 'viewer'
  const nav = useNavigate()
  const [form, setForm] = useState(null)
  const [editScene, setEditScene] = useState(false)
  // aberta de dentro de uma diária (?dia=): mostra o que foi gravado naquele dia e cria takes com a data dela
  const [params] = useSearchParams()
  const days = useDays(projectId)
  const day = days?.find((d) => d.id === params.get('dia')) || null
  const q = day ? `?dia=${day.id}` : ''
  const backTo = day ? (day.date === todayISO() ? `/p/${projectId}?tab=hoje` : `/p/${projectId}/d/${day.id}`) : `/p/${projectId}?tab=roteiro`
  const multi = isMulticam(project)

  // Por plano (planos vinculados juntos): grupos de take (claquete), próximo número e câmeras usadas
  const byShot = useMemo(() => {
    const m = {}
    if (!shots) return m
    for (const s of shots) {
      const ids = new Set(linkedShots(s, shots).map((x) => x.id))
      const all = (takes || []).filter((t) => ids.has(t.shot_id))
      const mine = all.filter((t) => t.shot_id === s.id)
      const list = day ? mine.filter((t) => t.shoot_date === day.date) : mine
      const groups = groupTakes(list, project)
      const used = [...new Set(mine.map((t) => t.camera).filter(Boolean))].sort()
      m[s.id] = { groups, proximo: all.reduce((n, t) => Math.max(n, t.take_number), 0) + 1, used }
    }
    return m
  }, [takes, shots, project, day])

  if (scene === undefined || project === undefined) return null
  if (!scene || scene.deleted) return (<><TopBar title="Cena" back={backTo} /><Empty title="Cena não encontrada" /></>)

  const openShot = (s, extra = '') => nav(`/p/${projectId}/s/${sceneId}/sh/${s.id}${q}${extra ? (q ? '&' : '?') + extra : ''}`)
  const chipsOf = (info) => {
    const out = []
    for (const g of info.groups.slice(0, multi ? 3 : 6)) {
      for (const r of g.rows) {
        out.push({ take: g.number, status: r.status ? r.status.toUpperCase() : null, circulado: !!r.circled,
          cam: g.rows.length > 1 || multi ? r.camera || undefined : undefined, onPress: () => openShot(shots.find((x) => x.id === r.shot_id) || scene, `take=${g.number}`) })
      }
    }
    return out.reverse()
  }

  return (
    <>
      <TopBar title={`Cena ${scene.number}`} subtitle={day ? `${dayLabel(day.number)} · ${fmtDate(day.date)}` : project?.title} back={backTo} />
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-28">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {scene.int_ext && <Tag>{scene.int_ext}</Tag>}
          {scene.period && <Tag icon={scene.period === 'NOITE' ? 'moon' : 'sun'}>{scene.period}</Tag>}
          <span className="flex-1" />
          {canEdit && <Button size="p" icon="pencil" onClick={() => setEditScene(true)} data-testid="edit-scene">Editar cena</Button>}
        </div>
        {scene.location && <div className="text-xl font-bold leading-[26px]">{scene.location}</div>}
        {scene.description && <p className="mt-1 text-[17px] leading-6 text-muted">{scene.description}</p>}
        <div className="mt-4 mb-2 text-2xl font-bold leading-[30px]">{shots?.length ? `${plural(shots.length, 'plano')}${day ? ` · ${dayLabel(day.number)}` : ''}` : 'Planos'}</div>
        {shots?.length === 0 && (
          <EmptyState icon="film" title="Nenhum plano ainda" action={canEdit ? 'Novo plano' : undefined} onAction={() => setForm('new')}>
            Crie o primeiro plano desta cena para começar a registrar takes.
          </EmptyState>
        )}
        <div className="grid gap-3" data-testid="shots">
          {shots?.map((s) => {
            const info = byShot[s.id] || { groups: [], proximo: 1, used: [] }
            const cams = shotCameras(s) || (multi && info.used.length ? info.used : undefined)
            const linked = linkedShots(s, shots).filter((x) => x.id !== s.id)
            return (
              <div key={s.id} data-testid="shot-card">
                <PlanoCard numero={shotLabel(scene, s)} tipo={s.shot_type || undefined} descricao={s.description || undefined}
                  cams={cams} junto={linked.length ? linked.map((x) => shotLabel(scene, x)).join(', ') : undefined}
                  proximo={info.proximo} takes={chipsOf(info)} total={info.groups.length} podeGravar={canEdit}
                  onGravar={() => nav(`/p/${projectId}/s/${sceneId}/sh/${s.id}${q}`, { state: { gravar: true } })}
                  onVerTodos={() => openShot(s, 'lista=1')} onRenomear={canEdit ? () => setForm(s) : undefined} />
              </div>
            )
          })}
        </div>
        {canEdit && shots?.length > 0 && (
          <div className="mt-3"><Button block icon="plus" onClick={() => setForm('new')} data-testid="new-shot">Novo plano na cena {scene.number}</Button></div>
        )}
      </main>
      <ShotForm open={!!form} shot={form === 'new' ? null : form} scene={scene} shots={shots || []} project={project}
        onClose={() => setForm(null)} onCreated={(s) => nav(`/p/${projectId}/s/${sceneId}/sh/${s.id}${q}`, { state: { gravar: true } })} />
      <SceneForm open={editScene} onClose={() => setEditScene(false)} scene={scene} project={project} scenes={scenes}
        onDeleted={() => nav(day ? backTo : `/p/${projectId}?tab=roteiro`)} />
    </>
  )
}

export function ShotForm({ open, onClose, shot, scene, shots, project, onCreated }) {
  const [f, setF] = useState({})
  const { notify, confirm } = useDialog()
  const remove = async () => {
    const n = new Set((await getDb().takes.where('shot_id').equals(shot.id).toArray()).filter((t) => !t.deleted).map((t) => t.take_number)).size
    if (!(await confirm({ title: 'Excluir plano', danger: true, confirmLabel: 'Excluir',
      message: `Excluir o plano ${shotLabel(scene, shot)}${n ? ` e ${n === 1 ? 'o take dele' : `os ${n} takes dele`}` : ''}? Não dá para desfazer.` }))) return
    await deleteShot(shot.id)
    notify('Plano excluído')
    onClose()
  }
  const [lastOpen, setLastOpen] = useState(false)
  const multi = isMulticam(project)
  const others = shots.filter((s) => s.id !== shot?.id)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setF(shot
        ? { ...shot, cams: shotCameras(shot) || [], links: linkedShots(shot, shots).filter((s) => s.id !== shot.id).map((s) => s.id) }
        : { code: suggestShotCodes(project, shots.map((s) => s.code))[0], shot_type: null, description: '', cams: [], links: [] })
    }
  }
  const toggle = (k, v) => setF((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }))

  const save = async () => {
    const code = String(f.code || '').trim()
    if (!code) return notify('Informe o código do plano', 'error')
    if (shots.some((s) => s.code.toLowerCase() === code.toLowerCase() && s.id !== shot?.id)) return notify(`O plano ${code} já existe`, 'error')
    const data = { code, shot_type: f.shot_type || null, description: f.description || null }
    if (multi) data.cameras = f.cams.length ? f.cams : null
    // Vínculo "roda junto com": todos os planos marcados + este ficam com o mesmo link_id
    const before = shot ? linkedShots(shot, shots).filter((s) => s.id !== shot.id).map((s) => s.id) : []
    const changed = multi && (before.length !== f.links.length || before.some((id) => !f.links.includes(id)))
    let linkId = shot?.link_id ?? null
    if (changed) {
      const partners = others.filter((s) => f.links.includes(s.id))
      linkId = f.links.length ? shot?.link_id || partners.find((s) => s.link_id)?.link_id || uuid() : null
      data.link_id = linkId
      for (const s of partners) if (s.link_id !== linkId) await update('shots', s.id, { link_id: linkId })
      // quem saiu do grupo perde o vínculo; grupo que sobrar com 1 plano também
      const dropped = others.filter((s) => before.includes(s.id) && !f.links.includes(s.id))
      const leftover = shot?.link_id ? others.filter((s) => s.link_id === shot.link_id && !f.links.includes(s.id)) : []
      for (const s of dropped) await update('shots', s.id, { link_id: null })
      if (leftover.length === 1 && !dropped.includes(leftover[0])) await update('shots', leftover[0].id, { link_id: null })
    }
    if (shot) await update('shots', shot.id, data)
    else { const s = await createShot(scene, data); onCreated?.(s) }
    onClose()
  }
  const camIds = projectCameras(project).map((c) => c.id)
  const chip = (on) => `min-h-12 rounded-[10px] border-2 px-4 font-mono text-[17px] font-bold ${on ? 'border-accent bg-accent text-accent-ink' : 'border-borda bg-surface text-ink'}`
  return (
    <Sheet open={open} onClose={onClose} title={shot ? `Editar plano ${shot.code}` : `Novo plano — cena ${scene.number}`}
      footer={<div className="grid gap-2">
        <Btn full size="lg" onClick={save}>{shot ? 'Salvar' : 'Criar e abrir'}</Btn>
        {shot && <Btn full variant="danger" onClick={remove}><IconTrash /> Excluir plano</Btn>}
      </div>}>
      <div className="grid gap-4">
        <TextInput label="Nome do plano (como na claquete)" value={f.code || ''} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
          hint={`Aparece como ${shotLabel(scene, { code: f.code || '?' })}. A numeração do projeto está na Ficha técnica.`} data-testid="shot-code" />
        {!shot && (
          <div className="flex flex-wrap gap-2" aria-label="Sugestões de nome">
            {suggestShotCodes(project, shots.map((s) => s.code)).map((c) => (
              <button type="button" key={c} onClick={() => setF({ ...f, code: c })} aria-pressed={f.code === c}
                className={chip(f.code === c)}>{shotLabel(scene, { code: c })}</button>
            ))}
          </div>
        )}
        <Field label="Enquadramento"><ChipSelect options={SHOT_TYPES} value={f.shot_type} onChange={(v) => setF({ ...f, shot_type: v })} /></Field>
        {multi && (
          <>
            <Field label="Câmeras deste plano" hint="Nenhuma marcada = segue as câmeras do take anterior.">
              <div className="flex flex-wrap gap-2">
                {camIds.map((c) => (
                  <button type="button" key={c} onClick={() => toggle('cams', c)} className={chip(f.cams?.includes(c))} data-testid={`shot-cam-${c}`}>{c}</button>
                ))}
              </div>
            </Field>
            {others.length > 0 && (
              <Field label="Roda junto com (mesma claquete)" hint="Ex.: 12A na câmera A e 12B na câmera B ao mesmo tempo. O + TAKE cria o take nos dois planos.">
                <div className="flex flex-wrap gap-2">
                  {others.map((s) => (
                    <button type="button" key={s.id} onClick={() => toggle('links', s.id)} className={chip(f.links?.includes(s.id))} data-testid={`link-${s.code}`}>
                      {shotLabel(scene, s)}{shotCameras(s) ? ` · ${shotCameras(s).join('+')}` : ''}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </>
        )}
        <TextArea label="Descrição (opcional)" rows={2} value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
    </Sheet>
  )
}

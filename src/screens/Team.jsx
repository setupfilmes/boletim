import { useCallback, useEffect, useState } from 'react'
import { Btn, Card, ChipSelect, Field, IconBtn, Sheet, TextInput, useDialog } from '../components/ui'
import { IconTrash } from '../components/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { scheduleSync } from '../lib/sync'
import { getDb } from '../lib/db'
import { inviteUrl, inviteText } from '../lib/inviteLink'
import { fmtDate } from '../lib/util'

const ROLES = [{ value: 'editor', label: 'Pode editar' }, { value: 'viewer', label: 'Só visualizar' }]

// Compartilhamento precisa de internet (a lista de contas fica no servidor)
export default function Team({ project, role }) {
  const { user, sessionOk } = useAuth()
  const { notify, confirm } = useDialog()
  const [members, setMembers] = useState(null)
  const [invites, setInvites] = useState([])
  const [links, setLinks] = useState([])
  const [linkRole, setLinkRole] = useState('editor')
  const [shareSheet, setShareSheet] = useState(null) // { url, text }
  const [err, setErr] = useState(null)
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState('editor')
  const [busy, setBusy] = useState(false)
  const isOwner = role === 'owner'
  const unsynced = !!project._dirty && !project.updated_at

  const load = useCallback(async () => {
    if (!sessionOk) return
    setErr(null)
    const { data, error } = await supabase.from('project_members').select('*').eq('project_id', project.id).order('created_at')
    if (error) setErr(navigator.onLine ? error.message : 'Sem internet')
    else setMembers(data)
    // convites guardados (e-mails que ainda não criaram conta) — só o dono vê; sem a tabela no banco, fica vazio
    const inv = await supabase.from('project_invites').select('*').eq('project_id', project.id).order('created_at')
    setInvites(inv.error ? [] : inv.data)
    // links de convite ainda não usados e dentro da validade
    const lk = await supabase.from('project_invite_links').select('*').eq('project_id', project.id).is('used_by', null)
      .gt('expires_at', new Date().toISOString()).order('created_at')
    setLinks(lk.error ? [] : lk.data)
  }, [project.id, sessionOk])

  useEffect(() => { load() }, [load])

  const add = async (e) => {
    e.preventDefault()
    setBusy(true)
    const args = { p_project: project.id, p_email: email, p_role: newRole }
    let { data, error } = await supabase.rpc('share_project', args)
    if (error?.code === 'PGRST202') ({ error } = await supabase.rpc('add_project_member', args)) // banco sem a atualização de 19/10
    setBusy(false)
    if (error) return notify(error.message.replace(/^.*?:\s*/, ''), 'error')
    const who = email.trim().toLowerCase()
    setEmail('')
    notify(data === 'invited'
      ? `Convite guardado: quando ${who} criar a conta no app com este e-mail, o projeto aparece para essa pessoa.`
      : `${who} foi adicionado. O projeto aparece na lista dessa pessoa em instantes.`)
    load()
  }

  // Convite por link: gera o link e abre o envio (WhatsApp / compartilhar / copiar). Não precisa do e-mail.
  const makeLink = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('create_invite_link', { p_project: project.id, p_role: linkRole })
    setBusy(false)
    if (error) return notify(error.code === 'PGRST202' ? 'Convite por link ainda não está ativo no banco.' : error.message.replace(/^.*?:\s*/, ''), 'error')
    const url = inviteUrl(data)
    setShareSheet({ url, text: inviteText(project, linkRole, url) })
    load()
  }
  const shareNative = async () => {
    try { await navigator.share({ text: shareSheet.text }) } catch { /* cancelado */ }
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareSheet.text); notify('Convite copiado') } catch { notify(shareSheet.url) }
  }
  const removeLink = async (l) => {
    if (!(await confirm({ title: 'Cancelar link', danger: true, confirmLabel: 'Cancelar link',
      message: 'Quem ainda não abriu este link não vai conseguir entrar.' }))) return
    const { error } = await supabase.from('project_invite_links').delete().eq('token', l.token)
    if (error) return notify(error.message, 'error')
    load()
  }

  const removeInvite = async (i) => {
    if (!(await confirm({ title: 'Cancelar convite', danger: true, confirmLabel: 'Cancelar convite',
      message: `Cancelar o convite para ${i.email}?` }))) return
    const { error } = await supabase.from('project_invites').delete().eq('project_id', project.id).eq('email', i.email)
    if (error) return notify(error.message, 'error')
    load()
  }

  const remove = async (m) => {
    const self = m.user_id === user.id
    if (!(await confirm({ title: self ? 'Sair do projeto' : 'Remover pessoa', danger: true, confirmLabel: self ? 'Sair' : 'Remover',
      message: self ? 'Você deixará de ver este projeto.' : `Remover ${m.email} do projeto?` }))) return
    const { error } = await supabase.from('project_members').delete().eq('project_id', project.id).eq('user_id', m.user_id)
    if (error) return notify(error.message, 'error')
    if (self) scheduleSync(100)
    load()
  }

  // Passa o projeto para alguém da equipe; quem era dono continua como editor
  const transfer = async (m) => {
    if (!(await confirm({ title: 'Transferir projeto', confirmLabel: 'Transferir',
      message: `Passar “${project.title}” para ${m.email}?\nEssa pessoa vira a dona do projeto (pode excluir e gerenciar a equipe). Você continua na equipe, podendo editar.` }))) return
    const { error } = await supabase.rpc('transfer_project', { p_project: project.id, p_new_owner: m.user_id })
    if (error) return notify(error.message.replace(/^.*?:\s*/, ''), 'error')
    // atualiza a cópia local sem marcar para envio (o servidor já trocou o dono)
    await getDb().projects.update(project.id, { owner_id: m.user_id })
    scheduleSync(100)
    notify(`Projeto transferido para ${m.email}`)
    load()
  }

  if (!sessionOk) return <p className="py-10 text-center text-sm text-muted">Entre na sua conta (com internet) para gerenciar a equipe.</p>

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        Convide a equipe por um link no WhatsApp (a pessoa entra ou cria a conta ao abrir) ou pelo e-mail da conta.
        Quem pode editar registra takes normalmente e tudo sincroniza entre os aparelhos. O dono pode passar o projeto
        para outra pessoa da equipe (“Tornar dono”).
      </p>
      {err && <div className="rounded-xl border-2 border-ng p-3 text-sm text-ng">{err}</div>}
      <Card className="divide-y divide-line">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{isOwner ? `${user.email} (você)` : 'Dono do projeto'}</div>
            <div className="text-xs uppercase tracking-widest text-accent">Dono</div>
          </div>
        </div>
        {members?.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{m.email}{m.user_id === user.id ? ' (você)' : ''}</div>
              <div className="text-xs uppercase tracking-widest text-muted">{m.role === 'viewer' ? 'Só visualizar' : 'Pode editar'}</div>
            </div>
            {isOwner && <Btn size="sm" variant="ghost" onClick={() => transfer(m)} data-testid="transfer">Tornar dono</Btn>}
            {(isOwner || m.user_id === user.id) && <IconBtn label="Remover" onClick={() => remove(m)}><IconTrash /></IconBtn>}
          </div>
        ))}
        {links.map((l) => (
          <div key={l.token} className="flex items-center gap-3 px-4 py-2" data-testid="invite-link">
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-muted">Link de convite (WhatsApp)</div>
              <div className="text-xs uppercase tracking-widest text-check">
                Aguardando · {l.role === 'viewer' ? 'Só visualizar' : 'Pode editar'} · vale até {fmtDate(l.expires_at)}
              </div>
            </div>
            {isOwner && <IconBtn label="Cancelar link" onClick={() => removeLink(l)}><IconTrash /></IconBtn>}
          </div>
        ))}
        {invites.map((i) => (
          <div key={i.email} className="flex items-center gap-3 px-4 py-2" data-testid="invite">
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-muted">{i.email}</div>
              <div className="text-xs uppercase tracking-widest text-check">
                Convite pendente · {i.role === 'viewer' ? 'Só visualizar' : 'Pode editar'}
              </div>
            </div>
            {isOwner && <IconBtn label="Cancelar convite" onClick={() => removeInvite(i)}><IconTrash /></IconBtn>}
          </div>
        ))}
      </Card>
      {isOwner && (unsynced ? (
        <p className="text-sm text-check">Este projeto ainda não foi enviado para a nuvem. Aguarde a sincronização para compartilhar.</p>
      ) : (
        <>
        <Card className="grid gap-3 p-4" data-testid="invite-by-link">
          <div className="font-display text-lg font-bold">Convidar pelo WhatsApp</div>
          <p className="-mt-2 text-sm text-muted">Gera um link para uma pessoa. Ela abre, entra ou cria a conta, e o projeto aparece para ela. Vale por 7 dias.</p>
          <Field label="Permissão"><ChipSelect options={ROLES} value={linkRole} onChange={(v) => setLinkRole(v || 'editor')} allowEmpty={false} /></Field>
          <Btn onClick={makeLink} disabled={busy} data-testid="make-link">Criar convite</Btn>
        </Card>
        <div className="font-display text-lg font-bold">Ou adicionar pelo e-mail</div>
        <form onSubmit={add} className="grid grid-cols-1 gap-3">
          <TextInput label="E-mail da conta" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field label="Permissão"><ChipSelect options={ROLES} value={newRole} onChange={(v) => setNewRole(v || 'editor')} allowEmpty={false} /></Field>
          <Btn type="submit" disabled={busy}>Adicionar</Btn>
        </form>
        </>
      ))}
      <Sheet open={!!shareSheet} onClose={() => setShareSheet(null)} title="Enviar convite"
        footer={<Btn full variant="ghost" onClick={() => setShareSheet(null)}>Fechar</Btn>}>
        {shareSheet && (
          <div className="grid gap-3">
            <pre className="whitespace-pre-wrap rounded-xl border-2 border-line bg-surface2 p-3 font-mono text-xs" data-testid="invite-text">{shareSheet.text}</pre>
            <a className="inline-flex min-h-14 items-center justify-center rounded-xl border-2 border-[#25D366] bg-[#25D366] font-display text-lg font-bold text-black"
              href={`https://wa.me/?text=${encodeURIComponent(shareSheet.text)}`} target="_blank" rel="noopener noreferrer" data-testid="invite-whatsapp">
              Enviar pelo WhatsApp
            </a>
            {typeof navigator.share === 'function' && <Btn variant="surface" onClick={shareNative}>Outros apps…</Btn>}
            <Btn variant="surface" onClick={copyLink} data-testid="invite-copy">Copiar convite</Btn>
          </div>
        )}
      </Sheet>
    </div>
  )
}

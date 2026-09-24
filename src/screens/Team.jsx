import { useCallback, useEffect, useState } from 'react'
import { Btn, Card, ChipSelect, Field, IconBtn, TextInput, useDialog } from '../components/ui'
import { IconTrash } from '../components/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { scheduleSync } from '../lib/sync'

const ROLES = [{ value: 'editor', label: 'Pode editar' }, { value: 'viewer', label: 'Só visualizar' }]

// Compartilhamento precisa de internet (a lista de contas fica no servidor)
export default function Team({ project, role }) {
  const { user, sessionOk } = useAuth()
  const { notify, confirm } = useDialog()
  const [members, setMembers] = useState(null)
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
  }, [project.id, sessionOk])

  useEffect(() => { load() }, [load])

  const add = async (e) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.rpc('add_project_member', { p_project: project.id, p_email: email, p_role: newRole })
    setBusy(false)
    if (error) return notify(error.message.replace(/^.*?:\s*/, ''), 'error')
    setEmail('')
    notify('Pessoa adicionada')
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

  if (!sessionOk) return <p className="py-10 text-center text-sm text-muted">Entre na sua conta (com internet) para gerenciar a equipe.</p>

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        Compartilhe este projeto com outros assistentes. Eles precisam ter uma conta no app. Quem pode editar registra takes
        normalmente; tudo sincroniza entre os aparelhos.
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
            {(isOwner || m.user_id === user.id) && <IconBtn label="Remover" onClick={() => remove(m)}><IconTrash /></IconBtn>}
          </div>
        ))}
      </Card>
      {isOwner && (unsynced ? (
        <p className="text-sm text-check">Este projeto ainda não foi enviado para a nuvem. Aguarde a sincronização para compartilhar.</p>
      ) : (
        <form onSubmit={add} className="grid grid-cols-1 gap-3">
          <TextInput label="E-mail da conta" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field label="Permissão"><ChipSelect options={ROLES} value={newRole} onChange={(v) => setNewRole(v || 'editor')} allowEmpty={false} /></Field>
          <Btn type="submit" disabled={busy}>Adicionar</Btn>
        </form>
      ))}
    </div>
  )
}

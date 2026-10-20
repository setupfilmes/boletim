import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useDialog } from './ui'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'
import { syncNow } from '../lib/sync'
import { getPendingInvite, clearPendingInvite } from '../lib/inviteLink'

// Aceita o convite por link guardado no aparelho assim que houver conta logada com internet, e abre o projeto
export default function InviteAcceptor() {
  const { sessionOk, user } = useAuth()
  const { notify } = useDialog()
  const nav = useNavigate()
  const running = useRef(false)
  useEffect(() => {
    const token = getPendingInvite()
    if (!token || !user || running.current) return
    if (!sessionOk) { notify('Você abriu um convite. Entre na sua conta com internet (em Conta) para aceitar.'); return }
    running.current = true
    ;(async () => {
      const { data, error } = await supabase.rpc('accept_invite_link', { p_token: token })
      if (error) {
        const net = /fetch|network|Failed/i.test(error.message) && !error.code
        if (!net) clearPendingInvite()
        notify(net ? 'Sem internet para aceitar o convite. Tente de novo com conexão.' : error.message.replace(/^.*?:\s*/, ''), 'error')
        running.current = false
        return
      }
      clearPendingInvite()
      notify('Convite aceito! Abrindo o projeto…')
      await syncNow().catch(() => {})
      nav(`/p/${data}`)
      running.current = false
    })()
  }, [sessionOk, user, notify, nav])
  return null
}

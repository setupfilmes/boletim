import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { openDb, closeDb } from './lib/db'
import { setSyncEnabled, syncNow, pendingCount } from './lib/sync'
import { ensureKitSeeded } from './lib/repo'

const AuthCtx = createContext(null)
const LAST_USER = 'boletim.lastUser'
const RECENT = 'boletim.recentAccounts'

const readJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb } catch { return fb } }

export function recentAccounts() {
  return readJSON(RECENT, [])
}
export function forgetAccount(email) {
  localStorage.setItem(RECENT, JSON.stringify(recentAccounts().filter((a) => a.email !== email)))
}
function rememberAccount(user) {
  const name = user.user_metadata?.full_name || ''
  const list = recentAccounts().filter((a) => a.email !== user.email)
  list.unshift({ email: user.email, name })
  localStorage.setItem(RECENT, JSON.stringify(list.slice(0, 6)))
}

function toUser(u) {
  return { id: u.id, email: u.email, name: u.user_metadata?.full_name || '' }
}

export function AuthProvider({ children }) {
  // user: usuário ativo | sessionOk: sessão válida para sincronizar | recovery: link de nova senha
  const [st, setSt] = useState({ loading: true, user: null, sessionOk: false, recovery: false })
  const manualSignOut = useRef(false)
  const active = useRef({ id: null, sessionOk: false })

  const activate = async (user, sessionOk) => {
    if (active.current.id === user.id && active.current.sessionOk === sessionOk) {
      setSt((s) => ({ ...s, user }))
      return
    }
    active.current = { id: user.id, sessionOk }
    openDb(user.id)
    localStorage.setItem(LAST_USER, JSON.stringify(user))
    setSt((s) => ({ ...s, loading: false, user, sessionOk }))
    setSyncEnabled(sessionOk)
    if (sessionOk) {
      await syncNow()
    }
    await ensureKitSeeded()
  }

  function endLocal() {
    active.current = { id: null, sessionOk: false }
    localStorage.removeItem(LAST_USER)
    setSyncEnabled(false)
    closeDb()
    if (location.hash && location.hash !== '#/') history.replaceState(null, '', location.pathname + location.search + '#/')
    setSt({ loading: false, user: null, sessionOk: false, recovery: false })
  }

  useEffect(() => {
    if (!supabase) { setSt({ loading: false, user: null, sessionOk: false, recovery: false }); return }
    let alive = true
    const lastUser = readJSON(LAST_USER, null)

    // Sem internet o Supabase pode demorar tentando renovar a sessão — não deixa o app travado em "Carregando"
    const quick = setTimeout(() => {
      if (alive && lastUser) activate(lastUser, false)
    }, navigator.onLine ? 2500 : 200)

    supabase.auth.getSession().then(({ data }) => {
      clearTimeout(quick)
      if (!alive) return
      const u = data?.session?.user
      if (u) activate(toUser(u), true)
      else if (lastUser) activate(lastUser, false) // sem sessão (offline ou expirada): continua trabalhando no aparelho
      else setSt((s) => ({ ...s, loading: false }))
    }).catch(() => {
      clearTimeout(quick)
      if (lastUser) activate(lastUser, false)
      else setSt((s) => ({ ...s, loading: false }))
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setSt((s) => ({ ...s, recovery: true }))
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        rememberAccount(session.user)
        // fora do callback do Supabase (evita travar o cliente de auth)
        setTimeout(() => activate(toUser(session.user), true), 0)
      }
      if (event === 'SIGNED_OUT') {
        if (manualSignOut.current) {
          manualSignOut.current = false
          endLocal()
        } else {
          // sessão caiu sozinha (ex.: expirou sem internet) — NÃO tira o usuário do app
          active.current = { ...active.current, sessionOk: false }
          setSyncEnabled(false)
          setSt((s) => ({ ...s, sessionOk: false }))
        }
      }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const api = {
    ...st,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
    },
    async signUp(name, email, password) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password, options: { data: { full_name: name.trim() } },
      })
      if (error) throw error
      return { needsConfirm: !data.session }
    },
    async resetPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + window.location.pathname,
      })
      if (error) throw error
    },
    async setNewPassword(password) {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setSt((s) => ({ ...s, recovery: false }))
    },
    async updateName(name) {
      const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } })
      if (error) throw error
    },
    async signOut() {
      manualSignOut.current = true
      const { error } = await supabase.auth.signOut({ scope: 'local' }).catch((e) => ({ error: e }))
      if (error || active.current.id) {
        // garante o encerramento no aparelho (mesmo offline ou sem evento)
        manualSignOut.current = false
        endLocal()
      }
    },
    pendingCount,
  }

  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)

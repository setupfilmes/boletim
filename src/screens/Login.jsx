import { useState } from 'react'
import { useAuth, recentAccounts, forgetAccount } from '../auth'
import { Btn, TextInput } from '../components/ui'
import { IconUser, IconX } from '../components/icons'

const errPt = (e) => {
  const m = e?.message || String(e)
  if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(m)) return 'Confirme o e-mail (veja sua caixa de entrada) antes de entrar.'
  if (/already registered|already exists/i.test(m)) return 'Já existe uma conta com este e-mail.'
  if (/at least 6|Password should/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (/fetch|network|Failed/i.test(m)) return 'Sem internet. O primeiro acesso em cada aparelho precisa de conexão.'
  return m
}

export default function Login({ embedded }) {
  const auth = useAuth()
  const [mode, setMode] = useState('login') // login | signup | reset
  const [recent, setRecent] = useState(recentAccounts())
  const [email, setEmail] = useState(recent[0]?.email || '')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (mode === 'login') await auth.signIn(email, password)
      else if (mode === 'signup') {
        const r = await auth.signUp(name, email, password)
        if (r.needsConfirm) { setMsg({ ok: true, text: 'Conta criada! Abra o e-mail de confirmação e depois entre aqui.' }); setMode('login') }
      } else {
        await auth.resetPassword(email)
        setMsg({ ok: true, text: 'Enviamos um link para redefinir a senha no seu e-mail.' })
      }
    } catch (err) {
      setMsg({ ok: false, text: errPt(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={embedded ? '' : 'safe-top safe-bottom mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-10'}>
      {!embedded && (
        <div className="mb-8">
          <div className="font-mono text-xs uppercase tracking-[.3em] text-accent">1st AC · Camera Report</div>
          <h1 className="font-display text-4xl font-extrabold leading-none">Boletim<br />de Câmera</h1>
        </div>
      )}

      {mode === 'login' && recent.length > 0 && (
        <div className="mb-5">
          <div className="mb-2 text-xs uppercase tracking-widest text-muted">Contas neste aparelho</div>
          <div className="grid grid-cols-1 gap-2">
            {recent.map((a) => (
              <div key={a.email} className={`flex items-center rounded-xl border-2 ${email === a.email ? 'border-accent' : 'border-line'} bg-surface`}>
                <button type="button" onClick={() => setEmail(a.email)} className="flex min-h-14 flex-1 items-center gap-3 px-3 text-left">
                  <IconUser />
                  <span className="min-w-0">
                    <span className="block truncate font-display font-bold">{a.name || a.email}</span>
                    {a.name && <span className="block truncate text-xs text-muted">{a.email}</span>}
                  </span>
                </button>
                <button type="button" aria-label="Remover da lista" className="h-14 w-12 text-muted"
                  onClick={() => { forgetAccount(a.email); setRecent(recentAccounts()) }}><IconX size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={submit} className="grid gap-4">
        {mode === 'signup' && (
          <TextInput label="Seu nome" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        )}
        <TextInput label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          autoComplete="email" inputMode="email" />
        {mode !== 'reset' && (
          <TextInput label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        )}
        {msg && <div className={`rounded-xl border-2 p-3 text-sm ${msg.ok ? 'border-good text-good' : 'border-ng text-ng'}`}>{msg.text}</div>}
        <Btn size="lg" disabled={busy} type="submit">
          {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
        </Btn>
      </form>

      <div className="mt-5 grid gap-2 text-center text-sm">
        {mode !== 'signup' && <button className="min-h-11 text-accent" onClick={() => { setMode('signup'); setMsg(null) }}>Criar uma conta nova</button>}
        {mode !== 'login' && <button className="min-h-11 text-accent" onClick={() => { setMode('login'); setMsg(null) }}>Já tenho conta — entrar</button>}
        {mode === 'login' && <button className="min-h-11 text-muted" onClick={() => { setMode('reset'); setMsg(null) }}>Esqueci a senha</button>}
      </div>
    </div>
  )
}

export function NewPassword() {
  const auth = useAuth()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(null)
  return (
    <div className="safe-top mx-auto flex min-h-full max-w-md flex-col justify-center px-5">
      <h1 className="mb-6 font-display text-3xl font-extrabold">Nova senha</h1>
      <form className="grid gap-4" onSubmit={async (e) => {
        e.preventDefault()
        try { await auth.setNewPassword(pw) } catch (x) { setErr(errPt(x)) }
      }}>
        <TextInput label="Nova senha" type="password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required />
        {err && <div className="text-ng">{err}</div>}
        <Btn size="lg" type="submit">Salvar senha</Btn>
      </form>
    </div>
  )
}

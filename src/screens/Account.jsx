import { useEffect, useState } from 'react'
import { TopBar, Btn, Card, Sheet, TextInput, useDialog } from '../components/ui'
import { IconSun, IconSync } from '../components/icons'
import { useAuth } from '../auth'
import { syncNow } from '../lib/sync'
import { usePending, useSyncState } from '../components/SyncBadge'
import { buildBackup, shareFile } from '../lib/export'
import { createDemoProject } from '../lib/demo'
import { useNavigate } from 'react-router'
import { configSource, clearDeviceConfig } from '../lib/supabase'
import { fmtDate, fmtTime } from '../lib/util'
import { useTheme } from '../theme'
import Login from './Login'

export default function Account() {
  const auth = useAuth()
  const { user, sessionOk } = auth
  const pending = usePending()
  const s = useSyncState()
  const { theme, setTheme } = useTheme()
  const { confirm, notify } = useDialog()
  const nav = useNavigate()
  const [relogin, setRelogin] = useState(false)
  const [name, setName] = useState(user?.name || '')
  useEffect(() => { if (sessionOk) setRelogin(false) }, [sessionOk])

  const status = !sessionOk ? 'Sessão expirada — os dados continuam salvos no aparelho'
    : s.status === 'syncing' ? 'Sincronizando…'
    : s.status === 'offline' ? 'Sem internet — tudo salvo no aparelho'
    : s.status === 'error' ? `Erro: ${s.error}`
    : pending ? 'Aguardando envio' : 'Tudo sincronizado'

  return (
    <>
      <TopBar title="Conta" subtitle={user?.email} />
      <main className="mx-auto grid max-w-2xl gap-4 px-4 pt-4 pb-28">
        <Card className="p-4">
          <div className="mb-1 text-xs uppercase tracking-widest text-muted">Sincronização</div>
          <div className="font-display text-lg font-bold">{status}</div>
          <div className="mt-1 font-mono text-sm text-muted">
            {pending} alteraç{pending === 1 ? 'ão' : 'ões'} só no aparelho
            {s.lastSync ? ` · última: ${fmtDate(s.lastSync)} ${fmtTime(s.lastSync)}` : ''}
          </div>
          <div className="mt-3 grid gap-2">
            {sessionOk
              ? <Btn variant="surface" onClick={() => syncNow()}><IconSync size={18} /> Sincronizar agora</Btn>
              : <Btn onClick={() => setRelogin(true)}>Entrar de novo para sincronizar</Btn>}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-xs uppercase tracking-widest text-muted">Tela</div>
          <div className="grid grid-cols-2 gap-2">
            <Btn variant={theme === 'dark' ? 'primary' : 'ghost'} onClick={() => setTheme('dark')}>Escuro</Btn>
            <Btn variant={theme === 'sun' ? 'primary' : 'ghost'} onClick={() => setTheme('sun')}><IconSun size={18} /> Modo sol</Btn>
          </div>
          <p className="mt-2 text-xs text-muted">Modo sol: fundo branco e contraste máximo para ler em externa.</p>
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-xs uppercase tracking-widest text-muted">Perfil</div>
          <div className="flex gap-2">
            <div className="flex-1"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" aria-label="Seu nome" /></div>
            <Btn variant="surface" disabled={!sessionOk || name === user?.name}
              onClick={async () => { try { await auth.updateName(name); notify('Nome atualizado') } catch (e) { notify(e.message, 'error') } }}>Salvar</Btn>
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-xs uppercase tracking-widest text-muted">Backup</div>
          <Btn variant="surface" full onClick={async () => { await shareFile(await buildBackup()) }}>Exportar backup (JSON)</Btn>
          <p className="mt-2 text-xs text-muted">Cópia de todos os seus projetos em um arquivo — funciona offline.</p>
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-xs uppercase tracking-widest text-muted">Demonstração</div>
          <Btn variant="surface" full data-testid="create-demo" onClick={async () => {
            if (!(await confirm({ title: 'Projeto de demonstração', confirmLabel: 'Criar',
              message: 'Cria o projeto fictício “Noite Adentro” com 4 diárias preenchidas (1 câmera, A+B, planos vinculados) para ver o app e os relatórios. Pode excluir depois em Info → Excluir projeto.' }))) return
            const p = await createDemoProject(user?.name)
            notify('Projeto de demonstração criado')
            nav(`/p/${p.id}?tab=diarias`)
          }}>Criar projeto de demonstração</Btn>
        </Card>

        <Btn variant="ghost" className="text-ng" onClick={async () => {
          const msg = pending
            ? `ATENÇÃO: ${pending} alteração(ões) ainda não foram enviadas para a nuvem. Elas ficam guardadas neste aparelho e serão enviadas quando você entrar de novo com esta conta.\n\nSair mesmo assim?`
            : 'Sair desta conta neste aparelho?'
          if (await confirm({ title: 'Sair', message: msg, danger: !!pending, confirmLabel: 'Sair' })) await auth.signOut()
        }}>Sair da conta</Btn>

        {configSource === 'device' && (
          <button className="text-xs text-muted underline" onClick={() => { clearDeviceConfig(); location.reload() }}>
            Apagar configuração do banco salva neste aparelho
          </button>
        )}
        <div className="text-center font-mono text-xs text-muted">Boletim de Câmera v{__APP_VERSION__}</div>
      </main>
      <Sheet open={relogin} onClose={() => setRelogin(false)} title="Entrar">
        <Login embedded />
      </Sheet>
    </>
  )
}

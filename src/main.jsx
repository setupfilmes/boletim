import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { captureInviteFromUrl } from './lib/inviteLink'

// link de convite (…#/convite/<token>): guarda antes do login para aceitar depois
captureInviteFromUrl()

// Pede ao navegador para não apagar os dados locais quando faltar espaço
navigator.storage?.persist?.().catch(() => {})

// Depois de uma atualização, uma aba antiga pode pedir arquivos que já não existem: recarrega uma vez
window.addEventListener('vite:preloadError', (e) => {
  let last = 0
  try { last = Number(sessionStorage.getItem('boletim.staleReload')) || 0 } catch { /* sem storage */ }
  if (Date.now() - last < 30000) return
  try { sessionStorage.setItem('boletim.staleReload', String(Date.now())) } catch { /* sem storage */ }
  e.preventDefault()
  location.reload()
})

// Versão nova do app: o service worker baixa em segundo plano e assume; aqui a página recarrega para usá-la
// (sem isso a aba seguia com a versão antiga — e com bugs já corrigidos — até ser fechada). Não recarrega no
// meio de uma digitação ou com uma janela aberta: espera o app sair e voltar para a tela.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller // 1ª visita: não precisa recarregar
  let pending = false
  const busy = () => document.querySelector('[role="dialog"]') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
  const apply = () => { if (pending && !busy()) location.reload() }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || pending) return
    pending = true
    apply()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      apply()
      navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
    }
  })
  // app aberto o dia todo no set: procura versão nova a cada 30 min
  setInterval(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {}), 30 * 60 * 1000)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

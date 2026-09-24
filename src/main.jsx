import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

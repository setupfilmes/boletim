import { useState } from 'react'
import { Btn } from './ui'
import { IconX } from './icons'

const KEY = 'boletim.hint.samsung'

// O Samsung Internet instala o app num pacote marcado para Android antigo, e o Play Protect bloqueia
// ("App de risco bloqueado"). Pelo Chrome a instalação é normal — então sugerimos abrir no Chrome.
export default function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })
  const samsung = /SamsungBrowser/i.test(navigator.userAgent)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
  if (hidden || !samsung || standalone) return null

  const close = () => {
    setHidden(true)
    try { localStorage.setItem(KEY, '1') } catch { /* sem armazenamento */ }
  }
  const { host, pathname, hash } = window.location
  const chrome = `intent://${host}${pathname}${hash}#Intent;scheme=https;package=com.android.chrome;end`

  return (
    <div className="mb-4 rounded-xl border-2 border-check p-3" data-testid="install-hint">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm">
          <b>Para instalar o app, use o Chrome.</b> Instalado pelo Samsung Internet, o Android mostra “App de risco bloqueado”
          (é o pacote que esse navegador gera, não o app).
        </p>
        <button onClick={close} aria-label="Fechar aviso" className="shrink-0 p-1 text-muted"><IconX size={18} /></button>
      </div>
      <Btn size="sm" full className="mt-2" onClick={() => { window.location.href = chrome }}>Abrir no Chrome</Btn>
    </div>
  )
}

import { useState } from 'react'
import { saveDeviceConfig } from '../lib/supabase'
import { Btn, TextInput } from '../components/ui'

// Aparece só se o config.js ainda não tiver os dados do Supabase.
export default function Setup() {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  return (
    <div className="safe-top mx-auto max-w-md px-5 py-10">
      <div className="font-mono text-xs uppercase tracking-[.3em] text-accent">Configuração inicial</div>
      <h1 className="mb-4 font-display text-3xl font-extrabold">Conectar ao banco</h1>
      <p className="mb-6 text-sm text-muted">
        O arquivo <b className="text-ink">config.js</b> do site ainda está vazio. O ideal é preenchê-lo antes de publicar
        (vale para todos os aparelhos). Para testar agora, cole os dados do Supabase abaixo — ficam salvos só neste aparelho.
      </p>
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); saveDeviceConfig(url, key); location.reload() }}>
        <TextInput label="Project URL" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <TextInput label="Publishable key (ou anon key)" placeholder="sb_publishable_… ou eyJ…" value={key} onChange={(e) => setKey(e.target.value)} required />
        <Btn size="lg" type="submit">Salvar e continuar</Btn>
      </form>
    </div>
  )
}

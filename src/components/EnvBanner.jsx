import { IS_TEST } from '../lib/env'

// Faixa no topo do ambiente de teste — para ninguém confundir com o app da equipe
export default function EnvBanner() {
  if (!IS_TEST) return null
  return (
    <div className="safe-top bg-[repeating-linear-gradient(135deg,#f5b301_0_12px,#111_12px_24px)] text-center" data-testid="env-banner">
      <span className="inline-block bg-black px-2 font-mono text-[11px] font-bold uppercase tracking-widest text-[#f5b301]">
        Ambiente de teste — não use para a filmagem
      </span>
    </div>
  )
}

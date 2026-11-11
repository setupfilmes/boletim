import { useEffect, useRef, useState } from 'react'
import { Button, Icon } from '../ds/components'
import { vibrate } from '../lib/util'

// Bloco da continuidade na tela do take: personagens, tempo (cronômetro REC/CORTA), claquete errada e problema técnico.
// Vale para todas as câmeras do take (setAll). Personagens vêm do take anterior (grudados) e da lista da ficha técnica.
export const PROBLEMAS = ['Foco', 'Som', 'Câmera', 'Luz', 'Atuação', 'Figurino/arte', 'Continuidade', 'Claquete']

export const personagensDo = (project) => (Array.isArray(project?.kit?.personagens) ? project.kit.personagens : [])

const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const chip = (on) => `min-h-12 rounded-[10px] border-2 px-3 text-[17px] font-bold ${on ? 'border-ink bg-ink text-bg' : 'border-borda bg-surface text-ink'}`

export default function ContinuityBlock({ project, active, canEdit, setAll, setExtraAll }) {
  const chars = personagensDo(project)
  const sel = Array.isArray(active?.characters) ? active.characters : []
  const probs = Array.isArray(active?.extra?.problemas) ? active.extra.problemas : []
  const [start, setStart] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [slate, setSlate] = useState(active?.slate_as || '')
  const [dur, setDur] = useState(active?.duration || '')
  const tick = useRef(null)
  useEffect(() => { setSlate(active?.slate_as || ''); setDur(active?.duration || '') }, [active?.id, active?.slate_as, active?.duration])
  useEffect(() => {
    if (!start) return undefined
    tick.current = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(tick.current)
  }, [start])

  const toggleChar = (c) => canEdit && (vibrate(), setAll('characters', sel.includes(c) ? sel.filter((x) => x !== c) : [...sel, c]))
  const toggleProb = (p) => canEdit && (vibrate(), setExtraAll('problemas', probs.includes(p) ? probs.filter((x) => x !== p) : [...probs, p]))
  const rec = () => { vibrate(30); setStart(Date.now()); setNow(Date.now()) }
  const corta = () => { vibrate(30); const d = mmss(Date.now() - start); setStart(null); setDur(d); setAll('duration', d) }

  return (
    <div className="bc-rec__bloco grid gap-3" data-testid="continuity">
      <div className="bc-rec__secrot"><span>Continuidade</span></div>

      <div>
        <div className="mb-1.5 text-[13px] font-bold uppercase tracking-[.07em] text-muted">Personagens em cena</div>
        {chars.length ? (
          <div className="flex flex-wrap gap-2" data-testid="characters">
            {chars.map((c) => <button key={c} type="button" aria-pressed={sel.includes(c)} disabled={!canEdit} onClick={() => toggleChar(c)} className={chip(sel.includes(c))}>{c}</button>)}
          </div>
        ) : <p className="text-[15px] text-muted">Cadastre os personagens na ficha técnica (menu ⋮ → Ficha técnica).</p>}
      </div>

      <div>
        <div className="mb-1.5 text-[13px] font-bold uppercase tracking-[.07em] text-muted">Tempo do take</div>
        <div className="flex items-center gap-2">
          {start ? (
            <Button variant="perigo" size="g" icon="x" onClick={corta} disabled={!canEdit} data-testid="corta">CORTA · {mmss(now - start)}</Button>
          ) : (
            <Button size="g" icon="clapperboard" onClick={rec} disabled={!canEdit} data-testid="rec">REC</Button>
          )}
          <input value={dur} placeholder="0:00" inputMode="numeric" disabled={!canEdit} aria-label="Duração do take"
            onChange={(e) => setDur(e.target.value)} onBlur={() => dur !== (active?.duration || '') && setAll('duration', dur.trim() || null)}
            className="min-h-14 w-28 rounded-[10px] border-2 border-borda bg-surface px-3 font-mono text-[17px] text-ink outline-none focus:border-ink" />
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[13px] font-bold uppercase tracking-[.07em] text-muted">Claquete marcada errada? O que estava escrito</div>
        <input value={slate} placeholder="ex.: 54/1/1" disabled={!canEdit} aria-label="Claquete marcada errada"
          onChange={(e) => setSlate(e.target.value)} onBlur={() => slate !== (active?.slate_as || '') && setAll('slate_as', slate.trim() || null)}
          className="min-h-14 w-full rounded-[10px] border-2 border-borda bg-surface px-3 font-mono text-[17px] text-ink outline-none focus:border-ink" />
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[.07em] text-muted"><Icon name="triangle-alert" size={16} /> Problema técnico</div>
        <div className="flex flex-wrap gap-2" data-testid="problems">
          {PROBLEMAS.map((p) => <button key={p} type="button" aria-pressed={probs.includes(p)} disabled={!canEdit} onClick={() => toggleProb(p)} className={chip(probs.includes(p))}>{p}</button>)}
        </div>
      </div>
    </div>
  )
}

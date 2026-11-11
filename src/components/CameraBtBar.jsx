// Barra da câmera Bluetooth na tela do take: estado da conexão, timecode/REC ao vivo, qual câmera do projeto ela é
// (multicâmera) e clipes que rodaram sem conexão. Só aparece em navegador com Web Bluetooth.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import * as link from '../lib/bmd/link'
import * as bt from '../lib/bmd/session'
import { isMulticam, projectCameras } from '../lib/cameras'
import { fmtTime } from '../lib/util'
import { useDialog } from './ui'

function Tc() {
  const [tc, setTc] = useState(link.getState().timecode)
  useEffect(() => link.subscribeTimecode(setTc), [])
  return <span className="font-mono tabular-nums">{tc?.text || '--:--:--:--'}</span>
}

const chip = 'inline-flex min-h-10 items-center rounded-[10px] border-2 px-3 text-[15px] font-bold'

export default function CameraBtBar({ project }) {
  const s = useSyncExternalStore(link.subscribe, link.getState)
  const b = useSyncExternalStore(bt.subscribe, bt.getState)
  const nav = useNavigate()
  const { notify } = useDialog()
  if (!link.supported() || !project) return null

  const multi = isMulticam(project)
  const letters = multi ? projectCameras(project).map((c) => c.id) : []
  const letter = multi ? (letters.includes(bt.cameraLetter(project.id)) ? bt.cameraLetter(project.id) : letters[0]) : null
  const on = s.status === 'connected'
  const gaps = b.gaps.filter((g) => !g.context || g.context.projectId === project.id)

  let body
  if (s.status === 'idle' || s.status === 'error') {
    body = (
      <>
        <span className="flex-1 text-muted">Câmera Bluetooth</span>
        <button type="button" className={`${chip} border-borda bg-surface`} onClick={() => link.connect('blackmagic')} data-testid="bt-connect">Blackmagic</button>
        <button type="button" className={`${chip} border-borda bg-surface`} onClick={() => link.connect('sony')} data-testid="bt-connect-sony">Sony</button>
      </>
    )
  } else if (on && s.noData) {
    body = <button type="button" className="flex-1 text-left font-bold text-ng" onClick={() => nav('/camera')}>Câmera sem pareamento · ver como resolver</button>
  } else if (on) {
    body = (
      <>
        {s.camera.recording
          ? <span className="rounded-md bg-ng px-2 py-0.5 font-bold text-white" data-testid="bt-rec">● REC</span>
          : <span className="font-bold text-good">●</span>}
        <span className="flex-1 truncate">{s.brand === 'sony' ? <span className="text-muted">sem timecode</span> : <Tc />}{s.deviceName ? <span className="text-muted"> · {s.deviceName}</span> : null}</span>
      </>
    )
  } else {
    body = <span className="flex-1 font-bold text-check-ink">{s.status === 'reconnecting' ? 'Câmera: reconectando…' : 'Câmera: conectando…'}</span>
  }

  return (
    <div className="grid gap-2" data-testid="bt-bar">
      <div className="flex min-h-12 items-center gap-2 rounded-[10px] border-2 border-line px-3 text-[15px]">
        {body}
        <button type="button" className="text-sm text-muted underline" onClick={() => nav('/camera')}>detalhes</button>
      </div>
      {multi && on && (
        <div className="flex flex-wrap items-center gap-2 text-[15px]">
          <span className="text-muted">Esta câmera é a</span>
          {letters.map((l) => (
            <button key={l} type="button" aria-pressed={l === letter} onClick={() => bt.setCameraLetter(project.id, l)}
              className={`${chip} ${l === letter ? 'border-ink bg-ink text-bg' : 'border-borda bg-surface'}`}>{l}</button>
          ))}
        </div>
      )}
      {b.message && <p className="text-sm text-ng">{b.message}</p>}
      {gaps.map((g) => (
        <div key={g.id} className="rounded-[10px] border-2 border-check px-3 py-2 text-[15px]" data-testid="bt-gap">
          <div className="font-bold">
            {g.takes ? `${g.takes.length} clipe${g.takes.length > 1 ? 's' : ''} rodaram sem conexão` : 'Clipes rodaram sem conexão'}
            {g.context?.label ? ` · plano ${g.context.label}` : ''}
          </div>
          <div className="text-sm text-muted">
            {fmtTime(g.startAt)} → {fmtTime(g.stopAt)}{g.approxSeconds ? ` · ≈${Math.floor(g.approxSeconds / 60)}:${String(g.approxSeconds % 60).padStart(2, '0')} gravados` : ''}
            {' · '}sem timecode
          </div>
          <div className="mt-2 flex gap-2">
            {g.takes && (
              <button type="button" className={`${chip} border-accent bg-accent text-accent-ink`} onClick={async () => {
                try { const n = await bt.createGapTakes(g); notify(`${n} take${n > 1 ? 's' : ''} criado${n > 1 ? 's' : ''}`) } catch (e) { notify(e.message, 'error') }
              }}>Criar {g.takes.length} take{g.takes.length > 1 ? 's' : ''}</button>
            )}
            <button type="button" className={`${chip} border-borda bg-surface`} onClick={() => bt.dismissGap(g.id)}>Ignorar</button>
          </div>
        </div>
      ))}
    </div>
  )
}

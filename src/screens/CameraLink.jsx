// Tela de teste da conexão Bluetooth com câmeras Blackmagic (fase 1).
// Serve para responder no set: o PIN funciona? o timecode chega? o REC é detectado? a claquete escrita vale?
// Ainda não grava nada nos takes do Boletim.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { TopBar, Btn, Card, TextInput, useDialog } from '../components/ui'
import * as link from '../lib/bmd/link'
import * as bt from '../lib/bmd/session'
import { cmd } from '../lib/bmd/protocol'
import { fmtTime } from '../lib/util'

const STATUS = {
  idle: 'Desconectada',
  choosing: 'Escolhendo a câmera…',
  connecting: 'Conectando… (se a câmera mostrar um PIN, digite em até 30 s)',
  connected: 'Conectada',
  reconnecting: 'Conexão caiu — tentando de novo…',
  error: 'Erro',
}

const Title = ({ children }) => <div className="mb-2 text-[13px] font-bold uppercase tracking-[.07em] text-muted">{children}</div>
const Row = ({ label, value }) => (
  <div className="flex justify-between gap-3 border-b border-line py-1.5 last:border-0">
    <span className="text-muted">{label}</span><span className="text-right font-mono">{value ?? '—'}</span>
  </div>
)

function LiveTimecode() {
  const [tc, setTc] = useState(link.getState().timecode)
  useEffect(() => link.subscribeTimecode(setTc), [])
  return <div className="font-mono text-5xl font-bold tabular-nums tracking-tight">{tc?.text || '--:--:--:--'}</div>
}

const seconds = (r) => r.stopAt ? Math.round((r.stopAt - r.startAt) / 1000) : null
const dur = (s) => s == null ? 'gravando…' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Sem conta (endereço #/camera direto) não dá para usar a TopBar: ela mostra a sincronização, que precisa do banco do usuário
function Header({ standalone }) {
  if (!standalone) return <TopBar title="Câmera Bluetooth" subtitle="Blackmagic · teste" back="/conta" />
  return (
    <header className="safe-top sticky top-0 z-30 border-b-2 border-line bg-bg px-4 py-3">
      <div className="text-[13px] font-bold uppercase tracking-[.07em] text-muted">Blackmagic · teste</div>
      <h1 className="text-xl font-bold">Câmera Bluetooth</h1>
    </header>
  )
}

export default function CameraLink({ standalone }) {
  const s = useSyncExternalStore(link.subscribe, link.getState)
  const session = useSyncExternalStore(bt.subscribe, bt.getState)
  const { confirm, notify } = useDialog()
  const [scene, setScene] = useState('')
  const [take, setTake] = useState('')
  const [project, setProject] = useState('')
  const [hasKnown, setHasKnown] = useState(false)
  const cam = s.camera || {}
  const slate = cam.slate || {}
  const on = s.status === 'connected'

  useEffect(() => {
    navigator.bluetooth?.getDevices?.().then((l) => setHasKnown(l.length > 0)).catch(() => {})
  }, [s.status])

  const send = async (bytes, label) => {
    try { await link.send(bytes, label); notify(`${label}: enviado`) } catch (e) { notify(e.message, 'error') }
  }

  const copyLog = async () => {
    const text = s.log.map((l) => `${new Date(l.at).toLocaleTimeString('pt-BR')} ${l.dir} ${l.text}`).join('\n')
    try { await navigator.clipboard.writeText(text); notify('Registro copiado') } catch { notify('Não deu para copiar', 'error') }
  }

  if (!link.supported()) {
    return (
      <>
        <Header standalone={standalone} />
        <main className="mx-auto grid max-w-2xl gap-4 px-4 pt-4 pb-28">
          <Card className="p-4">
            <div className="text-[17px] font-bold">Este navegador não tem Bluetooth para sites</div>
            <p className="mt-2 text-sm text-muted">
              Funciona no <b>Chrome</b> (ou Edge) do Android, Windows e Mac. No iPhone e no iPad nenhum navegador tem
              esse recurso. O endereço também precisa ser <b>https</b> (ou localhost).
            </p>
          </Card>
        </main>
      </>
    )
  }

  return (
    <>
      <Header standalone={standalone} />
      <main className="mx-auto grid max-w-2xl gap-4 px-4 pt-4 pb-28">
        <Card className="p-4">
          <Title>Conexão</Title>
          <div className={`text-[17px] font-bold ${on && s.noData ? 'text-ng' : ''}`} data-testid="bt-status">
            {on && s.noData ? 'Sem pareamento — a câmera não está mandando dados' : STATUS[s.status]}
            {on && !s.noData && s.deviceName ? ` · ${s.deviceName}` : ''}
          </div>
          {s.error && <p className="mt-1 text-sm text-ng">{s.error}</p>}
          {s.waitingPin && (
            <div className="mt-3 rounded-[10px] border-2 border-check p-3 text-sm" data-testid="bt-waitpin">
              <b>Parado esperando o pareamento.</b> O sistema deve estar pedindo o PIN que aparece na tela da câmera.
              No Windows ele vem como notificação no canto da tela (ou na central, <b>Win + N</b>); no Android, como
              janela ou notificação. Digite em até 30 s.
            </div>
          )}
          {s.refused && s.status !== 'connected' && (
            <div className="mt-3 rounded-[10px] border-2 border-ng p-3 text-sm" data-testid="bt-refused">
              <b>A câmera está recusando este aparelho.</b> Quase sempre ela "esqueceu" o pareamento (Bluetooth
              desconectado pelo menu da câmera, ou pareada com outro aparelho) e o sistema ainda guarda a chave antiga.
              <ol className="mt-2 list-decimal pl-5">
                <li>Toque em <b>Desconectar</b> aqui.</li>
                <li>Confira se nenhum outro aparelho está conectado na câmera (celular, outro computador, placa).</li>
                <li><b>Windows</b> → Configurações → Bluetooth e dispositivos → câmera → <b>Remover dispositivo</b>.
                  {' '}<b>Android</b> → Bluetooth → engrenagem da câmera → <b>Desparear</b>.</li>
                <li>Pareie de novo pelo sistema, digitando o PIN da câmera, e conecte aqui.</li>
              </ol>
            </div>
          )}
          {on && s.noData && (
            <div className="mt-3 rounded-[10px] border-2 border-ng p-3 text-sm" data-testid="bt-nodata">
              <b>A câmera não está mandando dados.</b> Quase sempre é porque o pareamento (PIN) não aconteceu.
              Pareie primeiro pelo sistema: <b>Android</b> → Configurações → Dispositivos conectados → Parear novo
              dispositivo; <b>Windows</b> → Configurações → Bluetooth → Adicionar dispositivo. Escolha a câmera, digite o
              PIN que aparece na tela dela e depois toque em Desconectar e Conectar aqui de novo.
            </div>
          )}
          <div className="mt-3 grid gap-2">
            {s.status === 'idle' || s.status === 'error' ? (
              <>
                <Btn onClick={() => link.connect()}>Conectar câmera</Btn>
                {hasKnown && <Btn variant="surface" onClick={() => link.reconnectKnown()}>Reconectar a última câmera</Btn>}
              </>
            ) : (
              <>
                {s.status === 'reconnecting' && <Btn onClick={() => link.retryNow()}>Reconectar agora</Btn>}
                <Btn variant="surface" onClick={() => link.disconnect()}>Desconectar</Btn>
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            Na câmera: Bluetooth ligado e nenhum outro aparelho conectado (ela aceita um de cada vez).
            <b> Na primeira vez, pareie pelo sistema</b> (Android: Configurações → Dispositivos conectados → Parear novo
            dispositivo; Windows: Configurações → Bluetooth → Adicionar dispositivo) e digite o PIN que aparece na
            câmera. Depois disso é só conectar por aqui.
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <Title>Timecode</Title>
            <span className={`rounded-md px-2 py-0.5 font-bold ${cam.recording ? 'bg-ng text-white' : 'bg-surface2 text-muted'}`}>
              {cam.recording ? '● REC' : 'parada'}
            </span>
          </div>
          <LiveTimecode />
          <p className="mt-1 text-xs text-muted">O timecode pelo Bluetooth é referência, não sincronismo.</p>
        </Card>

        <Card className="p-4">
          <Title>Câmera</Title>
          <Row label="Codec" value={cam.codec ? `${cam.codec} ${cam.codecVariant || ''}` : null} />
          <Row label="Resolução" value={cam.width ? `${cam.width}×${cam.height}` : null} />
          <Row label="FPS" value={cam.fps} />
          <Row label="ISO" value={cam.iso} />
          <Row label="WB" value={cam.wb ? `${cam.wb}K${cam.tint ? ` · tint ${cam.tint}` : ''}` : null} />
          <Row label="Shutter" value={cam.shutter ? `1/${cam.shutter}` : null} />
          <Row label="Cartão ativo" value={cam.activeCard ? `cartão ${cam.activeCard}` : null} />
        </Card>

        <Card className="p-4">
          <Title>Claquete na câmera</Title>
          <Row label="Rolo (sem confirmar)" value={slate.reel} />
          <Row label="Cena" value={slate.scene} />
          <Row label="Take" value={slate.take != null ? `${slate.take}${slate.takeTag ? ` ${slate.takeTag}` : ''}` : null} />
          <Row label="Good take" value={slate.goodTake == null ? null : slate.goodTake ? 'sim' : 'não'} />
          <Row label="INT/EXT · dia/noite" value={slate.intExt || slate.dayNight ? `${slate.intExt} · ${slate.dayNight}` : null} />
          <Row label="ID da câmera" value={slate.cameraId} />
          <Row label="Projeto" value={slate.project} />
          <Row label="Vale para" value={slate.slateFor} />
        </Card>

        <Card className="p-4">
          <Title>Escrever na claquete da câmera</Title>
          <p className="mb-3 text-xs text-muted">
            Só o nome do projeto já foi confirmado na Pocket 4K. Cena, take e good take são teste: confira na tela
            da câmera e depois no metadado do clipe no Resolve.
          </p>
          <div className="grid gap-2">
            <div className="flex gap-2">
              <div className="flex-1"><TextInput value={project} onChange={(e) => setProject(e.target.value)} placeholder="Projeto (até 15)" aria-label="Projeto" /></div>
              <Btn variant="surface" disabled={!on || !project} onClick={() => send(cmd.project(project), 'Projeto')}>Enviar</Btn>
            </div>
            <div className="flex gap-2">
              <div className="flex-1"><TextInput value={scene} onChange={(e) => setScene(e.target.value)} placeholder="Cena (ex.: 12A)" aria-label="Cena" /></div>
              <Btn variant="surface" disabled={!on || !scene} onClick={() => send(cmd.scene(scene), 'Cena')}>Enviar</Btn>
            </div>
            <div className="flex gap-2">
              <div className="flex-1"><TextInput value={take} inputMode="numeric" onChange={(e) => setTake(e.target.value.replace(/\D/g, ''))} placeholder="Take (1–99)" aria-label="Take" /></div>
              <Btn variant="surface" disabled={!on || !take} onClick={() => send(cmd.take(take), 'Take')}>Enviar</Btn>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="surface" disabled={!on} onClick={() => send(cmd.goodTake(true), 'Good take sim')}>Good take: sim</Btn>
              <Btn variant="surface" disabled={!on} onClick={() => send(cmd.goodTake(false), 'Good take não')}>Good take: não</Btn>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <Title>Gravações ({s.recordings.length})</Title>
            {s.recordings.length > 0 && <button className="text-sm text-muted underline" onClick={async () => {
              if (await confirm({ title: 'Limpar gravações', confirmLabel: 'Limpar', danger: true,
                message: 'Apaga esta lista deste aparelho. Os clipes na câmera não são afetados.' })) link.clearRecordings()
            }}>Limpar</button>}
          </div>
          {s.recordings.length === 0
            ? <p className="text-sm text-muted">Dê REC na câmera: cada gravação aparece aqui com o timecode de início e fim.</p>
            : (
              <div className="grid gap-1">
                {[...s.recordings].reverse().map((r) => r.offline ? (
                  <div key={r.id} className="rounded-[10px] border-2 border-check px-3 py-2 text-sm" data-testid="bt-offline">
                    <div className="font-bold">
                      Sem conexão · {fmtTime(r.startAt)} → {fmtTime(r.stopAt)}
                    </div>
                    <div className="font-mono">
                      {r.takes ? `${r.takes.length} clipe${r.takes.length > 1 ? 's' : ''}: take${r.takes.length > 1 ? 's' : ''} ${r.takes.join(', ')}` : 'quantidade de clipes desconhecida'}
                      {r.scene ? ` · cena ${r.scene}` : ''}
                      {r.approxSeconds ? ` · ≈${dur(r.approxSeconds)} gravados` : ''}
                    </div>
                    <div className="text-xs text-muted">Sem timecode: confira na descarga do cartão.</div>
                  </div>
                ) : (
                  <div key={r.id} className="flex items-center justify-between gap-2 border-b border-line py-1.5 font-mono text-sm last:border-0">
                    <span>{fmtTime(r.startAt)}</span>
                    <span>{r.startTc || '—'} → {r.stopTc || (r.interrupted ? 'caiu' : '…')}</span>
                    <span className="text-muted">{r.interrupted ? '—' : dur(seconds(r))}</span>
                    <span className="text-muted">{r.slate?.scene ? `C${r.slate.scene}` : ''}{r.slate?.take != null ? ` T${r.slate.take}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          {!standalone && (
            <p className="mt-2 text-sm font-bold" data-testid="bt-context">
              {session.context
                ? `Cada REC vira take no plano ${session.context.label} (o último que você abriu).`
                : 'Nenhum plano aberto ainda: abra um plano para os RECs virarem takes.'}
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            A lista fica guardada neste aparelho. Se a conexão cair, ao voltar o app conta pelo nº do take da câmera
            quantos clipes rodaram nesse meio-tempo. A lista completa, com o nome dos arquivos, vem do cartão:
            menu ⋮ do projeto → Conferir cartão, ou importando do Resolve.
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <Title>Registro ({s.log.length})</Title>
            <div className="flex gap-3">
              <button className="text-sm text-muted underline" onClick={copyLog}>Copiar</button>
              <button className="text-sm text-muted underline" onClick={() => link.clearLog()}>Limpar</button>
            </div>
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">
            {s.log.slice(-150).map((l) => `${new Date(l.at).toLocaleTimeString('pt-BR')} ${l.dir} ${l.text}`).join('\n') || 'Nada ainda.'}
          </pre>
        </Card>
        <details className="rounded-[10px] border-2 border-line px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold text-muted">Avançado</summary>
          <div className="mt-3">
            <Title>Gravar pelo app</Title>
            <p className="mb-3 text-xs text-muted">Manda REC e parar para a câmera. Cada toque pede confirmação.</p>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="danger" disabled={!on} onClick={async () => {
                if (await confirm({ title: 'Gravar pelo app', confirmLabel: 'Gravar', danger: true, message: 'Mandar REC para a câmera?' }))
                  send(cmd.record(true), 'REC')
              }}>REC</Btn>
              <Btn variant="surface" disabled={!on} onClick={async () => {
                if (await confirm({ title: 'Parar pelo app', confirmLabel: 'Parar', message: 'Mandar parar a gravação?' }))
                  send(cmd.record(false), 'Parar')
              }}>Parar</Btn>
            </div>
          </div>
        </details>
      </main>
    </>
  )
}

// Conexão Web Bluetooth com uma câmera Blackmagic.
// Funciona no Chrome/Edge do Android, Windows, macOS e ChromeOS. Não funciona em navegador de iPhone/iPad.
// Uma conexão só, guardada aqui fora do React: continua viva ao trocar de tela.
//
// Ordem da conexão (a mesma do CCU Bridge): conecta → acha o serviço → acha as características →
// escreve o nosso nome (é aqui que a câmera costuma pedir o PIN) → assina recebimento, timecode e status.
import { SERVICE, CHR, parseMessages, applyMessage, parseTimecode, describe, toHex, detectGap } from './protocol'

const MAX_LOG = 400
const RETRY_MS = 4000
const DEVICE_NAME = 'Boletim'

// Guardado no aparelho: as gravações detectadas sobrevivem a recarregar a página, e o "retrato" da câmera
// permite descobrir, ao reconectar, o que foi gravado enquanto estava sem conexão.
const REC_KEY = 'boletim.bt.recordings'
const SNAP_KEY = 'boletim.bt.snapshot'
const MAX_RECORDINGS = 500
const GAP_CHECK_MS = 3000 // a câmera manda o estado completo logo depois de conectar

const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* sem espaço ou bloqueado */ } }

const initial = () => ({
  status: 'idle', // idle | choosing | connecting | connected | reconnecting | error
  error: '',
  deviceName: '',
  camera: {}, // estado da câmera (recording, codec, fps, slate…)
  timecode: null, // { text, hh, mm, ss, ff, flags }
  timecodeAt: 0,
  // [{ id, startTc, startAt, stopTc, stopAt, slate, interrupted? }] ou, sem conexão,
  // [{ id, offline: true, startAt, stopAt, scene, takes: [n…] | null, approxSeconds }]
  recordings: load(REC_KEY, []),
  log: [], // [{ at, dir: '←' | '→' | '·', text }]
  noData: false, // conectou mas a câmera não manda nada: quase sempre é falta de pareamento
  refused: false, // a câmera aceita e derruba seguidas vezes: ela esqueceu este aparelho (parear de novo)
  waitingPin: false, // um passo da conexão está parado: quase sempre o sistema esperando o PIN
})

let state = initial()
const listeners = new Set()
let device = null
let chars = {}
let wantConnected = false
let retryTimer = null
let tcListeners = new Set()
let lastDataAt = 0
let noDataTimer = null
const NO_DATA_MS = 5000

function gotData() {
  lastDataAt = Date.now()
  if (state.noData) set({ noData: false })
}

function set(patch) {
  const prev = state
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  if (state.recordings !== prev.recordings) save(REC_KEY, state.recordings.slice(-MAX_RECORDINGS))
  if (state.camera !== prev.camera && state.status === 'connected') saveSnapshot(state.camera)
  listeners.forEach((l) => l())
}

// O que importa para comparar depois: nº do take na claquete (a câmera soma 1 a cada clipe), tempo livre no
// cartão ativo e o formato (se o formato mudar, o tempo livre muda sem ninguém gravar).
function saveSnapshot(cam) {
  if (cam.slate?.take == null && !cam.cardSeconds) return
  save(SNAP_KEY, {
    at: Date.now(), take: cam.slate?.take ?? null, scene: cam.slate?.scene ?? '', recording: !!cam.recording,
    activeCard: cam.activeCard ?? 0, cardSeconds: cam.cardSeconds ?? null,
    format: [cam.codec, cam.codecVariant, cam.fps, cam.width].join('|'),
  })
}

function log(dir, text) {
  set((s) => ({ log: [...s.log.slice(-(MAX_LOG - 1)), { at: Date.now(), dir, text }] }))
}

export const supported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth && window.isSecureContext
export const getState = () => state
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }
// Timecode chega muitas vezes por segundo: quem só quer o timecode assina aqui (não re-renderiza a tela toda).
export function subscribeTimecode(fn) { tcListeners.add(fn); return () => tcListeners.delete(fn) }

function onIncoming(e) {
  const bytes = new Uint8Array(e.target.value.buffer.slice(0))
  gotData()
  const msgs = parseMessages(bytes)
  let cam = state.camera
  for (const m of msgs) {
    const before = cam
    cam = applyMessage(cam, m)
    // Não lota o registro com o que se repete sem parar (bateria 9.x, formato 1.9)
    if (cam !== before || !(m.category === 9 || (m.category === 1 && m.parameter === 9))) log('←', describe(m))
  }
  if (!msgs.length) log('←', `cru ${toHex(bytes)}`)
  if (cam === state.camera) return
  const wasRec = !!state.camera.recording
  const isRec = !!cam.recording
  const patch = { camera: cam }
  // Início e fim de gravação viram registros com timecode: é a base do "take automático"
  if (!wasRec && isRec) {
    patch.recordings = [...state.recordings, {
      id: crypto.randomUUID(), startAt: Date.now(), startTc: state.timecode?.text || '', stopTc: '', stopAt: 0, slate: { ...(cam.slate || {}) },
    }]
    log('·', `REC ${state.timecode?.text || ''}`)
  } else if (wasRec && !isRec) {
    const list = [...state.recordings]
    const last = list[list.length - 1]
    if (last && !last.stopAt) list[list.length - 1] = { ...last, stopAt: Date.now(), stopTc: state.timecode?.text || '' }
    patch.recordings = list
    log('·', `CORTA ${state.timecode?.text || ''}`)
  }
  set(patch)
}

function onTimecode(e) {
  const tc = parseTimecode(new Uint8Array(e.target.value.buffer.slice(0)))
  if (!tc) return
  if (!lastDataAt || state.noData) gotData()
  else lastDataAt = Date.now()
  state = { ...state, timecode: tc, timecodeAt: Date.now() } // sem avisar a tela toda
  tcListeners.forEach((l) => l(tc))
}

function onStatus(e) {
  const b = new Uint8Array(e.target.value.buffer.slice(0))
  log('←', `status ${toHex(b)}`)
}

function onDisconnected() {
  const wasConnected = !!chars.outgoing
  chars = {}
  if (!wantConnected) { log('·', 'conexão caiu'); return set({ status: 'idle' }) }
  // Quedas sem estarmos conectados = o sistema (Windows/Android) tentando sozinho e a câmera recusando.
  // Não reiniciam o relógio da próxima tentativa (antes, elas adiavam a tentativa para sempre).
  if (!wasConnected && (opening || retryTimer)) { quietDrops++; return }
  log('·', 'conexão caiu')
  set({ status: 'reconnecting' })
  if (!opening) scheduleRetry() // se caiu durante uma tentativa, quem tenta de novo é ela
}
let quietDrops = 0
let refusals = 0
const REFUSALS_FOR_WARNING = 3

let attempt = 0
let opening = false

// Passo que pode ficar esperando o pareamento: avisa no registro se demorar (não cancela, o PIN pode chegar depois)
const SLOW_STEP_MS = 8000
async function step(label, promise) {
  const t = setTimeout(() => {
    log('·', `${label}: esperando há ${SLOW_STEP_MS / 1000} s — o sistema deve estar pedindo o PIN (Windows: veja as notificações, Win + N)`)
    set({ waitingPin: true })
  }, SLOW_STEP_MS)
  try { return await promise } finally { clearTimeout(t); if (state.waitingPin) set({ waitingPin: false }) }
}

// Tenta de novo para sempre enquanto o usuário quiser a câmera conectada: 2 s, 4 s, 6 s… até 10 s entre tentativas.
function scheduleRetry(now = false) {
  clearTimeout(retryTimer)
  if (!wantConnected || !device) return
  const wait = now ? 0 : Math.min(2000 * (attempt + 1), 10000)
  retryTimer = setTimeout(async () => {
    retryTimer = null
    if (!wantConnected || !device || opening) return
    attempt++
    log('·', `tentando reconectar (${attempt})…`)
    try {
      // Limpa o que sobrou da conexão anterior: no Windows, sem isso o connect() às vezes "conecta" num link morto
      if (device.gatt.connected) device.gatt.disconnect()
      await open()
      attempt = 0
    } catch (err) {
      noteRefusal(err)
      log('·', `tentativa ${attempt} falhou: ${err.message}${quietDrops ? ` (+${quietDrops} quedas do sistema)` : ''}`)
      quietDrops = 0
      if (wantConnected) { set({ status: 'reconnecting' }); scheduleRetry() }
    }
  }, wait)
}

function noteRefusal(err) {
  if (!/derrubou|Connection attempt failed|disconnected/i.test(err.message)) return
  refusals++
  if (refusals >= REFUSALS_FOR_WARNING && !state.refused) {
    log('·', 'a câmera está recusando este aparelho: provavelmente esqueceu o pareamento')
    set({ refused: true })
  }
}

/** Tenta reconectar já, sem esperar a próxima tentativa. */
export function retryNow() { attempt = 0; scheduleRetry(true) }

async function open() {
  if (opening) throw new Error('já estou conectando')
  opening = true
  try { await openInner() } finally { opening = false }
}

async function openInner() {
  const before = load(SNAP_KEY, null) // retrato de antes desta conexão
  set({ status: state.status === 'reconnecting' ? 'reconnecting' : 'connecting', error: '' })
  log('·', 'conectando…')
  const server = await device.gatt.connect()
  // A câmera às vezes aceita e derruba logo em seguida (ainda refazendo a criptografia do pareamento)
  await new Promise((r) => setTimeout(r, 300))
  if (!device.gatt.connected) throw new Error('a câmera aceitou e derrubou a conexão logo em seguida')
  const service = await server.getPrimaryService(SERVICE)
  log('·', 'serviço Blackmagic encontrado')
  const get = (uuid) => service.getCharacteristic(uuid).catch(() => null)
  const [outgoing, incoming, timecode, status, deviceName] = await Promise.all(
    [CHR.outgoing, CHR.incoming, CHR.timecode, CHR.status, CHR.deviceName].map(get))
  if (!outgoing || !incoming) throw new Error('A câmera não tem as características de comando esperadas.')
  log('·', `características: ${[['comando', outgoing], ['recebimento', incoming], ['timecode', timecode], ['status', status], ['nome', deviceName]].map(([n, c]) => `${n} ${c ? 'ok' : 'não'}`).join(', ')}`)
  chars = { outgoing, incoming, timecode, status, deviceName }

  // Ler/escrever numa característica protegida deveria fazer o sistema pedir o PIN da câmera.
  // Se nada pedir PIN e a câmera não mandar dados, o pareamento não aconteceu (ver aviso noData).
  const proto = await service.getCharacteristic(CHR.protocol).catch(() => null)
  if (proto) {
    try { log('·', `versão do protocolo: ${new TextDecoder().decode(await proto.readValue())}`) }
    catch (e) { log('·', `leitura da versão recusada (${e.name}): ${e.message}`) }
  }
  if (deviceName) {
    log('·', 'enviando nosso nome (a câmera pode pedir o PIN agora)…')
    try {
      await step('enviando nome', deviceName.writeValueWithResponse(new TextEncoder().encode(DEVICE_NAME)))
      log('·', 'nome aceito pela câmera (isso ainda não prova que pareou)')
    } catch (e) { log('·', `nome recusado (${e.name}): ${e.message}`) }
  }
  // O Chrome pode devolver o mesmo objeto ao reconectar: tira antes para não receber tudo em dobro
  incoming.removeEventListener('characteristicvaluechanged', onIncoming)
  incoming.addEventListener('characteristicvaluechanged', onIncoming)
  log('·', 'assinando o recebimento…')
  await step('assinando o recebimento', incoming.startNotifications())
  if (timecode) {
    timecode.removeEventListener('characteristicvaluechanged', onTimecode)
    timecode.addEventListener('characteristicvaluechanged', onTimecode)
    await step('assinando o timecode', timecode.startNotifications()).catch((e) => log('·', `timecode indisponível: ${e.message}`))
  }
  if (status) {
    status.removeEventListener('characteristicvaluechanged', onStatus)
    status.addEventListener('characteristicvaluechanged', onStatus)
    await status.startNotifications().catch(() => {})
  }
  refusals = 0
  set({ status: 'connected', deviceName: device.name || 'Câmera Blackmagic', noData: false, refused: false })
  log('·', `conectada: ${device.name || ''}`)
  setTimeout(() => {
    if (state.status !== 'connected') return
    const cam = state.camera
    const now = { take: cam.slate?.take ?? null, activeCard: cam.activeCard ?? 0, cardSeconds: cam.cardSeconds ?? null,
      format: [cam.codec, cam.codecVariant, cam.fps, cam.width].join('|') }
    const list = [...state.recordings]
    // REC que estava rodando quando a conexão caiu e já terminou: fecha sem o TC de saída
    const last = list[list.length - 1]
    if (last && !last.offline && !last.stopAt && !cam.recording) {
      list[list.length - 1] = { ...last, stopAt: Date.now(), stopTc: '', interrupted: true }
      log('·', 'o REC que estava rodando terminou sem conexão: fim sem timecode')
    }
    const gap = detectGap(before, now)
    if (gap) {
      list.push(gap)
      log('·', `sem conexão: ${gap.takes ? `${gap.takes.length} clipe(s), takes ${gap.takes.join(', ')}` : 'clipes não contados'}${gap.approxSeconds ? `, ≈${gap.approxSeconds} s gravados` : ''}`)
    }
    if (list.length !== state.recordings.length || list[list.length - 1] !== state.recordings[state.recordings.length - 1]) set({ recordings: list })
    saveSnapshot(state.camera)
  }, GAP_CHECK_MS)
  const since = Date.now()
  clearTimeout(noDataTimer)
  noDataTimer = setTimeout(() => {
    if (state.status === 'connected' && lastDataAt < since) {
      log('·', `nenhum dado da câmera em ${NO_DATA_MS / 1000} s: provavelmente não pareou`)
      set({ noData: true })
    }
  }, NO_DATA_MS)
}

/** Abre o seletor do navegador (precisa vir de um toque do usuário) e conecta. */
export async function connect() {
  if (!supported()) throw new Error('Este navegador não tem Bluetooth para sites.')
  wantConnected = true
  set({ status: 'choosing', error: '' })
  try {
    const chosen = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE] }],
      optionalServices: [SERVICE, 'device_information'],
    })
    if (device && device !== chosen) device.removeEventListener('gattserverdisconnected', onDisconnected)
    device = chosen
    device.addEventListener('gattserverdisconnected', onDisconnected)
    set({ camera: {}, timecode: null })
    await open()
  } catch (err) {
    const cancelled = err.name === 'NotFoundError' && /cancel/i.test(err.message)
    if (cancelled) { wantConnected = false; return set({ status: device?.gatt?.connected ? 'connected' : 'idle' }) }
    log('·', `erro: ${err.name}: ${err.message}`)
    noteRefusal(err)
    // Caiu durante a preparação (ex.: PIN demorou > 30 s): tenta de novo sozinho
    // Câmera escolhida mas a conexão caiu na preparação (PIN demorou, link instável): tenta de novo sozinho
    const permanent = ['SecurityError', 'NotAllowedError'].includes(err.name) || /características de comando/.test(err.message)
    if (device && wantConnected && !permanent) { set({ status: 'reconnecting', error: '' }); return scheduleRetry() }
    wantConnected = false
    set({ status: 'error', error: friendly(err) })
  }
}

/** Câmeras já autorizadas neste navegador (se o Chrome tiver esse recurso). Reconecta sem abrir o seletor. */
export async function reconnectKnown() {
  if (!navigator.bluetooth?.getDevices) return false
  const list = await navigator.bluetooth.getDevices()
  const cam = list[0]
  if (!cam) return false
  device = cam
  device.removeEventListener('gattserverdisconnected', onDisconnected)
  device.addEventListener('gattserverdisconnected', onDisconnected)
  wantConnected = true
  set({ status: 'reconnecting' })
  log('·', `câmera conhecida: ${cam.name || cam.id}`)
  try { await open() } catch (err) { log('·', `ainda não respondeu: ${err.message}`); scheduleRetry() }
  return true
}

export function disconnect() {
  wantConnected = false
  attempt = 0
  refusals = 0
  clearTimeout(retryTimer)
  retryTimer = null
  set({ refused: false })
  clearTimeout(retryTimer)
  if (device?.gatt?.connected) device.gatt.disconnect()
  set({ status: 'idle' })
}

/** Envia um comando (Uint8Array de protocol.js). */
export async function send(bytes, label = '') {
  if (!chars.outgoing) throw new Error('Câmera não conectada.')
  log('→', `${label ? label + ' ' : ''}${toHex(bytes)}`)
  await chars.outgoing.writeValueWithResponse(bytes)
}

export function clearRecordings() { set({ recordings: [] }) }
export function clearLog() { set({ log: [] }) }

function friendly(err) {
  if (err.name === 'SecurityError') return 'O navegador bloqueou o Bluetooth. Abra o app pelo endereço https (ou localhost).'
  if (err.name === 'NotFoundError') return 'Nenhuma câmera escolhida. Confira se o Bluetooth da câmera está ligado e se nenhum outro aparelho está conectado nela.'
  if (err.name === 'NotAllowedError') return 'Permissão de Bluetooth negada. Libere o Bluetooth para este site nas configurações do navegador.'
  if (err.name === 'NetworkError') return 'A conexão caiu durante a preparação. Se a câmera pediu PIN, digite em até 30 segundos.'
  return `${err.name}: ${err.message}`
}

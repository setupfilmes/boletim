// Protocolo Bluetooth das câmeras Blackmagic (Pocket 4K/6K, Cinema Camera 6K, URSA, PYXIS).
// Traduzido do CCU Bridge V2 (firmware ESP32 testado com Pocket 4K, firmware 9.8).
// Referência completa: CCU_Bridge_LoRa/docs/bluetooth-blackmagic.md
// Só funções puras aqui (sem Bluetooth), para poder testar com os bytes reais da câmera.

export const SERVICE = '291d567a-6d75-11e6-8b77-86f30ca893d3'
export const CHR = {
  outgoing: '5dd3465f-1aee-4299-8493-d2eca2f8e1bb', // app → câmera: comandos
  incoming: 'b864e140-76a0-416a-bf30-5876504537d9', // câmera → app: estado e mudanças
  timecode: '6d8f2110-86f1-41bf-9afb-451d87e976c8', // câmera → app: timecode em BCD
  status: '7fe8691d-95dc-4fc5-8abd-ca74339b51b9', // câmera → app: 1 byte (bits não conferidos)
  deviceName: 'ffac0c52-c9fb-41a0-b063-cc76282eb89c', // app → câmera: nome que a câmera mostra
  protocol: '8f1fd018-b508-456f-8f82-3d392bee2706', // leitura: versão do protocolo
}

export const TYPE = { bool: 0, int8: 1, int16: 2, int32: 3, int64: 4, string: 5, fixed16: 128 }
const SIZE = { 0: 1, 1: 1, 2: 2, 3: 4, 4: 8, 128: 2 }

export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join('')
export const fromHex = (hex) => new Uint8Array((hex.replace(/\s+/g, '').match(/../g) || []).map((h) => parseInt(h, 16)))

/**
 * Monta um comando "mudar ajuste".
 * values: número, lista de números, ou texto (TYPE.string). fixed16: número real (1.0 = 2048).
 * Preenche até múltiplo de 4, como o manual pede (o CCU Bridge não preenche e a Pocket aceita; aqui preenchemos).
 */
export function buildCommand(category, parameter, type, values, { op = 0, dest = 0xff } = {}) {
  let data
  if (type === TYPE.string) {
    data = new TextEncoder().encode(String(values ?? ''))
  } else {
    const list = Array.isArray(values) ? values : values == null ? [] : [values]
    const size = SIZE[type]
    if (!size) throw new Error(`tipo ${type} não suportado`)
    data = new Uint8Array(list.length * size)
    const view = new DataView(data.buffer)
    list.forEach((v, i) => {
      const at = i * size
      if (type === TYPE.bool || type === TYPE.int8) view.setInt8(at, v ? Number(v) : 0)
      else if (type === TYPE.int16) view.setInt16(at, v, true)
      else if (type === TYPE.int32) view.setInt32(at, v, true)
      else if (type === TYPE.int64) view.setBigInt64(at, BigInt(v), true)
      else if (type === TYPE.fixed16) view.setInt16(at, Math.round(v * 2048), true)
    })
  }
  const declared = 4 + data.length
  if (declared > 255) throw new Error('comando grande demais')
  const out = new Uint8Array((4 + declared + 3) & ~3)
  out.set([dest, declared, 0, 0, category, parameter, type, op])
  out.set(data, 8)
  return out
}

/** Separa uma indicação em mensagens. Uma indicação pode trazer várias, cada uma preenchida até múltiplo de 4. */
export function parseMessages(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength)
  const out = []
  let at = 0
  while (at + 8 <= b.length) {
    const declared = b[at + 1]
    const size = 4 + declared
    if (b[at] !== 0xff || declared < 4 || at + size > b.length) break
    const category = b[at + 4], parameter = b[at + 5]
    // FF 04 00 00 FF FF FF FF = marca sem conteúdo que a câmera manda às vezes
    if (!(category === 0xff && parameter === 0xff)) {
      out.push({ category, parameter, type: b[at + 6], op: b[at + 7], data: b.slice(at + 8, at + size) })
    }
    at += (size + 3) & ~3
  }
  return out
}

/** Converte os dados de uma mensagem conforme o tipo. Retorna lista de números ou texto. */
export function decodeValue({ type, data }) {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const read = (size, fn) => Array.from({ length: Math.floor(data.length / size) }, (_, i) => fn(i * size))
  switch (type) {
    case TYPE.bool:
    case TYPE.int8: return read(1, (i) => v.getInt8(i))
    case TYPE.int16: return read(2, (i) => v.getInt16(i, true))
    case TYPE.int32: return read(4, (i) => v.getInt32(i, true))
    case TYPE.int64: return read(8, (i) => Number(v.getBigInt64(i, true)))
    case TYPE.string: return new TextDecoder().decode(data)
    case TYPE.fixed16: return read(2, (i) => v.getInt16(i, true) / 2048)
    default: return toHex(data)
  }
}

const bcd = (b) => (b >> 4) * 10 + (b & 0x0f)

/**
 * Timecode: 4 bytes em BCD no fim da notificação, do menos para o mais significativo (FF SS MM HH).
 * Os 2 bits mais altos da hora são um marcador da câmera (significado ainda não descoberto): vão em `flags`.
 */
export function parseTimecode(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (b.length < 4) return null
  const l = b.slice(b.length - 4)
  const hh = bcd(l[3] & 0x3f), mm = bcd(l[2]), ss = bcd(l[1]), ff = bcd(l[0])
  const p = (n) => String(n).padStart(2, '0')
  return { text: `${p(hh)}:${p(mm)}:${p(ss)}:${p(ff)}`, hh, mm, ss, ff, flags: l[3] >> 6, raw: toHex(b) }
}

// ── Tabelas (do CCU Bridge: tools/ble_console.py) ─────────────
export const CODECS = { 0: 'CinemaDNG', 1: 'DNxHD', 2: 'ProRes', 3: 'Blackmagic RAW' }
export const PRORES = { 0: 'HQ', 1: '422', 2: 'LT', 3: 'Proxy', 4: '444', 5: '444 XQ' }
export const BRAW = { 0: 'Q0', 7: 'Q1', 8: 'Q3', 1: 'Q5', 2: '3:1', 3: '5:1', 4: '8:1', 5: '12:1' }
export const MEDIA = { 0: 'CFast', 1: 'SD', 2: 'SSD' }
export const TRANSPORT = { 0: 'parada', 1: 'reprodução', 2: 'gravando' }
export const SCENE_TAG = { '-1': '', 0: 'WS', 1: 'CU', 2: 'MS', 3: 'BCU', 4: 'MCU', 5: 'ECU' }
export const TAKE_TAG = { '-1': '', 0: 'PU', 1: 'VFX', 2: 'SER' }

// Claquete (categoria 12). Só 12.5 a 12.8 foram conferidos na câmera; o resto segue o protocolo SDI da Blackmagic.
export const SLATE = {
  0: 'reel', 1: 'sceneTags', 2: 'scene', 3: 'take', 4: 'goodTake', 5: 'cameraId', 6: 'operator', 7: 'director',
  8: 'project', 9: 'lensType', 10: 'lensIris', 11: 'lensFocal', 12: 'lensDistance', 13: 'filter', 14: 'slateFor', 15: 'slateName',
}

/**
 * Junta uma mensagem no estado da câmera. Retorna o novo estado (objeto novo) ou o mesmo se nada mudou.
 * O estado guarda só o que o Boletim usa; o resto aparece no registro (log).
 */
export function applyMessage(state, msg) {
  const { category: c, parameter: p } = msg
  const val = decodeValue(msg)
  const s = { ...state }
  if (c === 10 && p === 1 && Array.isArray(val) && val.length >= 1) {
    s.transport = val[0] // 0 parada, 1 reprodução, 2 gravando
    s.recording = val[0] === 2
    if (val.length >= 3) s.activeCard = val[2] & 0x40 ? 2 : val[2] & 0x20 ? 1 : 0
  } else if (c === 10 && p === 0 && Array.isArray(val) && val.length >= 2) {
    s.codec = CODECS[val[0]] ?? `codec ${val[0]}`
    const variant = ({ 2: PRORES, 3: BRAW })[val[0]]?.[val[1]]
    s.codecVariant = variant ?? String(val[1])
  } else if (c === 1 && p === 9 && Array.isArray(val) && val.length >= 4) {
    s.fps = val[0]; s.sensorFps = val[1]; s.width = val[2]; s.height = val[3]
  } else if (c === 1 && p === 14 && Array.isArray(val)) {
    s.iso = val[0]
  } else if (c === 1 && p === 2 && Array.isArray(val) && val.length >= 1) {
    s.wb = val[0]; s.tint = val[1]
  } else if (c === 1 && p === 12 && Array.isArray(val)) {
    s.shutter = val[0] // 1/x
  } else if (c === 9 && p === 2 && Array.isArray(val)) {
    s.cardSeconds = val // segundos restantes por cartão (fora do manual)
  } else if (c === 12 && SLATE[p]) {
    const slate = { ...(s.slate || {}) }
    const key = SLATE[p]
    if (key === 'take' && Array.isArray(val)) { slate.take = val[0]; slate.takeTag = TAKE_TAG[val[1]] ?? '' }
    else if (key === 'sceneTags' && Array.isArray(val)) {
      slate.shotType = SCENE_TAG[val[0]] ?? ''
      slate.intExt = val[1] === 1 ? 'INT' : val[1] === 0 ? 'EXT' : ''
      slate.dayNight = val[2] === 1 ? 'DIA' : val[2] === 0 ? 'NOITE' : ''
    } else if (key === 'goodTake' && Array.isArray(val)) slate.goodTake = !!val[0]
    else if (key === 'reel' && Array.isArray(val)) slate.reel = val[0]
    else if (key === 'slateFor' && Array.isArray(val)) slate.slateFor = val[0] === 1 ? 'último clipe' : 'próximo clipe'
    else slate[key] = val
    s.slate = slate
  } else {
    return state
  }
  return s
}

/** Descrição curta para o registro: "12.2 texto “1”". */
export function describe(msg) {
  const val = decodeValue(msg)
  const shown = typeof val === 'string' ? `“${val}”` : Array.isArray(val) ? val.join(', ') : val
  return `${msg.category}.${msg.parameter} ${shown}`
}

// ── Comandos usados pelo Boletim ──────────────────────────────
export const cmd = {
  // Claquete. 12.8 (projeto) foi confirmado na Pocket 4K; os outros ainda precisam ser conferidos na câmera e no Resolve.
  project: (name) => buildCommand(12, 8, TYPE.string, String(name).slice(0, 15)),
  scene: (scene) => buildCommand(12, 2, TYPE.string, String(scene).slice(0, 5)),
  take: (take, tag = -1) => buildCommand(12, 3, TYPE.int8, [Math.max(1, Math.min(99, Number(take) || 1)), tag]),
  goodTake: (good) => buildCommand(12, 4, TYPE.bool, [good ? 1 : 0]),
  cameraId: (id) => buildCommand(12, 5, TYPE.string, String(id).slice(0, 1)),
  reel: (reel) => buildCommand(12, 0, TYPE.int16, [Number(reel) || 1]),
  slateFor: (lastClip) => buildCommand(12, 14, TYPE.int8, [lastClip ? 1 : 0]),
  // Gravar / parar (10.1). NUNCA testado no CCU Bridge — testar com cartão sem material importante.
  record: (on) => buildCommand(10, 1, TYPE.int8, [on ? 2 : 0]),
}

// ── O que rodou sem conexão ───────────────────────────────────
// A câmera não manda lista de clipes pelo Bluetooth. Ao reconectar, comparamos o "retrato" salvo antes da
// queda com o estado atual: o nº do take da claquete (a câmera soma 1 a cada clipe) e o tempo livre do cartão.
const GAP_MAX_HOURS = 14 // retrato mais velho que isso não vale (outra diária, cartão trocado)

const cardLeft = (snap) => {
  const i = snap.activeCard === 2 ? 1 : snap.activeCard === 1 ? 0 : -1
  return i >= 0 && Array.isArray(snap.cardSeconds) ? snap.cardSeconds[i] : null
}

/** Compara o retrato de antes da conexão com o estado atual e registra o que rodou sem conexão. */
export function detectGap(before, now, nowAt = Date.now()) {
  if (!before || nowAt - before.at > GAP_MAX_HOURS * 3600e3) return null
  // Se caiu no meio de um REC, o clipe que estava rodando já está na lista: não conta de novo
  let jump = before.take != null && now.take != null ? now.take - before.take - (before.recording ? 1 : 0) : 0
  if (jump < 0 || jump > 50) jump = 0 // take mudado à mão ou outra claquete: não dá para saber
  let seconds = null
  if (before.activeCard && before.activeCard === now.activeCard && before.format === now.format) {
    const a = cardLeft(before), b = cardLeft(now)
    if (a != null && b != null && a - b > 5) seconds = a - b
  }
  if (!jump && !seconds) return null
  return {
    id: crypto.randomUUID(), offline: true, startAt: before.at, stopAt: nowAt, scene: before.scene,
    takes: jump ? Array.from({ length: jump }, (_, i) => before.take + (before.recording ? 1 : 0) + i) : null,
    approxSeconds: seconds,
  }
}

// Sony (FX3, FX30, Alpha) pelo Bluetooth: protocolo do controle remoto RMT-P1BT.
// NÃO é oficial: foi mapeado por desenvolvedores independentes (Greg Leeds; projetos freemote, furble; Hypoxic:
// gethypoxic.com/blogs/technical/sony-camera-ble-control-protocol-di-remote-control).
// O que dá: saber quando grava/para (aviso D5) e mandar REC. Não vem timecode, ISO, WB, nem claquete.
// O controle completo da Sony (app Creators' App / Monitor & Control) é pelo Wi-Fi (PTP/IP) — o navegador não alcança.

export const SONY_SERVICE = '8000ff00-ff00-ffff-ffff-ffffffffffff'
export const SONY_CHR = {
  command: 0xff01, // app → câmera: 2 bytes (código do botão)
  notify: 0xff02, // câmera → app: 3 bytes (0x02, assunto, valor)
}
export const SONY_COMPANY_ID = 0x012d // Sony nos dados de fabricante do anúncio

// Botões do controle remoto: cada um tem "apertar" e "soltar"
export const SONY_BUTTON = {
  focusUp: 0x0106, focusDown: 0x0107, shutterUp: 0x0108, shutterDown: 0x0109,
  recordUp: 0x010e, recordDown: 0x010f,
}
export const sonyCommand = (code) => new Uint8Array([code >> 8, code & 0xff])

/**
 * Aviso da câmera (3 bytes: 0x02, assunto, valor). Assuntos conhecidos:
 * 0x3F foco (0x20 = em foco), 0xA0 obturador (0x20 = ativo), 0xD5 gravação (0x20 = gravando, 0x00 = parada).
 * Retorna { subject, value, recording? } ou null.
 */
export function parseSonyNotify(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (b.length < 3 || b[0] !== 0x02) return null
  const out = { subject: b[1], value: b[2] }
  if (b[1] === 0xd5) out.recording = b[2] === 0x20
  if (b[1] === 0x3f) out.focus = b[2] === 0x20
  if (b[1] === 0xa0) out.shutter = b[2] === 0x20
  return out
}

export const SONY_SUBJECT = { 0x3f: 'foco', 0xa0: 'obturador', 0xd5: 'gravação' }

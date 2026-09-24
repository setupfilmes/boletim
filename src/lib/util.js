export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  return fmtUuid(b)
}

function fmtUuid(bytes) {
  const h = [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

// UUID determinístico (mesmo texto => mesmo id). Evita itens de kit duplicados entre aparelhos.
// FNV-1a de 128 bits simplificado (4 x 32 bits) — não precisa ser criptográfico.
export function stableUuid(str) {
  const out = new Uint8Array(16)
  for (let k = 0; k < 4; k++) {
    let h = 0x811c9dc5 ^ (k * 0x9e3779b1)
    const s = `${k}|${str}`
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    out[k * 4] = h >>> 24
    out[k * 4 + 1] = (h >>> 16) & 255
    out[k * 4 + 2] = (h >>> 8) & 255
    out[k * 4 + 3] = h & 255
  }
  out[6] = (out[6] & 0x0f) | 0x50
  out[8] = (out[8] & 0x3f) | 0x80
  return fmtUuid(out)
}

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
export const natCompare = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''))

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function nowISO() {
  return new Date().toISOString()
}

// Próximo código de plano: "1" -> "2", "A" -> "B", "3B" -> "3C". Pula I e O (padrão de claquete: confundem com 1 e 0)
const SKIP_LETTERS = /[IO]/i
export function nextCode(codes) {
  if (!codes.length) return '1'
  const last = [...codes].sort(natCompare).at(-1)
  const m = String(last).match(/^(.*?)(\d+)$/)
  if (m) return `${m[1]}${Number(m[2]) + 1}`
  const l = String(last).match(/^(.*?)([A-Y])$/i)
  if (l) {
    let c = l[2].charCodeAt(0) + 1
    while (SKIP_LETTERS.test(String.fromCharCode(c))) c++
    return `${l[1]}${String.fromCharCode(c)}`
  }
  return `${last}1`
}

export function joinFilters(f) {
  return Array.isArray(f) ? f.join(' + ') : f || ''
}

export function vibrate(ms = 12) {
  try { navigator.vibrate?.(ms) } catch { /* ignore */ }
}

export const plural = (n, word, pl = `${word}s`) => `${n} ${n === 1 ? word : pl}`

// Incrementa o último número do texto mantendo os zeros: "A001C003" -> "A001C004", "A009" -> "A010"
export function incrCode(s) {
  const m = String(s || '').match(/^(.*?)(\d+)(\D*)$/)
  if (!m) return s
  return `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}${m[3]}`
}

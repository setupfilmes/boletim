// Campos do take além dos de câmera: som, marcações de claquete e campos extras configuráveis por projeto.

// Som do take (padrão da indústria: todo boletim diz se teve som)
export const SOUND = { sync: 'SYNC', mos: 'MOS' }

// Marcações de claquete (takes.marks = ['pu', 'ser', …]). Tela e PDF: sigla internacional + nome ("PU Pickup");
// CSV/DIT/ALE: só a sigla (Pickup, Series, Tail slate, After False Start, No Slate).
export const MARKS = [
  { key: 'pu', code: 'PU', label: 'Pickup', title: 'retomada a partir de um trecho do take (pickup)' },
  { key: 'ser', code: 'SER', label: 'Série', title: 'vários takes seguidos sem nova claquete (series)' },
  { key: 'tail', code: 'TAIL', label: 'Claquete no fim', title: 'claquete batida no final do take (tail slate)' },
  { key: 'afs', code: 'AFS', label: 'Recomeço', title: 'recomeçou sem cortar a câmera (after false start)' },
  { key: 'ns', code: 'NS', label: 'Sem claquete', title: 'take sem claquete (no slate)' },
]
export const markCode = (k) => MARKS.find((m) => m.key === k)?.code || k
export const markLabel = (k) => MARKS.find((m) => m.key === k)?.label || k
export const markFull = (k) => { const m = MARKS.find((x) => x.key === k); return m ? `${m.code} ${m.label}` : k }

// Campos extras ligados por projeto (project.kit.fields = ['tc_in', 'lut', …]); valores em takes.extra = { lut: 'K1S1' }.
// sticky: vem preenchido do take anterior da mesma câmera (como lente e T-stop).
// perCamera: normalmente fixo por câmera no dia — no PDF vai para o cabeçalho, não para cada linha.
// input: 'pick' (gaveta com presets + valores já usados), 'multi' (vários), 'tc' (timecode), 'text'.
export const EXTRA_FIELDS = [
  { key: 'tc_in', label: 'TC in', group: 'Timecode', input: 'tc' },
  { key: 'tc_out', label: 'TC out', group: 'Timecode', input: 'tc' },
  // ND: dá para marcar mais de um (ex.: interno 1.2 + 0.6) — valores antigos de um ND só (texto) continuam valendo
  { key: 'nd_int', label: 'ND interno', short: 'ND int', group: 'Câmera', input: 'multi', sticky: true,
    presets: ['Clear', '0.3', '0.6', '0.9', '1.2', '1.5', '1.8', '2.1', '2.4'] },
  { key: 'lut', label: 'LUT', group: 'Câmera', input: 'pick', sticky: true, perCamera: true,
    presets: ['Rec709', 'K1S1', 'LogC4 to Rec709', 'S-Log3 to 709', 'Show LUT'] },
  { key: 'codec', label: 'Codec', group: 'Câmera', input: 'pick', sticky: true, perCamera: true,
    presets: ['ARRIRAW', 'ProRes 4444 XQ', 'ProRes 4444', 'ProRes 422 HQ', 'X-OCN ST', 'BRAW 5:1', 'XAVC-I', 'REDCODE HQ'] },
  { key: 'resolution', label: 'Resolução', short: 'Res', group: 'Câmera', input: 'pick', sticky: true, perCamera: true,
    presets: ['4.6K 3:2', '4.5K LF', '4K UHD', '3.8K 16:9', '2.8K', '6K', '8K', '1080p'] },
  { key: 'unit', label: 'Unidade', group: 'Câmera', input: 'pick', sticky: true, perCamera: true,
    presets: ['1ª unidade', '2ª unidade', 'Splinter'] },
  { key: 'lens_height', label: 'Altura da lente', short: 'Altura', group: 'VFX', input: 'pick', sticky: true, numeric: true,
    presets: ['0,5m', '0,8m', '1m', '1,2m', '1,4m', '1,6m', '1,8m', '2m'] },
  { key: 'tilt', label: 'Tilt', group: 'VFX', input: 'pick', sticky: true, numeric: true,
    presets: ['0°', '+5°', '+10°', '+15°', '-5°', '-10°', '-15°', '-30°', '-90°'] },
  { key: 'distance', label: 'Distância ao assunto', short: 'Dist', group: 'VFX', input: 'pick', numeric: true,
    presets: ['1m', '1,5m', '2m', '3m', '4m', '5m', '8m', '10m'] },
  { key: 'vfx', label: 'VFX', group: 'VFX', input: 'multi',
    presets: ['Green screen', 'Blue screen', 'Clean plate', 'Tracking', 'HDRI', 'Chrome ball', 'Color chart', 'Witness cam',
      'Rig removal', 'Set extension', 'BG plate', 'Paint out'] },
]
export const EXTRA_GROUPS = ['Timecode', 'Câmera', 'VFX']
export const extraField = (k) => EXTRA_FIELDS.find((f) => f.key === k)

// Campos ligados no projeto, na ordem do catálogo
export const projectFields = (project) => {
  const on = project?.kit?.fields
  return Array.isArray(on) ? EXTRA_FIELDS.filter((f) => on.includes(f.key)) : []
}

export const extraText = (field, v) => (Array.isArray(v) ? v.join(' + ') : v ?? '')
export const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length)

// Timecode digitado só com números: "1020304" -> "01:02:03:04"
export function formatTc(raw) {
  const d = String(raw || '').replace(/\D/g, '').slice(-8)
  if (!d) return ''
  const p = d.padStart(8, '0')
  return `${p.slice(0, 2)}:${p.slice(2, 4)}:${p.slice(4, 6)}:${p.slice(6, 8)}`
}

// ---------- Resultado do take (continuidade, padrão internacional) ----------
// Três status: GOOD / NG / CHECK + estrelas (takes.rating 1–5) independentes do status.
// Em GOOD: 5 = VALEU (o take escolhido), 1–4 = RESERVA. No Resolve: GOOD = Good Take, NG = Rejected, estrelas = Rating.
// GOOD sem estrelas conta como 5 (takes antigos; o antigo "circulado" também era o escolhido).
export const ratingOf = (t) => t?.rating ?? (t?.status === 'good' ? 5 : null)

// 'valeu' | 'reserva' | 'ng' | 'check' | null
export function resultOf(t) {
  if (!t?.status) return null
  if (t.status === 'good') return ratingOf(t) >= 5 ? 'valeu' : 'reserva'
  return t.status
}
export const RESULT_LABEL = { valeu: 'VALEU', reserva: 'RESERVA', ng: 'NÃO VALEU', check: 'CHECAR' }
export const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '')

// Clipes que não são take: consomem número de clipe, mas não número de take (takes.clip_type)
export const CLIP_TYPES = [
  { key: 'falso_rec', label: 'Falso REC', code: 'FALSO REC' },
  { key: 'ensaio', label: 'Ensaio', code: 'ENSAIO' },
  { key: 'wild', label: 'Wild (imagem solta)', code: 'WILD' },
  { key: 'insert', label: 'Insert', code: 'INSERT' },
  { key: 'som', label: 'Cobertura de som', code: 'SOM' },
]
export const clipTypeLabel = (k) => CLIP_TYPES.find((c) => c.key === k)?.label || k

// Cobertura de som: o técnico de som grava depois da cena (room tone, falas soltas, ambiente) — registro só de som,
// sem clipe de câmera (clip_type 'som'). O que foi gravado em extra.som (lista), arquivo/take do gravador em
// extra.som_arquivo, personagens das falas em characters, observação em notes.
export const SOM_TIPOS = ['Room tone', 'Falas (wild lines)', 'Ambiente', 'Efeitos / foley']
// só som = não tem clipe de câmera (fica fora do boletim de câmera, DIT, ALE e CSV do Resolve)
export const soundOnly = (t) => t?.clip_type === 'som' && !t.clip
// "Room tone + Falas (wild lines): Ana · arquivo 31-WT01"
export function somResumo(t) {
  const tipos = Array.isArray(t?.extra?.som) ? t.extra.som : []
  const chars = Array.isArray(t?.characters) ? t.characters : []
  return [tipos.join(' + ') + (chars.length ? `${tipos.length ? ': ' : ''}${chars.join(', ')}` : ''),
    t?.extra?.som_arquivo && `arquivo ${t.extra.som_arquivo}`].filter(Boolean).join(' · ')
}

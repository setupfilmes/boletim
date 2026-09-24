// Campos do take além dos de câmera: som, marcações de claquete e campos extras configuráveis por projeto.

// Som do take (padrão da indústria: todo boletim diz se teve som)
export const SOUND = { sync: 'SYNC', mos: 'MOS' }

// Marcações de claquete (takes.marks = ['pu', 'ser', …])
export const MARKS = [
  { key: 'pu', label: 'P/U', title: 'Pickup — retomada a partir de um trecho' },
  { key: 'ser', label: 'SER', title: 'Série — vários takes sem nova claquete' },
  { key: 'tail', label: 'TAIL', title: 'Claquete no final (tail slate)' },
  { key: 'afs', label: 'AFS', title: 'After false start — recomeçou sem cortar' },
  { key: 'ns', label: 'S/ CLAQ', title: 'Sem claquete' },
]
export const markLabel = (k) => MARKS.find((m) => m.key === k)?.label || k

// Campos extras ligados por projeto (project.kit.fields = ['tc_in', 'lut', …]); valores em takes.extra = { lut: 'K1S1' }.
// sticky: vem preenchido do take anterior da mesma câmera (como lente e T-stop).
// perCamera: normalmente fixo por câmera no dia — no PDF vai para o cabeçalho, não para cada linha.
// input: 'pick' (gaveta com presets + valores já usados), 'multi' (vários), 'tc' (timecode), 'text'.
export const EXTRA_FIELDS = [
  { key: 'tc_in', label: 'TC in', group: 'Timecode', input: 'tc' },
  { key: 'tc_out', label: 'TC out', group: 'Timecode', input: 'tc' },
  { key: 'nd_int', label: 'ND interno', short: 'ND int', group: 'Câmera', input: 'pick', sticky: true,
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

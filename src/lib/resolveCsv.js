// Importar um projeto a partir do CSV de metadados do DaVinci Resolve (Media Pool → Export Metadata).
// Lê no próprio aparelho (nada sobe antes de você confirmar) e monta Diárias → Cenas → Planos → Takes.
// O resultado de cada clipe vem, nesta ordem: Tag (1 = Good Take, 2 = Rejected) + Rating, depois Clip Color
// (Green valeu, Yellow reserva, Orange/Red não valeu, Purple checar) e por fim a 1ª palavra das Keywords.
import { natCompare } from './util.js'

// ---------- leitura do arquivo ----------
// O Resolve exporta em UTF-16 (com BOM); aceita também UTF-8
export function decodeCsv(buf) {
  const b = new Uint8Array(buf)
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2))
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2))
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3))
  // sem BOM: UTF-16 tem um zero a cada 2 bytes no texto em ASCII
  if (b.length > 3 && b[1] === 0 && b[3] === 0) return new TextDecoder('utf-16le').decode(b)
  return new TextDecoder('utf-8').decode(b)
}

// CSV tolerante: o Resolve não escapa aspas dentro de um campo — ex.: "Boletim diz "claquete errada, correto 9.3/1"; …"
// ou um campo sem aspas que começa com aspas ("Take de plano detalhe" citado no …). Cada linha é lida testando as
// interpretações possíveis dessas aspas e fica a que dá exatamente o número de colunas do cabeçalho com o menor
// número de aspas "fora do lugar" (aspas literais dentro de um campo).
export function parseCsv(text) {
  const rows = []
  let pos = 0
  const CR = '\r', LF = '\n'
  const nl = (c) => c === LF || c === CR || c === undefined
  const endOf = (i) => (text[i] === CR && text[i + 1] === LF ? i + 2 : i + 1)
  let ncols = null
  let memo = new Map()
  // melhor leitura do registro a partir do campo n que começa em `start`: { cost, list (encadeada), end }
  const field = (start, n) => {
    const key = start * 128 + n
    if (memo.has(key)) return memo.get(key)
    let best = null
    const consider = (val, cost, i) => {
      const r = after(i, n + 1)
      if (r && (!best || cost + r.cost < best.cost)) best = { cost: cost + r.cost, list: { val, next: r.list }, end: r.end }
    }
    if (text[start] === '"') {
      // fechamentos possíveis: aspas seguidas de vírgula ou de quebra de linha
      let j = start + 1, buf = '', lit = 0, seen = 0
      while (seen < 24 && j - start < 20000) {
        const k = text.indexOf('"', j)
        if (k < 0) break
        buf += text.slice(j, k)
        const c = text[k + 1]
        if (c === '"') { buf += '"'; j = k + 2; continue }
        if (c === ',' || nl(c)) { seen++; consider(buf, lit, k + 1) }
        buf += '"'; lit++; j = k + 1 // aspas no meio do texto
      }
    }
    let i = start
    while (text[i] !== ',' && !nl(text[i])) i++
    const raw = text.slice(start, i)
    consider(raw, (raw.match(/"/g) || []).length, i)
    memo.set(key, best)
    return best
  }
  // depois de um campo: vírgula = próximo campo; quebra de linha = fim do registro (só vale com o nº certo de colunas)
  const after = (i, n) => {
    if (text[i] === ',') return ncols && n >= ncols ? null : field(i + 1, n)
    if (ncols && n !== ncols) return null
    return { cost: 0, list: null, end: endOf(i) }
  }
  const toArray = (list) => { const out = []; for (let x = list; x; x = x.next) out.push(x.val); return out }
  while (pos < text.length) {
    if (text[pos] === CR || text[pos] === LF) { pos++; continue }
    memo = new Map()
    let r = field(pos, 0)
    if (!r) { // não deu para alinhar: lê a linha como estiver
      const save = ncols; ncols = null; memo = new Map(); r = field(pos, 0); ncols = save
    }
    const fields = toArray(r.list)
    if (!ncols) ncols = fields.length
    rows.push(fields)
    pos = r.end
  }
  return rows
}

// ---------- tradução dos campos ----------
const VIDEO = /\.(braw|r3d|ari|arx|mxf|mov|mp4|crm|dng)$/i
const COLOR_RESULT = { green: 'valeu', yellow: 'reserva', orange: 'ng', red: 'ng', purple: 'check' }
const KEYWORD_RESULT = { 'VALEU': 'valeu', 'RESERVA': 'reserva', 'NÃO VALEU': 'ng', 'NAO VALEU': 'ng', 'CHECAR': 'check', 'CHECK': 'check' }
const KEYWORD_TYPE = { 'FALSO REC': 'falso_rec', 'ENSAIO': 'ensaio', 'WILD': 'wild', 'INSERT': 'insert', 'SOM': 'som', 'COBERTURA DE SOM': 'som' }
export const RESERVA_STARS = 3 // reservas sem estrelas no Resolve entram com 3 (ajustável depois)

const unpad = (s) => String(s || '').trim().replace(/^0+(?=\d)/, '')
const firstKeyword = (k) => String(k || '').split(',')[0].trim().toUpperCase()
const tcTime = (tc) => (/^\d\d:\d\d:\d\d/.test(tc || '') ? tc.slice(0, 8) : null)
// "A001_09190403_C001" → "A001C001" (rolo + clipe, como no boletim)
export const shortClip = (clipNumber, fileName) => {
  const src = clipNumber || String(fileName || '').replace(/\.[^.]+$/, '')
  const m = src.match(/^([A-Z]\d{3})_.*_(C\d{3,4})/i)
  return m ? `${m[1]}${m[2]}`.toUpperCase() : src
}
const nd = (v) => {
  const s = String(v || '').trim()
  if (!s || s === '0') return null
  if (/^\d*\.\d+$|^\d+$/.test(s)) return `ND ${s.replace(/^0(?=\.)/, '')}`
  return s // "Pro-Mist 1/4" digitado no campo errado
}
const period = (v) => ({ day: 'DIA', night: 'NOITE', dawn: 'AMANHECER', dusk: 'ENTARDECER' }[String(v || '').toLowerCase()] || (v ? String(v).toUpperCase() : null))
const intExt = (v) => ({ interior: 'INT', exterior: 'EXT' }[String(v || '').toLowerCase()] || (v ? String(v).toUpperCase() : null))
const resolveDate = (v) => { const m = String(v || '').match(/^(\d{4})[:-](\d\d)[:-](\d\d)/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null }
const mostCommon = (list) => {
  const n = {}
  for (const v of list) if (v) n[v] = (n[v] || 0) + 1
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null
}

// Resultado: { status, rating, clipType, source, conflict }
export function resultOfClip(c) {
  const tag = String(c['Tag'] || '').trim()
  const rating = parseInt(c['Rating'], 10) || null
  const byColor = COLOR_RESULT[String(c['Clip Color'] || '').toLowerCase()] || null
  const kw = firstKeyword(c['Keywords'])
  const byKeyword = KEYWORD_RESULT[kw] || null
  const clipType = KEYWORD_TYPE[kw] || (/^E\d+$/i.test(c['Take'] || '') ? 'ensaio' : null)
  let res = null, source = null
  if (tag === '2') { res = 'ng'; source = 'Rejected' }
  else if (tag === '1') { res = rating && rating < 5 ? 'reserva' : byColor === 'reserva' ? 'reserva' : 'valeu'; source = 'Good Take' }
  else if (byColor) { res = byColor; source = 'cor' }
  else if (byKeyword) { res = byKeyword; source = 'Keywords' }
  const conflict = !!(byColor && byKeyword && byColor !== byKeyword)
  const status = res === 'valeu' || res === 'reserva' ? 'good' : res
  // estrelas valem para qualquer status; em GOOD sem Rating: valeu 5, reserva 3
  const stars = status !== 'good' ? rating : res === 'valeu' ? rating || 5 : rating && rating < 5 ? rating : RESERVA_STARS
  return { status, rating: stars, clipType, source, conflict, semRegistro: kw === 'SEM REGISTRO' }
}

// ---------- análise (prévia, sem gravar nada) ----------
export function analyzeResolveCsv(text) {
  const rows = parseCsv(text)
  const header = rows[0] || []
  if (!header.includes('File Name')) throw new Error('Este arquivo não parece um "Export Metadata" do Resolve (falta a coluna File Name).')
  const all = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
  const clips = all.filter((c) => VIDEO.test(c['File Name']))
  const warnings = []
  const takes = []
  const loose = [] // sem cena: vão para "AVULSOS"
  for (const c of clips) {
    const r = resultOfClip(c)
    const date = resolveDate(c['Date Recorded'])
    const scene = c['Scene']
    const take = {
      file_name: c['File Name'],
      clip: shortClip(c['Clip Number'], c['File Name']),
      roll: c['Roll Card #'] || null,
      camera: /^[A-Z]$/i.test(c['Camera #']) ? c['Camera #'].toUpperCase() : 'A',
      scene, shot: unpad(c['Shot']), takeRaw: c['Take'], take_number: parseInt(c['Take'], 10) || null,
      shoot_date: date, day: parseInt(c['Shoot Day'], 10) || null,
      tc_in: c['Start TC'] || null, tc_out: c['End TC'] || null, duration: c['Duration TC'] || null,
      lens: /^T\d/i.test(c['Focal Point (mm)']) ? null : c['Focal Point (mm)'] || null,
      t_stop: c['Camera Aperture'] || (/^T\d/i.test(c['Focal Point (mm)']) ? c['Focal Point (mm)'] : null),
      filters: [c['Filter'], nd(c['ND Filter'])].filter(Boolean),
      iso: /^\d+$/.test(c['ISO']) ? c['ISO'] : null,
      shutter: c['Shutter Speed'] || c['Shutter Angle'] || null,
      fps: c['Camera FPS'] || c['Shot Frame Rate'] || null,
      wb: /^\d+$/.test(c['White Point (Kelvin)']) ? `${c['White Point (Kelvin)']}K` : null,
      sound: /^MOS$/i.test(c['Audio Notes']) ? 'mos' : 'sync',
      guide: /GUIA/i.test(c['Audio Notes']),
      status: r.status, rating: r.rating, clip_type: r.clipType,
      notes: c['Description'] || null, comments: c['Comments'] || null,
      lut: c['LUT Used'] || null,
      location: c['Location'] || null, period: period(c['Day / Night']), int_ext: intExt(c['Environment']),
      raw: c,
    }
    if (r.semRegistro) take.comments = [take.comments, 'Sem registro na continuidade'].filter(Boolean).join(' · ')
    if (take.guide) take.comments = [take.comments, 'Som guia'].filter(Boolean).join(' · ')
    if (r.conflict) warnings.push({ kind: 'resultado', clip: take.clip, text: `cor "${c['Clip Color']}" e Keywords "${firstKeyword(c['Keywords'])}" discordam — usei ${r.source}` })
    if (!date) warnings.push({ kind: 'data', clip: take.clip, text: 'sem data de gravação' })
    if (take.clip_type || !scene || !take.take_number) loose.push(take)
    else takes.push(take)
  }
  // takes repetidos (mesma cena/plano/take/câmera)
  const seen = new Map()
  for (const t of takes) {
    const k = `${t.scene}|${t.shot}|${t.take_number}|${t.camera}`
    if (seen.has(k)) warnings.push({ kind: 'repetido', clip: t.clip, text: `${t.scene}/${t.shot}/${t.take_number} também está em ${seen.get(k).clip}` })
    else seen.set(k, t)
  }
  // clipes avulsos (falso REC, ensaio, sem claquete): cena "AVULSOS", um plano por tipo, na ordem do cartão
  const looseKind = (t) => (t.clip_type === 'falso_rec' ? 'FALSO REC' : t.clip_type === 'ensaio' ? 'ENSAIO' : t.clip_type ? t.clip_type.toUpperCase() : 'SEM CLAQUETE')
  const byKind = {}
  for (const t of loose.sort((a, b) => natCompare(a.clip, b.clip))) {
    const kind = looseKind(t)
    const list = (byKind[kind] ||= [])
    const origin = t.scene ? `Cena ${t.scene}, plano ${t.shot || '?'}, ${t.takeRaw || 'sem take'}` : null
    list.push({ ...t, notes: [origin, t.notes].filter(Boolean).join(' · ') || null, scene: 'AVULSOS', shot: kind, take_number: list.length + 1 })
  }
  const allTakes = [...takes, ...Object.values(byKind).flat()]

  const pick = (k) => mostCommon(clips.map((c) => c[k]))
  const cameraBody = pick('Camera Type')
  const project = {
    title: titleCase(pick('Production Name') || 'Projeto importado'),
    director: pick('Director'), dop: pick('DOP') && titleCase(pick('DOP')), first_ac: pick('Camera Assistant') || pick('Focus Puller'),
    logger: pick('Digital Technician'), camera_body: cameraBody,
    scriptSupervisor: pick('Script Supervisor'), operator: pick('Camera Operator') && titleCase(pick('Camera Operator')),
    ficha: {
      codec: [pick('Video Codec'), pick('Compression Ratio')].filter(Boolean).join(' ') || null,
      resolucao: pick('Resolution'), fps: pick('Camera FPS') || pick('Shot Frame Rate'), aspect: pick('Aspect Ratio Notes'),
      lut: pick('LUT Used'), lentes: pick('Lens Type'),
    },
    cameras: [...new Set(allTakes.map((t) => t.camera))].sort().map((id) => ({ id, body: cameraBody || '' })),
  }
  const ignored = all.length - clips.length
  const counts = {
    clips: clips.length, ignored,
    days: new Set(allTakes.map((t) => t.shoot_date).filter(Boolean)).size,
    scenes: new Set(takes.map((t) => t.scene)).size,
    shots: new Set(takes.map((t) => `${t.scene}|${t.shot}`)).size,
    takes: takes.length, loose: loose.length,
    valeu: allTakes.filter((t) => t.status === 'good' && t.rating === 5).length,
    reserva: allTakes.filter((t) => t.status === 'good' && t.rating < 5).length,
    ng: allTakes.filter((t) => t.status === 'ng').length,
    check: allTakes.filter((t) => t.status === 'check').length,
    semResultado: allTakes.filter((t) => !t.status).length,
    rolls: new Set(allTakes.map((t) => t.roll).filter(Boolean)).size,
  }
  // diárias encontradas; clipes sem "Shoot Day" (ex.: teste de câmera antes do filme) começam desmarcados
  const groups = {}
  for (const t of allTakes) {
    const k = t.shoot_date || 'sem-data'
    const g = (groups[k] ||= { key: k, date: t.shoot_date, day: null, count: 0, folders: new Set() })
    g.count++
    if (t.day && !g.day) g.day = t.day
    const dir = String(t.raw['Clip Directory'] || '').split(/[\\/]/).filter(Boolean)
    if (dir.length) g.folders.add(dir.slice(-2).join('/'))
  }
  const dayGroups = Object.values(groups).map((g) => ({ ...g, folders: [...g.folders].slice(0, 3), include: !!g.day && !!g.date }))
    .sort((a, b) => String(a.date || '9').localeCompare(String(b.date || '9')))
  return { project, takes: allTakes, warnings, counts, dayGroups, looseKinds: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length])) }
}

// "DESCE DO SALTO, SO!" → "Desce do Salto, So!" (só se vier tudo em maiúsculas)
function titleCase(s) {
  if (!s || s !== s.toUpperCase()) return s
  const small = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a'])
  return s.toLowerCase().replace(/\S+/g, (w, i) => (i > 0 && small.has(w) ? w : w[0].toUpperCase() + w.slice(1)))
}

// usado também na gravação
export { tcTime }

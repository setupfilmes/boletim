// Relatórios gerados 100% no aparelho (funciona sem internet)
import { getDb } from './db'
import { natCompare, fmtDate, fmtTime, joinFilters, plural } from './util'
import { cameraOrder, projectCameras, takeKey, shotLabel } from './cameras'
import { EXTRA_FIELDS, extraField, extraText, isEmpty, markCode, MARKS, SOUND } from './fields'
import { photoDataUrl } from './photos'

const STATUS_TXT = { good: 'GOOD', ng: 'NG', check: 'CHECK' }
const STATUS_RGB = { good: [34, 197, 94], ng: [239, 68, 68], check: [250, 204, 21] }

export async function reportData(projectId, date = null) {
  const db = getDb()
  const project = await db.projects.get(projectId)
  const scenes = Object.fromEntries((await db.scenes.where('project_id').equals(projectId).toArray()).map((s) => [s.id, s]))
  const shots = Object.fromEntries((await db.shots.where('project_id').equals(projectId).toArray()).map((s) => [s.id, s]))
  let takes = (await db.takes.where('project_id').equals(projectId).toArray())
    .filter((t) => !t.deleted && scenes[t.scene_id] && !scenes[t.scene_id].deleted && shots[t.shot_id] && !shots[t.shot_id].deleted)
  if (date) takes = takes.filter((t) => t.shoot_date === date)
  const camCmp = cameraOrder(project)
  const key = (t) => takeKey(t, shots) // planos vinculados (link_id) = mesma claquete
  const label = (shotId) => shotLabel(scenes[shots[shotId].scene_id], shots[shotId])
  // Planos vinculados ficam juntos no relatório, na posição do primeiro plano do grupo (ex.: 12A e 12B sob 12A)
  const leadCode = {}
  for (const sh of Object.values(shots)) {
    if (sh.deleted) continue
    const k = sh.link_id || sh.id
    if (leadCode[k] == null || natCompare(sh.code, leadCode[k]) < 0) leadCode[k] = sh.code
  }
  const lead = (t) => leadCode[shots[t.shot_id].link_id || t.shot_id] ?? shots[t.shot_id].code
  takes.sort((a, b) =>
    (date ? 0 : String(a.shoot_date).localeCompare(String(b.shoot_date)))
    || natCompare(scenes[a.scene_id].number, scenes[b.scene_id].number)
    || natCompare(lead(a), lead(b))
    || a.take_number - b.take_number
    || natCompare(shots[a.shot_id].code, shots[b.shot_id].code)
    || camCmp(a.camera, b.camera))
  // Multicâmera: câmeras que gravaram o mesmo take (mesma claquete, no mesmo plano ou em planos vinculados)
  const byTake = new Map()
  for (const t of takes) {
    if (!byTake.has(key(t))) byTake.set(key(t), [])
    byTake.get(key(t)).push(t)
  }
  const multicamText = (list) => {
    if (list.length < 2) return ''
    const manyShots = new Set(list.map((t) => t.shot_id)).size > 1
    return list.map((t) => (manyShots ? `${t.camera || '?'}(${label(t.shot_id)})` : t.camera || '?')).join('+')
  }
  const photos = (await db.take_photos.where('project_id').equals(projectId).toArray()).filter((p) => !p.deleted)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const photosByTake = {}
  for (const ph of photos) (photosByTake[ph.take_id] ||= []).push(ph)
  let group = -1
  let prevKey = null
  const rows = takes.map((t) => ({
    id: t.id,
    photos: photosByTake[t.id] || [],
    group: key(t) === prevKey ? group : (prevKey = key(t), ++group),
    multicam: multicamText(byTake.get(key(t))),
    date: fmtDate(t.shoot_date),
    scene: scenes[t.scene_id].number,
    shot: shots[t.shot_id].code,
    shotType: shots[t.shot_id].shot_type || '',
    take: t.take_number,
    camera: t.camera || '',
    roll: t.roll || '',
    clip: t.clip || '',
    lens: t.lens || '',
    tstop: t.t_stop || '',
    filters: joinFilters(t.filters),
    focus: t.focus || '',
    iso: t.iso || '',
    shutter: t.shutter || '',
    fps: t.fps || '',
    wb: t.wb || '',
    status: t.status || '',
    time: fmtTime(t.recorded_at),
    notes: t.notes || '',
    isoDate: t.shoot_date || '',
    slate: label(t.shot_id),
    sound: SOUND[t.sound] || '',
    circled: !!t.circled,
    marks: (t.marks || []).map(markCode).join(' '),
    extra: t.extra || {},
  }))
  // planos que rodaram com mais de uma câmera, na ordem do relatório: "1.1 (A+B)", "12A+12B (A+B)"
  const multiShots = []
  for (const list of byTake.values()) {
    if (list.length < 2) continue
    const name = [...new Set(list.map((t) => label(t.shot_id)))].join('+')
    let m = multiShots.find((x) => x.label === name)
    if (!m) multiShots.push((m = { label: name, cams: new Set() }))
    for (const t of list) m.cams.add(t.camera || '?')
  }
  for (const m of multiShots) m.combo = [...m.cams].sort(camCmp).join('+')
  // campos extras que aparecem no relatório: os ligados no projeto + os que têm valor (mesmo se desligados depois)
  const enabled = new Set(project.kit?.fields || [])
  const used = new Set(takes.flatMap((t) => Object.keys(t.extra || {})))
  const fields = EXTRA_FIELDS.filter((f) => enabled.has(f.key) || used.has(f.key))
  const summary = {
    takes: byTake.size,
    records: rows.length,
    multicamTakes: [...byTake.values()].filter((c) => c.length > 1).length,
    multiShots,
    good: rows.filter((r) => r.status === 'good').length,
    ng: rows.filter((r) => r.status === 'ng').length,
    check: rows.filter((r) => r.status === 'check').length,
    scenes: new Set(rows.map((r) => r.scene)).size,
    shots: new Set(takes.map((t) => t.shot_id)).size,
    rolls: [...new Set(rows.map((r) => r.roll).filter(Boolean))],
    circled: rows.filter((r) => r.circled).length,
    mos: rows.filter((r) => r.sound === 'MOS').length,
    photos: rows.reduce((n, r) => n + r.photos.length, 0),
  }
  return { project, rows, summary, date, fields }
}

// Fonte padrão do PDF só tem Latin-1: troca símbolos que não existem nela
// Colunas do PDF que podem quebrar linha; as outras ficam com a largura do conteúdo
const FLEX_COLS = new Set(['Filtros', 'Multicam', 'Extras', 'Notas pós / VFX'])

const pdfSafe = (s) => String(s ?? '').replace(/∞/g, 'INF').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/[^\x00-\xFF]/g, '')

export async function buildPdf(projectId, date = null) {
  // jsPDF só é carregado aqui (deixa a abertura do app mais leve). O arquivo separado
  // entra no precache do service worker, então funciona offline do mesmo jeito.
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const { project, rows, summary, fields } = await reportData(projectId, date)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 10

  // Cabeçalho
  doc.setFillColor(10, 10, 11)
  doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(245, 179, 1)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('BOLETIM DE CÂMERA  ·  CAMERA REPORT', M, 8)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.text(pdfSafe(project.title), M, 17)
  doc.setFontSize(11)
  doc.text(pdfSafe(date ? `DIÁRIA ${fmtDate(date)}` : 'TODAS AS DIÁRIAS'), W - M, 10, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const cams = projectCameras(project)
  const bodies = cams.length >= 2 ? cams.filter((c) => c.body).map((c) => `${c.id}: ${c.body}`).join('  ') : project.camera_body
  doc.text(pdfSafe([project.production_type, project.company, bodies].filter(Boolean).join('  ·  ')), W - M, 17, { align: 'right' })

  // Equipe e resumo
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(8.5)
  const crew = [['Direção', project.director], ['Dir. Fotografia', project.dop], ['1º AC', project.first_ac],
    ['2º AC', project.second_ac], ['DIT / Logger', project.logger]].filter(([, v]) => v)
  let x = M
  for (const [k, v] of crew) {
    doc.setFont('helvetica', 'bold'); doc.text(pdfSafe(`${k}:`), x, 30)
    const kw = doc.getTextWidth(pdfSafe(`${k}: `))
    doc.setFont('helvetica', 'normal'); doc.text(pdfSafe(v), x + kw, 30)
    x += kw + doc.getTextWidth(pdfSafe(v)) + 8
  }
  doc.setFont('helvetica', 'bold')
  const multi = summary.multicamTakes > 0
  const sum = `${plural(summary.takes, 'take')}${summary.records !== summary.takes ? ` (${summary.records} registros de câmera)` : ''}`
    + `  ·  ${plural(summary.scenes, 'cena')}  ·  ${plural(summary.shots, 'plano')}  ·  GOOD ${summary.good}  ·  NG ${summary.ng}  ·  CHECK ${summary.check}`
    + (summary.circled ? `  ·  Circulados ${summary.circled}` : '') + (summary.mos ? `  ·  MOS ${summary.mos}` : '')
    + (summary.photos ? `  ·  ${plural(summary.photos, 'foto')}` : '')
    + (summary.rolls.length ? `  ·  Cartões: ${summary.rolls.join(', ')}` : '')
  doc.setFontSize(8)
  let y = 35.5
  for (const line of doc.splitTextToSize(pdfSafe(sum), W - 2 * M)) { doc.text(line, M, y); y += 3.6 }
  doc.setFont('helvetica', 'normal')
  const info = (text) => {
    const lines = doc.splitTextToSize(pdfSafe(text), W - 2 * M)
    doc.text(lines, M, y + 1)
    y += lines.length * 3.6
  }
  if (multi) {
    info(`Multicâmera (mesma claquete gravada por mais de uma câmera) — ${plural(summary.multicamTakes, 'take')}, `
      + `planos: ${summary.multiShots.map((m) => `${m.label} (${m.combo})`).join(', ')}`)
  }
  // Campos fixos por câmera (LUT, codec, resolução, unidade) vão para o cabeçalho, não para cada linha
  const camFields = fields.filter((f) => f.perCamera)
  if (camFields.length) {
    const byCam = {}
    for (const r of rows) {
      const o = (byCam[r.camera || '-'] ||= {})
      for (const f of camFields) if (!isEmpty(r.extra[f.key])) (o[f.key] ||= new Set()).add(extraText(f, r.extra[f.key]))
    }
    const parts = Object.entries(byCam).map(([cam, o]) => {
      const vals = camFields.filter((f) => o[f.key]).map((f) => `${f.label}: ${[...o[f.key]].join(' / ')}`)
      return vals.length ? `${cam !== '-' ? `Câm. ${cam} — ` : ''}${vals.join(', ')}` : null
    }).filter(Boolean)
    if (parts.length) info(parts.join('   |   '))
  }
  const takeFields = fields.filter((f) => !f.perCamera)
  const extrasOf = (r) => takeFields.filter((f) => !isEmpty(r.extra[f.key])).map((f) =>
    (f.key === 'vfx' ? `VFX: ${extraText(f, r.extra.vfx)}` : `${f.short || f.label} ${extraText(f, r.extra[f.key])}`)).join(' · ')
  const hasExtras = rows.some((r) => extrasOf(r))
  const legend = [summary.circled && 'O em volta do take = circle take (escolhido)', summary.mos && 'MOS = sem som',
    ...MARKS.filter((m) => rows.some((r) => r.marks.split(' ').includes(m.code))).map((m) => `${m.code} = ${m.title}`)]
    .filter(Boolean)
  if (legend.length) { doc.setTextColor(90, 90, 90); info(`Legenda: ${legend.join('  ·  ')}`); doc.setTextColor(0, 0, 0) }
  const startY = y + 2.5

  const head = [[...(date ? [] : ['Data']), 'Cena', 'Plano', 'Take', 'Cam', ...(multi ? ['Multicam'] : []), 'Cartão', 'Clipe', 'Lente', 'T-Stop', 'Filtros',
    'Foco', 'ISO', 'Shutter', 'FPS', 'WB', 'Som', 'Status', 'Hora', ...(hasExtras ? ['Extras'] : []), 'Notas pós / VFX']]
  const body = rows.map((r) => [...(date ? [] : [r.date]), r.scene, r.shot, `${r.take}${r.marks ? `  ${r.marks}` : ''}`, r.camera,
    ...(multi ? [r.multicam] : []), r.roll, r.clip, r.lens, r.tstop, r.filters, r.focus, r.iso, r.shutter, r.fps, r.wb, r.sound,
    STATUS_TXT[r.status] || '', r.time, ...(hasExtras ? [extrasOf(r)] : []),
    [r.notes, r.photos.length && `(${plural(r.photos.length, 'foto')})`].filter(Boolean).join(' ')].map(pdfSafe))
  const col = (name) => head[0].indexOf(name)
  const statusCol = col('Status')
  const multiCol = col('Multicam')
  const soundCol = col('Som')
  const takeCol = col('Take')
  const extrasCol = col('Extras')
  const notesCol = head[0].length - 1

  autoTable(doc, {
    head: head.map((h) => h.map(pdfSafe)),
    body,
    startY,
    margin: { left: M, right: M, bottom: 12 },
    rowPageBreak: 'avoid', // linha inteira na mesma página (e o círculo do take não se perde)
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.4, lineColor: [190, 190, 190], lineWidth: 0.15, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [30, 30, 33], textColor: [245, 179, 1], fontStyle: 'bold', fontSize: 7 },
    // colunas curtas nunca quebram ("21/09/2026", "CHECK", "A001C003"); só as de texto livre se ajustam à largura
    columnStyles: Object.fromEntries(head[0].map((h, i) => [i, FLEX_COLS.has(h) ? {} : { cellWidth: 'wrap' }])),
    didParseCell: (d) => {
      if (d.section !== 'body') return
      const r = rows[d.row.index]
      // sombreado por take (as câmeras do mesmo take ficam juntas)
      if (r.group % 2) d.cell.styles.fillColor = [244, 244, 244]
      if (d.column.index === multiCol && r.multicam) {
        d.cell.styles.fillColor = [255, 236, 179]
        d.cell.styles.fontStyle = 'bold'
        d.cell.styles.halign = 'center'
      }
      if (d.column.index === statusCol && r.status) {
        d.cell.styles.fillColor = STATUS_RGB[r.status]
        d.cell.styles.textColor = r.status === 'ng' ? [255, 255, 255] : [0, 0, 0]
        d.cell.styles.fontStyle = 'bold'
        d.cell.styles.halign = 'center'
      }
      if (d.column.index === soundCol) {
        d.cell.styles.halign = 'center'
        if (r.sound === 'MOS') { d.cell.styles.fillColor = [250, 204, 21]; d.cell.styles.fontStyle = 'bold' }
        else d.cell.styles.textColor = [150, 150, 150]
      }
      if (d.column.index <= (date ? 2 : 3) + (multi ? 1 : 0)) d.cell.styles.fontStyle = 'bold'
    },
    // circle take: círculo em volta do número do take, como no boletim de papel
    didDrawCell: (d) => {
      const r = rows[d.row.index]
      if (d.section !== 'body' || d.column.index !== takeCol || !r?.circled) return
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
      const w = doc.getTextWidth(String(r.take))
      doc.setDrawColor(200, 30, 30); doc.setLineWidth(0.35)
      doc.ellipse(d.cell.x + d.cell.padding('left') + w / 2, d.cell.y + d.cell.height / 2, w / 2 + 1.3, 2.3, 'S')
    },
  })

  await addPhotoPages(doc, rows, pdfSafe)

  const pages = doc.getNumberOfPages()
  const stamp = new Date()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120)
    const h = doc.internal.pageSize.getHeight()
    doc.text(pdfSafe(`Gerado em ${fmtDate(stamp.toISOString())} ${fmtTime(stamp)} — Boletim de Câmera`), M, h - 5)
    doc.text(`${i} / ${pages}`, W - M, h - 5, { align: 'right' })
  }
  const blob = doc.output('blob')
  return { blob, filename: fileName(project.title, date, 'pdf') }
}

// Páginas finais com as fotos de referência (12 por página), na ordem do relatório
async function addPhotoPages(doc, rows, safe) {
  const items = rows.flatMap((r) => r.photos.map((p) => ({ r, p })))
  if (!items.length) return
  const W = doc.internal.pageSize.getWidth()
  const M = 10
  const COLS = 4
  const GAP = 6
  const cw = (W - 2 * M - GAP * (COLS - 1)) / COLS
  const ih = cw * 0.68
  const ch = ih + 9
  let missing = 0
  let i = 0
  const newPage = () => {
    doc.addPage()
    doc.setFillColor(10, 10, 11)
    doc.rect(0, 0, W, 14, 'F')
    doc.setTextColor(245, 179, 1); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text(safe('FOTOS DE REFERÊNCIA'), M, 9)
  }
  for (const { r, p } of items) {
    const data = await photoDataUrl(p)
    if (!data) { missing++; continue }
    const slot = i % 12
    if (slot === 0) newPage()
    const x = M + (slot % COLS) * (cw + GAP)
    const y = 20 + Math.floor(slot / COLS) * (ch + 4)
    // encaixa a foto mantendo a proporção
    const ratio = p.width && p.height ? p.width / p.height : 4 / 3
    let w = cw
    let h = cw / ratio
    if (h > ih) { h = ih; w = ih * ratio }
    doc.setFillColor(240, 240, 240); doc.rect(x, y, cw, ih, 'F')
    doc.addImage(data, 'JPEG', x + (cw - w) / 2, y + (ih - h) / 2, w, h)
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
    doc.text(safe(`${r.slate}  ·  Take ${r.take}${r.camera ? `  ·  Cam ${r.camera}` : ''}`), x, y + ih + 4)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90, 90, 90)
    doc.text(safe([r.date, r.time, STATUS_TXT[r.status], r.circled && 'circulado'].filter(Boolean).join('  ·  ')), x, y + ih + 7.5)
    i++
  }
  if (missing) {
    if (!i) newPage()
    doc.setTextColor(200, 30, 30); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(safe(`${plural(missing, 'foto')} não ${missing === 1 ? 'está' : 'estão'} neste aparelho (sem internet) e ${missing === 1 ? 'ficou' : 'ficaram'} de fora.`), W - M, 9, { align: 'right' })
  }
}

export async function buildCsv(projectId, date = null) {
  const { project, rows, fields } = await reportData(projectId, date)
  const cols = [['date', 'Data'], ['scene', 'Cena'], ['shot', 'Plano'], ['shotType', 'Enquadramento'], ['take', 'Take'],
    ['camera', 'Câmera'], ['multicam', 'Multicam'], ['roll', 'Cartão'], ['clip', 'Clipe'], ['lens', 'Lente'], ['tstop', 'T-Stop'], ['filters', 'Filtros'],
    ['focus', 'Foco'], ['iso', 'ISO'], ['shutter', 'Shutter'], ['fps', 'FPS'], ['wb', 'WB'], ['sound', 'Som'], ['circled', 'Circle'],
    ['marks', 'Marcações'], ['status', 'Status'], ['time', 'Hora'], ...fields.map((f) => [`x:${f.key}`, f.label]), ['notes', 'Notas pós/VFX'],
    ['photoCount', 'Fotos']]
  const esc = csvEscape(';')
  const val = (r, k) => (k === 'status' ? STATUS_TXT[r.status] || '' : k === 'circled' ? (r.circled ? 'Sim' : '')
    : k === 'photoCount' ? r.photos.length || ''
    : k.startsWith('x:') ? extraText(extraField(k.slice(2)), r.extra[k.slice(2)]) : r[k])
  const lines = [cols.map((c) => c[1]).join(';')]
  for (const r of rows) lines.push(cols.map(([k]) => esc(val(r, k))).join(';'))
  // BOM + ";" = abre certinho no Excel em português
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  return { blob, filename: fileName(project.title, date, 'csv') }
}

const csvEscape = (sep) => (v) => {
  const s = String(v ?? '')
  return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ---------- Para o DIT / pós ----------
// Não há um formato público oficial de importação do Silverstack; os importadores da Pomfort (ZoeLog, Drylab…)
// casam pela coluna "filenameBase" (nome do clipe — dá para usar só os N primeiros caracteres, ex.: 8 para A001C003)
// ou por "timecode". Este CSV segue esse estilo, com cabeçalhos em inglês. Testar com o DIT antes de depender dele.
const DIT_COLS = [
  ['filenameBase', (r) => r.clip], ['camera', (r) => r.camera], ['reel', (r) => r.roll], ['scene', (r) => r.scene],
  ['shot', (r) => r.shot], ['slate', (r) => r.slate], ['take', (r) => r.take], ['circled', (r) => (r.circled ? 'YES' : '')],
  ['sound', (r) => r.sound], ['status', (r) => STATUS_TXT[r.status] || ''], ['marks', (r) => r.marks],
  ['lens', (r) => r.lens], ['tStop', (r) => r.tstop], ['focus', (r) => r.focus], ['filters', (r) => r.filters],
  ['iso', (r) => r.iso], ['shutter', (r) => r.shutter], ['fps', (r) => r.fps], ['whiteBalance', (r) => r.wb],
  ['timecode', (r) => r.extra.tc_in || ''], ['timecodeOut', (r) => r.extra.tc_out || ''],
  ['ndInternal', (r) => r.extra.nd_int || ''], ['lut', (r) => r.extra.lut || ''], ['codec', (r) => r.extra.codec || ''],
  ['resolution', (r) => r.extra.resolution || ''], ['unit', (r) => r.extra.unit || ''], ['lensHeight', (r) => r.extra.lens_height || ''],
  ['tilt', (r) => r.extra.tilt || ''], ['distance', (r) => r.extra.distance || ''], ['vfx', (r) => [].concat(r.extra.vfx || []).join(' + ')],
  ['multicam', (r) => r.multicam], ['shootingDate', (r) => r.isoDate], ['recordedAt', (r) => r.time], ['comment', (r) => r.notes],
]

export async function buildDitCsv(projectId, date = null) {
  const { project, rows } = await reportData(projectId, date)
  const esc = csvEscape(',')
  const lines = [DIT_COLS.map((c) => c[0]).join(','), ...rows.map((r) => DIT_COLS.map(([, f]) => esc(f(r))).join(','))]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  return { blob, filename: fileName(project.title, date, 'csv', 'DIT') }
}

// ALE (Avid Log Exchange): formato aberto, texto separado por TAB — importa no Avid, DaVinci Resolve e Silverstack.
// Name = nome do clipe; Start/End = TC (se preenchido); Tracks V (MOS) ou VA1A2 (com som).
export async function buildAle(projectId, date = null) {
  const { project, rows } = await reportData(projectId, date)
  const fpsCount = {}
  for (const r of rows) if (r.fps) fpsCount[r.fps] = (fpsCount[r.fps] || 0) + 1
  const fps = Object.entries(fpsCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '24'
  const clean = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim()
  const cols = [
    ['Name', (r) => r.clip], ['Tracks', (r) => (r.sound === 'MOS' ? 'V' : 'VA1A2')], ['Start', (r) => r.extra.tc_in || ''],
    ['End', (r) => r.extra.tc_out || ''], ['Tape', (r) => r.roll], ['Camroll', (r) => r.roll], ['Scene', (r) => r.slate],
    ['Take', (r) => r.take], ['Camera', (r) => r.camera], ['Circled', (r) => (r.circled ? 'YES' : '')], ['Sound', (r) => r.sound],
    ['Status', (r) => STATUS_TXT[r.status] || ''], ['Marks', (r) => r.marks], ['Lens', (r) => r.lens], ['T-Stop', (r) => r.tstop],
    ['Focus', (r) => r.focus], ['Filters', (r) => r.filters], ['ISO', (r) => r.iso], ['Shutter', (r) => r.shutter],
    ['FPS', (r) => r.fps], ['WB', (r) => r.wb], ['LUT', (r) => r.extra.lut || ''], ['Multicam', (r) => r.multicam],
    ['Shoot Date', (r) => r.isoDate], ['Comments', (r) => r.notes],
  ]
  const out = ['Heading', 'FIELD_DELIM\tTABS', 'VIDEO_FORMAT\t1080', 'AUDIO_FORMAT\t48khz', `FPS\t${fps}`, '',
    'Column', cols.map((c) => c[0]).join('\t'), '', 'Data', ...rows.map((r) => cols.map(([, f]) => clean(f(r))).join('\t'))]
  const blob = new Blob([out.join('\r\n') + '\r\n'], { type: 'text/plain;charset=utf-8' })
  return { blob, filename: fileName(project.title, date, 'ale') }
}

function fileName(title, date, ext, tag = '') {
  const slug = String(title || 'projeto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')
  return `Boletim_${slug}_${date ? date : 'completo'}${tag ? `_${tag}` : ''}.${ext}`
}

export function canShareFiles() {
  try {
    const f = new File(['x'], 'x.pdf', { type: 'application/pdf' })
    return !!navigator.canShare?.({ files: [f] })
  } catch { return false }
}

export async function shareFile({ blob, filename }) {
  const file = new File([blob], filename, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'
    }
  }
  downloadFile({ blob, filename })
  return 'downloaded'
}

export function downloadFile({ blob, filename }) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

// Backup completo em JSON (também offline)
export async function buildBackup() {
  const db = getDb()
  const data = {}
  for (const t of ['projects', 'scenes', 'shots', 'takes', 'take_photos', 'kit_items']) data[t] = (await db[t].toArray()).filter((r) => !r.deleted)
  const blob = new Blob([JSON.stringify({ app: 'boletim-de-camera', version: 2, exported_at: new Date().toISOString(), data }, null, 1)],
    { type: 'application/json' })
  const d = new Date()
  return { blob, filename: `Boletim_backup_${d.toISOString().slice(0, 10)}.json` }
}

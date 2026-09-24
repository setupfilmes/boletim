// Relatórios gerados 100% no aparelho (funciona sem internet)
import { getDb } from './db'
import { natCompare, fmtDate, fmtTime, joinFilters, plural } from './util'
import { cameraOrder, projectCameras, takeKey, shotLabel } from './cameras'

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
  let group = -1
  let prevKey = null
  const rows = takes.map((t) => ({
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
  }
  return { project, rows, summary, date }
}

// Fonte padrão do PDF só tem Latin-1: troca símbolos que não existem nela
const pdfSafe = (s) => String(s ?? '').replace(/∞/g, 'INF').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/[^\x00-\xFF]/g, '')

export async function buildPdf(projectId, date = null) {
  // jsPDF só é carregado aqui (deixa a abertura do app mais leve). O arquivo separado
  // entra no precache do service worker, então funciona offline do mesmo jeito.
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const { project, rows, summary } = await reportData(projectId, date)
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
    + (summary.rolls.length ? `  ·  Cartões: ${summary.rolls.join(', ')}` : '')
  doc.text(pdfSafe(sum), M, 35.5)
  let startY = 39
  if (multi) {
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(pdfSafe(`Multicâmera (mesma claquete gravada por mais de uma câmera) — ${plural(summary.multicamTakes, 'take')}, `
      + `planos: ${summary.multiShots.map((m) => `${m.label} (${m.combo})`).join(', ')}`), W - 2 * M)
    doc.text(lines, M, 40.5)
    startY = 40.5 + lines.length * 3.6 + 1
  }

  const head = [[...(date ? [] : ['Data']), 'Cena', 'Plano', 'Take', 'Cam', ...(multi ? ['Multicam'] : []), 'Cartão', 'Clipe', 'Lente', 'T-Stop', 'Filtros',
    'Foco', 'ISO', 'Shutter', 'FPS', 'WB', 'Status', 'Hora', 'Notas pós / VFX']]
  const body = rows.map((r) => [...(date ? [] : [r.date]), r.scene, r.shot, r.take, r.camera, ...(multi ? [r.multicam] : []), r.roll, r.clip, r.lens, r.tstop,
    r.filters, r.focus, r.iso, r.shutter, r.fps, r.wb, STATUS_TXT[r.status] || '', r.time, r.notes].map(pdfSafe))
  const statusCol = head[0].indexOf('Status')
  const multiCol = head[0].indexOf('Multicam')
  const notesCol = head[0].length - 1

  autoTable(doc, {
    head: head.map((h) => h.map(pdfSafe)),
    body,
    startY,
    margin: { left: M, right: M, bottom: 12 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.4, lineColor: [190, 190, 190], lineWidth: 0.15, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [30, 30, 33], textColor: [245, 179, 1], fontStyle: 'bold', fontSize: 7 },
    columnStyles: { [notesCol]: { cellWidth: multi ? 48 : 55 } },
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
      if (d.column.index <= (date ? 2 : 3) + (multi ? 1 : 0)) d.cell.styles.fontStyle = 'bold'
    },
  })

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

export async function buildCsv(projectId, date = null) {
  const { project, rows } = await reportData(projectId, date)
  const cols = [['date', 'Data'], ['scene', 'Cena'], ['shot', 'Plano'], ['shotType', 'Enquadramento'], ['take', 'Take'],
    ['camera', 'Câmera'], ['multicam', 'Multicam'], ['roll', 'Cartão'], ['clip', 'Clipe'], ['lens', 'Lente'], ['tstop', 'T-Stop'], ['filters', 'Filtros'],
    ['focus', 'Foco'], ['iso', 'ISO'], ['shutter', 'Shutter'], ['fps', 'FPS'], ['wb', 'WB'], ['status', 'Status'],
    ['time', 'Hora'], ['notes', 'Notas pós/VFX']]
  const esc = (v) => {
    const s = String(v ?? '')
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [cols.map((c) => c[1]).join(';')]
  for (const r of rows) lines.push(cols.map(([k]) => esc(k === 'status' ? STATUS_TXT[r.status] || '' : r[k])).join(';'))
  // BOM + ";" = abre certinho no Excel em português
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  return { blob, filename: fileName(project.title, date, 'csv') }
}

function fileName(title, date, ext) {
  const slug = String(title || 'projeto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')
  return `Boletim_${slug}_${date ? date : 'completo'}.${ext}`
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
  for (const t of ['projects', 'scenes', 'shots', 'takes', 'kit_items']) data[t] = (await db[t].toArray()).filter((r) => !r.deleted)
  const blob = new Blob([JSON.stringify({ app: 'boletim-de-camera', version: 2, exported_at: new Date().toISOString(), data }, null, 1)],
    { type: 'application/json' })
  const d = new Date()
  return { blob, filename: `Boletim_backup_${d.toISOString().slice(0, 10)}.json` }
}

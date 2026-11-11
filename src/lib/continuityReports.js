// Relatórios da continuidade (modelo dos relatórios do Desce do Salto) e CSV de metadados para o DaVinci Resolve.
// - Progresso: por diária, início/fim, cenas programadas/filmadas/omitidas (remanejadas), cartões, planos.
// - Relatório final: por cena e plano, takes que valeram e reservas, dia/cartão, som, descrição e observação p/ montagem.
// - Boletim diário: por cena (locação, dia/noite, int/ext, som, cartão) e take (resultado, tempo, personagens, obs).
// - Resolve: CSV para Media Pool → Import Metadata (casa pelo File Name).
import { reportData, pdfSafe, staleBuild, fileName } from './export'
import { loadDays, dayLabel } from './days'
import { fmtDate, fmtTime, natCompare } from './util'
import { ratingOf, resultOf, RESULT_LABEL, clipTypeLabel } from './fields'
import { ficha } from './ficha'

const RES_RGB = { valeu: [34, 197, 94], reserva: [250, 204, 21], ng: [239, 68, 68], check: [167, 139, 250] }
const resText = (t) => {
  if (t.clip_type) return clipTypeLabel(t.clip_type).toUpperCase()
  const r = resultOf(t)
  const n = ratingOf(t)
  return [RESULT_LABEL[r], n && r !== 'valeu' ? `${n}/5` : null].filter(Boolean).join(' ')
}
const hhmm = (iso) => (iso ? fmtTime(iso) : '')
// "00:00:54:22" (TC do Resolve) → "0:54"; "1:02" fica como está
const shortDur = (v) => {
  const m = String(v || '').match(/^(\d\d):(\d\d):(\d\d)(?::\d\d)?$/)
  if (!m) return v || ''
  const h = +m[1], min = +m[2]
  return h ? `${h}:${m[2]}:${m[3]}` : `${min}:${m[3]}`
}
const tcOf = (tc) => (/^\d\d:\d\d/.test(tc || '') ? tc.slice(0, 5).replace(':', 'h') : '')

async function pdfKit(orientation = 'landscape') {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]).catch(staleBuild)
  return { doc: new jsPDF({ orientation, unit: 'mm', format: 'a4' }), autoTable }
}

function header(doc, project, title, right) {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(10, 10, 11); doc.rect(0, 0, W, 22, 'F')
  doc.setTextColor(245, 179, 1); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text(pdfSafe(`CONTINUIDADE  ·  ${title}`), 10, 8)
  doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.text(pdfSafe(project.title), 10, 16)
  doc.setFontSize(10); doc.text(pdfSafe(right || ''), W - 10, 10, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  const f = ficha(project)
  doc.text(pdfSafe([project.director && `Direção: ${project.director}`, f.continuidade && `Continuidade: ${f.continuidade}`].filter(Boolean).join('   ·   ')), W - 10, 16, { align: 'right' })
  doc.setTextColor(0, 0, 0)
  return 28
}

const tableStyle = {
  theme: 'grid', styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.2, overflow: 'linebreak', lineColor: [200, 200, 200] },
  headStyles: { fillColor: [10, 10, 11], textColor: [255, 255, 255], fontStyle: 'bold' }, rowPageBreak: 'avoid', margin: { left: 10, right: 10 },
}

async function base(projectId, date) {
  const data = await reportData(projectId, date)
  const days = await loadDays(projectId)
  return { ...data, days, takes: data.rows.map((r) => ({ ...r.src, _row: r })) }
}

// ---------- Progresso ----------
export async function buildProgressPdf(projectId) {
  const { project, takes, days } = await base(projectId, null)
  const { doc, autoTable } = await pdfKit('portrait')
  const y = header(doc, project, 'RELATÓRIO DE PROGRESSO', `${days.length} diárias`)
  const byDate = {}
  for (const t of takes) (byDate[t.shoot_date] ||= []).push(t)
  const sceneNum = Object.fromEntries(takes.map((t) => [t.scene_id, t._row.sceneRow.number]))
  const allScenes = new Map(takes.map((t) => [t.scene_id, t._row.sceneRow]))
  const shotDays = {} // cena -> datas em que foi filmada
  for (const t of takes) (shotDays[t.scene_id] ||= new Set()).add(t.shoot_date)
  const body = days.map((d) => {
    const list = (byDate[d.date] || []).filter((t) => !t.clip_type)
    const filmed = [...new Set(list.map((t) => t.scene_id))]
    // cena só com falso REC / ensaio (ex.: AVULSOS) não conta como programada
    const onlyClips = new Set((byDate[d.date] || []).filter((t) => t.clip_type).map((t) => t.scene_id).filter((id) => !filmed.includes(id)))
    const programmed = d.scenes.map((s) => s.scene_id).filter((id) => !onlyClips.has(id))
    const omitted = programmed.filter((id) => !filmed.includes(id))
    const name = (id) => sceneNum[id] || allScenes.get(id)?.number || '?'
    const omittedTxt = omitted.map((id) => {
      const other = [...(shotDays[id] || [])].filter((x) => x !== d.date)
      const to = other.length ? days.find((x) => x.date === other.sort()[0]) : null
      return to ? `${name(id)} (remanejada p/ ${dayLabel(to.number)})` : name(id)
    })
    const times = list.map((t) => t.recorded_at).filter(Boolean).sort()
    const ends = list.map((t) => t.extra?.tc_out).filter(Boolean).sort()
    return [
      `${dayLabel(d.number)}\n${fmtDate(d.date)}`,
      times.length ? hhmm(times[0]) : '',
      ends.length ? tcOf(ends[ends.length - 1]) : times.length ? hhmm(times[times.length - 1]) : '',
      programmed.map(name).join(', '),
      filmed.map(name).sort(natCompare).join(', '),
      omittedTxt.join(', ') || 'Nenhuma',
      [...new Set(list.map((t) => t.roll).filter(Boolean))].sort().join(', '),
      String(new Set(list.map((t) => t.shot_id)).size),
      String(new Set(list.map((t) => `${t.shot_id}#${t.take_number}`)).size),
    ]
  })
  autoTable(doc, { ...tableStyle, startY: y,
    head: [['Diária', 'Início', 'Fim', 'Cenas programadas', 'Cenas filmadas', 'Omitidas', 'Cartões', 'Planos', 'Takes']],
    body: body.map((r) => r.map(pdfSafe)),
    columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 1: { cellWidth: 12 }, 2: { cellWidth: 12 }, 7: { cellWidth: 12 }, 8: { cellWidth: 12 } } })
  return { blob: doc.output('blob'), filename: fileName(project.title, null, 'pdf', 'Progresso') }
}

// ---------- Relatório final ----------
export async function buildFinalReportPdf(projectId) {
  const { project, takes, days } = await base(projectId, null)
  const { doc, autoTable } = await pdfKit('landscape')
  const y = header(doc, project, 'RELATÓRIO FINAL', `${new Set(takes.map((t) => t.scene_id)).size} cenas`)
  const dayOf = Object.fromEntries(days.map((d) => [d.date, d]))
  const byShot = new Map()
  for (const t of takes) {
    if (t.clip_type) continue
    const k = t.shot_id
    if (!byShot.has(k)) byShot.set(k, { scene: t._row.sceneRow, shot: t._row.shotRow, list: [] })
    byShot.get(k).list.push(t)
  }
  const groups = [...byShot.values()].sort((a, b) => natCompare(a.scene.number, b.scene.number) || natCompare(a.shot.code, b.shot.code))
  const body = groups.map(({ scene, shot, list }) => {
    const valeu = list.filter((t) => resultOf(t) === 'valeu')
    const reserva = list.filter((t) => resultOf(t) === 'reserva').sort((a, b) => ratingOf(b) - ratingOf(a))
    const pick = valeu.length ? valeu : reserva.slice(0, 1)
    const where = [...new Set(pick.map((t) => `${dayOf[t.shoot_date] ? dayLabel(dayOf[t.shoot_date].number) : fmtDate(t.shoot_date)} · ${fmtDate(t.shoot_date)} - ${t.roll || '?'}`))].join('\n')
    const sound = [...new Set(pick.map((t) => (t.sound === 'mos' ? 'MOS' : 'Corresponde a claquete')))].join(' / ')
    const obs = [shot.edit_note, ...pick.map((t) => t.notes && `T${t.take_number}: ${t.notes}`), ...pick.map((t) => t.slate_as && `T${t.take_number}: claquete marcada ${t.slate_as}`)].filter(Boolean).join('\n')
    return [scene.number, shot.code, valeu.map((t) => `T${t.take_number}`).join(', ') || '—',
      reserva.map((t) => `T${t.take_number} (${ratingOf(t)}/5)`).join(', '), where, sound, shot.description || '', obs]
  })
  autoTable(doc, { ...tableStyle, startY: y,
    head: [['Cena', 'Plano', 'Valeu', 'Reservas', 'Dia / cartão', 'Som', 'Descrição do plano', 'Observação']],
    body: body.map((r) => r.map(pdfSafe)),
    columnStyles: { 0: { cellWidth: 12, fontStyle: 'bold' }, 1: { cellWidth: 11 }, 2: { cellWidth: 16, fontStyle: 'bold' }, 3: { cellWidth: 26 }, 4: { cellWidth: 36 }, 5: { cellWidth: 24 }, 6: { cellWidth: 55 } } })
  return { blob: doc.output('blob'), filename: fileName(project.title, null, 'pdf', 'Relatorio_final') }
}

// ---------- Boletim diário da continuidade ----------
export async function buildContinuityDailyPdf(projectId, date = null) {
  const { project, takes, days, dayName } = await base(projectId, date)
  const { doc, autoTable } = await pdfKit('landscape')
  let y = header(doc, project, 'BOLETIM DIÁRIO', date ? `${(dayName || 'Diária').toUpperCase()} · ${fmtDate(date)}` : 'Todas as diárias')
  const H = doc.internal.pageSize.getHeight()
  // blocos por diária + cena, na ordem de gravação
  const blocks = []
  for (const t of takes) {
    const k = `${t.shoot_date}|${t.scene_id}`
    let b = blocks[blocks.length - 1]
    if (!b || b.k !== k) blocks.push((b = { k, date: t.shoot_date, scene: t._row.sceneRow, list: [] }))
    b.list.push(t)
  }
  const dayOf = Object.fromEntries(days.map((d) => [d.date, d]))
  for (const b of blocks) {
    if (y > H - 30) { doc.addPage(); y = 14 }
    const s = b.scene
    const sound = b.list.some((t) => t.sound !== 'mos') ? (b.list.some((t) => t.sound === 'mos') ? 'SYNC / MOS' : 'SYNC') : 'MOS'
    const cards = [...new Set(b.list.map((t) => t.roll).filter(Boolean))].join(', ')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text(pdfSafe(`${date ? '' : `${dayOf[b.date] ? dayLabel(dayOf[b.date].number) : ''} ${fmtDate(b.date)}  ·  `}CENA ${s.number}  ·  ${[s.period, s.int_ext].filter(Boolean).join(' ')}  ·  ${sound}  ·  Cartão ${cards || '—'}`), 10, y + 4)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    if (s.location) doc.text(pdfSafe(`Locação: ${s.location}`), 10, y + 8.5)
    const body = b.list.map((t) => [
      `${t._row.shotRow.code}/${String(t.take_number).padStart(2, '0')}`,
      t.clip || '', t.sound === 'mos' ? 'MOS' : 'SYNC', resText(t), shortDur(t.duration),
      (t.characters || []).join(', '),
      [...(t.extra?.problemas || []), t.slate_as && `Claquete: ${t.slate_as}`].filter(Boolean).join(', '),
      [t.notes, t._row.shotRow.description && t.take_number === Math.min(...b.list.filter((x) => x.shot_id === t.shot_id).map((x) => x.take_number)) ? `(${t._row.shotRow.description})` : null].filter(Boolean).join(' '),
    ])
    autoTable(doc, { ...tableStyle, startY: y + (s.location ? 10.5 : 6.5),
      head: [['Plano/take', 'Clipe', 'Som', 'Resultado', 'Tempo', 'Personagens', 'Problema', 'Observação']],
      body: body.map((r) => r.map(pdfSafe)),
      columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 1: { cellWidth: 20 }, 2: { cellWidth: 12 }, 3: { cellWidth: 24, fontStyle: 'bold' }, 4: { cellWidth: 13 }, 5: { cellWidth: 38 }, 6: { cellWidth: 32 } },
      didParseCell: (d) => {
        if (d.section !== 'body' || d.column.index !== 3) return
        const t = b.list[d.row.index]
        const rgb = !t.clip_type && RES_RGB[resultOf(t)]
        if (rgb) d.cell.styles.fillColor = rgb
      } })
    y = doc.lastAutoTable.finalY + 6
  }
  return { blob: doc.output('blob'), filename: fileName(project.title, date, 'pdf', 'Continuidade') }
}

// ---------- CSV para o DaVinci Resolve ----------
// Media Pool → selecionar os clipes → botão direito → Import Metadata → escolher este arquivo (casa pelo File Name).
// Good Take = Tag 1, Rejected = Tag 2; Rating = estrelas; cor e Flags pelo resultado; Keywords = cena + personagens.
const COLOR = { valeu: 'Green', reserva: 'Yellow', ng: 'Orange', check: 'Purple' }
const FLAG = { valeu: 'Green', reserva: 'Yellow', ng: 'Red', check: 'Purple' }
const pad2 = (s) => (/^\d+$/.test(String(s)) ? String(s).padStart(2, '0') : String(s ?? ''))

export async function buildResolveCsv(projectId, date = null) {
  const { project, takes, days } = await base(projectId, date)
  const dayOf = Object.fromEntries(days.map((d) => [d.date, d]))
  const f = ficha(project)
  const cols = ['File Name', 'Scene', 'Shot', 'Take', 'Camera #', 'Roll Card #', 'Shoot Day', 'Date Recorded', 'Description',
    'Comments', 'Keywords', 'Clip Color', 'Flags', 'Rating', 'Tag', 'Audio Notes', 'Day / Night', 'Environment', 'Location',
    'Focal Point (mm)', 'Camera Aperture', 'Filter', 'ND Filter', 'ISO', 'White Point (Kelvin)', 'Shutter Angle', 'EDL Clip Name',
    'People', 'Personagens', 'Production Name', 'Director', 'Script Supervisor', 'DOP', 'Camera Assistant', 'Digital Technician']
  const lines = []
  const missing = []
  for (const t of takes) {
    const s = t._row.sceneRow, sh = t._row.shotRow
    const res = t.clip_type ? null : resultOf(t)
    const clipCode = String(t.clip || '').toUpperCase()
    const edl = t.clip_type ? `${t.clip_type === 'falso_rec' ? 'FALSO-REC' : clipTypeLabel(t.clip_type).toUpperCase()}_${clipCode}`
      : `${s.number}-${pad2(sh.code)}-T${pad2(t.take_number)}_${clipCode}`
    if (!t.file_name) missing.push(t.clip || `${s.number}/${sh.code}/${t.take_number}`)
    const filters = (t.filters || []).filter((x) => !/^ND\b/i.test(x))
    const nd = (t.filters || []).find((x) => /^ND\b/i.test(x))
    const chars = t.characters || []
    const row = {
      'File Name': t.file_name || t.clip || '', 'Scene': s.number, 'Shot': pad2(sh.code), 'Take': pad2(t.take_number), 'Camera #': t.camera || '',
      'Roll Card #': t.roll || '', 'Shoot Day': dayOf[t.shoot_date] ? pad2(dayOf[t.shoot_date].number) : '',
      'Date Recorded': String(t.shoot_date || '').replace(/-/g, ':'), 'Description': t.notes || '',
      'Comments': [t.comments, t.slate_as && `Claquete marcada ${t.slate_as}`, ...(t.extra?.problemas || []).map((p) => `Problema: ${p}`)].filter(Boolean).join(' · '),
      'Keywords': [`CENA ${s.number}`, ...chars, t.clip_type && clipTypeLabel(t.clip_type).toUpperCase()].filter(Boolean).join(', '),
      'Clip Color': t.clip_type ? 'Brown' : COLOR[res] || '', 'Flags': t.clip_type ? '' : FLAG[res] || '',
      'Rating': t.rating || (res === 'valeu' ? 5 : ''), 'Tag': res === 'valeu' || res === 'reserva' ? '1' : res === 'ng' ? '2' : '',
      'Audio Notes': t.sound === 'mos' ? 'MOS' : 'SYNC',
      'Day / Night': { DIA: 'day', NOITE: 'night', AMANHECER: 'dawn', ENTARDECER: 'dusk' }[s.period] || '',
      'Environment': { INT: 'interior', EXT: 'exterior' }[s.int_ext] || '', 'Location': s.location || '',
      'Focal Point (mm)': t.lens || '', 'Camera Aperture': t.t_stop || '', 'Filter': filters.join(' + '), 'ND Filter': nd ? nd.replace(/^ND\s*/i, '').replace(/^\./, '0.') : '',
      'ISO': t.iso || '', 'White Point (Kelvin)': String(t.wb || '').replace(/K$/i, ''), 'Shutter Angle': t.shutter || '', 'EDL Clip Name': edl,
      'People': chars.join(', '), 'Personagens': chars.join(', '),
      'Production Name': project.title, 'Director': project.director || '', 'Script Supervisor': f.continuidade || '', 'DOP': project.dop || '',
      'Camera Assistant': project.first_ac || '', 'Digital Technician': project.logger || '',
    }
    lines.push(cols.map((c) => csvCell(row[c])).join(','))
  }
  const text = [cols.join(','), ...lines].join('\r\n')
  // UTF-16 com BOM, como o próprio Resolve exporta (acentos sem surpresa)
  const buf = new Uint8Array(2 + text.length * 2)
  buf[0] = 0xff; buf[1] = 0xfe
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); buf[2 + i * 2] = c & 255; buf[3 + i * 2] = c >> 8 }
  return { blob: new Blob([buf], { type: 'text/csv' }), filename: fileName(project.title, date, 'csv', 'Resolve'), missing }
}
const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

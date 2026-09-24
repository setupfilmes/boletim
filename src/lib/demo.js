// Projeto de demonstração: 4 diárias com dados realistas (1 câmera, A+B no mesmo plano, planos vinculados,
// slow motion, status variados e notas). Serve para ver telas e relatórios preenchidos. Pode ser excluído.
import { getDb, currentUserId } from './db'
import { scheduleSync } from './sync'
import { createProject } from './repo'
import { uuid, nowISO } from './util'

const mark = (row) => ({ deleted: false, created_at: nowISO(), ...row, _dirty: 1, _rev: 1, _err: null })

const pad = (n, len = 3) => String(n).padStart(len, '0')
const dayISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`

// Look de cada diária (valores iguais para as câmeras naquele set)
const LOOK = {
  intDia: { iso: '800', shutter: '180°', fps: '24', wb: '4300K' },
  extDia: { iso: '800', shutter: '180°', fps: '24', wb: '5600K' },
  intNoite: { iso: '1600', shutter: '180°', fps: '24', wb: '3200K' },
  extNoite: { iso: '1280', shutter: '180°', fps: '24', wb: '4300K' },
  entardecer: { iso: '800', shutter: '172.8°', fps: '24', wb: '5000K' },
}

// Roteiro das diárias. Plano: cams = { A: {lens, t, focus, filters} , B: … }; status/notas por take (índice 0 = take 1).
// `link` junta planos que rodam juntos (mesma claquete); `bStatus`/`bNotes` são da câmera B (senão notas vão na A).
const DAYS = [
  { // Diária 1 — só câmera A
    scenes: [
      { number: '3', int_ext: 'INT', period: 'DIA', location: 'Apartamento da Lia', description: 'Lia acorda com o telefone', look: 'intDia',
        shots: [
          { code: '1', type: 'PG', desc: 'Master do quarto', cams: { A: { lens: '25mm', t: 'T2.8', focus: '3m' } },
            status: ['ng', 'check', 'good'], notes: { 0: 'Boom no quadro', 1: 'Foco suave no final' } },
          { code: '2', type: 'PM', cams: { A: { lens: '40mm', t: 'T2.8', focus: '1,8m' } }, status: ['ng', 'good'], notes: { 0: 'Atriz errou a fala' } },
          { code: '3', type: 'PP', desc: 'Lia atende', cams: { A: { lens: '75mm', t: 'T2', focus: '1,2m', filters: ['Pro-Mist 1/8'] } },
            status: ['check', 'ng', 'good', 'good'], notes: { 3: 'Alternativa: fala mais baixa' }, marks: { 1: ['pu'] } },
        ] },
      { number: '4', int_ext: 'INT', period: 'DIA', location: 'Apartamento da Lia', look: 'intDia',
        shots: [
          { code: '1', type: 'PA', cams: { A: { lens: '32mm', t: 'T2.8', focus: '2,5m' } }, status: ['ng', 'good'] },
          { code: '2', type: 'Insert', desc: 'Tela do celular', cams: { A: { lens: '100mm', t: 'T4', focus: '0,45m' } }, mos: true,
            status: ['good'], notes: { 0: 'Tracking markers na tela' }, vfx: { 0: ['Tracking', 'Paint out'] } },
        ] },
    ],
  },
  { // Diária 2 — A+B no mesmo plano, externa dia
    scenes: [
      { number: '7', int_ext: 'EXT', period: 'DIA', location: 'Rua 24 de Outubro', description: 'Perseguição a pé', look: 'extDia',
        shots: [
          { code: '1', type: 'PG', desc: 'Travelling lateral',
            cams: { A: { lens: '24-70mm', t: 'T5.6', focus: '7m', filters: ['ND 1.2'] }, B: { lens: '70-200mm', t: 'T4', focus: '10m', filters: ['ND .9'] } },
            status: ['ng', 'ng', 'good'], bStatus: ['ng', 'check', 'good'], notes: { 0: 'Carro entrou no quadro', 1: 'Figurante olhou para a câmera' },
            marks: { 1: ['afs'] } },
          { code: '2', type: 'PM',
            cams: { A: { lens: '32mm', t: 'T4', focus: '2m', filters: ['ND .9', 'Pro-Mist 1/8'] }, B: { lens: '65mm', t: 'T4', focus: '3m', filters: ['ND .9'] } },
            status: ['good', 'good'], bStatus: ['ng', 'good'], bNotes: { 0: 'Foco buzz no início' } },
        ] },
      { number: '8', int_ext: 'EXT', period: 'DIA', location: 'Praça do Sol', look: 'extDia',
        shots: [
          { code: '1', type: 'PP', cams: { A: { lens: '75mm', t: 'T2.8', focus: '1,5m', filters: ['ND 1.5'] } }, status: ['check', 'good'],
            notes: { 0: 'Flare no final — conferir com DoP' } },
          { code: '2', type: 'Detalhe', desc: 'Mão soltando a chave',
            cams: { A: { lens: '100mm', t: 'T4', focus: '0,8m', filters: ['ND 1.2'] }, B: { lens: '50mm', t: 'T4', focus: '1,5m', filters: ['ND 1.2'] } },
            status: ['good'], bStatus: ['good'], mos: true },
        ] },
    ],
  },
  { // Diária 3 — planos vinculados (A no 12A, B no 12B), interna noite
    scenes: [
      { number: '12', int_ext: 'INT', period: 'NOITE', location: 'Bar Central', description: 'Conversa no balcão', look: 'intNoite',
        shots: [
          { code: 'A', type: 'PM', desc: 'Lia pelo lado do balcão', link: 'bar', cams: { A: { lens: '40mm', t: 'T1.8', focus: '1,8m' } },
            status: ['ng', 'good', 'good', 'check'], notes: { 0: 'Reflexo no espelho do fundo', 3: 'Som ruim — pedir wild track' } },
          { code: 'B', type: 'PP', desc: 'Téo no contraplano', link: 'bar', cams: { B: { lens: '75mm', t: 'T1.8', focus: '1,5m' } },
            status: ['ng', 'ng', 'good', 'good'], notes: { 1: 'Foco suave' } },
          { code: 'C', type: 'Detalhe', desc: 'Copo sendo servido', cams: { A: { lens: '100mm', t: 'T2.8', focus: '0,6m' } }, status: ['good', 'good', 'good'],
            mos: true, marks: { 1: ['ser'], 2: ['ser'] }, notes: { 1: 'Série: 3 variações do gesto' } },
        ] },
      { number: '13', int_ext: 'INT', period: 'NOITE', location: 'Bar Central', look: 'intNoite',
        shots: [
          { code: 'A', type: 'PA', link: 'bar2', cams: { A: { lens: '32mm', t: 'T2', focus: '2,5m' } }, status: ['check', 'good'] },
          { code: 'B', type: 'PM', link: 'bar2', cams: { B: { lens: '50mm', t: 'T2', focus: '2m', filters: ['Pro-Mist 1/4'] } }, status: ['good', 'good'] },
        ] },
    ],
  },
  { // Diária 4 (hoje) — mistura: A+B, slow motion, entardecer
    scenes: [
      { number: '20', int_ext: 'EXT', period: 'NOITE', location: 'Estacionamento', description: 'Lia chega ao carro', look: 'extNoite',
        shots: [
          { code: '1', type: 'PG',
            cams: { A: { lens: '18mm', t: 'T1.5', focus: '5m' }, B: { lens: '135mm', t: 'T2', focus: '∞' } },
            status: ['ng', 'good', 'good'], bStatus: ['ng', 'ng', 'good'], notes: { 0: 'Luz do poste piscou' } },
          { code: '2', type: 'PP', desc: 'Slow motion', fps: '48', shutter: '180°', cams: { A: { lens: '65mm', t: 'T1.5', focus: '1m' } },
            status: ['ng', 'good'], notes: { 1: 'Slow 48fps — conformar a 24' } },
        ] },
      { number: '21', int_ext: 'EXT', period: 'ENTARDECER', location: 'Mirante', description: 'Final', look: 'entardecer',
        shots: [
          { code: '1', type: 'Plano-sequência',
            cams: { A: { lens: '24-70mm', t: 'T4', focus: '4m', filters: ['ND .6', 'Pro-Mist 1/8'] }, B: { lens: '70-200mm', t: 'T4', focus: '10m', filters: ['ND .6'] } },
            status: ['ng', 'check', 'good'], bStatus: ['good', 'check', 'good'], notes: { 0: 'Drone entrou no quadro', 2: 'Clean plate no final' },
            vfx: { 2: ['Clean plate'] }, marks: { 2: ['tail'] } },
        ] },
    ],
  },
]

// Campos extras ligados no projeto de demonstração e valores fixos de cada câmera
const DEMO_FIELDS = ['nd_int', 'lut', 'codec', 'resolution', 'vfx']
const CAM_TECH = {
  A: { lut: 'K1S1', codec: 'ARRIRAW', resolution: '4.5K LF' },
  B: { lut: 'S-Log3 to 709', codec: 'XAVC-I', resolution: '4K UHD' },
}

// Cenas sem take (para a lista parecer um roteiro real)
const EMPTY_SCENES = [
  ['1', 'EXT', 'NOITE', 'Estrada'], ['2', 'INT', 'NOITE', 'Carro'], ['5', 'INT', 'DIA', 'Escritório'],
  ['6', 'INT', 'DIA', 'Escritório'], ['9', 'EXT', 'DIA', 'Praça do Sol'], ['22', 'EXT', 'NOITE', 'Mirante'],
]

export async function createDemoProject(userName) {
  const p = await createProject({
    title: 'Noite Adentro (demonstração)', production_type: 'Curta', company: 'Setup Filmes', director: 'Rafael Moura',
    dop: 'Lívia Prado', first_ac: userName || '', second_ac: 'Téo Ramos', logger: 'Bruno Sá',
    camera_body: 'A: ARRI Alexa Mini LF, B: Sony FX6',
    kit: { cameras: [{ id: 'A', body: 'ARRI Alexa Mini LF' }, { id: 'B', body: 'Sony FX6' }], fields: DEMO_FIELDS },
    notes: 'Projeto fictício com 4 diárias para ver o app e os relatórios preenchidos. Pode excluir quando quiser.',
  })
  const db = getDb()
  const uid = currentUserId()
  const base = Date.now()
  const scenes = []
  const shots = []
  const takes = []
  const today = new Date()

  for (const [i, [number, int_ext, period, location]] of EMPTY_SCENES.entries()) {
    scenes.push(mark({ id: uuid(), project_id: p.id, number, int_ext, period, location, description: null, created_by: uid, sort_order: base + i }))
  }

  DAYS.forEach((day, di) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DAYS.length - 1 - di))
    const shootDate = dayISO(date)
    let minute = 8 * 60 + 30 // começa às 8h30
    const clip = { A: 0, B: 0 }
    const roll = { A: `A${pad(di + 1)}`, B: `B${pad(di + 1)}` }
    const links = {}
    for (const sc of day.scenes) {
      const scene = mark({ id: uuid(), project_id: p.id, number: sc.number, int_ext: sc.int_ext, period: sc.period,
        location: sc.location, description: sc.description || null, created_by: uid, sort_order: base + 100 + scenes.length })
      scenes.push(scene)
      // planos vinculados rodam juntos: take N do 12A e do 12B no mesmo horário
      const groups = []
      for (const sh of sc.shots) {
        const g = sh.link && groups.find((x) => x.link === sh.link)
        if (g) g.shots.push(sh)
        else groups.push({ link: sh.link, shots: [sh] })
      }
      for (const g of groups) {
        const linkId = g.link ? (links[g.link] ||= uuid()) : null
        const rows = g.shots.map((sh) => {
          const shot = mark({ id: uuid(), project_id: p.id, scene_id: scene.id, code: sh.code, shot_type: sh.type,
            description: sh.desc || null, created_by: uid, sort_order: base + 1000 + shots.length,
            cameras: Object.keys(sh.cams), link_id: linkId })
          shots.push(shot)
          return { sh, shot }
        })
        const n = Math.max(...g.shots.map((sh) => sh.status.length))
        for (let k = 0; k < n; k++) {
          minute += 4 + ((k * 7 + di * 3) % 5)
          const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minute / 60), minute % 60).toISOString()
          for (const { sh, shot } of rows) {
            if (k >= sh.status.length) continue
            for (const [cam, c] of Object.entries(sh.cams)) {
              clip[cam]++
              const look = LOOK[sc.look]
              const status = cam === 'B' && sh.bStatus ? sh.bStatus[k] : sh.status[k]
              const statuses = cam === 'B' && sh.bStatus ? sh.bStatus : sh.status
              const extra = { ...CAM_TECH[cam] }
              if (cam === 'B' && sc.look === 'extDia') extra.nd_int = '0.9'
              if (sh.vfx?.[k]) extra.vfx = sh.vfx[k]
              takes.push(mark({
                id: uuid(), project_id: p.id, scene_id: scene.id, shot_id: shot.id, take_number: k + 1,
                shoot_date: shootDate, recorded_at: at, created_by: uid, camera: cam,
                roll: roll[cam], clip: `${roll[cam]}C${pad(clip[cam])}`,
                lens: c.lens, t_stop: c.t, filters: c.filters || [], focus: c.focus,
                iso: look.iso, shutter: sh.shutter || look.shutter, fps: sh.fps || look.fps, wb: look.wb,
                status: status || null,
                sound: sh.mos ? 'mos' : 'sync', marks: sh.marks?.[k] || null, extra,
                circled: status === 'good' && statuses.lastIndexOf('good') === k, // o último GOOD de cada câmera é o circulado
                notes: (cam === 'B' && sh.bNotes ? sh.bNotes[k] : cam === 'A' || !sh.cams.A ? sh.notes?.[k] : null) || null,
              }))
            }
          }
        }
      }
    }
  })

  await db.transaction('rw', db.scenes, db.shots, db.takes, async () => {
    await db.scenes.bulkPut(scenes)
    await db.shots.bulkPut(shots)
    await db.takes.bulkPut(takes)
  })
  scheduleSync()
  return p
}

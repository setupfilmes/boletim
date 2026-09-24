// Projeto de demonstração: 5 diárias com dados realistas e completos (todas as cenas filmadas): 1 câmera, A+B no
// mesmo plano, 3 câmeras no carro, planos vinculados, slow motion, 2ª unidade, marcações de claquete, VFX, timecode,
// notas em todos os takes e fotos de referência com legenda. Serve para ver telas e relatórios preenchidos.
import { getDb, currentUserId } from './db'
import { scheduleSync } from './sync'
import { createProject } from './repo'
import { uuid, nowISO } from './util'

const mark = (row) => ({ deleted: false, created_at: nowISO(), ...row, _dirty: 1, _rev: 1, _err: null })

const pad = (n, len = 3) => String(n).padStart(len, '0')
const dayISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`

// Look de cada set (valores iguais para as câmeras naquele set)
const LOOK = {
  intDia: { iso: '800', shutter: '180°', fps: '24', wb: '4300K', nd: 'Clear' },
  extDia: { iso: '800', shutter: '180°', fps: '24', wb: '5600K', nd: '0.9' },
  intNoite: { iso: '1600', shutter: '180°', fps: '24', wb: '3200K', nd: 'Clear' },
  extNoite: { iso: '1280', shutter: '180°', fps: '24', wb: '4300K', nd: 'Clear' },
  entardecer: { iso: '800', shutter: '172.8°', fps: '24', wb: '5000K', nd: '0.6' },
}

// Roteiro das diárias. Plano: cams = { A: { lens, t, focus, filters, h (altura), tilt, nd, fps } , B: … }.
// status/notas por take (índice 0 = take 1); `bStatus`/`cStatus` e `bNotes`/`cNotes` são das câmeras B e C.
// `link` junta planos que rodam juntos (mesma claquete). `photos`: { take: [{ cam, kind, caption }] }.
// `dur`: duração média do take em segundos (para o timecode). Takes sem nota recebem uma nota coerente com o status.
const DAYS = [
  { // Diária 1 — noite na estrada, 2ª unidade + carro com 3 câmeras
    start: '19:00',
    scenes: [
      { number: '1', int_ext: 'EXT', period: 'NOITE', location: 'Estrada da Serra', description: 'O carro de Lia corta a estrada vazia', look: 'extNoite',
        shots: [
          { code: '1', type: 'PG', desc: 'Carro passa pela câmera', unit: '2ª unidade', dur: 40,
            cams: { A: { lens: '24mm', t: 'T1.5', focus: '8m', h: '0,5m', tilt: '+5°' } },
            status: ['ng', 'ng', 'good'], marks: { 1: ['afs'] },
            notes: { 0: 'Carro passou fora da marca', 1: 'Farol estourou a exposição — recomeçou sem cortar', 2: 'Bom. Farol entra no quadro no tempo certo' },
            photos: { 2: [{ cam: 'A', kind: 'road', caption: 'Posição do carro na marca 2: cone laranja fora de quadro à direita. Farol alto só depois da curva.' }] } },
          { code: '2', type: 'Insert', desc: 'Placa "Serra — 12 km"', unit: '2ª unidade', mos: true, dur: 12,
            cams: { A: { lens: '100mm', t: 'T2.8', focus: '12m', h: '1,2m', tilt: '+10°' } },
            status: ['good', 'good'], marks: { 1: ['ns'] }, notes: { 1: 'Sem claquete — identificado na voz no início' } },
        ] },
      { number: '2', int_ext: 'INT', period: 'NOITE', location: 'Carro de Lia (rebocado)', description: 'Lia dirige e fala ao telefone', look: 'intNoite',
        shots: [
          { code: '1', type: 'PM', desc: 'Lia pelo para-brisa, Téo no telefone (off)', dur: 95,
            cams: { A: { lens: '32mm', t: 'T1.8', focus: '1,2m', h: '1,1m', tilt: '0°' }, B: { lens: '50mm', t: 'T1.8', focus: '1m', h: '1,1m', tilt: '-5°' },
              C: { lens: '12mm', t: 'T2.8', focus: '0,6m', h: '1,3m', tilt: '-15°' } },
            status: ['ng', 'good', 'check', 'good'], bStatus: ['ng', 'good', 'good', 'ng'], cStatus: ['check', 'good', 'ng', 'good'],
            notes: { 0: 'Reflexo da equipe no vidro lateral' }, bNotes: { 3: 'Operador B bateu no retrovisor' }, cNotes: { 0: 'Ventosa soltou no fim', 2: 'Vibração forte na lombada' },
            photos: { 1: [{ cam: 'C', kind: 'car', caption: 'Crash cam C no para-brisa: ventosa dupla + cabo de segurança. Conferir vibração a cada take.' }] } },
          { code: '2', type: 'Detalhe', desc: 'Mão aperta o volante', dur: 25,
            cams: { A: { lens: '65mm', t: 'T2', focus: '0,7m', h: '0,9m', tilt: '-10°' } },
            status: ['good', 'good'], marks: { 0: ['tail'] }, notes: { 0: 'Claquete no fim — espaço apertado no carro' } },
        ] },
    ],
  },
  { // Diária 2 — apartamento (só câmera A) e escritório (A+B)
    start: '07:30',
    scenes: [
      { number: '3', int_ext: 'INT', period: 'DIA', location: 'Apartamento da Lia', description: 'Lia acorda com o telefone', look: 'intDia',
        shots: [
          { code: '1', type: 'PG', desc: 'Master do quarto', dur: 70, cams: { A: { lens: '25mm', t: 'T2.8', focus: '3m', h: '1,6m', tilt: '-5°' } },
            status: ['ng', 'check', 'good'], notes: { 0: 'Boom no quadro', 1: 'Foco suave no final' },
            photos: { 2: [{ cam: 'A', kind: 'room', caption: 'Continuidade: cobertor dobrado sobre a perna esquerda, celular virado para baixo na cabeceira.' }] } },
          { code: '2', type: 'PM', desc: 'Lia senta na cama', dur: 45, cams: { A: { lens: '40mm', t: 'T2.8', focus: '1,8m', h: '1,2m', tilt: '0°' } },
            status: ['ng', 'good'], notes: { 0: 'Atriz errou a fala' } },
          { code: '3', type: 'PP', desc: 'Lia atende', dur: 50, cams: { A: { lens: '75mm', t: 'T2', focus: '1,2m', filters: ['Pro-Mist 1/8'], h: '1,1m', tilt: '0°' } },
            status: ['check', 'ng', 'good', 'good'], notes: { 1: 'Pickup a partir de "alô?"', 3: 'Alternativa: fala mais baixa' }, marks: { 1: ['pu'] },
            photos: { 3: [{ cam: 'A', kind: 'face', caption: 'Reflexo da janela no olho da atriz — manter no contraplano do Téo.' }] } },
        ] },
      { number: '4', int_ext: 'INT', period: 'DIA', location: 'Apartamento da Lia', description: 'A mensagem no celular', look: 'intDia',
        shots: [
          { code: '1', type: 'PA', desc: 'Lia anda até a janela', dur: 35, cams: { A: { lens: '32mm', t: 'T2.8', focus: '2,5m', h: '1,4m', tilt: '0°' } }, status: ['ng', 'good'],
            notes: { 0: 'Sombra do boom na parede' } },
          { code: '2', type: 'Insert', desc: 'Tela do celular', dur: 15, cams: { A: { lens: '100mm', t: 'T4', focus: '0,45m', h: '1m', tilt: '-30°' } }, mos: true,
            status: ['good'], notes: { 0: 'Tracking markers na tela — tela desligada' }, vfx: { 0: ['Tracking', 'Paint out'] },
            photos: { 0: [{ cam: 'A', kind: 'phone', caption: 'Marcadores de tracking na tela do celular (5 pontos). Tela desligada no take; inserção na pós.' }] } },
        ] },
      { number: '5', int_ext: 'INT', period: 'DIA', location: 'Escritório Moura & Filhos', description: 'Lia recebe a notícia do chefe', look: 'intDia',
        shots: [
          { code: '1', type: 'PA', desc: 'Master da sala (cobertura cruzada)', dur: 120,
            cams: { A: { lens: '32mm', t: 'T2.8', focus: '2,5m', h: '1,5m', tilt: '0°' }, B: { lens: '85mm', t: 'T2.8', focus: '3m', h: '1,5m', tilt: '0°' } },
            status: ['ng', 'good', 'good'], bStatus: ['check', 'good', 'ng'], notes: { 0: 'Telefone de alguém tocou no set' },
            bNotes: { 2: 'Operador B perdeu o enquadramento no giro' }, vfx: { 0: ['Green screen'], 1: ['Green screen'], 2: ['Green screen'] },
            photos: { 1: [{ cam: 'A', kind: 'office', caption: 'Monitor do chefe em verde para inserção. Marcas de tracking nos cantos da tela.' }] } },
          { code: '2', type: 'PP', desc: 'Reação do chefe', dur: 40, cams: { A: { lens: '75mm', t: 'T2.8', focus: '1,4m', h: '1,3m', tilt: '0°' } },
            status: ['good', 'good'], marks: { 1: ['pu'] }, notes: { 1: 'Pickup a partir da fala "eu sei"' } },
        ] },
      { number: '6', int_ext: 'INT', period: 'DIA', location: 'Escritório Moura & Filhos', description: 'Lia deixa o prédio sem olhar para trás', look: 'intDia',
        shots: [
          { code: '1', type: 'Plano-sequência', desc: 'Steadicam da mesa até o elevador', dur: 150,
            cams: { A: { lens: '25mm', t: 'T2.8', focus: '3m', h: '1,5m', tilt: '0°' } },
            status: ['ng', 'ng', 'ng', 'good', 'check'],
            notes: { 0: 'Steadicam bateu na porta', 1: 'Figurante atravessou cedo', 2: 'Luz do corredor não acendeu', 4: 'Segurança: conferir foco no elevador' },
            photos: { 3: [{ cam: 'A', kind: 'person', caption: 'Figurino: Lia SEM o casaco, crachá no bolso esquerdo, bolsa no ombro direito.' }] } },
        ] },
    ],
  },
  { // Diária 3 — externa dia, A+B no mesmo plano, alta velocidade na B
    start: '08:30',
    scenes: [
      { number: '7', int_ext: 'EXT', period: 'DIA', location: 'Rua 24 de Outubro', description: 'Perseguição a pé', look: 'extDia',
        shots: [
          { code: '1', type: 'PG', desc: 'Travelling lateral', dur: 55,
            cams: { A: { lens: '24-70mm', t: 'T5.6', focus: '7m', filters: ['ND 1.2'], h: '1,2m', tilt: '0°' },
              B: { lens: '70-200mm', t: 'T4', focus: '10m', filters: ['ND .9'], h: '1,6m', tilt: '-5°' } },
            status: ['ng', 'ng', 'good'], bStatus: ['ng', 'check', 'good'], notes: { 0: 'Carro entrou no quadro', 1: 'Figurante olhou para a câmera' },
            marks: { 1: ['afs'] },
            photos: { 2: [{ cam: 'A', kind: 'street', caption: 'Marca do figurante no poste. Carro prata estacionado ficou no quadro — avaliar remoção.' }] } },
          { code: '2', type: 'PM', desc: 'Lia olha para trás', dur: 30,
            cams: { A: { lens: '32mm', t: 'T4', focus: '2m', filters: ['ND .9', 'Pro-Mist 1/8'], h: '1,4m', tilt: '0°' },
              B: { lens: '65mm', t: 'T4', focus: '3m', filters: ['ND .9'], h: '1,4m', tilt: '0°', fps: '120', shutter: '180°' } },
            status: ['good', 'good'], bStatus: ['ng', 'good'], bNotes: { 0: 'Foco buzz no início', 1: 'B a 120 fps — slow motion' } },
        ] },
      { number: '8', int_ext: 'EXT', period: 'DIA', location: 'Praça do Sol', description: 'Lia encontra a chave', look: 'extDia',
        shots: [
          { code: '1', type: 'PP', desc: 'Lia vê algo no chão', dur: 35, cams: { A: { lens: '75mm', t: 'T2.8', focus: '1,5m', filters: ['ND 1.5'], h: '1,5m', tilt: '-10°' } },
            status: ['check', 'good'], notes: { 0: 'Flare no final — conferir com DoP' },
            photos: { 0: [{ cam: 'A', kind: 'sun', caption: 'Flare do sol no canto superior esquerdo. DoP aprovou, mas manter a bandeira na mesma posição.' }] } },
          { code: '2', type: 'Detalhe', desc: 'Mão soltando a chave', dur: 18,
            cams: { A: { lens: '100mm', t: 'T4', focus: '0,8m', filters: ['ND 1.2'], h: '0,8m', tilt: '-30°' },
              B: { lens: '50mm', t: 'T4', focus: '1,5m', filters: ['ND 1.2'], h: '1m', tilt: '-15°' } },
            status: ['good', 'good'], bStatus: ['good', 'check'], mos: true, marks: { 0: ['ser'], 1: ['ser'] }, notes: { 0: 'Série: 3 quedas da chave' } },
        ] },
      { number: '9', int_ext: 'EXT', period: 'DIA', location: 'Praça do Sol', description: 'Lia espera Téo no banco', look: 'extDia',
        shots: [
          { code: '1', type: 'PG', desc: 'Grua descendo sobre a praça', unit: '2ª unidade', dur: 60,
            cams: { A: { lens: '18mm', t: 'T8', focus: '∞', filters: ['ND 1.2', 'Polarizador'], h: '6m', tilt: '-30°' } },
            status: ['check', 'good'], notes: { 0: 'Nuvem cobriu o sol no meio' },
            photos: { 1: [{ cam: 'A', kind: 'sky', caption: 'Céu nublado a partir das 14h: conferir a continuidade de luz com a cena 8.' }] } },
          { code: '2', type: 'PM', desc: 'Lia no banco, Téo entra em quadro', dur: 80,
            cams: { A: { lens: '50mm', t: 'T2.8', focus: '2m', filters: ['ND 1.2'], h: '1,2m', tilt: '0°' },
              B: { lens: '85mm', t: 'T2.8', focus: '3,5m', filters: ['ND 1.2'], h: '1,2m', tilt: '0°' } },
            status: ['ng', 'good', 'good'], bStatus: ['good', 'good', 'check'], notes: { 0: 'Pombo passou na frente da lente' } },
        ] },
    ],
  },
  { // Diária 4 — planos vinculados (A no 12A, B no 12B), interna noite
    start: '19:30',
    scenes: [
      { number: '12', int_ext: 'INT', period: 'NOITE', location: 'Bar Central', description: 'Conversa no balcão', look: 'intNoite',
        shots: [
          { code: 'A', type: 'PM', desc: 'Lia pelo lado do balcão', link: 'bar', dur: 110, cams: { A: { lens: '40mm', t: 'T1.8', focus: '1,8m', h: '1,3m', tilt: '0°' } },
            status: ['ng', 'good', 'good', 'check'], notes: { 0: 'Reflexo no espelho do fundo', 3: 'Som ruim — pedir wild track' },
            photos: { 2: [{ cam: 'A', kind: 'bar', caption: 'Copo cheio até a metade, guardanapo à esquerda. Reflexo do espelho controlado com bandeira.' }] } },
          { code: 'B', type: 'PP', desc: 'Téo no contraplano', link: 'bar', dur: 110, cams: { B: { lens: '75mm', t: 'T1.8', focus: '1,5m', h: '1,3m', tilt: '0°' } },
            status: ['ng', 'ng', 'good', 'good'], notes: { 1: 'Foco suave' } },
          { code: 'C', type: 'Detalhe', desc: 'Copo sendo servido', dur: 20, cams: { A: { lens: '100mm', t: 'T2.8', focus: '0,6m', h: '1,1m', tilt: '-15°' } },
            status: ['good', 'good', 'good'], mos: true, marks: { 1: ['ser'], 2: ['ser'] }, notes: { 1: 'Série: 3 variações do gesto' },
            vfx: { 0: ['Color chart', 'Chrome ball'] },
            photos: { 0: [{ cam: 'A', kind: 'chart', caption: 'Color chart e chrome ball no início do take 1 (referência de cor para VFX).' }] } },
        ] },
      { number: '13', int_ext: 'INT', period: 'NOITE', location: 'Bar Central', description: 'Téo paga a conta e sai', look: 'intNoite',
        shots: [
          { code: 'A', type: 'PA', desc: 'Téo levanta', link: 'bar2', dur: 45, cams: { A: { lens: '32mm', t: 'T2', focus: '2,5m', h: '1,4m', tilt: '0°' } }, status: ['check', 'good'] },
          { code: 'B', type: 'PM', desc: 'Lia fica sozinha', link: 'bar2', dur: 45,
            cams: { B: { lens: '50mm', t: 'T2', focus: '2m', filters: ['Pro-Mist 1/4'], h: '1,3m', tilt: '0°' } }, status: ['good', 'good'],
            photos: { 1: [{ cam: 'B', kind: 'bar', caption: 'Pro-Mist 1/4 só na câmera B — manter nos próximos planos da cena.' }] } },
        ] },
    ],
  },
  { // Diária 5 (hoje) — entardecer e noite: A+B, slow motion, último take ainda sem status
    start: '16:45',
    scenes: [
      { number: '21', int_ext: 'EXT', period: 'ENTARDECER', location: 'Mirante', description: 'Final: Lia e Téo olham a cidade', look: 'entardecer',
        shots: [
          { code: '1', type: 'Plano-sequência', desc: 'Travelling circular ao redor do casal', dur: 180,
            cams: { A: { lens: '24-70mm', t: 'T4', focus: '4m', filters: ['ND .6', 'Pro-Mist 1/8'], h: '1,6m', tilt: '0°' },
              B: { lens: '70-200mm', t: 'T4', focus: '10m', filters: ['ND .6'], h: '1,6m', tilt: '0°' } },
            status: ['ng', 'check', 'good'], bStatus: ['good', 'check', 'good'], notes: { 0: 'Drone entrou no quadro', 2: 'Clean plate no final' },
            vfx: { 2: ['Clean plate'] }, marks: { 2: ['tail'] },
            photos: { 2: [{ cam: 'A', kind: 'sunset', caption: 'Clean plate de 10 s no final: sem atores, mesma altura (1,6 m) e mesma lente.' }] } },
        ] },
      { number: '20', int_ext: 'EXT', period: 'NOITE', location: 'Estacionamento', description: 'Lia chega ao carro', look: 'extNoite',
        shots: [
          { code: '1', type: 'PG', desc: 'Lia atravessa o estacionamento', dur: 65,
            cams: { A: { lens: '18mm', t: 'T1.5', focus: '5m', h: '1,8m', tilt: '-5°' }, B: { lens: '135mm', t: 'T2', focus: '∞', h: '1,5m', tilt: '0°' } },
            status: ['ng', 'good', 'good'], bStatus: ['ng', 'ng', 'good'], notes: { 0: 'Luz do poste piscou' } },
          { code: '2', type: 'PP', desc: 'Slow motion', dur: 30, cams: { A: { lens: '65mm', t: 'T1.5', focus: '1m', h: '1,5m', tilt: '0°', fps: '48' } },
            status: ['ng', 'good'], notes: { 0: 'Flicker do poste a 48 fps', 1: 'Slow 48fps — conformar a 24' },
            photos: { 0: [{ cam: 'A', kind: 'lamp', caption: 'Poste da esquerda pisca a 60 Hz: com 48 fps dá flicker. Trocar por LED do elétrica.' }] } },
        ] },
      { number: '22', int_ext: 'EXT', period: 'NOITE', location: 'Mirante', description: 'Lia sozinha; as luzes da cidade', look: 'extNoite',
        shots: [
          { code: '1', type: 'PG', desc: 'Silhueta contra a cidade', dur: 70,
            cams: { A: { lens: '35mm', t: 'T1.5', focus: '6m', h: '1,4m', tilt: '0°' }, B: { lens: '100mm', t: 'T2', focus: '6m', h: '1,4m', tilt: '0°' } },
            status: ['ng', 'good', null], bStatus: ['ng', 'good', null], notes: { 0: 'Vento derrubou a bandeira' },
            vfx: { 0: ['HDRI', 'Chrome ball'] },
            photos: { 1: [{ cam: 'A', kind: 'city', caption: 'HDRI e chrome ball feitos antes do take 1. Cidade ao fundo: conferir luzes apagadas à direita.' }] } },
        ] },
    ],
  },
]

// Campos extras ligados no projeto de demonstração (todos) e valores fixos de cada câmera
const DEMO_FIELDS = ['tc_in', 'tc_out', 'nd_int', 'lut', 'codec', 'resolution', 'unit', 'lens_height', 'tilt', 'distance', 'vfx']
const CAMS = [
  { id: 'A', body: 'ARRI Alexa Mini LF' },
  { id: 'B', body: 'Sony FX6' },
  { id: 'C', body: 'Blackmagic Pocket 6K' },
]
const CAM_TECH = {
  A: { lut: 'K1S1', codec: 'ARRIRAW', resolution: '4.5K LF' },
  B: { lut: 'S-Log3 to 709', codec: 'XAVC-I', resolution: '4K UHD' },
  C: { lut: 'Rec709', codec: 'BRAW 5:1', resolution: '6K' },
}

// Nota padrão (quando o roteiro não traz uma), variando pelo status
const AUTO_NOTES = {
  good: ['Bom para direção', 'Ótimo: ator e câmera', 'Foco e movimento limpos', 'Preferido do diretor', 'Bom, luz estável'],
  ng: ['Erro de texto', 'Foco perdido no meio', 'Movimento tremido', 'Interrompido pela direção', 'Avião passou — som'],
  check: ['Conferir foco no monitor', 'Checar exposição no céu', 'Revisar com o DoP'],
  none: ['Aguardando revisão do take'],
}

// Timecode hora do dia (câmeras em jam sync): segundos -> HH:MM:SS:FF
const tc = (sec, ff) => `${pad(Math.floor(sec / 3600) % 24, 2)}:${pad(Math.floor(sec / 60) % 60, 2)}:${pad(sec % 60, 2)}:${pad(ff, 2)}`
// Distância ao assunto para o campo VFX: arredonda o foco ("1,8m" -> "2m"); infinito fica 10m
const distOf = (focus) => {
  const n = parseFloat(String(focus).replace(',', '.'))
  if (!Number.isFinite(n)) return '10m'
  return n < 1.25 ? '1m' : n < 1.75 ? '1,5m' : `${Math.round(n)}m`
}

export async function createDemoProject(userName) {
  const p = await createProject({
    title: 'Noite Adentro (demonstração)', production_type: 'Curta', company: 'Setup Filmes', director: 'Rafael Moura',
    dop: 'Lívia Prado', first_ac: userName || 'Marina Costa', second_ac: 'Téo Ramos', logger: 'Bruno Sá',
    camera_body: CAMS.map((c) => `${c.id}: ${c.body}`).join(', '),
    kit: { cameras: CAMS, fields: DEMO_FIELDS },
    notes: 'Projeto fictício com 5 diárias e todas as cenas filmadas (1 a 3 câmeras, fotos de referência, VFX e timecode) '
      + 'para ver o app e os relatórios preenchidos. Pode excluir quando quiser.',
  })
  const db = getDb()
  const uid = currentUserId()
  const base = Date.now()
  const scenes = []
  const shots = []
  const takes = []
  const photoSpecs = []
  const today = new Date()
  let noteIdx = 0

  DAYS.forEach((day, di) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DAYS.length - 1 - di))
    const shootDate = dayISO(date)
    const [hh, mm] = day.start.split(':').map(Number)
    let minute = hh * 60 + mm
    const clip = { A: 0, B: 0, C: 0 }
    const roll = { A: `A${pad(di + 1)}`, B: `B${pad(di + 1)}`, C: `C${pad(di + 1)}` }
    const links = {}
    for (const sc of day.scenes) {
      const scene = mark({ id: uuid(), project_id: p.id, number: sc.number, int_ext: sc.int_ext, period: sc.period,
        location: sc.location, description: sc.description || null, created_by: uid, sort_order: base + Number(sc.number) })
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
          const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minute / 60), minute % 60)
          const tcIn = at.getHours() * 3600 + at.getMinutes() * 60 + ((k * 13 + di * 7) % 50)
          for (const { sh, shot } of rows) {
            if (k >= sh.status.length) continue
            const dur = Math.round((sh.dur || 45) * (0.8 + ((k * 37 + di * 11) % 40) / 100))
            const ff = (k * 7 + di * 5) % 24
            for (const [cam, c] of Object.entries(sh.cams)) {
              clip[cam]++
              const look = LOOK[sc.look]
              const statuses = (cam !== 'A' && sh[`${cam.toLowerCase()}Status`]) || sh.status
              const status = statuses[k] ?? null
              const camNotes = cam !== 'A' && sh[`${cam.toLowerCase()}Notes`]
              // notas do plano vão para a primeira câmera; as outras têm as próprias (ou a nota automática)
              const first = Object.keys(sh.cams)[0] === cam
              const pool = AUTO_NOTES[status || 'none']
              const note = (camNotes ? camNotes[k] : first ? sh.notes?.[k] : null) || pool[noteIdx++ % pool.length]
              const extra = {
                ...CAM_TECH[cam],
                tc_in: tc(tcIn, ff), tc_out: tc(tcIn + dur, (ff + 11) % 24),
                nd_int: c.nd || (cam === 'C' ? 'Clear' : look.nd),
                unit: sh.unit || '1ª unidade',
                lens_height: c.h || '1,4m', tilt: c.tilt || '0°', distance: distOf(c.focus),
              }
              if (sh.vfx?.[k]) extra.vfx = sh.vfx[k]
              const take = mark({
                id: uuid(), project_id: p.id, scene_id: scene.id, shot_id: shot.id, take_number: k + 1,
                shoot_date: shootDate, recorded_at: at.toISOString(), created_by: uid, camera: cam,
                roll: roll[cam], clip: `${roll[cam]}C${pad(clip[cam])}`,
                lens: c.lens, t_stop: c.t, filters: c.filters || [], focus: c.focus,
                iso: look.iso, shutter: c.shutter || sh.shutter || look.shutter, fps: c.fps || sh.fps || look.fps, wb: look.wb,
                status,
                sound: sh.mos ? 'mos' : 'sync', marks: sh.marks?.[k] || null, extra,
                circled: status === 'good' && statuses.lastIndexOf('good') === k, // o último GOOD de cada câmera é o circulado
                notes: note,
              })
              takes.push(take)
              for (const ph of sh.photos?.[k] || []) {
                if (ph.cam === cam) photoSpecs.push({ ...ph, take, look: sc.look, label: `${sc.number}/${sh.code} · T${k + 1} · CAM ${cam}` })
              }
            }
          }
        }
      }
    }
  })

  const photos = []
  const blobs = []
  for (const [i, ph] of photoSpecs.entries()) {
    const { blob, width, height } = await drawRef(ph)
    const id = uuid()
    blobs.push({ id, blob, pending: 1 })
    photos.push(mark({ id, project_id: p.id, take_id: ph.take.id, path: `${p.id}/${ph.take.id}/${id}.jpg`, width, height,
      caption: ph.caption, created_by: uid, created_at: new Date(Date.parse(ph.take.recorded_at) + 60000 + i).toISOString() }))
  }

  await db.transaction('rw', [db.scenes, db.shots, db.takes, db.take_photos, db.photo_blobs], async () => {
    await db.scenes.bulkPut(scenes)
    await db.shots.bulkPut(shots)
    await db.takes.bulkPut(takes)
    await db.photo_blobs.bulkPut(blobs)
    await db.take_photos.bulkPut(photos)
  })
  scheduleSync()
  return p
}

// ---------------------------------------------------------------------------------------------------------------
// Fotos de referência fictícias, desenhadas no aparelho (sem baixar nada): céu/ambiente do set, uma cena simples do
// assunto e a identificação no canto, como uma foto de continuidade tirada do monitor.
const SKY = {
  intDia: ['#d8c7a8', '#9c8466', '#6b5a45'],
  extDia: ['#5f9fd8', '#cfe6fb', '#7d8a6a'],
  intNoite: ['#2a1a10', '#6b4323', '#1b120b'],
  extNoite: ['#070b1c', '#1c2a4f', '#111418'],
  entardecer: ['#f39a4f', '#7b4f95', '#2d2233'],
}

async function drawRef({ kind, look, label }) {
  const W = 1280
  const H = 720
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')
  if (!g.roundRect) g.roundRect = (x, y, w, h) => g.rect(x, y, w, h) // navegadores antigos
  const [top, bottom, ground] = SKY[look] || SKY.extDia
  const sky = g.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, top)
  sky.addColorStop(1, bottom)
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  const horizon = H * 0.64
  g.fillStyle = ground
  g.fillRect(0, horizon, W, H - horizon)

  const person = (x, y, s, color = '#161616') => {
    g.fillStyle = color
    g.beginPath(); g.arc(x, y - 150 * s, 38 * s, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.roundRect(x - 55 * s, y - 108 * s, 110 * s, 220 * s, 30 * s); g.fill()
  }
  const buildings = (color, seed) => {
    g.fillStyle = color
    for (let i = 0; i < 14; i++) {
      const w = 60 + ((i * 53 + seed) % 70)
      const h = 80 + ((i * 97 + seed) % 200)
      g.fillRect(i * 95 - 20, horizon - h, w, h)
    }
  }
  const lights = (n, color) => {
    g.fillStyle = color
    for (let i = 0; i < n; i++) g.fillRect((i * 137) % W, horizon - 20 - ((i * 71) % 220), 6, 6)
  }

  switch (kind) {
    case 'road':
      g.fillStyle = '#1e1e22'; g.beginPath(); g.moveTo(W * 0.45, horizon); g.lineTo(W * 0.55, horizon); g.lineTo(W, H); g.lineTo(0, H); g.fill()
      g.strokeStyle = '#e9d36b'; g.setLineDash([40, 40]); g.lineWidth = 8
      g.beginPath(); g.moveTo(W / 2, horizon); g.lineTo(W / 2, H); g.stroke(); g.setLineDash([])
      g.fillStyle = '#ff7a1a'; g.beginPath(); g.moveTo(1080, 640); g.lineTo(1110, 560); g.lineTo(1140, 640); g.fill()
      g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(560, horizon + 30, 14, 0, 7); g.arc(700, horizon + 30, 14, 0, 7); g.fill()
      break
    case 'car':
      g.fillStyle = '#0d0d0f'; g.fillRect(0, H * 0.7, W, H * 0.3)
      g.strokeStyle = '#2b2b30'; g.lineWidth = 30; g.beginPath(); g.arc(W * 0.3, H * 0.95, 150, Math.PI, 0); g.stroke()
      person(W * 0.62, H * 0.72, 1.3, '#3a2a20')
      g.fillStyle = '#7fd1ff'; g.fillRect(W * 0.08, H * 0.1, 90, 150) // brilho do celular / painel
      break
    case 'room': case 'office':
      g.fillStyle = kind === 'room' ? '#efe6d6' : '#cfd6db'; g.fillRect(W * 0.62, 90, 300, 260) // janela
      g.fillStyle = kind === 'room' ? '#6e4f3a' : '#3d4750'; g.fillRect(120, horizon - 40, 620, 120) // cama / mesa
      if (kind === 'office') { g.fillStyle = '#1fbf4d'; g.fillRect(260, horizon - 190, 230, 140) } // monitor em verde
      person(kind === 'room' ? 420 : 820, horizon + 40, 1)
      break
    case 'phone':
      g.fillStyle = '#6b5a45'; g.fillRect(0, 0, W, H)
      g.fillStyle = '#111'; g.beginPath(); g.roundRect(470, 90, 340, 560, 40); g.fill()
      g.fillStyle = '#ffffff'
      for (const [x, y] of [[520, 150], [760, 150], [640, 370], [520, 590], [760, 590]]) {
        g.fillRect(x - 12, y - 2, 24, 4); g.fillRect(x - 2, y - 12, 4, 24)
      }
      break
    case 'face': case 'person':
      person(W / 2, H + 80, 2.4, kind === 'face' ? '#5a4030' : '#222')
      if (kind === 'person') { g.fillStyle = '#d9d9d9'; g.fillRect(W / 2 - 70, H - 180, 40, 55) } // crachá
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(W / 2 + 40, H * 0.36, 9, 0, 7); g.fill()
      break
    case 'street': case 'sun': case 'sky':
      buildings('#56606a', kind.length * 31)
      if (kind === 'street') { g.fillStyle = '#b8bec4'; g.fillRect(820, horizon + 60, 300, 90); g.fillStyle = '#333'; g.fillRect(300, horizon - 260, 14, 330) }
      if (kind === 'sun') {
        const f = g.createRadialGradient(120, 90, 10, 120, 90, 320)
        f.addColorStop(0, 'rgba(255,245,210,1)'); f.addColorStop(1, 'rgba(255,245,210,0)')
        g.fillStyle = f; g.fillRect(0, 0, W, H)
      }
      if (kind === 'sky') { g.fillStyle = 'rgba(200,205,210,0.85)'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(200 + i * 230, 120 + (i % 2) * 50, 160, 50, 0, 0, 7); g.fill() } }
      person(W * 0.45, horizon + 110, 0.8)
      break
    case 'bar': case 'chart':
      g.fillStyle = '#3b2415'; g.fillRect(0, horizon, W, 60) // balcão
      lights(18, '#ffb347')
      g.fillStyle = 'rgba(220,240,255,0.55)'; g.fillRect(560, horizon - 130, 70, 130) // copo
      g.fillStyle = 'rgba(214,160,60,0.9)'; g.fillRect(560, horizon - 65, 70, 65)
      if (kind === 'chart') {
        const colors = ['#735244', '#c29682', '#627a9d', '#576c43', '#8580b1', '#67bdaa', '#d67e2c', '#505ba6', '#c15a63', '#5e3c6c', '#9dbc40', '#e0a32e',
          '#383d96', '#469449', '#af363c', '#e7c71f', '#bb5695', '#0885a1', '#f3f3f2', '#c8c8c8', '#a0a0a0', '#7a7a79', '#555555', '#343434']
        colors.forEach((col, i) => { g.fillStyle = col; g.fillRect(760 + (i % 6) * 70, 170 + Math.floor(i / 6) * 70, 62, 62) })
        const ball = g.createRadialGradient(330, 280, 10, 350, 300, 110)
        ball.addColorStop(0, '#ffffff'); ball.addColorStop(0.4, '#9aa3ad'); ball.addColorStop(1, '#2b2f35')
        g.fillStyle = ball; g.beginPath(); g.arc(350, 300, 110, 0, 7); g.fill()
      } else person(900, horizon + 20, 1.1, '#20150e')
      break
    case 'lamp':
      g.fillStyle = '#2a2a2e'; g.fillRect(250, 120, 16, horizon - 120)
      g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(258, 120, 28, 0, 7); g.fill()
      g.fillStyle = 'rgba(255,233,168,0.18)'; g.beginPath(); g.moveTo(258, 130); g.lineTo(60, H); g.lineTo(460, H); g.fill()
      person(760, horizon + 90, 1)
      break
    case 'sunset': case 'city':
      buildings(kind === 'city' ? '#0e1320' : '#3a2940', 17)
      if (kind === 'city') lights(60, '#ffd27a')
      else { g.fillStyle = '#ffd08a'; g.beginPath(); g.arc(W * 0.7, horizon - 30, 60, 0, 7); g.fill() }
      person(W * 0.4, horizon + 120, 0.9, '#0a0a0a')
      if (kind === 'sunset') person(W * 0.48, horizon + 120, 0.95, '#0a0a0a')
      break
    default:
      person(W / 2, horizon + 80, 1)
  }

  // moldura de monitor + identificação
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3
  const m = 40
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    g.beginPath(); g.moveTo(x, y + dy * 50); g.lineTo(x, y); g.lineTo(x + dx * 50, y); g.stroke()
  }
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(m + 10, H - m - 62, 470, 48)
  g.fillStyle = '#f5b301'; g.font = 'bold 30px monospace'; g.textBaseline = 'middle'
  g.fillText(label, m + 26, H - m - 38)

  const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao desenhar a foto'))), 'image/jpeg', 0.8))
  return { blob, width: W, height: H }
}

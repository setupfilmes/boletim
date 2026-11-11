// Testes do protocolo Bluetooth Blackmagic com bytes reais da Pocket 4K (firmware 9.8).
// Fonte dos bytes: CCU_Bridge_V2/logs/camera_menu_2026-11-05.log e test/test_core/test_main.cpp do CCU Bridge.
// Rodar: node --test tests/bmd-protocol.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCommand, parseMessages, decodeValue, applyMessage, parseTimecode, detectGap, cameraFields, tcDuration, TYPE, cmd, toHex, fromHex } from '../src/lib/bmd/protocol.js'

const apply = (state, hex) => parseMessages(fromHex(hex)).reduce(applyMessage, state)

test('monta comandos iguais aos que a câmera aceitou', () => {
  assert.equal(toHex(buildCommand(1, 2, TYPE.int16, [5600, -10])), 'FF080000010202' + '00E015F6FF')
  assert.equal(toHex(buildCommand(1, 12, TYPE.int32, 48)), 'FF080000010C030030000000')
  assert.equal(toHex(buildCommand(1, 14, TYPE.int32, 400)), 'FF080000010E030090010000')
  // Íris 0,5 em ponto fixo, agora com preenchimento até 12 bytes
  assert.equal(toHex(buildCommand(0, 2, TYPE.fixed16, 0.5)), 'FF0600000002800000040000')
  // Nome do projeto "CCU" (12.8) — igual ao comando cru da tela de teste do CCU Bridge
  assert.equal(toHex(cmd.project('CCU')), 'FF0700000C08050043435500')
  // Gravar (BlueMagic32)
  assert.equal(toHex(cmd.record(true)), 'FF0500000A01010002000000')
  assert.equal(toHex(cmd.record(false)), 'FF0500000A01010000000000')
})

test('todo comando sai com tamanho múltiplo de 4', () => {
  for (const c of [cmd.scene('12A'), cmd.take(3), cmd.goodTake(true), cmd.cameraId('A'), cmd.reel(4), cmd.project('Noite Adentro')]) {
    assert.equal(c.length % 4, 0)
    const padding = c.length - 4 - c[1] // tamanho declarado não conta os 4 primeiros bytes nem o preenchimento
    assert.ok(padding >= 0 && padding < 4)
  }
  assert.equal(toHex(cmd.take(34)), 'FF0600000C03010022FF0000')
  assert.equal(toHex(cmd.goodTake(true)), 'FF0500000C04000001000000')
})

test('separa várias mensagens numa indicação só e ignora a marca vazia', () => {
  const msgs = parseMessages(fromHex('FF0500000C020502310000' + '00' + 'FF040000FFFFFFFF' + 'FF0500000C05050241000000'))
  assert.equal(msgs.length, 2)
  assert.equal(decodeValue(msgs[0]), '1')
  assert.equal(decodeValue(msgs[1]), 'A')
})

test('lê gravação, formato e claquete das mensagens reais', () => {
  let s = {}
  s = apply(s, 'FF0A00000A010102000040000100') // parada, cartão 2
  assert.equal(s.recording, false)
  assert.equal(s.activeCard, 2)
  s = apply(s, 'FF0A00000A010102020040000100') // gravando
  assert.equal(s.recording, true)
  s = apply(s, 'FF0600000A0001020304')
  assert.equal(s.codec, 'Blackmagic RAW')
  assert.equal(s.codecVariant, '8:1')
  s = apply(s, 'FF0E0000010902021E001E00001070080300')
  assert.deepEqual([s.fps, s.width, s.height], [30, 4096, 2160])
  s = apply(s, 'FF080000010E030290010000')
  assert.equal(s.iso, 400)
  // claquete
  s = apply(s, 'FF0800000C00020204000100')
  s = apply(s, 'FF0500000C02050231')
  s = apply(s, 'FF0700000C010102FF0101')
  s = apply(s, 'FF0600000C03010222FF')
  s = apply(s, 'FF0500000C04000200')
  s = apply(s, 'FF0500000C05050241')
  s = apply(s, 'FF0400000C060502')
  s = apply(s, 'FF0D00000C0F05024E65787420436C6970')
  assert.equal(s.slate.reel, 4)
  assert.equal(s.slate.scene, '1')
  assert.equal(s.slate.take, 34)
  assert.equal(s.slate.goodTake, false)
  assert.equal(s.slate.cameraId, 'A')
  assert.equal(s.slate.operator, '')
  assert.equal(s.slate.intExt, 'INT')
  assert.equal(s.slate.dayNight, 'DIA')
  assert.equal(s.slate.slateName, 'Next Clip')
})

test('mensagem desconhecida não muda o estado', () => {
  const s = { recording: false }
  assert.equal(apply(s, 'FF060000090801020001'), s)
})

test('timecode em BCD, descartando o marcador da hora', () => {
  // 22:29:48:12 → FF SS MM HH = 12 48 29 22; com o bit mais alto da hora ligado (0x80)
  const tc = parseTimecode(fromHex('FF080000' + '070000' + '00' + '124829A2'))
  assert.equal(tc.text, '22:29:48:12')
  assert.equal(tc.flags, 2)
  assert.equal(parseTimecode(fromHex('00000001')).text, '01:00:00:00')
  assert.equal(parseTimecode(new Uint8Array(2)), null)
})

test('descobre o que rodou sem conexão pelo nº do take e pelo tempo do cartão', () => {
  const at = Date.now() - 600e3
  const before = { at, take: 5, scene: '12A', recording: false, activeCard: 2, cardSeconds: [0, 3000, 0, 0], format: 'BRAW|8:1|24|4096' }
  const now = { take: 8, activeCard: 2, cardSeconds: [0, 2880, 0, 0], format: 'BRAW|8:1|24|4096' }
  const gap = detectGap(before, now)
  assert.deepEqual(gap.takes, [5, 6, 7])
  assert.equal(gap.approxSeconds, 120)
  assert.equal(gap.scene, '12A')
  // caiu durante o REC do take 5: ele já está na lista, sobram 6 e 7
  assert.deepEqual(detectGap({ ...before, recording: true }, now).takes, [6, 7])
  // formato mudou: tempo do cartão não vale, mas o take sim
  const g2 = detectGap(before, { ...now, format: 'ProRes|HQ|24|4096' })
  assert.deepEqual([g2.takes.length, g2.approxSeconds], [3, null])
  // nada mudou
  assert.equal(detectGap(before, { ...now, take: 5, cardSeconds: [0, 3000, 0, 0] }), null)
  // take voltou (mudado à mão) e cartão igual: não inventa nada
  assert.equal(detectGap(before, { ...now, take: 1, cardSeconds: [0, 3000, 0, 0] }), null)
  // retrato velho (outra diária)
  assert.equal(detectGap({ ...before, at: Date.now() - 20 * 3600e3 }, now), null)
  // sem retrato (primeira conexão)
  assert.equal(detectGap(null, now), null)
})

test('dados da câmera viram campos do take no formato do kit', () => {
  let s = {}
  s = apply(s, 'FF0E0000010902021E001E00001070080300') // 30 fps com flags M-rate = 29.97, 4096x2160
  s = apply(s, 'FF080000010E030290010000') // ISO 400
  s = apply(s, 'FF08000001020202E0150000') // WB 5600
  s = apply(s, 'FF0600000A0001020304') // BRAW 8:1
  s = apply(s, 'FF080000010B0302' + '50460000') // ângulo 18000 = 180°
  const { fields, extra } = cameraFields(s)
  assert.deepEqual(fields, { iso: '400', shutter: '180°', fps: '29.97', wb: '5600K' })
  assert.deepEqual(extra, { codec: 'BRAW 8:1', resolution: '4K DCI' })
  assert.equal(cameraFields({ shutter: 50 }).fields.shutter, '1/50')
  assert.equal(cameraFields({ shutterAngle: 172.8 }).fields.shutter, '172.8°')
  // slow motion: arquivo 24, sensor 48 fora da velocidade
  assert.equal(cameraFields({ fps: 24, sensorFps: 48, offSpeed: true }).fields.fps, '48')
  assert.deepEqual(cameraFields({}), { fields: {}, extra: {} })
})

test('duração pelo timecode', () => {
  assert.equal(tcDuration('14:02:10:05', '14:02:50:12', 24), '0:40')
  assert.equal(tcDuration('23:59:50:00', '00:00:20:00', 25), '0:30')
  assert.equal(tcDuration('', '14:02:50:12', 24), null)
  assert.equal(tcDuration('14:02:10:05', '14:02:50:12', null), null)
})

test('Sony: aviso de gravação e botão REC do controle remoto', async () => {
  const { parseSonyNotify, sonyCommand, SONY_BUTTON } = await import('../src/lib/bmd/sony.js')
  assert.equal(parseSonyNotify(new Uint8Array([0x02, 0xd5, 0x20])).recording, true)
  assert.equal(parseSonyNotify(new Uint8Array([0x02, 0xd5, 0x00])).recording, false)
  assert.equal(parseSonyNotify(new Uint8Array([0x02, 0x3f, 0x20])).focus, true)
  assert.equal(parseSonyNotify(new Uint8Array([0x02, 0x3f, 0x20])).recording, undefined)
  assert.equal(parseSonyNotify(new Uint8Array([0x01, 0xd5])), null)
  assert.equal(toHex(sonyCommand(SONY_BUTTON.recordDown)), '010F')
  assert.equal(toHex(sonyCommand(SONY_BUTTON.recordUp)), '010E')
})

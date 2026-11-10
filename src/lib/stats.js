// Contagens por cena para os cartões (CenaCard): planos com take, takes da claquete, GOOD e circulados.
// `date` limita a uma diária. Planos vinculados contam como uma claquete (takeKey).
import { takeKey } from './cameras'

export function statsByScene(takes, shots, date = null) {
  const shotsById = Object.fromEntries((shots || []).map((s) => [s.id, s]))
  const acc = {}
  for (const t of takes || []) {
    if (date && t.shoot_date !== date) continue
    const o = (acc[t.scene_id] ||= { planos: new Set(), takes: new Set(), good: new Set(), circ: new Set() })
    const k = takeKey(t, shotsById)
    o.planos.add(t.shot_id)
    o.takes.add(k)
    if (t.status === 'good') o.good.add(k)
    if (t.circled) o.circ.add(k)
  }
  const out = {}
  for (const [id, o] of Object.entries(acc)) {
    out[id] = { planos: o.planos.size, takes: o.takes.size, good: o.good.size, circulados: o.circ.size }
  }
  return out
}

// Cena no formato do cartão: período vira DIA/NOITE (amanhecer/entardecer contam como dia/noite no ícone)
export const sceneCardProps = (s) => ({
  numero: s.number,
  intExt: s.int_ext || undefined,
  diaNoite: s.period || undefined,
  locacao: s.location || undefined,
  descricao: s.description || undefined,
})

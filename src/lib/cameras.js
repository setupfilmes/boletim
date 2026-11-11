import { natCompare } from './util'

// Multicâmera: as câmeras do projeto ficam em project.kit.cameras = [{ id: 'A', body: 'Alexa Mini LF' }, ...]
// (dentro do jsonb `kit` — sem mudança de schema). Com 2+ câmeras o projeto é multicâmera:
// cada take da claquete vira uma linha por câmera (mesmo shot_id + take_number, `camera` diferente).
// Uma linha por câmera = dois aparelhos nunca editam a mesma linha (a sync é "último envio vence" por linha).

export function projectCameras(project) {
  const list = project?.kit?.cameras
  return Array.isArray(list) ? list.filter((c) => c && c.id) : []
}

export const isMulticam = (project) => projectCameras(project).length >= 2

// Ordena câmeras pela ordem do projeto; as que não estão no projeto vão para o fim, em ordem alfabética
export function cameraOrder(project) {
  const ids = projectCameras(project).map((c) => c.id)
  const rank = (c) => {
    const i = ids.indexOf(c ?? '')
    return i < 0 ? ids.length : i
  }
  return (a, b) => rank(a) - rank(b) || String(a ?? '').localeCompare(String(b ?? ''))
}

// Mesmo take da claquete (todas as câmeras). Com `shotsById`, planos vinculados (link_id) contam como um só:
// 12A take 3 (câmera A) e 12B take 3 (câmera B) são a mesma claquete.
// Clipe que não é take (falso REC, ensaio, wild, insert) nunca se junta a um take: chave própria.
export const takeKey = (t, shotsById) => (t.clip_type ? `clip#${t.id}`
  : `${shotsById?.[t.shot_id]?.link_id || t.shot_id}#${t.take_number}`)

// Planos que rodam junto com este (mesmo link_id, mesma cena), incluindo ele mesmo, em ordem de código
export function linkedShots(shot, shots) {
  if (!shot?.link_id) return shot ? [shot] : []
  const list = (shots || []).filter((s) => !s.deleted && s.link_id === shot.link_id)
  return (list.some((s) => s.id === shot.id) ? list : [shot, ...list]).sort((a, b) => natCompare(a.code, b.code))
}

// Câmeras definidas para o plano (null = segue o take anterior)
export const shotCameras = (shot) => (Array.isArray(shot?.cameras) && shot.cameras.length ? shot.cameras : null)

// "12A", "3.1" — número da cena + código do plano
export const shotLabel = (scene, shot) => `${scene?.number ?? ''}${/^\d/.test(shot?.code ?? '') ? '.' : ''}${shot?.code ?? ''}`

// Agrupa linhas de take por número (mais recente primeiro); cada grupo tem as linhas ordenadas por câmera.
// Clipe com clip_type (falso REC, ensaio…) é um grupo à parte (clipType), antes do take de mesmo número.
export function groupTakes(takes, project) {
  const cmp = cameraOrder(project)
  const m = new Map()
  for (const t of takes || []) {
    const k = t.clip_type ? `c:${t.id}` : t.take_number
    if (!m.has(k)) m.set(k, { number: t.take_number, clipType: t.clip_type || null, rows: [], at: t.recorded_at || t.created_at || '' })
    m.get(k).rows.push(t)
  }
  return [...m.values()]
    .sort((a, b) => b.number - a.number || (a.clipType ? 1 : 0) - (b.clipType ? 1 : 0) || String(b.at).localeCompare(String(a.at)))
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => cmp(a.camera, b.camera)) }))
}
// Grupo do take N (ignora falso REC / ensaio com o mesmo número)
export const findTake = (groups, n) => groups.find((g) => g.number === n && !g.clipType)

// Quantos takes distintos (claquete) e quantos têm alguma câmera GOOD
export function countTakes(rows, shotsById) {
  const all = new Set()
  const good = new Set()
  for (const t of rows || []) {
    const k = takeKey(t, shotsById)
    all.add(k)
    if (t.status === 'good') good.add(k)
  }
  return { takes: all.size, good: good.size }
}

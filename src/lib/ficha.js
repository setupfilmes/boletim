// Ficha técnica do projeto (crédito, não acesso). Campos que já existiam continuam nas colunas do projeto
// (title, production_type, company, director, dop, first_ac, second_ac, logger); os novos ficam em
// project.kit.ficha (jsonb, sem mudar o banco): código, ano, vídeo assist e o formato de captação.
// Câmeras: project.kit.cameras = [{ id, body, serial }]. Numeração dos planos: project.kit.numeracao.
import { nextCode, natCompare } from './util'

export const FORMAT_FIELDS = [
  { k: 'codec', label: 'Codec' },
  { k: 'resolucao', label: 'Resolução / sensor' },
  { k: 'fps', label: 'FPS do projeto' },
  { k: 'aspect', label: 'Aspect ratio' },
  { k: 'cor', label: 'Espaço de cor / curva' },
  { k: 'lut', label: 'LUT de set' },
]

export const ficha = (project) => project?.kit?.ficha || {}

// "Formato: ARRIRAW · 4.5K LF · 24 fps · 2.39:1 · LogC4 · LUT K1S1" (vazio se nada preenchido)
export function formatLine(project) {
  const f = ficha(project)
  const parts = [f.codec, f.resolucao, f.fps && `${f.fps} fps`, f.aspect, f.cor, f.lut && `LUT ${f.lut}`].filter(Boolean)
  return parts.length ? parts.join(' · ') : ''
}

// "A: Alexa Mini LF (nº 12345)  B: FX6"
export function camerasLine(project) {
  const cams = project?.kit?.cameras || []
  if (!cams.length) return project?.camera_body || ''
  const one = (c) => `${c.body || ''}${c.serial ? ` (nº ${c.serial})` : ''}`.trim()
  if (cams.length === 1) return one(cams[0]) || project.camera_body || ''
  return cams.filter((c) => c.body || c.serial).map((c) => `${c.id}: ${one(c)}`).join('  ')
}

// Numeração dos planos: só muda o que o app SUGERE para o próximo plano (o código continua livre)
export const NUMERACOES = [
  { id: 'cena', label: 'Cena e número', exemplo: 'Cena 7 · planos 7.1, 7.2, 7.3' },
  { id: 'numeros', label: 'Números, com variações', exemplo: 'Cena 7 · planos 7.1, 7.2, 7.2A, 7.2B' },
  { id: 'letras', label: 'Letras', exemplo: 'Cena 7 · planos 7A, 7B, 7C' },
]
export const numeracao = (project) => project?.kit?.numeracao || 'cena'

// Sugestões de código para um plano novo, conforme a numeração do projeto
export function suggestShotCodes(project, codes) {
  const conv = numeracao(project)
  const sorted = [...codes].sort(natCompare)
  if (conv === 'letras') {
    const letters = sorted.filter((c) => /^[A-Z]+$/i.test(c))
    return [letters.length ? nextCode(letters) : 'A']
  }
  const nums = sorted.filter((c) => /^\d+$/.test(c))
  const nextNum = String(nums.length ? Math.max(...nums.map(Number)) + 1 : 1)
  if (conv === 'cena') return [nextNum]
  // números com variações: o próximo número e a próxima variação de cada número existente (2 → 2A, 2A → 2B)
  const out = [nextNum]
  for (const n of nums.slice().reverse()) {
    const vars = sorted.filter((c) => new RegExp(`^${n}[A-Z]$`, 'i').test(c))
    out.push(vars.length ? nextCode(vars) : `${n}A`)
  }
  return [...new Set(out)].slice(0, 5)
}

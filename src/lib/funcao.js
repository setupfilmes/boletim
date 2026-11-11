// Função de cada pessoa no projeto (decisão do Antonio, 11/11/2026): o dono define na aba Equipe.
// Fica em project.kit.funcoes = { <userId>: 'camera' | 'continuidade' } (sem mudança de banco).
// Cada tela mostra só o que é da função; sem função = vê tudo. Se ninguém da equipe é da Continuidade,
// a assistência de câmera também vê e edita o que seria da continuidade (status, estrelas, nota, som…).
import { update } from './repo'

export const FUNCOES = [
  { value: '', label: 'Tudo' },
  { value: 'camera', label: 'Câmera' },
  { value: 'continuidade', label: 'Continuidade' },
]
export const funcaoDe = (project, uid) => project?.kit?.funcoes?.[uid] || null
export const temContinuidade = (project) => Object.values(project?.kit?.funcoes || {}).includes('continuidade')

// { funcao, camera: vê/edita dados de câmera, continuidade: vê/edita o que é da continuidade }
export function visao(project, uid) {
  const funcao = funcaoDe(project, uid)
  return { funcao, camera: funcao !== 'continuidade', continuidade: funcao !== 'camera' || !temContinuidade(project) }
}

export function setFuncao(project, uid, value) {
  const funcoes = { ...(project.kit?.funcoes || {}) }
  if (value) funcoes[uid] = value
  else delete funcoes[uid]
  return update('projects', project.id, { kit: { ...project.kit, funcoes } })
}

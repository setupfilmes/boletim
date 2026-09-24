import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from './db'
import { natCompare } from './util'
import { sortKit } from './repo'

const alive = (rows) => rows.filter((r) => !r.deleted)

export const useProjects = () =>
  useLiveQuery(async () => alive(await getDb().projects.toArray()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [])

export const useProject = (id) => useLiveQuery(async () => (id ? (await getDb().projects.get(id)) || null : null), [id])

export const useScenes = (projectId) =>
  useLiveQuery(async () => alive(await getDb().scenes.where('project_id').equals(projectId).toArray())
    .sort((a, b) => natCompare(a.number, b.number) || a.sort_order - b.sort_order), [projectId])

export const useScene = (id) => useLiveQuery(async () => (await getDb().scenes.get(id)) || null, [id])

export const useShots = (sceneId) =>
  useLiveQuery(async () => alive(await getDb().shots.where('scene_id').equals(sceneId).toArray())
    .sort((a, b) => natCompare(a.code, b.code) || a.sort_order - b.sort_order), [sceneId])

export const useShot = (id) => useLiveQuery(async () => (await getDb().shots.get(id)) || null, [id])

export const useTakesByShot = (shotId) =>
  useLiveQuery(async () => alive(await getDb().takes.where('shot_id').equals(shotId).toArray())
    .sort((a, b) => b.take_number - a.take_number), [shotId])

export const useTakesByProject = (projectId) =>
  useLiveQuery(async () => alive(await getDb().takes.where('project_id').equals(projectId).toArray()), [projectId])

export const useShotsByProject = (projectId) =>
  useLiveQuery(async () => alive(await getDb().shots.where('project_id').equals(projectId).toArray()), [projectId])

export const useKit = () =>
  useLiveQuery(async () => sortKit(alive(await getDb().kit_items.toArray())), [], [])

// 'owner' | 'editor' | 'viewer'
export function useRole(project, userId) {
  const roles = useLiveQuery(async () => (await getDb().meta.get('roles'))?.value || {}, [], {})
  if (!project) return 'viewer'
  if (project.owner_id === userId) return 'owner'
  return roles[project.id] || 'editor'
}

// Opções de um campo: lentes/filtros usam o kit do projeto (se definido); o resto usa o kit geral
export function kitOptions(kit, project, category) {
  const all = kit.filter((k) => k.category === category).map((k) => k.value)
  const sel = project?.kit?.[category]
  if ((category === 'lens' || category === 'filter') && Array.isArray(sel) && sel.length) {
    return sel.filter((v) => all.includes(v)).concat(sel.filter((v) => !all.includes(v)))
  }
  return all
}

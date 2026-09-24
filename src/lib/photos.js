// Fotos de referência por take. Local primeiro: a imagem fica no aparelho (photo_blobs) e o registro em
// take_photos; a sincronização sobe a imagem para o Storage ANTES de enviar o registro (sync.js).
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { supabase } from './supabase'
import { getDb, currentUserId } from './db'
import { create, update } from './repo'
import { scheduleSync } from './sync'
import { uuid } from './util'

export const PHOTO_BUCKET = 'take-photos'
const MAX_SIDE = 1600
const QUALITY = 0.82

// Reduz para no máx. 1600 px e JPEG (~300 KB) — cabe ~3.000 fotos no 1 GB do plano grátis
async function compress(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file))
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * k)
  const h = Math.round(bmp.height * k)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao processar a foto'))), 'image/jpeg', QUALITY))
  return { blob, width: w, height: h }
}

export async function addPhotos(take, files) {
  const db = getDb()
  const ids = []
  for (const file of files) {
    const { blob, width, height } = await compress(file)
    const id = uuid()
    const path = `${take.project_id}/${take.id}/${id}.jpg`
    await db.photo_blobs.put({ id, blob, pending: 1 })
    await create('take_photos', { id, project_id: take.project_id, take_id: take.id, path, width, height, created_by: currentUserId() })
    ids.push(id)
  }
  scheduleSync()
  return ids
}

// Legenda / motivo da foto ("reflexo no vidro à esquerda", "posição do copo")
export const setPhotoCaption = (photo, caption) => update('take_photos', photo.id, { caption: caption.trim() || null })

// Foto que nunca subiu some só do aparelho; a que já está na nuvem é marcada como excluída (a sync apaga o arquivo)
export async function deletePhoto(photo) {
  const db = getDb()
  const blob = await db.photo_blobs.get(photo.id)
  if (!photo.updated_at && blob?.pending) {
    await db.transaction('rw', db.take_photos, db.photo_blobs, async () => {
      await db.take_photos.delete(photo.id)
      await db.photo_blobs.delete(photo.id)
    })
    return
  }
  await update('take_photos', photo.id, { deleted: true })
}

// Imagem da foto: do aparelho; se não estiver, baixa (com internet) e guarda para ver offline depois
export async function getPhotoBlob(photo) {
  const db = getDb()
  const local = await db.photo_blobs.get(photo.id)
  if (local?.blob) return local.blob
  if (!supabase || !navigator.onLine) return null
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(photo.path)
  if (error || !data) return null
  await db.photo_blobs.put({ id: photo.id, blob: data, pending: 0 })
  return data
}

export function usePhotoUrl(photo) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    let u = null
    setFailed(false)
    getPhotoBlob(photo).then((b) => {
      if (!alive) return
      if (!b) return setFailed(true)
      u = URL.createObjectURL(b)
      setUrl(u)
    })
    return () => { alive = false; if (u) URL.revokeObjectURL(u) }
  }, [photo.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return { url, failed }
}

// Fotos (não excluídas) de vários takes, em ordem de criação
export const useTakePhotos = (takeIds) =>
  useLiveQuery(async () => (takeIds.length
    ? (await getDb().take_photos.where('take_id').anyOf(takeIds).toArray()).filter((p) => !p.deleted)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    : []), [takeIds.join(',')], [])

// Imagem em dataURL para o PDF
export async function photoDataUrl(photo) {
  const b = await getPhotoBlob(photo)
  if (!b) return null
  return new Promise((res) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = () => res(null)
    r.readAsDataURL(b)
  })
}

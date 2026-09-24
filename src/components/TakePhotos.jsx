import { useEffect, useRef, useState } from 'react'
import { Btn, Sheet, TextArea, useDialog } from './ui'
import { IconCamera, IconCheck, IconImage, IconTrash } from './icons'
import { addPhotos, deletePhoto, setPhotoCaption, usePhotoUrl } from '../lib/photos'
import { vibrate } from '../lib/util'

function Thumb({ photo, onClick }) {
  const { url, failed } = usePhotoUrl(photo)
  return (
    <button onClick={onClick} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 border-line bg-surface2"
      aria-label="Ver foto" data-testid="photo-thumb">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" />
        : <span className="flex h-full items-center justify-center text-[10px] text-muted">{failed ? 'offline' : '…'}</span>}
      {photo.caption ? <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[9px] leading-tight text-white" title={photo.caption}>Aa</span> : null}
      {photo._dirty ? <span className="absolute right-0.5 bottom-0.5 h-2 w-2 rounded-full bg-check" title="Ainda não enviada" /> : null}
    </button>
  )
}

// Fotos de referência do take (continuidade, VFX, quadro): câmera do celular ou galeria. Funciona offline.
export default function TakePhotos({ take, photos, canEdit, caption }) {
  const { notify, confirm } = useDialog()
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState(null)
  const open = photos.find((p) => p.id === openId) || null

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    try {
      const ids = await addPhotos(take, files)
      vibrate()
      // Uma foto só: já abre para escrever o motivo
      if (ids.length === 1) setOpenId(ids[0])
      else notify(`${files.length} fotos adicionadas`)
    } catch (err) {
      notify(`Não foi possível adicionar: ${err.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const pickBtn = 'flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line text-muted active:border-accent'
  return (
    <div className="mt-2" data-testid="take-photos">
      <div className="mb-1 text-[11px] uppercase tracking-widest text-muted">Fotos{photos.length ? ` (${photos.length})` : ''}</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p) => <Thumb key={p.id} photo={p} onClick={() => setOpenId(p.id)} />)}
        {canEdit && (
          <>
            <label className={pickBtn} aria-label="Tirar foto">
              <IconCamera size={22} /><span className="text-[10px]">{busy ? '…' : 'Câmera'}</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onFiles} disabled={busy} data-testid="photo-camera" />
            </label>
            <label className={pickBtn} aria-label="Escolher da galeria">
              <IconImage size={22} /><span className="text-[10px]">Galeria</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={onFiles} disabled={busy} data-testid="photo-gallery" />
            </label>
          </>
        )}
        {!canEdit && !photos.length && <span className="py-4 text-sm text-muted/60">Sem fotos</span>}
      </div>
      <PhotoViewer photo={open} caption={caption} canEdit={canEdit} onClose={() => setOpenId(null)}
        onDelete={async (p) => {
          if (await confirm({ title: 'Excluir foto', danger: true, confirmLabel: 'Excluir', message: 'Excluir esta foto de referência?' })) {
            await deletePhoto(p)
            setOpenId(null)
            notify('Foto excluída')
          }
        }} />
    </div>
  )
}

function PhotoViewer({ photo, caption, canEdit, onClose, onDelete }) {
  if (!photo) return null
  return (
    <Sheet open onClose={onClose} title={caption || 'Foto'} tall
      footer={canEdit && <Btn variant="ghost" full className="text-ng" onClick={() => onDelete(photo)}><IconTrash /> Excluir foto</Btn>}>
      <FullPhoto photo={photo} />
      {canEdit ? <CaptionEditor key={photo.id} photo={photo} />
        : photo.caption && <p className="mt-3 whitespace-pre-wrap text-sm" data-testid="photo-caption-text">{photo.caption}</p>}
    </Sheet>
  )
}

// Legenda / motivo: botão Salvar com confirmação visível. Se fechar sem salvar, salva mesmo assim e avisa.
function CaptionEditor({ photo }) {
  const { notify } = useDialog()
  const [text, setText] = useState(photo.caption || '')
  const [saved, setSaved] = useState(photo.caption || '')
  const latest = useRef({ text, saved })
  latest.current = { text, saved }
  const dirty = text.trim() !== saved.trim()
  const save = () => {
    setPhotoCaption(photo, text)
    setSaved(text)
    vibrate()
  }
  useEffect(() => () => {
    const { text: t, saved: s } = latest.current
    if (t.trim() === s.trim()) return
    setPhotoCaption(photo, t)
    notify('Legenda salva')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mt-3">
      <TextArea label="Legenda / motivo" rows={2} value={text} maxLength={500} onChange={(e) => setText(e.target.value)}
        placeholder="Por que esta foto? O que observar (continuidade, reflexo, marca, posição…)" data-testid="photo-caption" />
      <div className="mt-2">
        {dirty
          ? <Btn full onClick={save} data-testid="photo-caption-save"><IconCheck /> Salvar legenda</Btn>
          : saved.trim()
            ? <div className="flex h-11 items-center justify-center gap-2 text-sm font-semibold text-good" data-testid="photo-caption-saved"><IconCheck size={18} /> Legenda salva</div>
            : null}
      </div>
    </div>
  )
}

function FullPhoto({ photo }) {
  const { url, failed } = usePhotoUrl(photo)
  if (failed) return <p className="py-10 text-center text-sm text-muted">Esta foto ainda não está neste aparelho. Conecte à internet para baixar.</p>
  return url ? <img src={url} alt="" className="mx-auto max-h-[50dvh] w-auto max-w-full rounded-xl object-contain" data-testid="photo-full" />
    : <p className="py-10 text-center text-sm text-muted">Carregando…</p>
}

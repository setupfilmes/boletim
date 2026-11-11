// Arrastar para reordenar uma lista vertical pela alça (⠿). Funciona com dedo, mouse e caneta (Pointer Events),
// e pelo teclado (alça focada + ↑/↓). Enquanto arrasta, os outros itens abrem espaço; perto da borda, rola sozinho.
// Ao soltar, chama onMove(idsNaOrdemNova) e mostra a ordem nova na hora, até os dados chegarem do banco.
import { useCallback, useEffect, useRef, useState } from 'react'

const EDGE = 70 // px da borda onde começa a rolar sozinho
const SPEED = 14 // px por quadro

export function moveItem(list, from, to) {
  const out = [...list]
  const [x] = out.splice(from, 1)
  out.splice(to, 0, x)
  return out
}

function scrollParent(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null // a página
}

export function useDragReorder(ids, onMove, { disabled = false } = {}) {
  const key = ids.join('|')
  const [pending, setPending] = useState(null) // ordem nova, até o banco confirmar
  const [drag, setDrag] = useState(null) // { id, from, to, dy, shift }
  const els = useRef(new Map())
  const live = useRef(null)
  const moveRef = useRef(onMove) // a função muda a cada desenho; o arrasto usa sempre a mais nova
  moveRef.current = onMove

  // Dados novos chegaram com a ordem pedida (ou outra mudança qualquer): solta a ordem provisória
  useEffect(() => { setPending(null) }, [key])
  const list = pending && pending.length === ids.length && pending.every((id) => ids.includes(id)) ? pending : ids

  const finish = useCallback((commit) => {
    const d = live.current
    if (!d) return
    live.current = null
    cancelAnimationFrame(d.raf)
    window.removeEventListener('pointermove', d.onMoveEv)
    window.removeEventListener('pointerup', d.onUp)
    window.removeEventListener('pointercancel', d.onCancel)
    setDrag(null)
    if (commit && d.to !== d.from) {
      const next = moveItem(d.list, d.from, d.to)
      setPending(next)
      moveRef.current(next)
    }
  }, [])

  useEffect(() => () => finish(false), [finish])

  const start = (id, e) => {
    if (disabled || live.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault()
    const from = list.indexOf(id)
    const rects = list.map((x) => els.current.get(x)?.getBoundingClientRect())
    if (from < 0 || rects.some((r) => !r)) return
    const scroller = scrollParent(els.current.get(id))
    const scrollTop = () => (scroller ? scroller.scrollTop : window.scrollY)
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 8
    const d = {
      id, from, to: from, list, rects, gap, scroller, startY: e.clientY, startScroll: scrollTop(), y: e.clientY, raf: 0,
    }
    const update = () => {
      const dy = d.y - d.startY + (scrollTop() - d.startScroll)
      const r = d.rects[d.from]
      const center = r.top + r.height / 2 + dy
      let to = 0
      d.rects.forEach((rr, i) => { if (i !== d.from && center > rr.top + rr.height / 2) to++ })
      d.to = to
      setDrag({ id, from: d.from, to, dy, shift: r.height + d.gap })
    }
    // rola sozinho perto da borda (da lista ou da janela)
    const tick = () => {
      if (live.current !== d) return
      const box = d.scroller ? d.scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
      const v = d.y < box.top + EDGE ? -SPEED : d.y > box.bottom - EDGE ? SPEED : 0
      if (v) { if (d.scroller) d.scroller.scrollTop += v; else window.scrollBy(0, v); update() }
      d.raf = requestAnimationFrame(tick)
    }
    d.onMoveEv = (ev) => { d.y = ev.clientY; update() }
    d.onUp = () => finish(true)
    d.onCancel = () => finish(false)
    live.current = d
    window.addEventListener('pointermove', d.onMoveEv)
    window.addEventListener('pointerup', d.onUp)
    window.addEventListener('pointercancel', d.onCancel)
    d.raf = requestAnimationFrame(tick)
    setDrag({ id, from, to: from, dy: 0, shift: rects[from].height + gap })
  }

  const onKey = (id, e) => {
    if (disabled || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const from = list.indexOf(id)
    const to = from + (e.key === 'ArrowUp' ? -1 : 1)
    if (to < 0 || to >= list.length) return
    const next = moveItem(list, from, to)
    setPending(next)
    moveRef.current(next)
  }

  return {
    list,
    dragging: drag?.id ?? null,
    itemRef: (id) => (el) => { if (el) els.current.set(id, el); else els.current.delete(id) },
    handleProps: (id) => ({ onPointerDown: (e) => start(id, e), onKeyDown: (e) => onKey(id, e) }),
    itemStyle: (id) => {
      if (!drag) return undefined
      if (id === drag.id) return { transform: `translateY(${drag.dy}px)`, position: 'relative', zIndex: 20, boxShadow: '0 12px 28px rgba(0,0,0,.35)', borderRadius: 16 }
      const i = list.indexOf(id)
      let y = 0
      if (drag.from < drag.to && i > drag.from && i <= drag.to) y = -drag.shift
      if (drag.to < drag.from && i >= drag.to && i < drag.from) y = drag.shift
      return { transform: `translateY(${y}px)`, transition: 'transform 150ms ease' }
    },
  }
}

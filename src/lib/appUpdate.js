// Atualização manual do app (botão em Conta). Apaga só a cópia offline do app (Cache Storage + service worker) e
// recarrega da internet. Projetos, takes e fotos ficam no IndexedDB e não são tocados.
const scriptName = (html) => html.match(/assets\/index-[\w-]+\.js/)?.[0] || null

// Versão em uso x versão publicada (lê o index.html do servidor, sem passar pelo cache offline)
export async function checkLatest() {
  const current = scriptName(document.documentElement.outerHTML)
  const res = await fetch(`${location.pathname}index.html?v=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Servidor respondeu ${res.status}`)
  const latest = scriptName(await res.text())
  return { current, latest, upToDate: !!current && current === latest }
}

export async function hardUpdate() {
  const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
  await Promise.all(regs.map((r) => r.unregister()))
  if (typeof caches !== 'undefined') await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  location.replace(`${location.pathname}${location.search}#/conta`)
  location.reload()
}

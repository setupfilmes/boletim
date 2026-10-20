// Convite por link (WhatsApp). O link é …/boletim/#/convite/<token>. Ao abrir, o token fica guardado no aparelho
// (localStorage) até a pessoa estar logada — mesmo que precise entrar ou criar conta antes — e então é aceito.
const KEY = 'boletim.pendingInvite'
const RE = /^#\/convite\/([a-f0-9]{32})/i

export function captureInviteFromUrl() {
  const m = location.hash.match(RE)
  if (!m) return
  try { localStorage.setItem(KEY, m[1].toLowerCase()) } catch { /* sem storage */ }
  history.replaceState(null, '', `${location.pathname}${location.search}#/`)
}

export function getPendingInvite() {
  try { return localStorage.getItem(KEY) } catch { return null }
}

export function clearPendingInvite() {
  try { localStorage.removeItem(KEY) } catch { /* sem storage */ }
}

export const inviteUrl = (token) => `${location.origin}${location.pathname}#/convite/${token}`

export const inviteText = (project, role, url) =>
  `Olá! Te convidei para o projeto "${project.title}" no Boletim de Câmera (${role === 'viewer' ? 'só visualizar' : 'pode editar'}).\n`
  + `Abra o link para entrar — se ainda não tiver conta, dá para criar na hora:\n${url}`

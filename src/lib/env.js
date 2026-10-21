// Em qual ambiente o app está rodando. Produção = GitHub Pages (setupfilmes.github.io). Teste = build com
// APP_ENV=test (Cloudflare Pages, ramo dev) ou qualquer outro endereço público que não seja o de produção.
const host = typeof location !== 'undefined' ? location.hostname : ''
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)
export const IS_TEST = __APP_ENV__ === 'test' || (!local && !host.endsWith('github.io'))

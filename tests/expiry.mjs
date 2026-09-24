import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'app', '-At', '-c', q]).toString().trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const FLAG = '/tmp/claude-0/stack/offline.flag'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
const a = await ctx.newPage()
a.on('pageerror', (e) => console.log('PAGEERR', e.message))
await a.goto('http://localhost:8080/')
await a.getByLabel('E-mail').fill('antonio@test.com'); await a.getByLabel('Senha').fill('123456')
await a.getByRole('button', { name: 'Entrar' }).click()
await a.getByText('A Tela').waitFor()
await sleep(3000)
console.log('logged in; going offline for 115s (token TTL 100s)')
await ctx.setOffline(true); fs.writeFileSync(FLAG, '1')
await sleep(115000)
await a.reload()
await a.getByText('A Tela').waitFor({ timeout: 15000 })
console.log('✔ after token expiry + offline reload: projects visible; badge =', await a.getByTestId('sync-badge').getAttribute('aria-label'))
await a.getByText('A Tela').click()
await a.getByRole('button', { name: 'Cena', exact: true }).click()
await a.getByLabel('Número da cena').fill('99X')
await a.getByRole('button', { name: 'Criar cena' }).click()
await a.getByText('Cena 99X').waitFor()
console.log('✔ created scene 99X offline with expired token')
fs.unlinkSync(FLAG); await ctx.setOffline(false)
await a.evaluate(() => window.dispatchEvent(new Event('online')))
let ok = false
for (let i = 0; i < 90; i++) { if (sql("select count(*) from scenes where number='99X'") === '1') { ok = true; break } await sleep(1000) }
console.log(ok ? '✔ back online: session refreshed and scene synced' : '✘ scene NOT synced after 90s', '; badge =', await a.getByTestId('sync-badge').getAttribute('aria-label'))
await browser.close()

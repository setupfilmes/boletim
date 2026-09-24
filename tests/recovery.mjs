import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'
const b64u = (b) => Buffer.from(b).toString('base64url')
const sign = (p) => { const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })); const pl = b64u(JSON.stringify(p)); return `${h}.${pl}.${crypto.createHmac('sha256', SECRET).update(`${h}.${pl}`).digest('base64url')}` }
const uid = execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'app', '-At', '-c', "select id from auth.users where email='b@test.com'"]).toString().trim()
const now = Math.floor(Date.now() / 1000)
const at = sign({ sub: uid, role: 'authenticated', aud: 'authenticated', email: 'b@test.com', exp: now + 3600, iat: now })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
const a = await ctx.newPage()
a.on('pageerror', (e) => console.log('PAGEERR', e.message))
await a.goto(`http://localhost:8080/#access_token=${at}&expires_at=${now + 3600}&expires_in=3600&refresh_token=abc&token_type=bearer&type=recovery`)
await a.getByText('Nova senha').first().waitFor({ timeout: 10000 })
console.log('✔ recovery link opens "Nova senha"; url =', a.url().slice(0, 60))
await a.getByLabel('Nova senha').fill('654321')
await a.getByRole('button', { name: 'Salvar senha' }).click()
await a.getByText('A Tela').waitFor({ timeout: 10000 })
console.log('✔ after new password: projects list; url =', a.url())
await browser.close()

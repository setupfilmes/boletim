import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const URL = 'http://localhost:8080/'
const OUT = '/var/lib/pwtest/shots'
fs.mkdirSync(OUT, { recursive: true })
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'app', '-At', '-c', q]).toString().trim()
const log = (...a) => console.log('✔', ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function assert(c, m) { if (!c) throw new Error('ASSERT: ' + m) }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch())
const mobile = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true }

const ctxA = await browser.newContext(mobile)
const a = await ctxA.newPage()
const errors = []
a.on('pageerror', (e) => errors.push(e.message))
a.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
const overflow = []
const shot = async (p, n) => {
  const w = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  if (w[0] > w[1]) overflow.push(`${n}: ${w[0]}>${w[1]}`)
  await p.screenshot({ path: `${OUT}/${n}.png` })
}

try {
await a.goto(URL)
await a.getByText('Criar uma conta nova').click()
await a.getByLabel('Seu nome').fill('Antonio')
await a.getByLabel('E-mail').fill('antonio@test.com')
await a.getByLabel('Senha').fill('123456')
await shot(a, '01-signup')
await a.getByRole('button', { name: 'Criar conta' }).click()
await a.getByText('Nenhum projeto ainda').waitFor()
log('signup + empty state')
await shot(a, '02-empty')

await a.getByRole('button', { name: /Criar exemplo/ }).click()
await a.getByText('Apartamento').first().waitFor()
const sceneCount = await a.locator('main .font-display.text-3xl').count()
assert(sceneCount === 32, `32 scenes, got ${sceneCount}`)
log('example project with 32 scenes')
await shot(a, '03-scenes')

// Cena 1 -> novo plano
await a.locator('main button', { hasText: 'Apartamento' }).first().click()
await a.getByRole('button', { name: /Novo plano/ }).click()
await a.getByRole('button', { name: 'PG', exact: true }).click()
await shot(a, '04-new-shot')
await a.getByRole('button', { name: 'Criar e abrir' }).click()
await a.getByTestId('add-take').waitFor()
await a.getByTestId('add-take').click()
await a.getByText('TAKE 1', { exact: true }).waitFor()

// Lente 50mm
await a.getByTestId('take-card').getByRole('button', { name: /^Lente/ }).click()
await a.getByTestId('picker-options').getByRole('button', { name: '50mm', exact: true }).click()
// T-stop
await a.getByTestId('take-card').getByRole('button', { name: /^T-Stop/ }).click()
await a.getByTestId('picker-options').getByRole('button', { name: 'T2.8', exact: true }).click()
// Filtros múltiplos
await a.getByTestId('take-card').getByRole('button', { name: /^Filtros/ }).click()
await a.getByTestId('picker-options').getByRole('button', { name: 'ND .9', exact: true }).click()
await a.getByTestId('picker-options').getByRole('button', { name: 'Pro-Mist 1/4', exact: true }).click()
await shot(a, '05-filter-picker')
await a.getByRole('button', { name: /Aplicar/ }).click()
// FPS / ISO
await a.getByTestId('take-card').getByRole('button', { name: /^FPS/ }).click()
await a.getByTestId('picker-options').getByRole('button', { name: '24', exact: true }).click()
await a.getByTestId('take-card').getByRole('button', { name: /^ISO/ }).click()
await a.getByTestId('picker-options').getByRole('button', { name: '800', exact: true }).click()
// Cartão via sugestão digitada
await a.getByTestId('take-card').getByRole('button', { name: /^Cartão/ }).click()
await a.getByPlaceholder('A001', { exact: true }).fill('a001')
await a.getByRole('button', { name: 'Salvar' }).click()
await a.getByTestId('status-good').click()
await shot(a, '06-take1')
const card1 = await a.getByTestId('take-card').innerText()
assert(card1.includes('50mm') && card1.includes('ND .9 + Pro-Mist 1/4') && card1.includes('A001'), 'take1 values: ' + card1)
log('take 1 filled via pickers')

// Take 2 herda (sticky)
await a.getByTestId('add-take').click()
await a.getByText('TAKE 2', { exact: true }).waitFor()
const card2 = await a.getByTestId('take-card').innerText()
assert(card2.includes('50mm') && card2.includes('T2.8') && card2.includes('ND .9 + Pro-Mist 1/4') && card2.includes('800') && card2.includes('A001'), 'sticky: ' + card2)
log('take 2 sticky fields')

// wait sync
await sleep(3000)
assert(sql('select count(*) from takes') === '2', 'server has 2 takes: ' + sql('select count(*) from takes'))
assert(sql('select count(*) from scenes') === '32', 'server 32 scenes')
log('synced to server:', sql("select string_agg(take_number||':'||coalesce(lens,'')||':'||filters::text||':'||coalesce(status,'-'), ' | ' order by take_number) from takes"))

// ---------- OFFLINE ----------
await ctxA.setOffline(true)
fs.writeFileSync('/tmp/claude-0/stack/offline.flag', '1')
await a.getByTestId('add-take').click()
await a.getByText('TAKE 3', { exact: true }).waitFor()
await a.getByTestId('status-ng').click()
await a.getByTestId('take-card').getByRole('button', { name: /^Lente/ }).click()
await a.getByPlaceholder('Adicionar novo…').fill('29mm')
await a.getByRole('button', { name: 'Adicionar' }).click()
await a.getByTestId('take-card').getByText('29mm').waitFor()
await a.getByTestId('take-card').getByRole('button', { name: /Notas de pós/ }).click()
await a.getByRole('button', { name: 'Tracking', exact: true }).click()
await a.getByRole('button', { name: 'Salvar' }).click()
log('offline: take 3 with new lens + notes')

// Recarregar SEM internet (service worker)
await a.reload()
await a.getByText('TAKE 3', { exact: true }).waitFor({ timeout: 10000 })
await shot(a, '07-offline-reload')
const badge = await a.getByTestId('sync-badge').getAttribute('aria-label')
log('offline reload ok; badge =', badge)

// Novo projeto + cena + plano offline
await a.goto(URL + '#/')
await a.getByRole('button', { name: /Novo projeto/ }).last().click()
await a.getByLabel('Nome do projeto *').fill('Comercial Offline')
await a.getByRole('button', { name: 'Publicidade' }).click()
await a.getByRole('button', { name: 'Criar projeto' }).click()
await a.getByRole('button', { name: 'Cena', exact: true }).click()
await a.getByRole('button', { name: 'Criar cena' }).click()
await a.getByRole('button', { name: /Novo plano/ }).click()
await a.getByRole('button', { name: 'Criar e abrir' }).click()
await a.getByTestId('add-take').click()
await a.getByText('TAKE 1', { exact: true }).waitFor()
const card3 = await a.getByTestId('take-card').innerText()
assert(!card3.includes('29mm'), 'new project starts clean: ' + card3)
log('offline: created project/scene/shot/take (new project starts with clean settings)')

// PDF offline
await a.goto(URL + '#/')
await a.getByText('A Tela').click()
await a.getByRole('button', { name: 'Diárias' }).click()
await shot(a, '08-diarias')
const [dl] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: /Baixar/ }).first().click()])
const pdfPath = `${OUT}/${dl.suggestedFilename()}`
await dl.saveAs(pdfPath)
assert(fs.readFileSync(pdfPath).subarray(0, 4).toString() === '%PDF', 'pdf header')
log('offline PDF generated:', dl.suggestedFilename(), fs.statSync(pdfPath).size, 'bytes')
const [dl2] = await Promise.all([a.waitForEvent('download'), a.getByTestId(/csv-/).first().click()])
await dl2.saveAs(`${OUT}/${dl2.suggestedFilename()}`)
log('offline CSV:', dl2.suggestedFilename())
assert(sql('select count(*) from takes') === '2', 'server still 2 while offline')

// ---------- ONLINE again ----------
fs.unlinkSync('/tmp/claude-0/stack/offline.flag')
await ctxA.setOffline(false)
await a.evaluate(() => window.dispatchEvent(new Event('online')))
for (let i = 0; i < 20 && sql('select count(*) from takes') !== '4'; i++) await sleep(500)
assert(sql('select count(*) from takes') === '4', 'server has 4 takes after reconnect: ' + sql('select count(*) from takes'))
assert(sql("select count(*) from kit_items where value='29mm'") === '1', 'new lens synced')
assert(sql('select count(*) from projects') === '2', '2 projects')
log('reconnected: offline work synced (4 takes, 2 projects, kit 29mm)')

// ---------- Compartilhar com usuário B ----------
const ctxB = await browser.newContext(mobile)
const b = await ctxB.newPage()
b.on('pageerror', (e) => errors.push('B: ' + e.message))
await b.goto(URL)
await b.getByText('Criar uma conta nova').click()
await b.getByLabel('Seu nome').fill('Segundo AC')
await b.getByLabel('E-mail').fill('b@test.com')
await b.getByLabel('Senha').fill('123456')
await b.getByRole('button', { name: 'Criar conta' }).click()
await b.getByText('Nenhum projeto ainda').waitFor()

await a.getByRole('button', { name: 'Equipe' }).click()
await a.getByLabel('E-mail da conta').fill('b@test.com')
await a.getByRole('button', { name: 'Adicionar', exact: true }).click()
await a.getByText('b@test.com').waitFor()
await shot(a, '09-team')
log('A shared project with B')

await b.evaluate(() => window.dispatchEvent(new Event('online')))
await b.getByText('A Tela').waitFor({ timeout: 15000 })
await sleep(1500); await b.screenshot({ path: OUT + '/b-scenes.png' }); console.log('B main:', (await b.locator('main').innerText()).slice(0,300).replace(/\n/g,' | '))
await b.getByText('A Tela').click()
await b.locator('main button', { hasText: 'Apartamento' }).first().click()
await b.locator('main button', { hasText: 'PG' }).click()
await b.getByText('TAKE 3', { exact: true }).waitFor()
await b.getByTestId('status-check').click()
log('B sees shared takes and marks take 3 CHECK')
for (let i = 0; i < 20 && sql("select status from takes where take_number=3 and shot_id in (select id from shots where code='1' and project_id=(select id from projects where title='A Tela'))") !== 'check'; i++) await sleep(500)
await a.evaluate(() => window.dispatchEvent(new Event('online')))
await a.goto(URL + '#/')
await a.getByText('A Tela').click()
await a.locator('main button', { hasText: 'Apartamento' }).first().click()
await a.locator('main button', { hasText: 'PG' }).click()
await a.getByTestId('take-card').getByTestId('status-check').waitFor()
for (let i = 0; i < 20; i++) {
  const cls = await a.getByTestId('take-card').getByTestId('status-check').getAttribute('class')
  if (cls.includes('bg-check')) break
  await sleep(500)
}
assert((await a.getByTestId('take-card').getByTestId('status-check').getAttribute('class')).includes('bg-check'), 'A received B change')
log('A received B edit')

// ---------- Excluir cena (soft delete propaga) ----------
await a.goto(URL + '#/')
await a.getByText('Comercial Offline').click()
await a.getByRole('button', { name: 'Opções da cena' }).first().click()
await a.getByRole('button', { name: 'Excluir cena' }).click()
await a.getByRole('dialog').last().getByRole('button', { name: 'Excluir' }).click()
await a.getByText('Sem cenas').waitFor()
for (let i = 0; i < 20 && sql("select count(*) from takes where deleted") !== '1'; i++) await sleep(500)
assert(sql("select count(*) from takes where deleted") === '1', 'take soft-deleted on server')
log('scene delete cascaded to server (soft delete)')

// Kit tab & account screenshots
await a.goto(URL + '#/kit')
await a.getByText('29mm').waitFor()
await shot(a, '10-kit')
await a.goto(URL + '#/conta')
await a.getByRole('button', { name: /Modo sol/ }).click()
await shot(a, '11-account-sun')
await a.goto(URL + '#/')
await a.getByText('A Tela').click()
await a.locator('main button', { hasText: 'Apartamento' }).first().click()
await a.locator('main button', { hasText: 'PG' }).click()
await shot(a, '12-take-sun')
await a.goto(URL + '#/conta')
await a.getByRole('button', { name: 'Escuro' }).click()

// Logout / login com conta salva
await a.getByRole('button', { name: 'Sair da conta' }).click()
await a.getByRole('dialog').last().getByRole('button', { name: 'Sair' }).click()
await a.getByText('Contas neste aparelho').waitFor()
await shot(a, '13-login-recent')
await a.getByLabel('Senha').fill('123456')
await a.getByRole('button', { name: 'Entrar' }).click()
await a.getByText('A Tela').waitFor()
log('logout + login with remembered account')

} catch (e) {
  console.log('FAIL', e.message.split('\n')[0])
  console.log(e.stack.split('\n').find(l=>l.includes('e2e.mjs')))
  const info = await a.evaluate(() => { const b = document.querySelector('[data-testid=add-take]'); if(!b) return null; const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2); return { r: [r.x, r.y, r.width, r.height], vh: innerHeight, el: el?.outerHTML.slice(0,150), sw: document.documentElement.scrollWidth, bodyOv: document.body.style.overflow } }).catch(()=>null)
  console.log(info)
  await a.screenshot({ path: OUT + '/fail.png' })
}
console.log('H-overflow:', overflow.length ? overflow : 'none')
console.log('\nJS errors:', errors.length ? errors : 'none')
await browser.close()

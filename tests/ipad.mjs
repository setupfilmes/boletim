import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const out = []
for (const [name, vp] of [['ipad-portrait', { width: 820, height: 1180 }], ['ipad-landscape', { width: 1180, height: 820 }], ['phone-small', { width: 360, height: 740 }]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  const a = await ctx.newPage()
  const chk = async (n) => {
    const w = await a.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
    out.push(`${name}/${n}: ${w[0] > w[1] ? 'OVERFLOW ' + w : 'ok'}`)
    await a.screenshot({ path: `shots/${name}-${n}.png` })
  }
  await a.goto('http://localhost:8080/')
  await a.getByLabel('E-mail').fill('antonio@test.com'); await a.getByLabel('Senha').fill('123456')
  await a.getByRole('button', { name: 'Entrar' }).click()
  await a.getByText('A Tela').waitFor(); await a.waitForTimeout(1500)
  await chk('projects')
  await a.getByText('A Tela').click(); await a.waitForTimeout(500)
  await chk('scenes')
  await a.locator('main button', { hasText: 'Apartamento' }).first().click()
  await a.locator('main button', { hasText: 'PG' }).click(); await a.waitForTimeout(500)
  await chk('shot')
  await a.getByTestId('take-card').getByRole('button', { name: /^Lente/ }).click(); await a.waitForTimeout(300)
  await chk('picker')
  await ctx.close()
}
console.log(out.join('\n'))
await browser.close()

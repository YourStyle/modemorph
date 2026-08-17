// Замер верхней геометрии в TMA-ветке.
// useTmaMobile() требует непустой initData, initDataUnsafe.user.id и platform ios|android —
// без всех трёх приложение уходит в десктопную ветку и замер бессмыслен.
// Usage: BASE=http://localhost:PORT [CHROME=46] node test/gauntlet/design/measure_top.mjs [/app]
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:3000'
const CHROME = Number(process.env.CHROME ?? 0) // contentSafeAreaInset.top; 0 = клиент не прислал
const ROUTE = process.argv[2] || '/app'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'ru-RU',
})
await ctx.addInitScript((chrome) => {
  const webapp = {
      platform: 'ios',
      initData: 'query_id=MOCK&user=%7B%22id%22%3A1%7D&auth_date=1&hash=x',
      initDataUnsafe: { query_id: 'MOCK', user: { id: 1, first_name: 'T' } },
      safeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
      contentSafeAreaInset: { top: chrome, bottom: 0, left: 0, right: 0 },
      onEvent() {}, offEvent() {}, ready() {}, expand() {},
      isVersionAtLeast: () => true,
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
  }
  const mock = {}
  Object.defineProperty(mock, "WebApp", { value: webapp, writable: false, configurable: false })
  Object.defineProperty(window, "Telegram", { value: mock, writable: false, configurable: false })
}, CHROME)

const page = await ctx.newPage()
await page.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded', timeout: 180000 }).catch(() => {})
await page.waitForTimeout(6000)

const m = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  const main = document.querySelector('main')
  const r = (el) => (el ? el.getBoundingClientRect() : null)

  // пилюля = fixed-элемент с .glass в верхней трети, самый узкий (не во весь борт)
  const pill = [...document.querySelectorAll('div,button,nav')]
    .filter((el) => {
      const st = getComputedStyle(el), b = el.getBoundingClientRect()
      return st.position === 'fixed' && b.top < 260 && b.height > 20 && b.width > 60 && b.width < window.innerWidth - 40
    })
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0]

  // первый реально видимый контент внутри main
  const firstVisible = [...(main?.querySelectorAll('*') || [])].find((el) => {
    const b = el.getBoundingClientRect()
    return b.height > 12 && b.width > 40 && (el.textContent || '').trim().length > 1
  })

  return {
    contentTop: cs.getPropertyValue('--tg-content-top').trim() || '(не задан)',
    chrome: cs.getPropertyValue('--tg-chrome').trim() || '(не задан)',
    hintH: cs.getPropertyValue('--tg-hint-h').trim() || '(нет)',
    mainPad: main ? Math.round(parseFloat(getComputedStyle(main).paddingTop)) : null,
    pill: pill ? { top: Math.round(r(pill).top), bottom: Math.round(r(pill).bottom), h: Math.round(r(pill).height) } : null,
    firstText: firstVisible ? (firstVisible.textContent || '').trim().slice(0, 32) : null,
    firstTop: firstVisible ? Math.round(r(firstVisible).top) : null,
  }
})

console.log(`route ${ROUTE}   contentSafeAreaInset.top = ${CHROME}`)
console.log(`  --tg-chrome        ${m.chrome}`)
console.log(`  --tg-content-top   ${m.contentTop}`)
console.log(`  --tg-hint-h        ${m.hintH}`)
console.log(`  main padding-top   ${m.mainPad}px`)
console.log(`  пилюля             top=${m.pill?.top} bottom=${m.pill?.bottom} h=${m.pill?.h}`)
console.log(`  первый контент     y=${m.firstTop}  «${m.firstText}»`)
if (m.pill && m.firstTop != null) {
  console.log(`\n  ЗАЗОР пилюля→контент: ${m.firstTop - m.pill.bottom}px`)
}

// Скриншот той же самой TMA-ветки — глазами надёжнее селекторов.
const shot = `test/gauntlet/design/ours/tma${ROUTE.replace(/\//g, '_') || '_root'}.png`
await page.screenshot({ path: shot })
console.log(`  скриншот           ${shot}`)

await browser.close()

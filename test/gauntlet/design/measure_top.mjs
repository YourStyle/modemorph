// Замер верхней геометрии с подставленными инсетами Telegram.
// Usage: BASE=http://localhost:PORT node test/gauntlet/design/measure_top.mjs
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:3000'
const TG_TOP = Number(process.env.TG_TOP || 105) // safeAreaInset.top + contentSafeAreaInset.top

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU' })
await ctx.addInitScript((top) => {
  // Минимальный мок Telegram, чтобы useTmaSafeArea выставил --tg-top.
  window.Telegram = {
    WebApp: {
      platform: 'ios', initData: 'mock', initDataUnsafe: {},
      safeAreaInset: { top: Math.round(top * 0.56), bottom: 34, left: 0, right: 0 },
      contentSafeAreaInset: { top: Math.round(top * 0.44), bottom: 0, left: 0, right: 0 },
      onEvent() {}, offEvent() {}, ready() {}, expand() {},
      isVersionAtLeast: () => true,
    },
  }
}, TG_TOP)

const page = await ctx.newPage()
await page.goto(BASE + '/app', { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {})
await page.waitForTimeout(4000)

const m = await page.evaluate(() => {
  const num = (v) => Math.round(parseFloat(v) || 0)
  const cs = getComputedStyle(document.documentElement)
  const main = document.querySelector('main')
  const pill = document.querySelector('nav[aria-label], header, [class*="glass"]')
  const box = (el) => (el ? (({ top, bottom, height }) => ({ top: Math.round(top), bottom: Math.round(bottom), height: Math.round(height) }))(el.getBoundingClientRect()) : null)

  // первый видимый значимый контент внутри main
  const firstChild = main?.querySelector('*')
  return {
    tgTop: cs.getPropertyValue('--tg-top').trim() || '(не задан)',
    contentTop: cs.getPropertyValue('--tg-content-top').trim(),
    mainPaddingTop: num(main ? getComputedStyle(main).paddingTop : 0),
    mainBox: box(main),
    firstContentTop: firstChild ? Math.round(firstChild.getBoundingClientRect().top) : null,
    // все фиксированные/липкие слои сверху
    layers: [...document.querySelectorAll('body *')]
      .filter((el) => {
        const p = getComputedStyle(el).position
        const r = el.getBoundingClientRect()
        return (p === 'fixed' || p === 'sticky') && r.top < 300 && r.height > 8 && r.width > 100
      })
      .slice(0, 6)
      .map((el) => ({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 48), pos: getComputedStyle(el).position, ...box(el) })),
  }
})

console.log(`--tg-top:           ${m.tgTop}`)
console.log(`--tg-content-top:   ${m.contentTop}`)
console.log(`main padding-top:   ${m.mainPaddingTop}px`)
console.log(`первый контент на:  y=${m.firstContentTop}`)
console.log('\nфиксированные слои сверху:')
for (const l of m.layers) console.log(`  ${l.pos.padEnd(7)} top=${String(l.top).padStart(4)} bottom=${String(l.bottom).padStart(4)} h=${String(l.height).padStart(3)}  ${l.tag}.${l.cls}`)

await browser.close()

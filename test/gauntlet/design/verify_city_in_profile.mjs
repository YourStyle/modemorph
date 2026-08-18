// Верификация: пилюля целиком открывает профиль (никакого вложенного <button>
// с погодой), а выбор города переехал внутрь шторки профиля инлайн-секцией
// (без второй шторки поверх первой).
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:3000'
const F = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'))
const API = {
  '/api/me/profile-session': () => ({
    profile: { ...F.profile, onboarding_complete: true },
    user: { id: F.profile.id, email: 'f@example.com', user_metadata: {}, created_at: F.generated_at },
  }),
  '/api/weather/cached': () => F.weather,
  '/api/weather': () => F.weather,
  '/api/weather/search-city': (url) => {
    const q = new URL(url).searchParams.get('q') || ''
    if (q.toLowerCase().startsWith('спб') || q.toLowerCase().startsWith('питер') || q.toLowerCase().startsWith('санкт')) {
      return { results: [{ name: 'Санкт-Петербург', country: 'RU', lat: 59.9311, lon: 30.3609 }] }
    }
    return { results: [] }
  },
  '/api/user-subscription': () => ({ subscription: { status: 'inactive' }, credits: { credits_balance: 12 } }),
  '/api/me/notifications': () => ({ notifications_enabled: true }),
  '/api/check-limits': () => ({ success: true, canUse: true, remaining: 10 }),
  '/api/limits/reconcile': () => ({ success: true }),
  '/api/wardrobe-user-items': () => F.wardrobeUserItems,
  '/api/basic-wardrobe-items': () => F.basicItems,
  '/api/user-looks': () => F.looks,
  '/api/looks-sections': () => F.sections,
  '/api/outfits/inspiration': () => ({ outfits: F.outfits, nextCursor: null }),
  '/api/user-likes': () => ({ liked: [] }),
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'ru-RU',
})
await ctx.addInitScript(() => {
  const webapp = {
    platform: 'ios',
    initData: 'query_id=MOCK&user=%7B%22id%22%3A1%7D&auth_date=1&hash=x',
    initDataUnsafe: { query_id: 'MOCK', user: { id: 1, first_name: 'T' } },
    safeAreaInset: { top: 59, bottom: 34, left: 0, right: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    onEvent() {}, offEvent() {}, ready() {}, expand() {},
    isVersionAtLeast: () => true,
    HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
  }
  const mock = {}
  Object.defineProperty(mock, "WebApp", { value: webapp, writable: false, configurable: false })
  Object.defineProperty(window, "Telegram", { value: mock, writable: false, configurable: false })
})

const origin = new URL(BASE).origin
await ctx.route((u) => u.origin === origin && u.pathname.startsWith('/api/'), async (route) => {
  const url = route.request().url()
  const path = new URL(url).pathname.replace(/\/+$/, '')
  const make = API[path]
  if (!make) return route.continue()
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(make(url)) })
})

const page = await ctx.newPage()
await page.goto(BASE + '/app', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(4000)

// 1) Проверяем разметку пилюли: внутри её <button> НЕТ вложенного <button>.
const pillCheck = await page.evaluate(() => {
  const pill = [...document.querySelectorAll('button')].find((b) => b.className.includes('glass') && b.className.includes('rounded-full'))
  if (!pill) return { found: false }
  const nestedButtons = pill.querySelectorAll('button').length
  return { found: true, nestedButtons, text: pill.textContent?.trim().slice(0, 60) }
})
console.log('Пилюля:', JSON.stringify(pillCheck))

await page.screenshot({ path: 'test/gauntlet/design/ours/pill_before.png' })

// 2) Тап по пилюле (в её произвольной точке, не строго по центру) открывает профиль.
const pillBox = await page.evaluate(() => {
  const pill = [...document.querySelectorAll('button')].find((b) => b.className.includes('glass') && b.className.includes('rounded-full'))
  const r = pill.getBoundingClientRect()
  return { x: r.left + r.width * 0.25, y: r.top + r.height / 2 }
})
await page.mouse.click(pillBox.x, pillBox.y)
await page.waitForTimeout(1000)

const sheetOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
console.log('Шторка профиля открылась после тапа по пилюле (25% слева):', sheetOpen)

await page.screenshot({ path: 'test/gauntlet/design/ours/profile_sheet_open.png' })

// 3) Внутри шторки — строка "Город", раскрывающая инлайн-секцию (не вторую шторку).
const cityRow = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]')
  if (!dialog) return null
  const btn = [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('Город'))
  if (!btn) return null
  const r = btn.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height), text: btn.textContent?.trim() }
})
console.log('Строка «Город»:', JSON.stringify(cityRow))

if (cityRow) {
  await page.mouse.click(cityRow.x, cityRow.y)
  await page.waitForTimeout(500)

  const dialogsAfterExpand = await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length)
  console.log('Число открытых [role=dialog] после раскрытия секции города:', dialogsAfterExpand)

  await page.screenshot({ path: 'test/gauntlet/design/ours/profile_sheet_city_expanded.png' })

  // Ввод города и выбор результата
  const input = await page.$('[role="dialog"] input[placeholder*="город"]')
  if (input) {
    await input.fill('Санкт-Петербург')
    await page.waitForTimeout(700)
    await page.screenshot({ path: 'test/gauntlet/design/ours/profile_sheet_city_search.png' })
    const resultBtn = await page.$('[role="dialog"] ul button')
    if (resultBtn) {
      await resultBtn.click()
      await page.waitForTimeout(500)
    }
  }

  const dialogsAfterPick = await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length)
  console.log('Число открытых [role=dialog] после выбора города:', dialogsAfterPick)
}

// 4) Липкий футер "Сохранить" — прижат к низу шита (bottom-0), без зазора
// между низом футера и низом самого CommonSheet (сам шит 80vh и может не
// доставать до низа вьюпорта — это ожидаемо, меряем зазор от шита, не от окна).
const footerGap = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]')
  if (!dialog) return null
  const saveBtn = [...dialog.querySelectorAll('button')].find((b) => b.textContent?.includes('Сохранить'))
  if (!saveBtn) return null
  const footerDiv = saveBtn.closest('.sticky')
  const dialogRect = dialog.getBoundingClientRect()
  const footerRect = (footerDiv || saveBtn).getBoundingClientRect()
  const btnRect = saveBtn.getBoundingClientRect()
  return {
    viewportH: window.innerHeight,
    dialogBottom: Math.round(dialogRect.bottom),
    footerDivBottom: Math.round(footerRect.bottom),
    gapFooterToDialogBottom: Math.round(dialogRect.bottom - footerRect.bottom),
    btnBottom: Math.round(btnRect.bottom),
    gapBtnToFooterDivBottom: Math.round(footerRect.bottom - btnRect.bottom),
  }
})
console.log('Футер «Сохранить» относительно низа шита:', JSON.stringify(footerGap))

// Диагностика: контент короче 80vh шита? Тогда sticky-футер просто идёт
// следом за контентом (это не регрессия моих правок — я не трогал сам
// механизм sticky/negative-margin, лишь добавил высоты в тело).
const scrollDiag = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]')
  const scroller = dialog?.querySelector('.overflow-y-auto')
  if (!scroller) return null
  return { scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight, contentShorterThanContainer: scroller.scrollHeight <= scroller.clientHeight }
})
console.log('Скролл-контейнер шита:', JSON.stringify(scrollDiag))

await page.screenshot({ path: 'test/gauntlet/design/ours/profile_sheet_footer.png', fullPage: false })

await browser.close()

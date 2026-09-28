// e2e/smoke.spec.ts
// Frontend smoke suite: every top-level authenticated page loads without a
// JS crash, without the app's own error screen, and with the piece of real
// content that proves the page actually rendered (not just "something is on
// screen").

import { test, expect, type ApiMockState } from "./fixtures"
import type { Page } from "@playwright/test"

const ERROR_SCREEN_TEXT = "Возникла ошибка"

function trackPageErrors(page: Page): Error[] {
  const errors: Error[] = []
  page.on("pageerror", (err) => errors.push(err))
  return errors
}

function expectNoErrors(errors: Error[]) {
  expect(errors, `Uncaught page error(s): ${errors.map((e) => e.message).join(" | ")}`).toHaveLength(0)
}

// Every /api/* request not explicitly mocked, and every non-localhost
// request that got aborted, across the whole run — printed once at the end
// so gaps in the mock coverage are visible without digging through
// per-test logs.
const allUnmockedHits: string[] = []
const allBlockedExternal = new Set<string>()

function collect(label: string, apiMocks: ApiMockState) {
  for (const hit of apiMocks.unmockedHits) allUnmockedHits.push(`[${label}] ${hit}`)
  for (const url of apiMocks.blockedExternal) allBlockedExternal.add(url)
}

test.afterAll(() => {
  console.log("\n=== /api/* endpoints hit but NOT explicitly mocked (got the generic {} fallback) ===")
  console.log(allUnmockedHits.length ? allUnmockedHits.join("\n") : "(none)")
  console.log("\n=== non-localhost requests aborted ===")
  console.log(allBlockedExternal.size ? [...allBlockedExternal].join("\n") : "(none)")
})

const ROUTES = ["/app", "/app/wardrobe", "/app/looks", "/app/inspiration", "/app/ai-assistant", "/admin/analytics"]

// On a fully cold `.next` cache (no prior `pnpm dev`/`pnpm e2e:web` run),
// Next dev compiles the whole shared chunk graph (root layout, all its
// providers) the first time ANY route is hit — that one compile can take
// well past a single test's expect() budget. Firing plain HTTP GETs at every
// route before any test's assertions start turns that one-time cost into
// setup time instead of eating into a specific test's timeout (whichever
// test happens to run first pays for it otherwise).
test.beforeAll(async ({ request }) => {
  await Promise.all(
    ROUTES.map((route) =>
      request.get(route, { timeout: 170_000 }).catch(() => {
        /* only compiling it matters, the response itself is unmocked/unused here */
      }),
    ),
  )
})

test.describe("frontend smoke", () => {
  test("/app — home renders sections, referral card after 2nd section, locked cards", async ({ page, apiMocks }) => {
    const errors = trackPageErrors(page)

    await page.goto("/app")

    await expect(page.getByText("Повседневный образ").first()).toBeVisible({ timeout: 90_000 })
    await expect(page.getByText("На выход").first()).toBeVisible()
    await expect(page.getByText("Премиум подборка").first()).toBeVisible()

    // Locked section (subscription upsell)
    await expect(page.getByText("Открыть с подпиской").first()).toBeVisible()
    await expect(page.getByLabel(/доступно по подписке/).first()).toBeVisible()

    // Referral card, and its DOM position: after the 2nd section, before the 3rd.
    await expect(page.getByText("Пригласи подругу").first()).toBeVisible()

    const bodyText = await page.locator("body").innerText()
    const idxSection1 = bodyText.indexOf("Повседневный образ")
    const idxSection2 = bodyText.indexOf("На выход")
    const idxInvite = bodyText.indexOf("Пригласи подругу")
    const idxSection3 = bodyText.indexOf("Премиум подборка")

    expect(idxSection1).toBeGreaterThanOrEqual(0)
    expect(idxSection2).toBeGreaterThan(idxSection1)
    expect(idxInvite).toBeGreaterThan(idxSection2)
    expect(idxSection3).toBeGreaterThan(idxInvite)

    await expect(page.getByText(ERROR_SCREEN_TEXT)).toHaveCount(0)
    expectNoErrors(errors)
    collect("/app", apiMocks)
  })

  test("/app/wardrobe — «Брать?» opens the buy-check sheet", async ({ page, apiMocks }) => {
    const errors = trackPageErrors(page)

    await page.goto("/app/wardrobe")

    await expect(page.getByRole("heading", { name: "Рекомендуемые базовые вещи" })).toBeVisible({ timeout: 90_000 })
    await expect(page.getByText("Белая рубашка").first()).toBeVisible()

    const takeItButton = page.getByRole("button", { name: "Брать?" })
    await expect(takeItButton).toBeVisible()
    await takeItButton.click()

    await expect(page.getByText("Стоит ли покупать?")).toBeVisible({ timeout: 10_000 })

    await expect(page.getByText(ERROR_SCREEN_TEXT)).toHaveCount(0)
    expectNoErrors(errors)
    collect("/app/wardrobe", apiMocks)
  })

  test("/app/looks — looks list renders", async ({ page, apiMocks }) => {
    const errors = trackPageErrors(page)

    await page.goto("/app/looks")

    await expect(page.getByRole("heading", { name: "Все образы" })).toBeVisible({ timeout: 90_000 })
    await expect(page.getByRole("button", { name: /Создать образ/ })).toBeVisible()

    await expect(page.getByText(ERROR_SCREEN_TEXT)).toHaveCount(0)
    expectNoErrors(errors)
    collect("/app/looks", apiMocks)
  })

  test("/app/inspiration — feed renders a slide", async ({ page, apiMocks }) => {
    const errors = trackPageErrors(page)

    await page.goto("/app/inspiration")

    // Segmented tab pill — always present regardless of feed content.
    await expect(page.getByRole("button", { name: "Лента образов" })).toBeVisible({ timeout: 90_000 })
    // First mocked outfit's title, rendered on the active slide.
    await expect(page.getByText("Повседневный образ").first()).toBeVisible()

    await expect(page.getByText(ERROR_SCREEN_TEXT)).toHaveCount(0)
    expectNoErrors(errors)
    collect("/app/inspiration", apiMocks)
  })

  test("/app/ai-assistant — greeting renders", async ({ page, apiMocks }) => {
    const errors = trackPageErrors(page)

    await page.goto("/app/ai-assistant")

    await expect(page.getByText(/Привет! Я помогу вам с образами/)).toBeVisible({ timeout: 90_000 })
    await expect(page.getByRole("button", { name: "На сегодня по погоде" })).toBeVisible()

    await expect(page.getByText(ERROR_SCREEN_TEXT)).toHaveCount(0)
    expectNoErrors(errors)
    collect("/app/ai-assistant", apiMocks)
  })

  test("/admin/analytics — dashboard renders every section", async ({ page, apiMocks }) => {
    const errors = trackPageErrors(page)

    await page.goto("/admin/analytics")

    await expect(page.getByRole("heading", { name: "Аналитика продукта" })).toBeVisible({ timeout: 90_000 })
    await expect(page.getByRole("heading", { name: "Воронка платежей" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Онбординг" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Aha-момент" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Retention и DAU/MAU" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Монетизация" })).toBeVisible()

    await expect(page.getByText(ERROR_SCREEN_TEXT)).toHaveCount(0)
    expectNoErrors(errors)
    collect("/admin/analytics", apiMocks)
  })
})

// e2e/auth-refresh.spec.ts
// Regression: onboarding «Завершить» → "API Error 401: Missing token" (Telegram, 2026-10-27).
// One failed /api/auth/refresh (429 from the rate-limit bucket, a network blip on
// app resume) wiped the whole session, refresh token included, so every request
// after it went out with no Authorization header and the user was stuck.

import { test, expect } from "./fixtures"

test("a failed token refresh does not log the user out", async ({ page, apiMocks: _ }) => {
  let expired = false
  let refreshOk = false
  let refreshCalls = 0
  let saved = false

  // Registered after the fixture's catch-all, so it runs first; route.fallback() hands over.
  await page.route("**/api/**", async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    if (path === "/api/client-errors") return route.fallback()
    if (path === "/api/auth/refresh") {
      refreshCalls++
      if (!refreshOk) return route.fulfill({ status: 429, json: { error: "Rate limit exceeded" } })
      return route.fulfill({
        json: {
          session: { access_token: "fresh", refresh_token: "e2e-refresh-token", expires_at: Math.floor(Date.now() / 1000) + 3600 },
          user_id: "e2e-user-0001",
        },
      })
    }
    const auth = req.headers()["authorization"]
    if (!auth) return route.fulfill({ status: 401, json: { detail: "Missing token" } })
    if (expired && auth !== "Bearer fresh") return route.fulfill({ status: 401, json: { detail: "Invalid token" } })
    if (path === "/api/me/profile-session") {
      if (req.method() === "POST") {
        saved = true
        return route.fulfill({ json: { success: true } })
      }
      return route.fulfill({ json: { profile: saved ? { onboarding_complete: true } : null, user: { id: "e2e-user-0001" } } })
    }
    return route.fallback()
  })

  await page.goto("/auth/mini-registration")
  await expect(page.getByText("Основная информация")).toBeVisible()

  // Access token expires mid-form; refresh is rate-limited for a while.
  expired = true
  await page.getByRole("button", { name: "Женский" }).click()
  await page.getByPlaceholder("175").fill("168")
  await page.getByPlaceholder("70").fill("60")
  await page.getByRole("button", { name: "Далее" }).click()
  await expect.poll(() => refreshCalls).toBeGreaterThan(0)

  const selects = page.locator("select")
  await selects.nth(0).selectOption("M")
  await selects.nth(1).selectOption("M")
  await selects.nth(2).selectOption("38")
  await page.getByRole("button", { name: "Далее" }).click()

  refreshOk = true
  await page.getByRole("button", { name: "От друзей" }).click()
  await page.getByRole("button", { name: "Завершить" }).click()

  await expect.poll(() => saved).toBe(true)
  await expect(page.getByText("Missing token")).toHaveCount(0)
})

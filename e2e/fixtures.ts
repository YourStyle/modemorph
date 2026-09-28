// e2e/fixtures.ts
// Shared Playwright fixtures: an authed session (tma_session, matching
// lib/tma/session-auth.ts) and a full /api/* mock layer built from
// e2e/mock-data.ts. Every test gets a fresh `page` that already has both.

import { test as base, expect, type Page, type Route } from "@playwright/test"
import * as M from "./mock-data"

// ---------------------------------------------------------------------------
// Session injection
// ---------------------------------------------------------------------------
// lib/tma/session-auth.ts stores the session under sessionStorage OR
// localStorage depending on whether `window.Telegram?.WebApp?.initData` is
// truthy at call time (store() picks sessionStorage only inside a real TMA
// webview). This suite deliberately does NOT stub window.Telegram at all:
// contexts/auth-context.tsx treats a truthy initData as "TMA mode" and fires
// a handshake POST to /api/auth/telegram/miniapp-session before anything
// else renders, which would need its own mocking and buys nothing for a
// frontend smoke test. Every consumer of window.Telegram in this codebase
// optional-chains it (grep confirms: use-tma.ts, safe-area.ts, geo.ts,
// MiniAppRegistrationGate.tsx, layout-client.tsx), so leaving it undefined
// is safe and exercises the plain "regular session-based auth" branch in
// auth-context.tsx instead.
// Because we don't set window.Telegram, TMASessionAuth.store() resolves to
// localStorage, not sessionStorage. We write the session to BOTH storages so
// the fixture matches the literal task spec (sessionStorage.tma_session)
// while still actually being picked up by the app's current code path.
const SESSION = {
  access_token: "e2e-access-token",
  refresh_token: "e2e-refresh-token",
  user_id: "e2e-user-0001",
  // Far future, already in ms (parseSupabaseExpiry treats >= 2_000_000_000 as ms).
  expires_at: Date.now() + 365 * 24 * 60 * 60 * 1000,
}

async function installSession(page: Page) {
  await page.addInitScript((session) => {
    const raw = JSON.stringify(session)
    try {
      window.sessionStorage.setItem("tma_session", raw)
    } catch {}
    try {
      window.localStorage.setItem("tma_session", raw)
    } catch {}
  }, SESSION)
}

// ---------------------------------------------------------------------------
// API mocking
// ---------------------------------------------------------------------------

type JsonBody = Record<string, any> | any[]

interface ExplicitRoute {
  match: (pathname: string, method: string) => boolean
  respond: (route: Route, pathname: string) => Promise<void> | void
}

function json(route: Route, body: JsonBody, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

function exact(path: string, body: JsonBody, methods?: string[]): ExplicitRoute {
  return {
    match: (pathname, method) => pathname === path && (!methods || methods.includes(method)),
    respond: (route) => json(route, body),
  }
}

function buildExplicitRoutes(): ExplicitRoute[] {
  return [
    // Global chrome (every /app/* page via layout-client.tsx / top-navigation.tsx / welcome-gift-gate.tsx)
    exact("/api/me/profile-session", M.profileSession),
    exact("/api/weather/cached", M.weatherCached),
    exact("/api/usage/log", {}, ["POST"]),
    exact("/api/limits/reconcile", {}, ["POST"]),
    exact("/api/client-errors", {}, ["POST"]),

    // check-limits is called with different payloads (daily ideas_viewed,
    // per-feature consume) but the shape the callers need back is the same.
    { match: (p, m) => p === "/api/check-limits" && m === "POST", respond: (route) => json(route, M.checkLimitsOk) },

    // Home (/app)
    exact("/api/wardrobe-user-items", M.wardrobeUserItems, ["GET"]),
    exact("/api/user-looks", M.userLooksEmpty, ["GET"]),
    exact("/api/recommendations", M.recommendationsResponse, ["GET"]),
    exact("/api/discounts/mine", M.discountsMine, ["GET"]),

    // Wardrobe (/app/wardrobe)
    exact("/api/me/profile", M.meProfile, ["GET"]),
    { match: (p, m) => p === "/api/basic-wardrobe-items" && m === "GET", respond: (route) => json(route, M.basicWardrobeItems) },

    // Looks (/app/looks)
    exact("/api/looks-sections", M.looksSectionsEmpty, ["GET"]),

    // Inspiration (/app/inspiration)
    { match: (p, m) => p === "/api/outfits/inspiration" && m === "GET", respond: (route) => json(route, M.inspirationOutfits) },
    { match: (p, m) => p === "/api/outfits/inspiration/vibes" && m === "GET", respond: (route) => json(route, M.inspirationVibes) },
    exact("/api/user-likes", M.userLikes, ["GET"]),

    // Admin gate (app/admin/layout.tsx) + analytics page
    exact("/api/me", M.meAdmin, ["GET"]),
    exact("/api/admin/analytics", M.adminAnalytics, ["GET"]),
    exact("/api/admin/paying-users", M.adminPayingUsers, ["GET"]),
    exact("/api/admin/sources", M.adminSources, ["GET"]),
  ]
}

export interface ApiMockState {
  /** "METHOD pathname?search" for every /api/* request that hit the generic fallback. */
  unmockedHits: string[]
  /** Full URL of every non-localhost request that was aborted. */
  blockedExternal: string[]
}

async function installApiMocks(page: Page, state: ApiMockState) {
  const explicitRoutes = buildExplicitRoutes()

  // Block any request leaving localhost — third-party scripts
  // (telegram-web-app.js), the vpn-warning geolocation-by-IP calls
  // (api.ipify.org, ipapi.co), fonts CDNs, anything. next/font/google
  // self-hosts at build time so this never touches real app functionality.
  await page.route("**/*", async (route) => {
    const url = route.request().url()
    let hostname: string
    try {
      hostname = new URL(url).hostname
    } catch {
      return route.fallback()
    }
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "") {
      return route.fallback()
    }
    state.blockedExternal.push(url)
    // Next.js loads telegram-web-app.js with <Script strategy="beforeInteractive">
    // (app/layout.tsx), which blocks hydration until the script settles.
    // route.abort() surfaces as a genuine network error to the browser and,
    // for a beforeInteractive script specifically, that occasionally left
    // hydration hanging indefinitely instead of resolving — the app never
    // ran a single client effect (no [AppClientLayout] log, no /api/* calls
    // at all), so every page sat on its bare SSR shell forever. Fulfilling
    // with an empty-but-valid script/response is deterministic either way:
    // the script "loads", does nothing (window.Telegram stays undefined,
    // which every consumer in this codebase already handles via optional
    // chaining — see fixtures.ts session-injection comment above), and
    // hydration proceeds on schedule.
    if (route.request().resourceType() === "script") {
      return route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
    }
    return route.abort()
  })

  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    const method = request.method()

    const explicit = explicitRoutes.find((r) => r.match(pathname, method))
    if (explicit) {
      await explicit.respond(route, pathname)
      return
    }

    state.unmockedHits.push(`${method} ${pathname}${url.search}`)
    // Sane default: most consumers in this codebase do
    // `Array.isArray(data) ? data : []`, so an empty object is safe even
    // where an array was semantically expected.
    await json(route, {})
  })
}

// ---------------------------------------------------------------------------
// Extended test
// ---------------------------------------------------------------------------

export const test = base.extend<{ apiMocks: ApiMockState }>({
  apiMocks: async ({ page }, use) => {
    const state: ApiMockState = { unmockedHits: [], blockedExternal: [] }
    await installSession(page)
    await installApiMocks(page, state)
    await use(state)
  },
})

export { expect }

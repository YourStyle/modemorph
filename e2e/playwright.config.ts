import os from "node:os"
import path from "node:path"
import { defineConfig, devices } from "@playwright/test"

// Playwright's webServer.cwd defaults to the directory this config file
// lives in (e2e/), which has no app/ or pages/ directory — `next dev` fails
// with "Couldn't find any `pages` or `app` directory" unless cwd is pinned
// to the repo root explicitly.
const projectRoot = path.resolve(__dirname, "..")

// Next's dev-mode webpack watcher watches the whole project root (nothing in
// next.config.mjs excludes e2e/), so writing Playwright's own run artifacts
// (screenshots, trace.zip, error-context.md) under e2e/test-results/ was
// observed to trigger a self-inflicted rebuild loop: a failed assertion saves
// a screenshot -> webpack sees a new file under the watched tree -> Fast
// Refresh recompiles and remounts the page -> in-flight fetches/state reset
// -> the next assertion in the same test also fails -> another screenshot.
// Once seen this repeats indefinitely (observed 30+ consecutive
// "[Fast Refresh] rebuilding" cycles on a single page load). Keeping
// Playwright's output outside the watched tree avoids feeding that loop.
const outputRoot = path.join(os.tmpdir(), "modemorph-e2e-artifacts")

// Frontend smoke suite. Chromium only, single worker: the pages under test
// share a dev server whose first compile per route is slow (Next 15 dev,
// no turbopack here), so parallel workers would just contend for the same
// compile queue instead of speeding anything up.
export default defineConfig({
  testDir: "./",
  testMatch: "*.spec.ts",
  // Generous: dev-mode on-demand compilation of the first hit to each route
  // (auth/limits/analysis providers wrapping every /app/* page) can take
  // 30-50s on a cold .next cache before the client bundle is even sent down.
  timeout: 150_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: path.join(outputRoot, "test-results"),
  use: {
    baseURL: "http://localhost:3006",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    // Dev-mode on-demand compilation of a route not hit yet in this server
    // process can take well over 30s under constrained CPU (recharts/xlsx
    // heavy pages like /admin/analytics, /app/looks). The HTTP response is
    // held open by Next until the bundle finishes compiling, so this is a
    // real wait, not a hang.
    navigationTimeout: 90_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx next dev -p 3006",
    port: 3006,
    reuseExistingServer: true,
    timeout: 180_000,
    cwd: projectRoot,
    env: {
      // Harmless dummies — no real Supabase/AI/Sentry project. Every request
      // this app makes to *its own* backend goes through app/api/* (proxied
      // to BACKEND_URL by next.config.mjs), which the tests intercept with
      // page.route before it ever reaches next dev's proxy. Supabase itself
      // is not used anywhere in the current codebase (checked: no lib/supabase
      // files exist — the app has migrated to session-based auth against the
      // FastAPI backend), these three vars are kept only because
      // .env.example documents them as "required".
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9/e2e-unused-supabase",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-dummy-anon-key",
      NEXT_PUBLIC_AI_API_URL: "http://127.0.0.1:9/e2e-unused-ai",
      NEXT_PUBLIC_SENTRY_DSN: "",
      SENTRY_DSN: "",
      NODE_ENV: "development",
    },
  },
})

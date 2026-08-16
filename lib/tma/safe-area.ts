// lib/tma/safe-area.ts
//
// Telegram Mini App top safe-area handling.
//
// `env(safe-area-inset-top)` only knows about the DEVICE notch/Dynamic
// Island — it has no idea Telegram draws its own header chrome (the
// Close / ⌄ / ⋯ pill) on top of our content. Telegram exposes that
// separately via `WebApp.contentSafeAreaInset` (space occupied by
// Telegram's own UI) and `WebApp.safeAreaInset` (device safe area), both
// added in Bot API 8.0. Neither exists on older clients or in a plain
// browser, so every read here is optional-chained and falls back to
// letting CSS `env()` do the job.
//
// Single source of truth: as soon as real numbers are available, this
// writes `--tg-top` (px) onto :root and keeps it live via the
// `safeAreaChanged` / `contentSafeAreaChanged` events. Consumers never talk
// to `window.Telegram` directly — they just reference
// `var(--tg-top, env(safe-area-inset-top, 0px))` in CSS/inline styles, so
// the value updates live (CSS custom properties repaint automatically)
// regardless of which component happens to mount first.
//
// NB: deliberately not augmenting the global `Window.Telegram` type here —
// several other files in the app already declare their own (mutually
// conflicting) shapes for it, so we read through an `any` cast like
// lib/tma/geo.ts does, instead of adding a fourth conflicting declaration.

export interface TgInset {
  top: number
  bottom: number
  left: number
  right: number
}

function getWebApp(): any {
  return typeof window !== "undefined" ? (window as any).Telegram?.WebApp : undefined
}

function readTopInset(): number | null {
  const tg = getWebApp()
  if (!tg) return null

  const device: number | undefined = tg.safeAreaInset?.top
  const chrome: number | undefined = tg.contentSafeAreaInset?.top

  // Both fields are undefined on clients older than Bot API 8.0 (and in a
  // plain browser) — nothing real to report, caller stays on the env()
  // fallback baked into the CSS `var(..., env(...))` chain.
  if (typeof device !== "number" && typeof chrome !== "number") return null

  return (device || 0) + (chrome || 0)
}

function applyTopInset(): void {
  const top = readTopInset()
  if (top === null) return
  document.documentElement.style.setProperty("--tg-top", `${top}px`)
}

/**
 * Subscribes `:root`'s `--tg-top` custom property to Telegram's real
 * top safe-area insets (device notch + Telegram's own header chrome).
 * Call once near the app root. Returns a cleanup function.
 *
 * No-op outside Telegram or on old clients — no CSS var gets written, so
 * every consumer's `var(--tg-top, env(safe-area-inset-top, 0px))` fallback
 * stays in effect.
 */
export function initTmaSafeArea(): () => void {
  if (typeof window === "undefined") return () => {}

  applyTopInset()

  const tg = getWebApp()
  if (!tg?.onEvent) return () => {}

  const handler = () => applyTopInset()
  tg.onEvent("safeAreaChanged", handler)
  tg.onEvent("contentSafeAreaChanged", handler)

  return () => {
    tg.offEvent?.("safeAreaChanged", handler)
    tg.offEvent?.("contentSafeAreaChanged", handler)
  }
}

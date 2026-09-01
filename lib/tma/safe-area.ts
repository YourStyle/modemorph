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
// writes `--tg-chrome` (px) onto :root and keeps it live via the
// `safeAreaChanged` / `contentSafeAreaChanged` events. Consumers never talk
// to `window.Telegram` directly — they just reference
// `var(--tg-chrome, env(safe-area-inset-top, 0px))` in CSS/inline styles, so
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

/**
 * Только хром самого Telegram (пилюля «Закрыть / ⌄ / …»), БЕЗ выреза устройства.
 *
 * Раньше здесь возвращалась сумма safeAreaInset.top + contentSafeAreaInset.top,
 * и это давало двойной счёт: вебвью в Telegram почти всегда уже начинается ниже
 * выреза, поэтому env(safe-area-inset-top) внутри него и так отрабатывает, а мы
 * сверху добавляли вырез ещё раз. На iPhone 14 это лишние ~59 точек — ровно та
 * пустота сверху, на которую жаловались с устройства.
 *
 * Теперь величины разделены: вырез считает CSS через env(), Telegram отдаёт
 * только свою шапку, потребители складывают их сами. Так корректно во всех трёх
 * случаях: вне Telegram (env + 0), в Telegram с вебвью под вырезом (0 + хром)
 * и в Telegram во весь экран (env + хром).
 */
function readChromeInset(): number | null {
  const tg = getWebApp()
  if (!tg) return null

  const chrome: number | undefined = tg.contentSafeAreaInset?.top

  // Поля нет на клиентах старше Bot API 8.0 и в обычном браузере — сообщать
  // нечего, потребители остаются на голом env().
  if (typeof chrome !== "number") return null

  return chrome
}

/**
 * Нижний отступ устройства (полоса home indicator) — БЕЗ хрома Telegram:
 * снизу Telegram ничего не рисует, поэтому здесь нужен safeAreaInset, а не
 * contentSafeAreaInset. Это зеркало ситуации сверху, но по другой причине.
 *
 * Зачем вообще: внутри вебвью Telegram на iOS env(safe-area-inset-bottom)
 * отдаёт 0, хотя вебвью физически доходит до низа экрана. Нижняя пилюля
 * навигации из-за этого садилась в полосу home indicator, где тапы забирает
 * система: видно, нажать нельзя (жалоба с iPhone 17).
 *
 * Складывать с env() НЕЛЬЗЯ — это тот же двойной счёт, на котором обожглись
 * сверху. Потребители берут max() из двух величин (см. --sab в globals.css).
 */
function readDeviceBottomInset(): number | null {
  const tg = getWebApp()
  if (!tg) return null

  const bottom: number | undefined = tg.safeAreaInset?.bottom
  if (typeof bottom !== "number") return null

  return bottom
}

function applyInsets(): void {
  const chrome = readChromeInset()
  if (chrome !== null) {
    document.documentElement.style.setProperty("--tg-chrome", `${chrome}px`)
  }

  const bottom = readDeviceBottomInset()
  if (bottom !== null) {
    document.documentElement.style.setProperty("--tg-safe-bottom", `${bottom}px`)
  }
}

/**
 * Subscribes `:root`'s `--tg-chrome` custom property to Telegram's real
 * top safe-area insets (device notch + Telegram's own header chrome).
 * Call once near the app root. Returns a cleanup function.
 *
 * No-op outside Telegram or on old clients — no CSS var gets written, so
 * every consumer's `var(--tg-chrome, env(safe-area-inset-top, 0px))` fallback
 * stays in effect.
 */
export function initTmaSafeArea(): () => void {
  if (typeof window === "undefined") return () => {}

  applyInsets()

  const tg = getWebApp()
  if (!tg?.onEvent) return () => {}

  const handler = () => applyInsets()
  tg.onEvent("safeAreaChanged", handler)
  tg.onEvent("contentSafeAreaChanged", handler)

  return () => {
    tg.offEvent?.("safeAreaChanged", handler)
    tg.offEvent?.("contentSafeAreaChanged", handler)
  }
}

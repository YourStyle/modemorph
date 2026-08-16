// Presentational-only local flags for the outfit like/dislike feedback UX
// (toast throttling + one-time explainer popup). Does NOT touch the actual
// reaction payload sent to the backend, analytics events, or recommendation
// logic — those stay exactly as they were.
//
// Telegram WebView on iOS in private/incognito mode can throw on
// localStorage.setItem/getItem instead of just failing silently, so every
// read/write here is guarded and degrades to "don't show" rather than
// crashing the UI.

const TOAST_KEY = "mm_outfit_feedback_toast_last_shown"
const EXPLAINER_KEY = "mm_outfit_feedback_explainer_seen"
const TOAST_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000 // не чаще раза в сутки

function isStorageAvailable(): boolean {
  if (typeof window === "undefined") return false
  try {
    const testKey = "__mm_storage_test__"
    window.localStorage.setItem(testKey, "1")
    window.localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/**
 * Should we show the "подборки подстроятся" toast right now?
 * At most once every 24h, so it doesn't fire on every like/dislike tap.
 */
export function shouldShowFeedbackToast(): boolean {
  if (!isStorageAvailable()) return false
  try {
    const last = window.localStorage.getItem(TOAST_KEY)
    if (!last) return true
    const lastTs = Number(last)
    if (Number.isNaN(lastTs)) return true
    return Date.now() - lastTs >= TOAST_MIN_INTERVAL_MS
  } catch {
    return false
  }
}

export function markFeedbackToastShown(): void {
  if (!isStorageAvailable()) return
  try {
    window.localStorage.setItem(TOAST_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

/**
 * One-time-ever explainer: "recommendations adapt to your reactions".
 * Shown on the very first like/dislike tap the user ever makes across the
 * whole app, never again after that.
 */
export function shouldShowFeedbackExplainer(): boolean {
  if (!isStorageAvailable()) return false
  try {
    return !window.localStorage.getItem(EXPLAINER_KEY)
  } catch {
    return false
  }
}

export function markFeedbackExplainerSeen(): void {
  if (!isStorageAvailable()) return
  try {
    window.localStorage.setItem(EXPLAINER_KEY, "1")
  } catch {
    /* ignore */
  }
}

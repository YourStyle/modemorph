// Client errors → POST /api/client-errors → hourly digest in the admins' bot
// (backend/app/api/errors.py). Imported by lib/api-client.ts, so the global
// listeners are installed on every page.
//
// Deliberately NOT reported: 5xx (the backend records those itself), 402
// (paywall is not an error), 4xx validation. Raw fetch, not api-client — a
// failing report must never report itself.

const seen = new Set<string>()
let budget = 20 // per page load: one broken loop must not flood the table

export function reportError(e: { message: string; location?: string; detail?: string; status?: number }) {
  if (typeof window === "undefined" || budget <= 0) return
  const key = `${e.location}|${e.message}`
  if (seen.has(key)) return
  seen.add(key)
  budget--
  let token: string | null = null
  try {
    const raw = sessionStorage.getItem("tma_session") || localStorage.getItem("tma_session")
    token = raw ? JSON.parse(raw).access_token : null
  } catch {}
  const tg = (window as any).Telegram?.WebApp?.initData ? "tma" : "web"
  void fetch("/api/client-errors", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify({
      message: e.message.slice(0, 500),
      location: `${e.location || window.location.pathname} [${tg}]`,
      detail: e.detail?.slice(0, 3000),
      status: e.status,
    }),
  }).catch(() => {})
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (ev) => {
    // Resource load errors (img 404) have no message — the catalog has plenty of dead images.
    if (!ev.message) return
    reportError({ message: ev.message, detail: ev.error?.stack || `${ev.filename}:${ev.lineno}:${ev.colno}` })
  })
  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason
    const message = r instanceof Error ? r.message : String(r)
    // api-client already reported the ones worth reporting.
    if (/^API Error \d+/.test(message)) return
    reportError({ message: `Unhandled: ${message}`, detail: r instanceof Error ? r.stack : undefined })
  })
}

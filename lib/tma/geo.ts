// Telegram Mini App–aware geolocation.
//
// In the Telegram WebView, navigator.geolocation usually never prompts (Telegram
// does not pass the browser permission through), so the old code silently timed
// out and fell back to Moscow. We try Telegram's LocationManager first (the
// proper TMA API — it shows a real permission prompt inside Telegram), then fall
// back to navigator.geolocation (web/desktop), then return null (caller decides).

export interface Coords {
  latitude: number
  longitude: number
}

function viaTelegram(timeoutMs: number): Promise<Coords | null> {
  return new Promise((resolve) => {
    const lm =
      (typeof window !== "undefined" && (window as any).Telegram?.WebApp?.LocationManager) || null
    if (!lm || typeof lm.init !== "function") {
      resolve(null)
      return
    }
    let settled = false
    const finish = (v: Coords | null) => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    try {
      lm.init(() => {
        try {
          if (!lm.isLocationAvailable) {
            clearTimeout(timer)
            finish(null)
            return
          }
          lm.getLocation((loc: any) => {
            clearTimeout(timer)
            if (loc && typeof loc.latitude === "number" && typeof loc.longitude === "number") {
              finish({ latitude: loc.latitude, longitude: loc.longitude })
            } else {
              finish(null) // denied / unavailable
            }
          })
        } catch {
          clearTimeout(timer)
          finish(null)
        }
      })
    } catch {
      clearTimeout(timer)
      finish(null)
    }
  })
}

function viaBrowser(timeoutMs: number): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null)
      return
    }
    let settled = false
    const finish = (v: Coords | null) => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer)
        finish({ latitude: p.coords.latitude, longitude: p.coords.longitude })
      },
      () => {
        clearTimeout(timer)
        finish(null)
      },
      { timeout: Math.max(timeoutMs - 500, 3000), maximumAge: 300000 },
    )
  })
}

/** Resolve the user's coordinates, or null if unavailable/denied. */
export async function getUserCoords(timeoutMs = 8000): Promise<Coords | null> {
  const fromTelegram = await viaTelegram(timeoutMs)
  if (fromTelegram) return fromTelegram
  return viaBrowser(timeoutMs)
}

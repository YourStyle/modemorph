"use client"

import { useEffect } from "react"

export default function GlobalErrorWire() {
  useEffect(() => {
    const post = (payload: any) => {
      try {
        navigator.sendBeacon?.("/api/_debug/client-log", JSON.stringify(payload))
      } catch {
        fetch("/api/_debug/client-log", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {})
      }
    }

    const onError = (e: ErrorEvent) => {
      post({
        t: "error",
        msg: e.message,
        file: e.filename,
        line: e.lineno,
        col: e.colno,
        stack: e.error?.stack || null,
        ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
      })
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason
      post({
        t: "unhandledrejection",
        msg: (r && (r.message || r.toString())) || "unknown",
        stack: r?.stack || null,
        ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
      })
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  return null
}

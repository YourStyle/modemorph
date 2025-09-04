"use client"

import { useEffect } from "react"

export default function TmaBodyClass() {
  useEffect(() => {
    const tg = (typeof window !== "undefined" ? (window as any).Telegram?.WebApp : undefined)

    const hasInit   = !!tg?.initData && String(tg.initData).trim().length > 0
    const hasUser   = !!tg?.initDataUnsafe?.user?.id || !!tg?.initDataUnsafe?.query_id
    const platform  = String(tg?.platform || "").toLowerCase()
    const inTma     = !!tg && hasInit && hasUser && platform !== "unknown"

    if (inTma) document.body.classList.add("tma-root")
    else       document.body.classList.remove("tma-root")

    return () => document.body.classList.remove("tma-root")
  }, [])

  return null
}

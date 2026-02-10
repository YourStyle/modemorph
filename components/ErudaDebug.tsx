"use client"

import { useEffect } from "react"

export default function ErudaDebug() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_TMA_DEBUG === "1" && typeof window !== "undefined") {
      import("eruda").then((eruda) => {
        eruda.default.init()
        console.log("[Eruda] Debug console initialized")
      })
    }
  }, [])

  return null
}

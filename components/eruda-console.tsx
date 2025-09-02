"use client"

import { useEffect } from "react"

export default function ErudaConsole() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TMA_DEBUG === "true") {
      import("eruda").then((eruda) => {
        eruda.default.init()
      })
    }
  }, [])

  return null
}

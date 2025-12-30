"use client"

import { useEffect } from "react"

export default function ErudaDebug() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      import("eruda").then((eruda) => {
        eruda.default.init()
        console.log("[Eruda] Debug console initialized")
      })
    }
  }, [])

  return null
}

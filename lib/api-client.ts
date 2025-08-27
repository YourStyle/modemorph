"use client"

import { useAuth } from "@/contexts/auth-context"

export function useApiClient() {
  const { trackUnauthorizedError } = useAuth()

  const apiCall = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

    if (response.status === 401) {
      console.log(`[v0] 401 error detected from ${url}`)
      trackUnauthorizedError()
    }

    return response
  }

  return { apiCall }
}

if (typeof window !== "undefined") {
  const originalFetch = window.fetch
  let authContext: any = null

  // Store auth context reference
  window.setAuthContext = (context: any) => {
    authContext = context
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init)

    if (response.status === 401 && authContext?.trackUnauthorizedError) {
      console.log(`[v0] Global 401 error detected from ${input}`)
      authContext.trackUnauthorizedError()
    }

    return response
  }
}

declare global {
  interface Window {
    setAuthContext: (context: any) => void
  }
}

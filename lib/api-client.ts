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

    // Track 401 errors for automatic redirect
    if (response.status === 401 && response.headers.get("X-Track-Unauthorized")) {
      trackUnauthorizedError()
    }

    return response
  }

  return { apiCall }
}

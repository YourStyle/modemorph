"use client"

import { useAuth } from "@/contexts/auth-context"

export function useApiClient() {
  const { trackUnauthorizedError } = useAuth()

  const apiCall = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

    if (response.status === 401) {
    
      trackUnauthorizedError()
    }

    return response
  }

  return { apiCall }
}

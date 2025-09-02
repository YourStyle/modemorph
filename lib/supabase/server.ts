// lib/supabase/server.ts
import { cookies, headers } from "next/headers"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { createClient as createAdminClient } from "@supabase/supabase-js"

type Role = "anon" | "service"

function getEnvOrThrow(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

export function createClient(opts?: { role?: Role }) {
  // ВАЖНО: берём ровно те же значения везде (клиент/сервер)
  const url = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY")

  // Для сервиса — отдельный админ-клиент (без куки)
  if (opts?.role === "service") {
    const serviceKey = getEnvOrThrow("SUPABASE_SERVICE_ROLE") || getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY")
    return createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  const cookieStore = cookies()
  const hdrs = headers()

  return createServerClient(url, anonKey, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value
      },
      set(name, value, options: CookieOptions) {
        cookieStore.set({ name, value, ...options })
      },
      remove(name, options: CookieOptions) {
        cookieStore.set({ name, value: "", ...options })
      },
    },
    headers: {
      "x-forwarded-for": hdrs.get("x-forwarded-for") ?? undefined,
      "user-agent": hdrs.get("user-agent") ?? undefined,
    },
  })
}

export function isSupabaseConfigured(): boolean {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    return !!(url && anonKey)
  } catch {
    return false
  }
}

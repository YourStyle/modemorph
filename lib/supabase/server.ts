// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr"
import { cookies, headers } from "next/headers"

type Role = "anon" | "service"

export const isSupabaseConfigured = !!(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
)

export function createClient(opts?: { role?: Role }) {
  const cookieStore = cookies()
  const hdrs = headers()
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""

  // поддержка обоих имён:
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

  const key = opts?.role === "service" ? serviceKey : anonKey

  return createServerClient(url, key, {
    cookies: {
      get: (n) => cookieStore.get(n)?.value,
      set: (n, v, o) => cookieStore.set({ name: n, value: v, ...o }),
      remove: (n, o) => cookieStore.set({ name: n, value: "", ...o }),
    },
    headers: {
      "x-forwarded-for": hdrs.get("x-forwarded-for") ?? undefined,
      "user-agent": hdrs.get("user-agent") ?? undefined,
    },
  })
}

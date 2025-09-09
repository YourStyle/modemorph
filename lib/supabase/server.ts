// lib/supabase/server.ts
import { cookies, headers } from "next/headers"
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { createClient as createAdminClient } from "@supabase/supabase-js"

type Role = "anon" | "service"

function must(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

export function isSupabaseConfigured(): boolean {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    return !!(url && anonKey && url.trim() && anonKey.trim())
  } catch (error) {
    return false
  }
}

export function createClient(opts?: { role?: Role }) {
  const url = must("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = must("NEXT_PUBLIC_SUPABASE_ANON_KEY")

  if (opts?.role === "service") {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) throw new Error("Missing env: SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY")
    return createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  const cookieStore = cookies()
  const hdrs = headers()
  const cookieDomain = ".modemorph.ru"
  const force: Partial<CookieOptions> = {
    // В проде:
    sameSite: "none",
    secure: true,
    domain: cookieDomain,
    path: "/",
  }

  return createServerClient(url, anonKey, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value
      },
      set(name, value, options: CookieOptions) {
        // Принудительно навешиваем флаги для 3rd-party контекста
        cookieStore.set({ name, value, ...options, ...force })
      },
      remove(name, options: CookieOptions) {
        cookieStore.set({
          name,
          value: "",
          ...options,
          sameSite: "none",
          secure: true,
          domain: ".modemorph.ru",
          path: "/",
          maxAge: 0,           // <-- важно
        })
      },
    },
    headers: {
      "x-forwarded-for": hdrs.get("x-forwarded-for") ?? undefined,
      "user-agent": hdrs.get("user-agent") ?? undefined,
    },
  })
}

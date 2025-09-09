import type { User } from "@supabase/supabase-js"

const pending: Record<string, Promise<User | null>> = {}

export function getUser(cookie?: string): Promise<User | null> {
  const key = cookie ?? "client"
  if (pending[key]) return pending[key]
  const url = typeof window === "undefined"
    ? `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/auth/me`
    : "/api/auth/me"
  pending[key] = fetch(url, {
    credentials: "include",
    headers: cookie ? { cookie } : undefined,
  })
    .then(r => r.ok ? r.json() : { user: null })
    .then(d => (d.user as User | null))
    .finally(() => {
      delete pending[key]
    })
  return pending[key]
}

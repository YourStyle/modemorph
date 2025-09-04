// app/api/auth/logout/route.ts
export const runtime = "nodejs"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { attachSupabaseCookieClears } from "@/lib/clear-supabase-cookies"

export async function POST() {
  // 1) Попробуем корректно разлогинить текущую сессию (если есть)
  const supabase = createClient()
  try {
    await supabase.auth.signOut({ scope: "global" }) // удалит refresh во всех девайсах; можно 'local'
  } catch {
    // даже если не было сессии — идём дальше
  }

  // 2) Принудительно погасим все возможные куки
  const res = attachSupabaseCookieClears(NextResponse.json({ success: true }))
  return res
}

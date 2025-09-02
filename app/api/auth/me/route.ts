// app/api/auth/me/route.ts
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

function projectRefFromUrl(url: string) {
  const m = url.match(/^https:\/\/([^.]+)\.supabase\.co/i)
  return m?.[1] || null
}

export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase.auth.getUser()

  if (!data?.user) {
    const all = cookies().getAll().map(c => c.name)
    const ref = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    const expected = ref ? `sb-${ref}-auth-token` : "(no ref)"
    return NextResponse.json(
      { user: null, cookies: all, expectedPrefix: expected },
      { status: 401 }
    )
  }

  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } })
}

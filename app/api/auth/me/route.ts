export const runtime = "nodejs"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return NextResponse.json({ user: null }, { status: 401 })
  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } })
}

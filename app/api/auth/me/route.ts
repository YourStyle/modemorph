// app/api/auth/me/route.ts (новый эндпоинт)
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) return NextResponse.json({ user: null }, { status: 200 })
  return NextResponse.json({ user }, { status: 200 })
}

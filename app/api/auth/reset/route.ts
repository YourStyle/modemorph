// app/api/auth/reset/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 })
    const supabase = await createClient()
    const redirectTo = process.env.SUPABASE_RESET_REDIRECT!
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Reset failed" }, { status: 500 })
  }
}

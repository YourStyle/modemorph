import { NextResponse, NextRequest } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const invId = searchParams.get("invId")
  if (!invId) return NextResponse.json({ error: "invId required" }, { status: 400 })

  // Проверяем авторизацию через session auth
  const user = await getAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Используем service role для запроса к таблице payments
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data, error } = await supabase
    .from("payments")
    .select("id")
    .eq("invoice_id", invId)
    .eq("user_id", user.id) // Проверяем что payment принадлежит пользователю
    .maybeSingle()

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ paymentId: data.id })
}

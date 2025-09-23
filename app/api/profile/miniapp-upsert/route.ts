export const runtime = "nodejs"
import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "No session" }, { status: 401 })

  try {
    const body = await req.json()

    // Получаем метаданные пользователя из auth
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Получаем данные пользователя из auth.users для доступа к user_metadata
    const { data: authUser } = await supabase.auth.admin.getUserById(user.id)
    const metadata = authUser?.user?.user_metadata || {}

    const payload = {
      user_id: user.id,
      gender: body.gender,
      height: Number(body.height),
      weight: Number(body.weight),
      top_size: body.top_size,
      bottom_size: body.bottom_size,
      shoe_size: Number.isFinite(Number(body.shoe_size)) ? Number(body.shoe_size) : body.shoe_size,
      referral: body.referral || null,
      // Добавляем данные из Telegram метаданных
      full_name: metadata.full_name || null,
      avatar_url: metadata.telegram_photo_url || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from("user_profiles").upsert(payload, { onConflict: "user_id" })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 })
  }
}
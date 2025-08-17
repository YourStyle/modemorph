// /api/limits/consume — инкремент 1 использования, если не превышен лимит
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const raw = String(body.featureType ?? body.usageType ?? "").toLowerCase()
  // Нормализация синонимов
  const featureType =
    raw === "ideas_views"
      ? "ideas_viewed"
      : raw === "wardrobe_digitizations" || raw === "digitize"
        ? "wardrobe_items"
        : raw

  const { data: profile, error: profErr } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single()
  if (profErr || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  // Инициализация/сброс суток выполняется внутри самой use_feature
  const { data: ok, error: rpcErr } = await supabase.rpc("use_feature", {
    p_user_profile_id: profile.id,
    p_feature_type: featureType,
    p_increment: 1,
  })

  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 })
  if (!ok) return NextResponse.json({ error: "Daily limit exceeded" }, { status: 429 })
  return NextResponse.json({ success: true })
}

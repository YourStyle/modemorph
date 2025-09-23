// /api/credits/spend
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "X-Track-Unauthorized": "true" } });
  }

  // Используем service role для операций с базой
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, serviceKey);

  const { amount, reason, description } = await req.json();
  if (!reason) return NextResponse.json({ error: "Reason is required" }, { status: 400 });

  // нормализация для SQL-функции
  const r = String(reason).toLowerCase();
  const canonicalReason =
    r === "ideas_viewing" || r === "ideas_views" || r === "ideas_viewed" || r === "ideas"
      ? "ideas_views"
      : r === "ai_assistant" || r === "ai_requests" || r === "ai"
      ? "ai_requests"
      : r === "digitize" || r === "wardrobe_digitization" || r === "wardrobe_digitizations" || r === "wardrobe_items"
      ? "wardrobe_items"
      : r === "outfits_saved" || r === "outfit_creation"
      ? "outfits_saved"
      : r === "ai_try_on" || r === "try_on" || r === "tryon"
      ? "ai_try_on"
      : r;

  // профиль
  const { data: profile, error: profErr } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (profErr || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // списание и покупка бонусов
  const { data: ok, error: spendErr } = await supabase.rpc("spend_credits", {
    p_user_profile_id: profile.id,
    p_amount: amount ?? 0,
    p_reason: canonicalReason,
    p_description: description ?? null,
  });
  if (spendErr) return NextResponse.json({ error: spendErr.message }, { status: 400 });
  if (!ok) return NextResponse.json({ error: "Insufficient credits" }, { status: 400 });

  // новый баланс
  const { data: credits } = await supabase
    .from("user_credits")
    .select("credits_balance")
    .eq("user_profile_id", profile.id)
    .single();

  return NextResponse.json({ success: true, newBalance: credits?.credits_balance ?? 0 });
}

// /api/credits/spend — принимает reason (обязательно) и amount (опционально)
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "X-Track-Unauthorized": "true" } }
      );
    }

    const { amount, reason, description } = await request.json();
    // reason обязательный, amount — нет: стоимость берётся из feature_costs
    if (!reason) return NextResponse.json({ error: "Reason is required" }, { status: 400 });

    // Нормализация названия в каноническое имя из feature_costs
    const rawReason = String(reason).toLowerCase();
    const canonicalReason =
      rawReason === "ideas_views" || rawReason === "ideas_viewed"
        ? "ideas_viewing"
        : rawReason === "wardrobe_items" ||
          rawReason === "digitize" ||
          rawReason === "wardrobe_digitizations"
        ? "wardrobe_digitization"
        : rawReason === "ai_requests" || rawReason === "ai_assistant"
        ? "ai_assistant"
        : rawReason === "outfits_saved" || rawReason === "outfit_creation"
        ? "outfit_creation"
        : rawReason === "ai_try_on"
        ? "ai_try_on"
        : rawReason;

    const { data: profile, error: profErr } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (profErr || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const { data: success, error: spendErr } = await supabase.rpc("spend_credits", {
      p_user_profile_id: profile.id,
      // если amount не указан, передаём 0, чтобы функция взяла стоимость из feature_costs
      p_amount: amount ?? 0,
      p_reason: canonicalReason,
      p_description: description ?? null,
    });
    if (spendErr) return NextResponse.json({ error: spendErr.message }, { status: 400 });
    if (!success) return NextResponse.json({ error: "Insufficient credits" }, { status: 400 });

    const { data: credits } = await supabase
      .from("user_credits")
      .select("credits_balance")
      .eq("user_profile_id", profile.id)
      .single();

    return NextResponse.json({ success: true, newBalance: credits?.credits_balance ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

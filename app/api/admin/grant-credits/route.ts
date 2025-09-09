import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const supabase = await createClient()

  // 1) Аутентификация
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2) Проверка, что вызывающий — админ
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // 3) Входные параметры
  const { userId, credits, subscriptionType, subscriptionDuration } = await request.json()

  try {
    // 4) Начисление кредитов (через RPC)
    if (credits && credits > 0) {
      const { error: creditsError } = await supabase.rpc("add_user_credits", {
        target_user_id: userId,
        credits_to_add: credits,
        transaction_type: "admin_grant", // допустимо, если функция игнорирует/нормализует
        description: `Admin granted ${credits} credits`,
      })
      if (creditsError) throw creditsError
    }

    // 5) Начисление подписки (ВСТАВИТЬ В ЭТОТ БЛОК)
    if (subscriptionType && subscriptionDuration) {
      const startDate = new Date()
      const endDate = new Date()

      if (subscriptionDuration === "monthly") {
        endDate.setMonth(endDate.getMonth() + 1)
      } else if (subscriptionDuration === "yearly") {
        endDate.setFullYear(endDate.getFullYear() + 1)
      }

      const { data: targetProfile, error: pErr } = await supabase
  .from("user_profiles")
  .select("id")
  .eq("user_id", userId)
  .single();
if (pErr || !targetProfile) throw pErr ?? new Error("Target profile not found");

const { error: subError } = await supabase
  .from("user_subscriptions")
  .upsert(
    {
      user_profile_id: targetProfile.id,
      subscription_type: subscriptionType,
      status: "active",
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      credits_included: subscriptionType === "pro" ? 40 : 0,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_profile_id", returning: "minimal" }
  );
if (subError) throw subError;
    }

    // 6) Ответ
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

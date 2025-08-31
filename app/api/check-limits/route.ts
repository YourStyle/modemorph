// POST /api/check-limits
// { usageType } -> ПРОВЕРКА без списания (canUse + remaining)
// { featureType } -> СПИСАНИЕ 1 единицы (auto-topup из кредитов) + remaining
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Feature =
  | "wardrobe_items_anlyzed"
  | "ai_requests"
  | "ideas_viewed"
  | "outfits_saved"
  | "vton_used";

function normalize(raw: string): Feature {
  const v = String(raw || "").toLowerCase();
  if (["digitize", "wardrobe", "wardrobe_items"].includes(v)) return "wardrobe_items_anlyzed";
  if (["ai", "assistant", "ai_requests"].includes(v)) return "ai_requests";
  if (["ideas", "ideas_views", "ideas_viewed"].includes(v)) return "ideas_viewed";
  if (["looks", "outfits", "outfits_saved"].includes(v)) return "outfits_saved";
  if (["vton", "tryon", "vton_used"].includes(v)) return "vton_used";
  return "ideas_viewed";
}

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) ?? {};
  const mode = body.featureType ? "consume" : "check";
  const key = normalize(body.featureType ?? body.usageType ?? "");

  // профиль
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const profileId = profile.id;
  const count = Number(body.count ?? 1);
  const meta = body?.meta ?? {};
  const pagePath: string | undefined = meta.pagePath;
  const itemId: number | undefined = meta.itemId;
  const requestId: string | undefined = meta.requestId;

  // всегда реконсилируем перед любой операцией
  await supabase.rpc("reconcile_limits", { p_user_profile_id: profile.id });

  if (mode === "consume") {
    // списываем 1 (с автотопапом из кредитов, если нужно)
    const { data: ok, error: rpcErr } = await supabase.rpc("use_feature", {
      p_user_profile_id: profile.id,
      p_feature: key,
      p_count: count,
    });

    await supabase.rpc("log_usage_event", {
      p_user_profile_id: profileId,
      p_feature: key,
      p_action: ok ? "consume_success" : "consume_fail",
      p_count: count,
      p_page_path: pagePath,
      p_item_id: itemId ?? null,
      p_request_id: requestId ?? null,
      p_metadata: body?.meta ?? {},
    });

    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 });
    if (!ok) {
      // лимитов нет и кредитов нет
      return NextResponse.json(
        { success: false, canUse: false, code: "payment_required" },
        { status: 402 }
      );
    }
  } else {
    // просто проверка возможности (учитывая возможность авто-топапа)
    const { data: canUse, error: canErr } = await supabase.rpc("can_use_feature", {
      p_user_profile_id: profile.id,
      p_feature: key,
      p_count: count,
    });
    if (canErr) return NextResponse.json({ error: canErr.message }, { status: 400 });

    await supabase.rpc("log_usage_event", {
      p_user_profile_id: profileId,
      p_feature: key,
      p_action: "check",
      p_count: count,
      p_page_path: pagePath,
      p_item_id: itemId ?? null,
      p_request_id: requestId ?? null,
      p_metadata: body?.meta ?? {},
    });

    if (!canUse) return NextResponse.json({ success: true, canUse: false, remaining: 0 });
  }

  // вернуть остатки
  const { data: limits } = await supabase
    .from("limits")
    .select("wardrobe_items_anlyzed, ai_requests, ideas_viewed, outfits_saved, vton_used")
    .eq("user_profile_id", profile.id)
    .single();

  const remaining =
    key === "wardrobe_items_anlyzed"
      ? limits?.wardrobe_items_anlyzed ?? 0
      : key === "ai_requests"
      ? limits?.ai_requests ?? 0
      : key === "vton_used"
      ? limits?.vton_used ?? 0
      : key === "ideas_viewed"
      ? limits?.ideas_viewed ?? 0
      : limits?.outfits_saved ?? 0;

  return NextResponse.json({ success: true, canUse: true, remaining });
}

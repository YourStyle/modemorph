import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Feature =
  | "wardrobe_items_anlyzed"
  | "ai_requests"
  | "ideas_viewed"
  | "outfits_saved"
  | "vton_used";

const FEATURE_KEYS = {
  wardrobe_items_anlyzed: "wardrobe_items_anlyzed", 
  ai_requests: "ai_requests",
  vton_used: "vton_used",
  ideas_viewed: "ideas_viewed",
  outfits_saved: "outfits_saved",
} as const;


function normFeature(s?: string) {
  if (!s) return null;
  const k = s.trim().toLowerCase();
  if (k in FEATURE_KEYS) return k as keyof typeof FEATURE_KEYS;
  if (k === "wardrobe_items_analyzed") return "wardrobe_items_anlyzed"; 
  if (k === "vton") return "vton_used";
  return null; 
}


export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) ?? {};

  const rawFeatureName: string | undefined =
    body.featureType ?? body.usageType ?? body.feature ?? body.type;
  const feature = normFeature(rawFeatureName);

  const mode = body.featureType ? "consume" : "check";
  if (!feature) {
    return NextResponse.json(
      {
        error: "Unknown feature type",
        received: rawFeatureName ?? null,
        allowed: Object.keys(FEATURE_KEYS),
      },
      { status: 400 },
    );
  }


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
      p_feature: feature,
      p_count: count,
    });

    await supabase.rpc("log_usage_event", {
      p_user_profile_id: profileId,
      p_feature: feature,
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
      p_feature: feature,
      p_count: count,
    });
    if (canErr) return NextResponse.json({ error: canErr.message }, { status: 400 });

    await supabase.rpc("log_usage_event", {
      p_user_profile_id: profileId,
      p_feature: feature,
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
    feature === "wardrobe_items_anlyzed"
      ? limits?.wardrobe_items_anlyzed ?? 0
      : feature === "ai_requests"
      ? limits?.ai_requests ?? 0
      : feature === "vton_used"
      ? limits?.vton_used ?? 0
      : feature === "ideas_viewed"
      ? limits?.ideas_viewed ?? 0
      : limits?.outfits_saved ?? 0;

  return NextResponse.json({ success: true, canUse: true, remaining });
}

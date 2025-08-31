import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Feature = "wardrobe_items_anlyzed" | "ai_requests" | "ideas_viewed" | "outfits_saved" | "vton_used";
type Action = "click" | "attempt" | "purchase_sub" | "purchase_credits";

function normFeature(s: string): Feature {
  const v = (s || "").toLowerCase();
  if (["digitize", "wardrobe", "wardrobe_items"].includes(v)) return "wardrobe_items_anlyzed";
  if (["ai", "assistant", "ai_requests"].includes(v)) return "ai_requests";
  if (["ideas", "ideas_views"].includes(v)) return "ideas_viewed";
  if (["looks", "outfits"].includes(v)) return "outfits_saved";
  if (["vton", "tryon"].includes(v)) return "vton_used";
  return "ideas_viewed";
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const key = normFeature(body.feature);
  const action: Action = body.action;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  await supabase.rpc("log_usage_event", {
    p_user_profile_id: profile.id,
    p_feature: key,
    p_action: action,
    p_count: Number(body.count ?? 1),
    p_page_path: body?.meta?.pagePath ?? null,
    p_item_id: body?.meta?.itemId ?? null,
    p_request_id: body?.meta?.requestId ?? null,
    p_metadata: body?.meta ?? {},
  });

  return NextResponse.json({ ok: true });
}

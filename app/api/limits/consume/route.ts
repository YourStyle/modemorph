import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-server";
import { createClient } from "@supabase/supabase-js";

type Feature = "wardrobe_items_anlyzed" | "ai_requests" | "ideas_viewed" | "outfits_saved" | "vton_used";
const norm = (s: string): Feature => {
  const v = (s || "").toLowerCase();
  if (["digitize", "wardrobe", "wardrobe_items"].includes(v)) return "wardrobe_items_anlyzed";
  if (["ai", "assistant", "ai_requests"].includes(v)) return "ai_requests";
  if (["ideas", "ideas_views", "ideas_viewed"].includes(v)) return "ideas_viewed";
  if (["looks", "outfits", "outfits_saved"].includes(v)) return "outfits_saved";
  if (["vton", "tryon", "vton_used"].includes(v)) return "vton_used";
  return "ideas_viewed";
};

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Используем service role для операций с базой
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, serviceKey);

  const body = await req.json();
  const key = norm(body.featureType ?? body.usageType ?? "");

  const { data: profile } = await supabase.from("user_profiles").select("id").eq("user_id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  await supabase.rpc("reconcile_limits", { p_user_profile_id: profile.id });

  const { data: ok, error: rpcErr } = await supabase.rpc("use_feature", {
    p_user_profile_id: profile.id,
    p_feature: key,
    p_count: 1,
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 });
  if (!ok)
    return NextResponse.json({ error: "Limit exceeded or insufficient credits", code: "payment_required" }, { status: 402 });

  return NextResponse.json({ success: true });
}

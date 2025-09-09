import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("user_profiles").select("id").eq("user_id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { error } = await supabase.rpc("reconcile_limits", { p_user_profile_id: profile.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const supabase = await createClient({ token });
  const { data: { user } } = await supabase.auth.getUser();
  return NextResponse.json({ user });
}

export const runtime = "nodejs"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No session" }, { status: 401 })

  const { data, error } = await supabase
    .from("user_profiles")
    .select("gender,height,weight,top_size,bottom_size,shoe_size")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ profile: data })
}

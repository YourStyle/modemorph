import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const invId = searchParams.get("invId")
  if (!invId) return NextResponse.json({ error: "invId required" }, { status: 400 })

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("payments")
    .select("id")
    .eq("invoice_id", invId)
    .maybeSingle()

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ paymentId: data.id })
}

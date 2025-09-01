import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import crypto from "crypto"

function md5hex(s: string) {
  return crypto.createHash("md5").update(s).digest("hex")
}

export async function POST(req: Request) {
  try {
    // RoboKassa обычно присылает form-encoded
    const form = await req.formData()
    const OutSum = String(form.get("OutSum") ?? "")
    const InvId  = String(form.get("InvId")  ?? "")
    const Sig    = String(form.get("SignatureValue") ?? "")
    const pass2  = process.env.ROBOKASSA_PASS2!

    // 1) сверяем подпись (регистр не важен)
    const expected = md5hex(`${OutSum}:${InvId}:${pass2}`)
    if (expected.toLowerCase() !== Sig.toLowerCase()) {
      return NextResponse.json({ success: false, error: "Bad signature" }, { status: 400 })
    }

    const supabase = createServerClient()

    // 2) (необязательно) сверить сумму
    const { data: got, error: ferr } = await supabase
      .from("payments")
      .select("id, amount, status")
      .eq("invoice_id", InvId)
      .maybeSingle()
    if (ferr || !got) return NextResponse.json({ success: false, error: "Payment not found" }, { status: 404 })

    if (Number(got.amount).toFixed(2) !== Number(OutSum).toFixed(2)) {
      return NextResponse.json({ success: false, error: "Amount mismatch" }, { status: 400 })
    }

    if (got.status !== "paid") {
      await supabase.from("payments").update({ status: "paid" }).eq("invoice_id", InvId)
    }

    // 3) RoboKassa требует ответ "OK{InvId}"
    return new Response(`OK${InvId}`, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

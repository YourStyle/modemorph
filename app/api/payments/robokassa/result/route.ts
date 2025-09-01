// app/api/payments/robokassa/result/route.ts
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex")

// Admin client (обходит RLS)
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const OutSum = String(form.get("OutSum") ?? "")
    // читаем и InvId, и InvoiceID — берём первое непустое
    const rawInv  = (form.get("InvId") ?? form.get("InvoiceID") ?? "").toString()
    const Sig     = String(form.get("SignatureValue") ?? "")
    const PASS2   = process.env.ROBOKASSA_PASS2!

    if (!rawInv || !OutSum || !Sig) {
      return NextResponse.json({ success:false, error:"missing required fields" }, { status:400 })
    }

    // Подпись по доке: MD5(OutSum:InvId:Pass2)
    const expected = md5(`${OutSum}:${rawInv}:${PASS2}`)
    if (expected.toLowerCase() !== Sig.toLowerCase()) {
      return NextResponse.json({ success:false, error:"Bad signature" }, { status:400 })
    }

    const invNum = Number(rawInv)
    const { data: payment, error: selErr } = await admin
      .from("payments")
      .select("id, amount, status")
      .eq("invoice_id", invNum)
      .maybeSingle()
    if (selErr || !payment) {
      return NextResponse.json({ success:false, error:"Payment not found" }, { status:404 })
    }

    // Сумму сравниваем как числа (без строгих строковых нулей)
    if (+payment.amount !== +OutSum) {
      // при желании можно логировать расхождение и всё равно принять
      // return NextResponse.json({ success:false, error:"Amount mismatch" }, { status:400 })
    }

    if (payment.status !== "paid") {
      const { error: updErr } = await admin
        .from("payments")
        .update({ status: "paid" })
        .eq("invoice_id", invNum)
      if (updErr) return NextResponse.json({ success:false, error: updErr.message }, { status:500 })
    }

    // Ответ строго "OK{InvId}"
    return new Response(`OK${rawInv}`, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ success:false, error: e.message }, { status:500 })
  }
}

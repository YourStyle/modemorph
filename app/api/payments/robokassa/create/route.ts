// app/api/payments/robokassa/create/route.ts
import { NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import crypto from "crypto"
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex")

export async function POST(req: Request) {
  const { amount, description, meta } = await req.json()

  if (!amount) return NextResponse.json({ success:false, error:"amount required" }, { status:400 })

  const supabase = createServerClient()
  const { data:{ user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success:false, error:"Unauthorized" }, { status:401 })

  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      user_id: user.id,
      amount,
      description,
      status: "pending",
      currency: "RUB",
      provider: "robokassa",
      meta: meta ?? {}
    })
    .select("*").single()
  if (error || !payment) return NextResponse.json({ success:false, error: error?.message || "DB error" }, { status:500 })

  const MerchantLogin = process.env.ROBOKASSA_LOGIN!
  const Pass1         = process.env.ROBOKASSA_PASS1!
  const OutSum        = Number(payment.amount).toFixed(2)
  const invoiceId     = payment.invoice_id
  const Desc          = description || `Оплата заказа #${invoiceId}`

  // Подпись по доке:
  const SignatureValue = md5(`${MerchantLogin}:${OutSum}:${invoiceId}:${Pass1}`)

  const url = new URL("https://auth.robokassa.ru/Merchant/Index.aspx")
  url.searchParams.set("MerchantLogin", MerchantLogin)
  url.searchParams.set("OutSum", OutSum)
  // Кладём оба имени — разные версии интеграции их по-разному читают:
  url.searchParams.set("InvId", String(invoiceId))
  url.searchParams.set("InvoiceID", String(invoiceId))
  url.searchParams.set("Description", Desc)
  url.searchParams.set("SignatureValue", SignatureValue)
  url.searchParams.set("SuccessURL", `${process.env.PUBLIC_BASE_URL}/payment/waiting`)
  url.searchParams.set("FailURL", `${process.env.PUBLIC_BASE_URL}/payment/fail`)

  return NextResponse.json({
    success: true,
    paymentId: payment.id,
    invoiceId: invoiceId,
    redirectUrl: url.toString()
  })
}

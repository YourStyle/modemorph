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
    const rawInv = String(form.get("InvId") ?? form.get("InvoiceID") ?? "")
    const Sig    = String(form.get("SignatureValue") ?? "")
    const PASS2  = process.env.ROBOKASSA_PASS2!

    if (!rawInv || !OutSum || !Sig) {
      return NextResponse.json({ success:false, error:"missing fields" }, { status:400 })
    }

    // Подпись Result: MD5(OutSum:InvId:Pass2) — регистр хеша не учитываем
    const expected = md5(`${OutSum}:${rawInv}:${PASS2}`)
    if (expected.toLowerCase() !== Sig.toLowerCase()) {
      return NextResponse.json({ success:false, error:"bad signature" }, { status:400 })
    }

    const invId = Number(rawInv)

    // 1) Находим платёж
    const { data: payment, error: selErr } = await admin
      .from("payments")
      .select("id, user_id, amount, status, meta, invoice_id")
      .eq("invoice_id", invId)
      .maybeSingle()

    if (selErr || !payment) {
      return NextResponse.json({ success:false, error:"payment not found" }, { status:404 })
    }

    // (опц.) Сверка суммы
    if (+payment.amount !== +OutSum) {
      // можно логировать, но не валить обработку
      // return NextResponse.json({ success:false, error:"amount mismatch" }, { status:400 })
    }

    // 2) Ставим paid (если ещё нет)
    if (payment.status !== "paid") {
      const { error: updErr } = await admin
        .from("payments")
        .update({ status: "paid" })
        .eq("invoice_id", invId)
      if (updErr) return NextResponse.json({ success:false, error:updErr.message }, { status:500 })
    }

    const meta = (payment.meta ?? {}) as any

    // Идемпотентность: уже применено — отвечаем OK
    if (meta?.post_applied === true) {
      return new Response(`OK${rawInv}`, { status:200 })
    }

    // 3) Бизнес-логика НАЧИСЛЕНИЙ — эквивалент твоего /api/user-subscription

    // Находим профиль пользователя
    const { data: profile, error: profErr } = await admin
      .from("user_profiles")
      .select("id")
      .eq("user_id", payment.user_id)
      .single()

    if (profErr || !profile) {
      await admin.from("payments").update({
        meta: { ...meta, post_applied:true, post_error:"profile_not_found" }
      }).eq("invoice_id", invId)
      return new Response(`OK${rawInv}`, { status:200 })
    }

    if (meta?.action === "subscribe") {
      // === Ветка subscribe (точно как в твоём POST) ===
      const type: "monthly"|"yearly" = meta?.type === "yearly" ? "yearly" : "monthly"

      // Проверяем, нет ли активной подписки
      const { data: existing } = await admin
        .from("user_subscriptions")
        .select("id, status")
        .eq("user_profile_id", profile.id)
        .eq("status", "active")
        .maybeSingle()

      if (!existing) {
        // Даты
        const startDate = new Date()
        const expireAt  = new Date()
        if (type === "monthly") expireAt.setMonth(expireAt.getMonth() + 1)
        else expireAt.setFullYear(expireAt.getFullYear() + 1)

        // Создаём подписку
        const { error: subscriptionError } = await admin
          .from("user_subscriptions")
          .insert({
            user_profile_id: profile.id,
            subscription_type: type,         // "monthly" | "yearly"
            status: "active",
            start_date: startDate.toISOString(),
            expires_at: expireAt.toISOString()
          })
        if (subscriptionError) {
          await admin.from("payments").update({
            meta: { ...meta, post_applied:true, post_error:`sub_insert:${subscriptionError.message}` }
          }).eq("invoice_id", invId)
          return new Response(`OK${rawInv}`, { status:200 })
        }

        // Активируем плюшки
        const { error: actErr } = await admin.rpc("activate_subscription_and_reset_limits", {
          p_user_profile_id: profile.id,
        })
        if (actErr) {
          await admin.from("payments").update({
            meta: { ...meta, post_applied:true, post_error:`activate:${actErr.message}` }
          }).eq("invoice_id", invId)
          return new Response(`OK${rawInv}`, { status:200 })
        }
      }
      // если уже активна — просто проставим post_applied ниже

    } else if (meta?.action === "buy_credits" && Number.isFinite(+meta?.credits)) {
      // === Ветка buy_credits ===
      const credits = Number(meta.credits)
      const packName = meta.packName || `${credits} кредитов`

      const { error: addErr } = await admin.rpc("add_credits", {
        p_user_profile_id: profile.id,
        p_amount: credits,
        p_reason: "purchase",
        p_description: `Покупка пака "${packName}"`,
      })
      if (addErr) {
        await admin.from("payments").update({
          meta: { ...meta, post_applied:true, post_error:`add_credits:${addErr.message}` }
        }).eq("invoice_id", invId)
        return new Response(`OK${rawInv}`, { status:200 })
      }
    } else {
      // неизвестное действие: просто помечаем
      await admin.from("payments").update({
        meta: { ...meta, post_applied:true, post_error:"unknown_action" }
      }).eq("invoice_id", invId)
      return new Response(`OK${rawInv}`, { status:200 })
    }

    // 4) Отмечаем, что пост-начисление применено (идемпотентность)
    await admin.from("payments").update({
      meta: { ...meta, post_applied:true, post_applied_at:new Date().toISOString() }
    }).eq("invoice_id", invId)

    // 5) Ответ RoboKassa — строго OK{InvId}
    return new Response(`OK${rawInv}`, { status:200 })
  } catch (e:any) {
    return NextResponse.json({ success:false, error:e.message }, { status:500 })
  }
}

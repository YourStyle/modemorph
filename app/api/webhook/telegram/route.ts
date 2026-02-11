import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendTelegramMessage } from "@/lib/telegram-bot"

export async function POST(req: NextRequest) {
  try {
    const update = await req.json()

    // Only handle messages with text
    const message = update.message
    if (!message?.text) {
      return NextResponse.json({ ok: true })
    }

    const chatId = String(message.chat.id)
    const text = message.text.trim()
    const telegramUserId = String(message.from.id)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey)

    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        "Добро пожаловать в ModeMorph!\n\n" +
        "Команды:\n" +
        "/mute — отключить уведомления\n" +
        "/unmute — включить уведомления"
      )
      return NextResponse.json({ ok: true })
    }

    if (text === "/mute" || text === "/unmute") {
      const enable = text === "/unmute"

      // Find user by telegram_id in auth.users metadata
      const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 10000 })
      const authUser = authData?.users?.find(
        (u) => String(u.user_metadata?.telegram_id) === telegramUserId
      )

      if (!authUser) {
        await sendTelegramMessage(chatId, "Пользователь не найден. Сначала войдите в приложение.")
        return NextResponse.json({ ok: true })
      }

      const { error } = await supabase
        .from("user_profiles")
        .update({
          notifications_enabled: enable,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", authUser.id)

      if (error) {
        await sendTelegramMessage(chatId, "Произошла ошибка. Попробуйте позже.")
        return NextResponse.json({ ok: true })
      }

      await sendTelegramMessage(
        chatId,
        enable
          ? "Уведомления включены. Вы будете получать напоминания."
          : "Уведомления отключены. Вы больше не будете получать напоминания.\nЧтобы включить: /unmute"
      )
      return NextResponse.json({ ok: true })
    }

    // Unknown command — ignore silently
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[Telegram Webhook] Error:", error)
    return NextResponse.json({ ok: true }) // Always return ok to Telegram
  }
}

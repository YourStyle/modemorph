// lib/telegram-bot.ts
// Telegram Bot API wrapper for broadcasts and reminders

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML"
) {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured")
  }

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    }
  )
  return res.json()
}

export async function broadcastMessages(
  recipients: Array<{ telegramId: string }>,
  text: string,
  onProgress?: (sent: number, failed: number) => void
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  for (const r of recipients) {
    try {
      const result = await sendTelegramMessage(r.telegramId, text)
      if (result.ok) {
        sent++
      } else {
        failed++
      }
    } catch {
      failed++
    }
    // Rate limit: Telegram allows ~30 msg/sec, 35ms gap keeps us safe
    await new Promise((resolve) => setTimeout(resolve, 35))
    onProgress?.(sent, failed)
  }

  return { sent, failed }
}

export function interpolateTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `{${key}}`)
}

// Реферальная ссылка зависит от того, где открыто приложение.
// В Telegram — мини-приложение напрямую (startapp), а не бот: `?start=ref_…`
// бот игнорировал, и код друга терялся по дороге. Код приходит в
// initDataUnsafe.start_param, layout-client запоминает его.
// На сайте — modemorph.ru/?ref=КОД: сайт открывается без VPN и Telegram, и
// подругу не надо уводить в Telegram. Код ловит app/page.tsx.
// Дальше одинаково: лист подписки подставляет код в поле промокода — награда
// пригласившему начисляется при оплате с этим кодом (backend/app/services/discounts.py).
import { toast } from "sonner"
import { inTelegram } from "@/lib/pwa"

export const REF_CODE_KEY = "mm_ref_code"

export const referralLink = (code: string) =>
  inTelegram()
    ? `https://t.me/modemorph_ai_bot?startapp=ref_${code}`
    : `${window.location.origin}/?ref=${encodeURIComponent(code)}`

export const appLink = () => (inTelegram() ? "https://t.me/modemorph_ai_bot" : window.location.origin)

// В Telegram — родной шэринг (navigator.share внутри TMA на iOS открывает
// системную шторку и часто не возвращает фокус). На сайте — системное «Поделиться»,
// где его нет (десктоп) — копируем. Проверяем inTelegram(), а не openTelegramLink:
// telegram-web-app.js грузится и на сайте, и метод там есть.
export async function shareLink(url: string, text: string) {
  if (inTelegram()) {
    ;(window as any).Telegram.WebApp.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    )
    return
  }
  if (navigator.share) {
    try {
      await navigator.share({ text, url })
      return
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`)
    toast.success("Ссылка скопирована")
  } catch {
    toast.error("Не удалось скопировать ссылку")
  }
}

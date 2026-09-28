// Реферальная ссылка открывает мини-приложение напрямую (startapp), а не бота:
// `?start=ref_…` бот игнорировал, и код друга терялся по дороге.
// Код приходит в initDataUnsafe.start_param, layout-client запоминает его,
// а лист подписки подставляет в поле промокода — награда пригласившему
// начисляется при оплате с этим кодом (backend/app/services/discounts.py).
export const REF_CODE_KEY = "mm_ref_code"

export const referralLink = (code: string) => `https://t.me/modemorph_ai_bot?startapp=ref_${code}`

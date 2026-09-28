// Минимальное описание Telegram Mini App SDK (telegram-web-app.js грузится
// скриптом, собственных типов у него нет). Только то, что реально читает код.
// Файл без import/export — объявления глобальные.

interface TelegramWebAppUser {
  id?: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
}

interface TelegramWebAppInitDataUnsafe {
  user?: TelegramWebAppUser
  query_id?: string
  start_param?: string
  auth_date?: number
  hash?: string
}

interface TelegramWebApp {
  platform?: string
  initData?: string
  initDataUnsafe?: TelegramWebAppInitDataUnsafe
  ready: () => void
  expand?: () => void
  requestFullscreen?: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  isVersionAtLeast?: (version: string) => boolean
  disableVerticalSwipes?: () => void
  enableClosingConfirmation?: () => void
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp
  }
}

import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/types/supabase"
import { sessionAuth } from "@/lib/tma/session-auth"

export function createClient() {
  // Не кэшируем клиент, чтобы каждый раз получать актуальный токен
  const accessToken = sessionAuth.getAccessToken()

  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // ✦ Не держим сессию в localStorage
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: undefined,
      },
      global: {
        headers: accessToken ? {
          // Добавляем Bearer token из sessionAuth ко всем запросам
          Authorization: `Bearer ${accessToken}`
        } : {}
      }
    }
  )

  return client
}

// Экспорт для совместимости
export const supabase = createClient()

// Функция для проверки подключения к Supabase
export async function checkSupabaseConnection() {
  try {
    const client = createClient()
    const { data, error } = await client.from("profiles").select("count").limit(1)

    if (error) {
      console.error("Supabase connection error:", error)
      return false
    }

    return true
  } catch (error) {
    console.error("Failed to check Supabase connection:", error)
    return false
  }
}

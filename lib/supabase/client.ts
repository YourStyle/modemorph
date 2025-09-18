import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/types/supabase"

let supabaseInstance: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  if (!supabaseInstance) {
    supabaseInstance = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          storage: typeof window !== "undefined" ? window.localStorage : undefined,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      }
    )
  }
  return supabaseInstance
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

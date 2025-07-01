import { createBrowserClient } from "@supabase/ssr"

// Check if Supabase environment variables are available
export const isSupabaseConfigured =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0

export const createClient = () => {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase не настроен. Проверьте переменные окружения.")
  }

  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

// Export a default instance for components that expect it
export const supabase = isSupabaseConfigured ? createClient() : null

// Helper function to check if Supabase is available
export const checkSupabaseConnection = async () => {
  const client = createClient()

  try {
    const { error } = await client.from("wardrobe_items").select("count", { count: "exact", head: true })
    if (error) {
      throw new Error(`Ошибка подключения к Supabase: ${error.message}`)
    }
    return true
  } catch (err) {
    throw new Error(`Не удалось подключиться к Supabase: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`)
  }
}

import { createBrowserClient } from "@supabase/ssr"

// Check if Supabase environment variables are available
export const isSupabaseConfigured =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0

let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null

// Create a singleton instance of the Supabase client for Client Components
export const createClient = () => {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase не настроен. Проверьте переменные окружения.")
  }

  if (!supabaseInstance) {
    supabaseInstance = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }

  return supabaseInstance
}

// Export the singleton instance as 'supabase' for compatibility
export const supabase = isSupabaseConfigured
  ? createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  : null

// Helper function to check if Supabase is available
export const checkSupabaseConnection = async () => {
  try {
    const client = createClient()
    const { error } = await client.from("wardrobe_items").select("count", { count: "exact", head: true })

    if (error) {
      throw new Error(`Ошибка подключения к Supabase: ${error.message}`)
    }
    return true
  } catch (err) {
    throw new Error(`Не удалось подключиться к Supabase: ${err instanceof Error ? err.message : "Неизвестная ошибка"}`)
  }
}

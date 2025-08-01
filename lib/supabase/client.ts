import { createClient as createSupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

let supabaseInstance: ReturnType<typeof createSupabaseClient> | null = null

export function createClient() {
  if (!supabaseInstance) {
    supabaseInstance = createSupabaseClient(supabaseUrl, supabaseAnonKey)
  }
  return supabaseInstance
}

export const supabase = createClient()

export async function checkSupabaseConnection() {
  try {
    const { data, error } = await supabase.from("profiles").select("count").limit(1)
    if (error) {
      console.error("Supabase connection error:", error)
      return false
    }
    return true
  } catch (error) {
    console.error("Supabase connection failed:", error)
    return false
  }
}

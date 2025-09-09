import { createClient } from "@/lib/supabase/server"
import { getUser } from "@/lib/get-user"

export async function isUserAdmin(userId?: string): Promise<boolean> {
  try {
    const supabase = createClient()

    // Если userId не передан, получаем текущего пользователя
    if (!userId) {
      const user = await getUser()
      if (!user) return false
      userId = user.id
    }

    // Проверяем, есть ли запись в user_profiles с is_admin = true
    const { data, error } = await supabase.from("user_profiles").select("is_admin").eq("user_id", userId).single()

    if (error) {
      console.error("Error checking admin status:", error)
      return false
    }

    return data?.is_admin === true
  } catch (error) {
    console.error("Error checking admin status:", error)
    return false
  }
}

export async function getUserProfile(userId?: string) {
  try {
    const supabase = createClient()

    if (!userId) {
      const user = await getUser()
      if (!user) return null
      userId = user.id
    }

    const { data, error } = await supabase.from("user_profiles").select("*").eq("user_id", userId).single()

    if (error) {
      console.error("Error getting user profile:", error)
      return null
    }

    return data
  } catch (error) {
    console.error("Error getting user profile:", error)
    return null
  }
}

export async function createUserProfile(userId: string, isAdmin = false) {
  try {
    const supabase = createClient()

    const { error } = await supabase.from("user_profiles").insert({
      user_id: userId,
      is_admin: isAdmin,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (error) {
      console.error("Error creating user profile:", error)
      return false
    }

    return true
  } catch (error) {
    console.error("Error creating user profile:", error)
    return false
  }
}

// lib/admin-auth.ts
// Универсальная функция для проверки админских прав через токены

import { NextRequest } from "next/server"
import { getAuthUser } from "./auth-server"
import { createClient } from "@supabase/supabase-js"

export async function getAdminUser(req?: NextRequest) {
  // Получаем пользователя через токен-авторизацию
  const user = await getAuthUser(req)
  if (!user) return null

  // Проверяем админские права через service role
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single()

  if (!profile?.is_admin) return null

  return user
}
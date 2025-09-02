// lib/supabase/server.ts
// SSR-клиент Supabase + явная экспортируемая метка конфигурации.
// Добавьте/замените файл целиком. Комментарии включены.

import { createServerClient } from "@supabase/ssr"
import { cookies, headers } from "next/headers"

// Роль ключа: анонимный (по умолчанию) или сервисный (только на сервере)
type Role = "anon" | "service"

/**
 * SSR-клиент Supabase.
 * При role="service" используется SERVICE_ROLE (нельзя использовать на клиенте).
 */
export function createClient(opts?: { role?: Role }) {
  const cookieStore = cookies()
  const hdrs = headers()

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""

  // Выбор ключа: anon для обычных запросов, service — для админ-операций в API-роутах
  const supabaseKey =
    opts?.role === "service"
      ? process.env.SUPABASE_SERVICE_ROLE || ""
      : process.env.SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        ""

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options })
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: "", ...options })
      },
    },
    headers: {
      "x-forwarded-for": hdrs.get("x-forwarded-for") ?? undefined,
      "user-agent": hdrs.get("user-agent") ?? undefined,
    },
  })
}

/**
 * Индикатор корректной конфигурации Supabase.
 * Экспорт добавлен для мест, где проверяется готовность окружения.
 */
export const isSupabaseConfigured =
  !!((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
     (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY))

/**
 * Дополнительно: индикатор наличия сервисного ключа (если нужен в API/cron).
 */
export const isSupabaseServiceConfigured =
  !!((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
     process.env.SUPABASE_SERVICE_ROLE)

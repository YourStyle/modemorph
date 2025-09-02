"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

interface Props {
  children: ReactNode
}

export default function MiniAppRegistrationGate({ children }: Props) {
  const [ready, setReady] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function check() {
      // Явный признак Telegram Mini App
      const isMiniApp = typeof window !== "undefined" && (window as any).Telegram?.WebApp

      if (!isMiniApp) {
        setReady(true)
        return
      }

      const supabase = createClient()
      // Проверяем текущего пользователя Supabase
      const {
        data: { user },
      } = await supabase.auth.getUser()

      // Если не авторизован — просто рендерим children,
      // логика входа останется в других компонентах
      if (!user) {
        setReady(true)
        return
      }

      // Получаем профиль из таблицы user_profiles
      const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("gender, height, weight, top_size, bottom_size, shoe_size, referral")
        .eq("user_id", user.id)
        .single()

      // Если ошибка или отсутствуют необходимые поля — редирект на регистрацию
      if (
        error ||
        !profile ||
        !profile.gender ||
        !profile.height ||
        !profile.weight ||
        !profile.top_size ||
        !profile.bottom_size ||
        !profile.shoe_size ||
        !profile.referral
      ) {
        router.replace("/auth/mini-registration")
        return
      }

      setReady(true)
    }

    check()
  }, [router])

  if (!ready) {
    // Можно отобразить индикатор загрузки, если нужно
    return null
  }

  return <>{children}</>
}

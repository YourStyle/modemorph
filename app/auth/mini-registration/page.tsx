// app/auth/mini-registration/page.tsx
// Страница мини-регистрации: внутри TMA гарантированно добивается сессии через tmaHandshake,
// затем рендерит форму (здесь — заглушка; вставьте вашу форму). Без сессии повторно не уходим.

"use client"

import { useEffect, useState } from "react"
import { tmaHandshake } from "@/lib/tma/handshake"
import { createClient } from "@/lib/supabase/client"

export default function MiniRegistrationPage() {
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const user = await tmaHandshake()
      setUserId(user?.id ?? null)
      setReady(true)
    })()
  }, [])

  if (!ready) return null

  // TODO: замените на вашу полноценную форму + отправку в user_profiles
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="text-2xl font-semibold mb-4">Мини-регистрация</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {userId ? `User: ${userId}` : "Нет сессии — проверьте Telegram Mini App initData"}
      </p>

      {/* Ваша форма: gender, height, weight, top_size, bottom_size, shoe_size (+ optional referral) */}
      {/* После успешного сохранения профиля можно сделать window.history.back() или router.replace("/") */}
      {/* Пример кнопки-заглушки: */}
      <button
        className="rounded-md border px-4 py-2"
        onClick={async () => {
          if (!userId) return
          await supabase.from("user_profiles").upsert({
            user_id: userId,
            gender: "male",
            height: 180,
            weight: 75,
            top_size: "M",
            bottom_size: "M",
            shoe_size: "42",
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" })
          window.location.href = "/"
        }}
      >
        Сохранить (заглушка) и перейти на главную
      </button>
    </main>
  )
}

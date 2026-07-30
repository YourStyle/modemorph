"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { sessionAuth } from "@/lib/tma/session-auth"
import { parseSupabaseExpiry } from "@/lib/auth-utils"
import { useAuth } from "@/contexts/auth-context"

function YandexCallbackLoading() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-600" />
        <p className="text-gray-600">Входим через Яндекс...</p>
      </div>
    </div>
  )
}

function YandexCallbackInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { reloadSession } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const code = searchParams.get("code")
    const oauthError = searchParams.get("error")

    if (oauthError) {
      setError("Яндекс отклонил запрос авторизации")
      return
    }
    if (!code) {
      setError("Код авторизации не найден в ссылке")
      return
    }

    const run = async () => {
      try {
        const res = await fetch("/api/auth/yandex/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.detail || "Не удалось войти через Яндекс")
        }

        const data = await res.json()
        if (!data.session || !data.user) {
          throw new Error("Некорректный ответ сервера")
        }

        sessionAuth.saveSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user_id: data.user.id,
          expires_at: parseSupabaseExpiry(data.session.expires_at),
        })

        reloadSession()
        router.push("/app")
      } catch (err: any) {
        console.error("[YandexCallback] Login error:", err)
        setError(err.message || "Не удалось войти через Яндекс")
      }
    }

    run()
  }, [searchParams, router, reloadSession])

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-red-600 text-sm">{error}</p>
          <Link href="/auth/login" className="inline-block text-sm font-medium text-gray-900 hover:underline">
            Вернуться к входу
          </Link>
        </div>
      </div>
    )
  }

  return <YandexCallbackLoading />
}

export default function YandexCallbackPage() {
  return (
    <Suspense fallback={<YandexCallbackLoading />}>
      <YandexCallbackInner />
    </Suspense>
  )
}

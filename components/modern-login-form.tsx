"use client"

import { useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { sessionAuth } from "@/lib/tma/session-auth"
import { parseSupabaseExpiry } from "@/lib/auth-utils"
import { fetchWithRetry } from "@/lib/fetch-with-retry"

export default function ModernLoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      console.log("[ModernLoginForm] Attempting email login...")

      // Делаем запрос на новый session-based endpoint
      const response = await fetchWithRetry(
        "/api/auth/email-session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        },
        {
          timeout: 10000,
          retries: 1,
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Login failed")
      }

      const data = await response.json()

      if (!data.session || !data.user) {
        throw new Error("Invalid response from server")
      }

      console.log("[ModernLoginForm] Login successful, saving session...")

      // Сохраняем сессию в sessionStorage через sessionAuth
      sessionAuth.saveSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.user.id,
        expires_at: parseSupabaseExpiry(data.session.expires_at),
      })

      console.log("[ModernLoginForm] Session saved, redirecting to home...")

      // Редиректим на главную
      router.push("/")
    } catch (err: any) {
      console.error("[ModernLoginForm] Login error:", err)
      setError(err.message || "Не удалось войти")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-2 text-center [500px]:text-left">
        <h1 className="text-2xl [500px]:text-3xl font-bold tracking-tight text-gray-900">Добро пожаловать</h1>
        <p className="text-base text-gray-600">Войдите в свой гардероб</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Электронная почта
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="ваш@email.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="h-11 text-base border-gray-300 focus:border-gray-900 focus:ring-gray-900 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Пароль
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="h-11 text-base border-gray-300 focus:border-gray-900 focus:ring-gray-900 rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-3">
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 text-base font-medium rounded-xl h-12 shadow-sm transition-all duration-200 hover:shadow-md disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Вход...
              </>
            ) : (
              "Войти"
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full py-3 text-base font-medium rounded-xl h-12 border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200"
            asChild
          >
            <Link href="/auth/sign-up">Я новый пользователь</Link>
          </Button>
        </div>

        <div className="text-center text-xs text-gray-500 leading-relaxed">
          Входя в систему, вы соглашаетесь с нашими{" "}
          <Link href="/terms" className="text-gray-700 hover:underline font-medium">
            Условиями использования
          </Link>{" "}
          и{" "}
          <Link href="/privacy" className="text-gray-700 hover:underline font-medium">
            Политикой конфиденциальности
          </Link>
          .
        </div>
      </form>
    </div>
  )
}

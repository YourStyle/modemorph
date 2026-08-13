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
import { useAuth } from "@/contexts/auth-context"

export default function ModernLoginForm() {
  const router = useRouter()
  const { reloadSession } = useAuth()
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

      console.log("[ModernLoginForm] Session saved, updating auth context...")

      // Notify AuthProvider about new session before navigating
      reloadSession()

      // Redirect to home
      router.push("/")
    } catch (err: any) {
      console.error("[ModernLoginForm] Login error:", err)
      setError(err.message || "Не удалось войти")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Место под ошибку зарезервировано заранее — форма не прыгает */}
        <div className="min-h-[18px]" aria-live="polite">
          {error && <p className="animate-fade-up text-caption text-destructive">{error}</p>}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5 animate-fade-up" style={{ animationDelay: "40ms" }}>
            <label htmlFor="email" className="block text-caption text-ink-2">
              Почта
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="ваш@email.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1.5 animate-fade-up" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-caption text-ink-2">
                Пароль
              </label>
              <Link
                href="/auth/reset"
                className="text-caption text-ink-3 transition-colors duration-press hover:text-ink"
              >
                Забыли пароль?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Входим
              </>
            ) : (
              "Войти"
            )}
          </Button>
        </div>

        <p className="text-center text-caption text-ink-3">
          Нет аккаунта?{" "}
          <Link href="/auth/sign-up" className="font-medium text-ink hover:underline">
            Зарегистрироваться
          </Link>
        </p>

        <p className="text-center text-micro leading-relaxed text-ink-3">
          Входя, вы соглашаетесь с{" "}
          <Link href="/terms" className="text-ink-2 hover:text-ink hover:underline">
            условиями
          </Link>{" "}
          и{" "}
          <Link href="/privacy" className="text-ink-2 hover:text-ink hover:underline">
            политикой конфиденциальности
          </Link>
        </p>
      </form>
    </div>
  )
}

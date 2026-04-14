"use client"

import { useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Building2 } from "lucide-react"
import Link from "next/link"
import { sessionAuth } from "@/lib/tma/session-auth"
import { parseSupabaseExpiry } from "@/lib/auth-utils"
import { fetchWithRetry } from "@/lib/fetch-with-retry"

export default function PartnerLoginPage() {
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
      const response = await fetchWithRetry(
        "/api/auth/email-session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        },
        { timeout: 10000, retries: 1 },
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Не удалось войти")
      }

      const data = await response.json()

      if (!data.session || !data.user) {
        throw new Error("Неверный ответ сервера")
      }

      sessionAuth.saveSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.user.id,
        expires_at: parseSupabaseExpiry(data.session.expires_at),
      })

      // Redirect to partner dashboard (layout will check partner status)
      router.push("/partner")
    } catch (err: any) {
      setError(err.message || "Не удалось войти")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#EC9DE2] to-[#89AEFF] flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Кабинет партнёра</h1>
          <p className="text-gray-500 mt-1">Войдите в партнёрский аккаунт</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Электронная почта
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="partner@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="h-11 text-base rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Пароль
                </label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="h-11 text-base rounded-xl"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full text-white py-3 text-base font-medium rounded-xl h-12"
              style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
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
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Нет аккаунта?{" "}
          <Link href="/partner/register" className="text-[#B97DC6] hover:underline font-medium">
            Стать партнёром
          </Link>
        </p>
      </div>
    </div>
  )
}

"use client"

import { useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Building2, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { sessionAuth } from "@/lib/tma/session-auth"
import { parseSupabaseExpiry } from "@/lib/auth-utils"

export default function PartnerRegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<"form" | "success">("form")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Account fields
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  // Company fields
  const [companyName, setCompanyName] = useState("")
  const [contactName, setContactName] = useState("")
  const [website, setWebsite] = useState("")
  const [description, setDescription] = useState("")

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      // Step 1: Register user via FastAPI
      console.log("[PartnerRegister] Step 1: creating user account...")
      const registerResponse = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const authData = await registerResponse.json().catch(() => null)
      console.log("[PartnerRegister] Step 1 response:", registerResponse.status, authData)

      if (!registerResponse.ok) {
        const detail = authData?.detail
        const msg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d: any) => d.msg || d).join(", ") : "Не удалось создать аккаунт"
        throw new Error(msg)
      }

      if (!authData?.session || !authData?.user) {
        throw new Error("Сервер не вернул данные сессии")
      }

      // Save session
      sessionAuth.saveSession({
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        user_id: authData.user.id,
        expires_at: parseSupabaseExpiry(authData.session.expires_at),
      })

      // Step 2: Create partner profile
      console.log("[PartnerRegister] Step 2: creating partner profile...")
      const response = await fetch("/api/partner/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authData.session.access_token}`,
        },
        body: JSON.stringify({
          company_name: companyName,
          contact_name: contactName,
          website: website || undefined,
          description: description || undefined,
        }),
      })

      const partnerData = await response.json().catch(() => null)
      console.log("[PartnerRegister] Step 2 response:", response.status, partnerData)

      if (!response.ok) {
        const detail = partnerData?.detail
        const msg = typeof detail === "string" ? detail : "Ошибка при регистрации партнёра"
        throw new Error(msg)
      }

      console.log("[PartnerRegister] Success! Setting step to success")
      setStep("success")
    } catch (err: any) {
      console.error("[PartnerRegister] Error:", err)
      setError(err.message || "Произошла ошибка при регистрации")
    } finally {
      setIsLoading(false)
    }
  }

  if (step === "success") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Заявка отправлена!</h1>
          <p className="text-gray-600 mb-6">
            Ваша заявка на партнёрство отправлена на рассмотрение. Мы уведомим вас по электронной почте после одобрения.
          </p>
          <Button
            onClick={() => router.push("/partner")}
            style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
            className="text-white border-0"
          >
            Перейти в кабинет
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#EC9DE2] to-[#89AEFF] flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Стать партнёром</h1>
          <p className="text-gray-500 mt-1">
            Получите доступ к API виртуальной примерки
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* Account section */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                Аккаунт
              </h2>
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Электронная почта *
                </label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="h-11 text-base rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Пароль *
                </label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="h-11 text-base rounded-xl"
                />
              </div>
            </div>

            <hr className="border-gray-200" />

            {/* Company section */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                О компании
              </h2>
              <div className="space-y-2">
                <label htmlFor="company" className="block text-sm font-medium text-gray-700">
                  Название компании *
                </label>
                <Input
                  id="company"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={isLoading}
                  placeholder="ООО «Ваша компания»"
                  className="h-11 text-base rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="contact" className="block text-sm font-medium text-gray-700">
                  Контактное лицо *
                </label>
                <Input
                  id="contact"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  disabled={isLoading}
                  placeholder="Иван Петров"
                  className="h-11 text-base rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="website" className="block text-sm font-medium text-gray-700">
                  Веб-сайт
                </label>
                <Input
                  id="website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  disabled={isLoading}
                  placeholder="https://example.com"
                  className="h-11 text-base rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="desc" className="block text-sm font-medium text-gray-700">
                  Описание бизнеса
                </label>
                <textarea
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isLoading}
                  placeholder="Расскажите, как планируете использовать API"
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full text-white py-3 text-base font-medium rounded-xl h-12 border-0"
              style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Регистрация...
                </>
              ) : (
                "Отправить заявку"
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Уже есть аккаунт?{" "}
          <Link href="/partner/login" className="text-[#B97DC6] hover:underline font-medium">
            Войти
          </Link>
        </p>
      </div>
    </div>
  )
}

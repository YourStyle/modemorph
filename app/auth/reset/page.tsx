// app/auth/reset/page.tsx — форма запроса письма на сброс
"use client"
import { useState, FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api-client"

export default function ResetPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      await api.post("/api/auth/reset", { email })
      setSent(true)
    } catch (error: any) {
      setErr(error?.message || "Не удалось отправить письмо")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-6">
      <Link
        href="/auth/login"
        aria-label="Назад"
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors duration-press hover:bg-canvas-sunk"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>

      <div className="mx-auto mt-6 w-full max-w-sm animate-fade-up">
        <h1 className="text-h1 text-ink">Восстановление пароля</h1>
        <p className="mt-2 text-body text-ink-2">Укажите почту — пришлём ссылку для сброса пароля</p>

        {sent ? (
          <p className="mt-8 animate-fade-up text-body text-ink">Письмо отправлено, проверьте почту.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="min-h-[18px]" aria-live="polite">
              {err && <p className="animate-fade-up text-caption text-destructive">{err}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reset-email" className="block text-caption text-ink-2">
                Почта
              </label>
              <Input
                id="reset-email"
                type="email"
                placeholder="ваш@email.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Отправляем
                </>
              ) : (
                "Отправить ссылку"
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

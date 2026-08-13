// app/auth/update-password/page.tsx — страница смены пароля после перехода из письма
"use client"
import { useState, FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api-client"

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("")
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      await api.post("/api/auth/update-password", { password })
      setOk(true)
    } catch (error: any) {
      setErr(error?.message || "Не удалось обновить пароль")
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
        <h1 className="text-h1 text-ink">Новый пароль</h1>

        {ok ? (
          <div className="mt-8 animate-fade-up space-y-4">
            <p className="text-body text-ink">Пароль обновлён.</p>
            <Link href="/auth" className="text-body font-medium text-ink underline underline-offset-4">
              Вернуться к входу
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="min-h-[18px]" aria-live="polite">
              {err && <p className="animate-fade-up text-caption text-destructive">{err}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-password" className="block text-caption text-ink-2">
                Пароль
              </label>
              <Input
                id="new-password"
                type="password"
                placeholder="Минимум 8 символов"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                disabled={loading}
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Сохраняем
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

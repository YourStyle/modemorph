// app/auth/update-password/page.tsx — страница смены пароля после перехода из письма
"use client"
import { useState } from "react"
import { api } from "@/lib/api-client"

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("")
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    try {
      await api.post("/api/auth/update-password", { password })
      setOk(true)
    } catch (error: any) {
      setErr(error?.message || "Не удалось обновить пароль")
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Новый пароль</h1>
      {ok ? (
        <div className="mt-4">
          <p>Пароль обновлён.</p>
          <a className="text-blue-600 underline" href="/auth">Вернуться к входу</a>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <input
            type="password"
            className="w-full rounded border px-3 py-2"
            placeholder="Минимум 8 символов"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <button className="w-full rounded bg-black px-3 py-2 text-white">Сохранить</button>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </form>
      )}
    </div>
  )
}

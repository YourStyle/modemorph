"use client"
import type React from "react"
import { useState } from "react"

export default function ResetPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    })
    if (res.ok) setSent(true)
    else setErr((await res.json()).error || "Failed")
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Восстановление пароля</h1>
      {sent ? (
        <p className="mt-4">Письмо со ссылкой отправлено, проверьте почту.</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <input
            type="email"
            className="w-full rounded border px-3 py-2"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="w-full rounded bg-black px-3 py-2 text-white">Отправить ссылку</button>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </form>
      )}
    </div>
  )
}

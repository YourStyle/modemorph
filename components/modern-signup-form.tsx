"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { signUp } from "@/lib/actions"

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Создаём аккаунт
        </>
      ) : (
        "Зарегистрироваться"
      )}
    </Button>
  )
}

export default function ModernSignupForm() {
  const [state, formAction] = useActionState(signUp, null)

  return (
    <div className="w-full">
      <div className="space-y-2 text-center min-[500px]:text-left">
        <h1 className="text-display text-ink">Создать аккаунт</h1>
        <p className="text-body text-ink-2">Соберите свой гардероб за пару минут</p>
      </div>

      <form action={formAction} className="mt-6 space-y-4">
        {/* Место под сообщение зарезервировано заранее — форма не прыгает */}
        <div className="min-h-[18px]" aria-live="polite">
          {state?.error && <p className="animate-fade-up text-caption text-destructive">{state.error}</p>}
          {state?.success && <p className="animate-fade-up text-caption text-ink">{state.success}</p>}
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
            />
          </div>
          <div className="space-y-1.5 animate-fade-up" style={{ animationDelay: "80ms" }}>
            <label htmlFor="password" className="block text-caption text-ink-2">
              Пароль
            </label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </div>
        </div>

        <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <SubmitButton />
        </div>

        <p className="text-center text-caption text-ink-3">
          Уже есть аккаунт?{" "}
          <Link href="/auth/login" className="font-medium text-ink hover:underline">
            Войти
          </Link>
        </p>

        <p className="text-center text-micro leading-relaxed text-ink-3">
          Регистрируясь, вы соглашаетесь с{" "}
          <Link href="/public_offer" className="text-ink-2 hover:text-ink hover:underline">
            публичной офертой
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

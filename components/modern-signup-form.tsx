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
    <Button
      type="submit"
      disabled={pending}
      className="w-full text-white py-3 text-base font-medium rounded-xl h-12 border-0 transition-all duration-200 disabled:opacity-50"
      style={{
        backgroundColor: '#292929',
      }}
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Создание аккаунта...
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
    <div className="w-full space-y-6">
      <div className="space-y-2 text-center [500px]:text-left">
        <h1 className="text-2xl [500px]:text-3xl font-bold tracking-tight text-gray-900">Создать аккаунт</h1>
        <p className="text-base text-gray-600">Начните организовывать свой гардероб</p>
      </div>

      <form action={formAction} className="space-y-5">
        {state?.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{state.error}</div>
        )}

        {state?.success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
            {state.success}
          </div>
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
              className="h-11 text-base border-gray-300 rounded-xl"
              style={{
                borderColor: '#292929',
              }}
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
              className="h-11 text-base border-gray-300 rounded-xl"
              style={{
                borderColor: '#292929',
              }}
            />
          </div>
        </div>

        <div className="space-y-3">
          <SubmitButton />

          <Button
            type="button"
            variant="outline"
            className="w-full py-3 text-base font-medium rounded-xl h-12 hover:bg-gray-50 transition-all duration-200"
            style={{
              borderColor: '#292929',
            }}
            asChild
          >
            <Link href="/auth/login">Уже есть аккаунт? Войти</Link>
          </Button>
        </div>

        <div className="text-center text-xs text-gray-500 leading-relaxed">
          Регистрируясь, вы соглашаетесь с нашими{" "}
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

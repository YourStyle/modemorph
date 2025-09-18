"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { defaultSignInState, signIn, type SignInState } from "@/lib/actions"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

function SubmitButton({ processing }: { processing: boolean }) {
  const { pending } = useFormStatus()
  const isSubmitting = pending || processing

  return (
    <Button
      type="submit"
      disabled={isSubmitting}
      className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 text-base font-medium rounded-xl h-12 shadow-sm transition-all duration-200 hover:shadow-md disabled:opacity-50"
    >
      {isSubmitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Вход...
        </>
      ) : (
        "Войти"
      )}
    </Button>
  )
}

export default function ModernLoginForm() {
  const router = useRouter()
  const supabase = useRef(createClient()).current
  const handledAccessTokenRef = useRef<string | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [state, formAction] = useActionState<SignInState, FormData>(signIn, defaultSignInState)

  useEffect(() => {
    if (state.error) {
      setClientError(state.error)
      setProcessing(false)
      handledAccessTokenRef.current = null
    } else if (!state.session) {
      setClientError(null)
      setProcessing(false)
      handledAccessTokenRef.current = null
    }
  }, [state.error, state.session])

  useEffect(() => {
    const session = state.session
    if (!session) return
    if (handledAccessTokenRef.current === session.access_token) return

    handledAccessTokenRef.current = session.access_token
    setProcessing(true)

    let cancelled = false

    ;(async () => {
      const { error } = await supabase.auth.setSession(session)
      if (cancelled) return
      if (error) {
        handledAccessTokenRef.current = null
        setClientError(error.message)
        setProcessing(false)
        return
      }

      setClientError(null)
      router.replace("/")
      router.refresh()
    })()

    return () => {
      cancelled = true
    }
  }, [state.session, supabase, router])

  return (
    <div className="w-full space-y-6">
      <div className="space-y-2 text-center [500px]:text-left">
        <h1 className="text-2xl [500px]:text-3xl font-bold tracking-tight text-gray-900">Добро пожаловать</h1>
        <p className="text-base text-gray-600">Войдите в свой гардероб</p>
      </div>

      <form action={formAction} className="space-y-5">
        {clientError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{clientError}</div>
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
              className="h-11 text-base border-gray-300 focus:border-gray-900 focus:ring-gray-900 rounded-xl"
            />
          </div>
        </div>

        <div className="space-y-3">
          <SubmitButton processing={processing} />

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

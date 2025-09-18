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
      className="w-full bg-[#2b725e] hover:bg-[#235e4c] text-white py-6 text-lg font-medium rounded-lg h-[60px]"
    >
      {isSubmitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Signing in...
        </>
      ) : (
        "Sign In"
      )}
    </Button>
  )
}

export default function LoginForm() {
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
    <div className="w-full max-w-md space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-white">Welcome back</h1>
        <p className="text-lg text-gray-400">Sign in to your account</p>
      </div>

      <form action={formAction} className="space-y-6">
        {clientError && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-700 px-4 py-3 rounded">{clientError}</div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              className="bg-[#1c1c1c] border-gray-800 text-white placeholder:text-gray-500"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              className="bg-[#1c1c1c] border-gray-800 text-white"
            />
          </div>
        </div>

        <SubmitButton processing={processing} />

        <div className="text-center text-gray-400">
          Don't have an account?{" "}
          <Link href="/auth/sign-up" className="text-white hover:underline">
            Sign up
          </Link>
        </div>
      </form>
    </div>
  )
}

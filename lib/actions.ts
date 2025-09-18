"use server"

import { createClient } from "@/lib/supabase/server"
import type { Session } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

export type SignInState = {
  error: string | null
  session: Session | null
}

export const defaultSignInState: SignInState = { error: null, session: null }

export async function signIn(prevState: SignInState, formData: FormData): Promise<SignInState> {
  if (!formData) {
    return { ...defaultSignInState, error: "Form data is missing" }
  }

  const email = formData.get("email")
  const password = formData.get("password")

  if (!email || !password) {
    return { ...defaultSignInState, error: "Email and password are required" }
  }

  const supabase = await createClient()

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toString(),
      password: password.toString(),
    })

    if (error || !data?.session) {
      return {
        ...defaultSignInState,
        error: error?.message || "Unable to sign in",
      }
    }

    return { error: null, session: data.session }
  } catch (error: any) {
    console.error("Sign in error:", error)
    return {
      ...defaultSignInState,
      error: error?.message || "Unexpected error during sign in",
    }
  }
}

export async function signUp(prevState: any, formData: FormData) {
  if (!formData) {
    return { error: "Form data is missing" }
  }

  const email = formData.get("email")
  const password = formData.get("password")

  if (!email || !password) {
    return { error: "Email and password are required" }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email: email.toString(),
    password: password.toString(),
  })

  if (error) {
    console.error("Sign up error:", error)
    return { error: error.message }
  }

  return { success: "Check your email to confirm your account." }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/")
}

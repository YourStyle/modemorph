"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function signIn(prevState: any, formData: FormData) {
  if (!formData) {
    return { error: "Form data is missing" }
  }

  const email = formData.get("email")
  const password = formData.get("password")

  if (!email || !password) {
    return { error: "Email and password are required" }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toString(),
    password: password.toString(),
  })

  if (error) {
    console.error("Sign in error:", error)
    return { error: error.message }
  }

  redirect("/")
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

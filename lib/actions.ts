"use server"

import { redirect } from "next/navigation"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080"

export async function signIn(prevState: any, formData: FormData) {
  if (!formData) {
    return { error: "Form data is missing" }
  }

  const email = formData.get("email")
  const password = formData.get("password")

  if (!email || !password) {
    return { error: "Email and password are required" }
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/email-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.toString(), password: password.toString() }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      return { error: data.detail || "Invalid credentials" }
    }
  } catch (error) {
    console.error("Sign in error:", error)
    return { error: "Connection error" }
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

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.toString(), password: password.toString() }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      return { error: data.detail || "Registration failed" }
    }

    return { success: "Аккаунт создан. Теперь вы можете войти." }
  } catch (error) {
    console.error("Sign up error:", error)
    return { error: "Connection error" }
  }
}

export async function signOut() {
  redirect("/")
}

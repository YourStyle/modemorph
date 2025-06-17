import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AuthLayout } from "@/components/auth-layout"
import ModernSignupForm from "@/components/modern-signup-form"

export default async function SignUpPage() {
  // If Supabase is not configured, show setup message directly
  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">Connect Supabase to get started</h1>
      </div>
    )
  }

  // Check if user is already logged in
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // If user is logged in, redirect to home page
  if (session) {
    redirect("/")
  }

  return (
    <AuthLayout showBackButton>
      <ModernSignupForm />
    </AuthLayout>
  )
}

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"

export default async function UserWardrobePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Мой гардероб</h1>
          <p className="text-xl text-gray-600">Ваши личные вещи</p>
        </div>

        <UserWardrobeGrid />
      </div>
    </div>
  )
}

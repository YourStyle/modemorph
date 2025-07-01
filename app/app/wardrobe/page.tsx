import { createClient } from "@/lib/supabase/server"
import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"

export default async function WardrobePage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Мой гардероб</h1>
        <p className="text-gray-600">Здесь собраны все ваши вещи</p>
      </div>

      <UserWardrobeGrid />
    </div>
  )
}

import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"

export default function UserWardrobePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Мой гардероб</h1>
        <p className="mt-2 text-gray-600">Все ваши вещи в одном месте</p>
      </div>

      <UserWardrobeGrid />
    </div>
  )
}

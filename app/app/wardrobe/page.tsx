import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"

export default function WardrobePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Мой гардероб</h1>
          <p className="text-gray-600">Все ваши вещи в одном месте</p>
        </div>
      </div>

      <UserWardrobeGrid />
    </div>
  )
}

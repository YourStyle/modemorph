"use client"

import { YandexMigrationCard } from "@/components/yandex-migration-card"
import { FixCorruptedFilesCard } from "@/components/fix-corrupted-files-card"

export default function AdminSettingsPage() {
  // Проверка админа уже выполняется в app/admin/layout.tsx
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">Настройки</h2>
          <p className="text-lg text-gray-500">Управление системными настройками</p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <YandexMigrationCard />
          <FixCorruptedFilesCard />
        </div>
      </div>
    </div>
  )
}
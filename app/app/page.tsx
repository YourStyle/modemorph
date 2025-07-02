"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"
import { AddToClosetSheet } from "@/components/add-to-closet-sheet"

export default function HomePage() {
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="px-4 py-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-serif font-bold text-gray-900 mb-2">Добро пожаловать</h1>
          <p className="text-gray-600 text-sm">Создавайте стильные образы с помощью ИИ</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-4 mb-8">
          <Card className="p-6 bg-gradient-to-br from-gray-100 to-gray-200 border-0 shadow-sm">
            <h3 className="text-lg font-serif font-semibold text-gray-900 mb-2">Начните с добавления вещей</h3>
            <p className="text-gray-600 text-sm mb-4">
              Загрузите фотографии своих вещей, чтобы ИИ мог создавать персональные образы
            </p>
            <Button onClick={() => setIsAddSheetOpen(true)} className="w-full bg-gray-900 hover:bg-gray-800 text-white">
              Добавить в гардероб
            </Button>
          </Card>
        </div>
      </div>

      <AddToClosetSheet isOpen={isAddSheetOpen} onClose={() => setIsAddSheetOpen(false)} />
    </div>
  )
}

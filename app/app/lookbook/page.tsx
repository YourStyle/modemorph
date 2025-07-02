"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export default function LookbookPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Lookbook</h1>
          <p className="text-gray-600 text-sm">Ваши сохраненные образы и комплекты</p>
        </div>

        <div className="space-y-4">
          <Card className="p-6 bg-white border border-gray-200">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="font-medium text-gray-900 mb-2">Создайте первый образ</h3>
              <p className="text-sm text-gray-600 mb-4">Сохраняйте понравившиеся комплекты в своем lookbook</p>
              <Button className="bg-gray-800 hover:bg-gray-700 text-white rounded-full">Создать образ</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

"use client"

import { Card } from "@/components/ui/card"
import { PastelLoader } from "@/components/pastel-loader"

export default function InspirationPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Вдохновение</h1>
          <p className="text-gray-600 text-sm">Откройте для себя новые стили и тренды</p>
        </div>

        <div className="flex justify-center mb-8">
          <PastelLoader size={60} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 border-0 shadow-lg">
              <div className="w-full h-full flex items-center justify-center text-4xl">✨</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

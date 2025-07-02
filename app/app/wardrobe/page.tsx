"use client"

import { useState, useEffect } from "react"
import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"
import type { WardrobeItem } from "@/lib/wardrobe"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"

export default function UserWardrobePage() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/wardrobe-user-items")

      if (!response.ok) {
        throw new Error("Failed to fetch wardrobe items")
      }

      const data = await response.json()
      setItems(data)
    } catch (err) {
      console.error("Error fetching wardrobe items:", err)
      setError("Не удалось загрузить вещи из гардероба")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [])

  const handleRefresh = () => {
    fetchItems()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Попробовать снова
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Мой гардероб</h1>
          <p className="text-gray-600">Все ваши вещи в одном месте</p>
        </div>

        <UserWardrobeGrid items={items} />
      </div>
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import type { WardrobeItem } from "@/lib/wardrobe"
import { WardrobeItemCard } from "./wardrobe-item-card"
import { Loader2 } from "lucide-react"

interface UserWardrobeGridProps {
  items: WardrobeItem[]
}

export function UserWardrobeGrid({ items }: UserWardrobeGridProps) {
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>(items)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setWardrobeItems(items)
  }, [items])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-600">Загрузка гардероба...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Ошибка загрузки гардероба</p>
      </div>
    )
  }

  if (wardrobeItems.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">У вас пока нет вещей в гардеробе</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {wardrobeItems.map((item) => (
        <WardrobeItemCard key={item.id} item={item} showImage={true} />
      ))}
    </div>
  )
}

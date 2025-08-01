"use client"

import { useState, useEffect } from "react"
import { InspirationOutfitCard } from "@/components/inspiration-outfit-card"
import { Skeleton } from "@/components/ui/skeleton"

interface OutfitItem {
  id: string
  name: string
  image_url: string
  color?: string
  shade?: string
  style?: string
  material?: string
  url?: string
  size_type?: string
  has_print?: string
  has_details?: string
  notes?: string
  is_basic?: boolean
  basic_item_id?: number | null
  user_id?: string | null
}

interface OutfitSuggestion {
  id: string
  title: string
  description: string
  items: OutfitItem[]
  tags: string[]
  likes: number
  isLiked: boolean
  isSaved: boolean
}

export default function InspirationPage() {
  const [outfits, setOutfits] = useState<OutfitSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedOutfitIds, setSavedOutfitIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchOutfits()
    fetchSavedOutfits()
  }, [])

  const fetchOutfits = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/outfits/inspiration")

      if (!response.ok) {
        throw new Error("Failed to fetch outfits")
      }

      const data = await response.json()
      setOutfits(data.outfits || [])
    } catch (error) {
      console.error("Error fetching outfits:", error)
      setError("Не удалось загрузить образы")
    } finally {
      setLoading(false)
    }
  }

  const fetchSavedOutfits = async () => {
    try {
      const response = await fetch("/api/user-looks")
      if (response.ok) {
        const savedLooks = await response.json()
        const savedIds = new Set(savedLooks.map((look: any) => look.original_outfit_id).filter(Boolean))
        setSavedOutfitIds(savedIds)
      }
    } catch (error) {
      console.error("Error fetching saved outfits:", error)
    }
  }

  const handleLike = (outfitId: string, action: "like" | "unlike") => {
    setOutfits((prev) =>
      prev.map((outfit) =>
        outfit.id === outfitId
          ? {
              ...outfit,
              likes: action === "like" ? outfit.likes + 1 : Math.max(0, outfit.likes - 1),
              isLiked: action === "like",
            }
          : outfit,
      ),
    )
  }

  const handleSave = (outfitId: string) => {
    setSavedOutfitIds((prev) => new Set([...prev, outfitId]))
    setOutfits((prev) => prev.map((outfit) => (outfit.id === outfitId ? { ...outfit, isSaved: true } : outfit)))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden">
                <Skeleton className="aspect-square w-full" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Ошибка загрузки</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchOutfits}
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Вдохновение</h1>
          <p className="text-gray-600">Откройте для себя новые образы и стили</p>
        </div>

        {outfits.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Образы не найдены</h3>
            <p className="text-gray-600">Пока нет доступных образов для вдохновения</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {outfits.map((outfit) => (
              <InspirationOutfitCard
                key={outfit.id}
                id={outfit.id}
                title={outfit.title}
                description={outfit.description}
                items={outfit.items}
                tags={outfit.tags}
                likes={outfit.likes}
                isLiked={outfit.isLiked}
                isSaved={savedOutfitIds.has(outfit.id)}
                onLike={handleLike}
                onSave={handleSave}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Star, Plus } from "lucide-react"
import { AddToClosetSheet } from "@/components/add-to-closet-sheet"
import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"

interface UserItem {
  id: string
  name: string
  image_url: string
  clothing_type: string
  color: string
  material: string
}

interface Recommendation {
  id: string
  title: string
  description: string
  items: UserItem[]
  created_at: string
}

interface LookSection {
  title: string
  looks_count: number
  suggestions: Recommendation[]
}

interface CachedRecommendations {
  data: LookSection[]
  timestamp: number
  userItemsCount: number
  fromCache: boolean
}

const CACHE_KEY = "outfit_recommendations_cache"
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

// Skeleton component for recommendations
const RecommendationsSkeleton = () => {
  return (
    <div className="space-y-8">
      {/* Section 1 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 bg-gray-200 rounded w-48 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
        </div>
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-64">
              <Card className="bg-white border-0 shadow-sm overflow-hidden">
                <div className="aspect-[4/5] bg-gray-200 animate-pulse"></div>
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2 animate-pulse"></div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 bg-gray-200 rounded w-56 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
        </div>
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-64">
              <Card className="bg-white border-0 shadow-sm overflow-hidden">
                <div className="aspect-[4/5] bg-gray-200 animate-pulse"></div>
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>

      {/* Section 3 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 bg-gray-200 rounded w-40 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
        </div>
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-64">
              <Card className="bg-white border-0 shadow-sm overflow-hidden">
                <div className="aspect-[4/5] bg-gray-200 animate-pulse"></div>
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-5/6 animate-pulse"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/5 animate-pulse"></div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [userItems, setUserItems] = useState<UserItem[]>([])
  const [userItemsCount, setUserItemsCount] = useState(0)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUser(user)
      if (user) {
        await fetchUserItemsCount()
        if (userItemsCount >= 6) {
          await fetchRecommendations()
        }
      }
      setLoading(false)
    }
    getUser()
  }, [refreshTrigger])

  const fetchUserItemsCount = async () => {
    try {
      const response = await fetch("/api/wardrobe-user-items")
      if (response.ok) {
        const data = await response.json()
        setUserItemsCount(data.length)
      }
    } catch (error) {
      console.error("Error fetching user items count:", error)
    }
  }

  const fetchRecommendations = async () => {
    if (userItemsCount < 6) return

    setLoadingRecommendations(true)
    try {
      const response = await fetch("/api/user-recommendations")
      if (response.ok) {
        const data = await response.json()
        setRecommendations(data)
      }
    } catch (error) {
      console.error("Error fetching recommendations:", error)
    } finally {
      setLoadingRecommendations(false)
    }
  }

  const handleSheetClose = async () => {
    setIsAddSheetOpen(false)
    await fetchUserItemsCount()
    setRefreshTrigger((prev) => prev + 1)
  }

  const progressPercentage = Math.min((userItemsCount / 6) * 100, 100)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-md mx-auto space-y-6">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-64 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-32 bg-gray-200 rounded-lg animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Добро пожаловать!</h1>
          <p className="text-gray-600">Создайте свой идеальный гардероб</p>
        </div>

        {userItemsCount < 6 ? (
          <>
            {/* Wardrobe Video */}
            <div className="flex justify-center">
              <div className="w-80 h-[28rem] bg-white rounded-2xl shadow-lg overflow-hidden">
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls={false}
                  preload="auto"
                  className="w-full h-full object-cover"
                >
                  <source src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/2025-07-14%204.03.22%E2%80%AFPM%20%281%29-5C9s38mSex1FKGeV9b9oiB6UjE3ENH.mp4" type="video/mp4" />
                  {/* Fallback content */}
                  <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 bg-blue-500 rounded-full mx-auto flex items-center justify-center">
                        <Star className="w-8 h-8 text-white" />
                      </div>
                      <p className="text-gray-600">Ваш гардероб</p>
                    </div>
                  </div>
                </video>
              </div>
            </div>

            {/* Progress Card */}
            <Card className="bg-gradient-to-r from-gray-50 to-gray-100 border-0 shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Разблокируйте весь потенциал</h3>
                    <p className="text-gray-600 text-sm">
                      {userItemsCount === 0
                        ? "Добавьте первую вещь в гардероб"
                        : userItemsCount < 3
                          ? "Отличное начало! Продолжайте добавлять"
                          : userItemsCount < 6
                            ? "Почти готово! Осталось совсем немного"
                            : "Поздравляем! Все функции разблокированы"}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">{userItemsCount}/6</div>
                    <Star className="w-6 h-6 mx-auto mt-1 text-yellow-500 fill-current" />
                  </div>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-gray-400 to-gray-500 h-3 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>

                {/* Slots visualization */}
                <div className="flex justify-center space-x-2 mt-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <button
                      key={index}
                      onClick={index >= userItemsCount ? () => setIsAddSheetOpen(true) : undefined}
                      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${
                        index < userItemsCount
                          ? "bg-gray-200 border-gray-300 text-gray-600 cursor-default"
                          : "border-gray-300 border-dashed hover:border-gray-400 hover:bg-gray-50 cursor-pointer"
                      }`}
                    >
                      {index < userItemsCount ? (
                        <Star className="w-5 h-5 text-yellow-500 fill-current" />
                      ) : (
                        <Plus className="w-5 h-5 text-gray-400 hover:text-gray-600 transition-colors" />
                      )}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Add to Wardrobe Button */}
            <Button
              onClick={() => setIsAddSheetOpen(true)}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl text-lg font-medium"
            >
              Добавить в гардероб
            </Button>
          </>
        ) : (
          <>
            {/* User Wardrobe Grid */}
            <UserWardrobeGrid key={refreshTrigger} />

            {/* Outfit Suggestions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Рекомендации образов</h2>
              </div>

              {loadingRecommendations ? (
                <div className="space-y-4">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="h-32 bg-gray-200 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : recommendations.length > 0 ? (
                <div className="space-y-4">
                  {recommendations.map((recommendation) => (
                    <Card key={recommendation.id} className="bg-white">
                      <CardContent className="p-4">
                        <h3 className="font-medium text-gray-900 mb-2">{recommendation.title}</h3>
                        <p className="text-sm text-gray-600 mb-3">{recommendation.description}</p>
                        <div className="flex space-x-2 overflow-x-auto">
                          {recommendation.items.map((item) => (
                            <div key={item.id} className="flex-shrink-0">
                              <img
                                src={item.image_url || "/placeholder.svg"}
                                alt={item.name}
                                className="w-16 h-16 object-cover rounded-lg"
                              />
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="bg-white">
                  <CardContent className="p-6 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                      <Star className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Пока нет рекомендаций</h3>
                    <p className="text-gray-600 text-sm mb-4">
                      Добавьте больше вещей в гардероб, чтобы получить персональные рекомендации
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </div>

      <AddToClosetSheet isOpen={isAddSheetOpen} onClose={handleSheetClose} />
    </div>
  )
}

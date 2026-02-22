"use client"

import { useState, useEffect } from "react"
import { OutfitCard } from "@/components/outfit-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Sparkles, Camera } from "lucide-react"
import { useReconcileLimits } from "@/hooks/use-reconcile-limits";
import { useFeature } from "@/hooks/use-feature";
import { SubscriptionSheet } from "@/components/subscription-sheet";
import { api } from "@/lib/api-client";
import { useAddToCloset } from "@/contexts/add-to-closet-context";


interface OutfitItem {
  id: string
  name: string
  image_url: string
  color: string
  shade: string
  has_print: string
  notes?: string
  user_id?: string
}

interface OutfitSuggestion {
  id: string
  title: string
  items: OutfitItem[]
  suggested_items_count: number
}

interface LookSection {
  title: string
  looks_count: number
  suggestions: OutfitSuggestion[]
}


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
  const [outfitSections, setOutfitSections] = useState<LookSection[]>([])
  const [loading, setLoading] = useState(true)
  const [userItemsCount, setUserItemsCount] = useState(0)
  const [itemsLoading, setItemsLoading] = useState(true)
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [userLooks, setUserLooks] = useState<any[]>([])
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { log, consume } = useFeature()
  const { openSheet } = useAddToCloset()
  useReconcileLimits(true);


  const loadUserLooks = async () => {
    try {
      const looks = await api.get("/api/user-looks")
      setUserLooks(looks)
    } catch (error) {
      console.error("Error loading user looks:", error)
    }
  }

  const handleTryOnClick = ({ requestId, suggestion, items }) => {
    // ⬇️ РОВНО как у тебя было: лог клика
    void log("vton_used", "click", {
      pagePath: "/app",
      requestId,
      outfitId: suggestion.id,
      itemIds: items.map(i => i.id),
    })
  }

  const handleTryOnSuccess = async ({ requestId, suggestion }) => {
    // ⬇️ списание ПОСЛЕ успешной примерки
    const res = await consume("vton_used", {
      pagePath: "/app",
      requestId,
      outfitId: suggestion.id,
    })
    if (!res.ok && res.code === "payment_required") setPaywallOpen(true)
  }

  // Handle save/unsave outfit
  const handleSaveOutfit = async (suggestion: OutfitSuggestion) => {
    if (!suggestion || !suggestion.items || suggestion.items.length === 0) {
      return
    }

    // Check if already saved
    const isAlreadySaved = userLooks.some(
        (look: any) =>
            look.name === suggestion.title ||
            (look.items &&
                look.items.length === suggestion.items.length &&
                look.items.every((item: any) => suggestion.items.some((suggItem) => suggItem.id === item.id.toString()))),
    )

    try {
      if (isAlreadySaved) {
        // Find and remove the saved look
        const lookToRemove = userLooks.find(
            (look: any) =>
                look.name === suggestion.title ||
                (look.items &&
                    look.items.length === suggestion.items.length &&
                    look.items.every((item: any) => suggestion.items.some((suggItem) => suggItem.id === item.id.toString()))),
        )

        if (lookToRemove) {
          await api.delete(`/api/user-looks/${lookToRemove.id}`)
          setUserLooks((prev) => prev.filter((look) => look.id !== lookToRemove.id))
        }
      } else {
        // Add to saved looks
        const transformedItems = suggestion.items.map((item: any) => ({
          type: item.user_id ? "user" : "basic",
          id: Number.parseInt(item.id),
        }))

        const newLook = await api.post("/api/user-looks", {
          name: suggestion.title,
          description: `Рекомендованный образ с ${suggestion.suggested_items_count} предложенными вещами`,
          items: transformedItems,
        })
        setUserLooks((prev) => [...prev, newLook])
      }
    } catch (error) {
      console.error("Error managing outfit:", error)
    }
  }




  // Load user items count
  useEffect(() => {
    const loadUserItemsCount = async () => {
      try {
        const data = await api.get("/api/wardrobe-user-items")
        setUserItemsCount(Array.isArray(data) ? data.length : 0)
      } catch (error) {
        console.error("Error loading user items count:", error)
      } finally {
        setItemsLoading(false)
      }
    }

    loadUserItemsCount()
    loadUserLooks()
  }, [])

  // Load outfit suggestions from database API
  useEffect(() => {
    const loadOutfitSuggestions = async () => {
      try {
        console.log("Loading recommendations from database")

        const recommendations = await api.get("/api/recommendations")
        console.log("Recommendations received from database:", recommendations)

        // Ensure recommendations is an array and has proper structure
        const validRecommendations = Array.isArray(recommendations) ? recommendations : []
        const processedRecommendations = validRecommendations.map((section) => ({
          ...section,
          suggestions: Array.isArray(section.suggestions)
              ? section.suggestions.map((suggestion) => ({
                ...suggestion,
                items: Array.isArray(suggestion.items) ? suggestion.items : [],
              }))
              : [],
        }))

        setOutfitSections(processedRecommendations)
      } catch (error) {
        console.error("Error loading outfit suggestions:", error)
        setOutfitSections([])
      } finally {
        setLoading(false)
      }
    }

    // Only load suggestions if user items count is loaded and user has 6+ items
    if (!itemsLoading && userItemsCount >= 6) {
      loadOutfitSuggestions()
    } else if (!itemsLoading && userItemsCount < 6) {
      // For users with less than 6 items, don't load recommendations
      setLoading(false)
    }
  }, [itemsLoading, userItemsCount])

  const handleGetRecommendations = async () => {
    setRecommendationsLoading(true)
    try {
      console.log("Manual recommendation request to database")

      const recommendations = await api.get("/api/recommendations")
      console.log("Manual recommendations received from database:", recommendations)

      // Ensure recommendations is an array and has proper structure
      const validRecommendations = Array.isArray(recommendations) ? recommendations : []
      const processedRecommendations = validRecommendations.map((section) => ({
        ...section,
        suggestions: Array.isArray(section.suggestions)
            ? section.suggestions.map((suggestion) => ({
              ...suggestion,
              items: Array.isArray(suggestion.items) ? suggestion.items : [],
            }))
            : [],
      }))

      setOutfitSections(processedRecommendations)
    } catch (error) {
      console.error("Error getting recommendations:", error)
      setOutfitSections([])
    } finally {
      setRecommendationsLoading(false)
    }
  }

  return (
      <div className="min-h-screen bg-gray-50 pb-10">
        <div className="px-4 py-6">
          {/* Upload card for users with less than 6 items */}
          {userItemsCount < 6 && !itemsLoading && (
              <Card className="mb-6 border-0 shadow-sm overflow-hidden">
                <CardContent className="p-6 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Camera className="w-8 h-8 text-gray-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {userItemsCount === 0
                        ? "Оцифруйте свой гардероб"
                        : "Добавьте ещё вещи"}
                  </h3>
                  <p className="text-sm text-gray-500 mb-5 max-w-[260px] mx-auto">
                    {userItemsCount === 0
                        ? "Сфотографируйте вещи — AI распознает их и добавит в ваш цифровой гардероб"
                        : `У вас ${userItemsCount} ${userItemsCount === 1 ? "вещь" : userItemsCount < 5 ? "вещи" : "вещей"}. Добавьте больше для персональных рекомендаций`}
                  </p>
                  <Button
                      onClick={() => openSheet()}
                      className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl px-6 py-2.5"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    {userItemsCount === 0 ? "Добавить первую вещь" : "Добавить вещи"}
                  </Button>
                </CardContent>
              </Card>
          )}

          {/* Outfit Suggestions - only for users with 6+ items */}
          {userItemsCount >= 6 && (
              <>
                {loading || itemsLoading ? (
                    <RecommendationsSkeleton />
                ) : outfitSections.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-500 mb-4">Пока нет рекомендаций</p>
                      <Button
                          onClick={handleGetRecommendations}
                          disabled={recommendationsLoading}
                          variant="outline"
                          className="text-blue-400 hover:text-blue-300 border-blue-200 hover:border-blue-300 bg-transparent"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        {recommendationsLoading ? "Подбираем..." : "Получить рекомендации"}
                      </Button>
                    </div>
                ) : (
                    <div className="space-y-8">
                      {outfitSections.map((section, sectionIndex) => {
                        // Add safety checks for section data
                        if (!section || !section.suggestions || !Array.isArray(section.suggestions)) {
                          return null
                        }

                        return (
                            <div key={`${section.title || "section"}-${sectionIndex}`} className="space-y-4">
                              {/* Section Header */}
                              <div className="flex items-center justify-between">
                                <h2 className="text-xl font-semibold text-gray-900">{section.title || "Образы"}</h2>
                                <span className="text-sm text-gray-500">
                          {section.looks_count || section.suggestions.length} образов
                        </span>
                              </div>

                              {/* Horizontal Scrolling Container */}
                              <div className="relative">
                                <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 snap-x snap-mandatory">
                                  {section.suggestions.map((suggestion, suggestionIndex) => {
                                    // Add safety check for suggestion
                                    if (!suggestion) {
                                      return null
                                    }

                                    return (
                                        <div
                                            key={suggestion.id || `suggestion-${suggestionIndex}`}
                                            className="flex-shrink-0 snap-start"
                                        >
                                          <OutfitCard
                                              suggestion={suggestion}
                                              onTryOnClick={handleTryOnClick}
                                              onTryOnSuccess={handleTryOnSuccess}
                                              onSaveOutfit={handleSaveOutfit}
                                              userLooks={userLooks}
                                          />
                                        </div>
                                    )
                                  })}
                                </div>

                                {/* Scroll indicators */}
                                <div className="absolute top-1/2 -translate-y-1/2 left-0 w-8 h-full bg-gradient-to-r from-gray-50 to-transparent pointer-events-none opacity-50" />
                                <div className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-full bg-gradient-to-l from-gray-50 to-transparent pointer-events-none opacity-50" />
                              </div>
                            </div>
                        )
                      })}
                    </div>
                )}
              </>
          )}
        </div>

        <SubscriptionSheet
            isOpen={paywallOpen}
            onClose={() => setPaywallOpen(false)}
            onSuccess={() => setPaywallOpen(false)}
        />
      </div>
  )
}
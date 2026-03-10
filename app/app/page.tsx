"use client"

import { useState, useEffect, useRef } from "react"
import { OutfitCard } from "@/components/outfit-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Sparkles, Loader2 } from "lucide-react"
import { HomeHeroSection } from "@/components/home-hero-section"
import { useReconcileLimits } from "@/hooks/use-reconcile-limits";
import { useFeature } from "@/hooks/use-feature";
import { SubscriptionSheet } from "@/components/subscription-sheet";
import { api } from "@/lib/api-client";
import { useAddToCloset } from "@/contexts/add-to-closet-context";
import { filterSections } from "@/lib/recommendation-filters";


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

// Beautiful loading screen for first-time generation
const GenerationLoadingScreen = () => {
  const [dots, setDots] = useState("")
  const [tipIndex, setTipIndex] = useState(0)

  const tips = [
    "Анализируем ваш гардероб",
    "Подбираем цветовые сочетания",
    "Учитываем погоду и сезон",
    "Составляем стильные образы",
    "Почти готово",
  ]

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots(d => d.length >= 3 ? "" : d + ".")
    }, 500)
    const tipInterval = setInterval(() => {
      setTipIndex(i => (i + 1) % tips.length)
    }, 4000)
    return () => { clearInterval(dotsInterval); clearInterval(tipInterval) }
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="relative mb-8">
        {/* Animated rings */}
        <div className="w-24 h-24 rounded-full border-2 border-purple-200 animate-ping absolute inset-0 opacity-20" />
        <div className="w-24 h-24 rounded-full border-2 border-blue-200 animate-ping absolute inset-0 opacity-15" style={{ animationDelay: "0.5s" }} />
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #EC9DE2, #89AEFF)" }}
        >
          <Sparkles className="w-10 h-10 text-white animate-pulse" />
        </div>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
        Подбираем лучшие образы для вас{dots}
      </h2>

      <p className="text-sm text-gray-500 mb-6 text-center max-w-xs">
        Первая генерация может занять от 1 до 2 минут. AI анализирует ваш гардероб и создаёт персональные рекомендации.
      </p>

      {/* Animated tip */}
      <div className="bg-white rounded-xl px-5 py-3 shadow-sm border border-gray-100 mb-6 min-w-[260px] text-center">
        <p className="text-sm text-gray-600 transition-opacity duration-300">
          <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-purple-400" />
          {tips[tipIndex]}
        </p>
      </div>

      {/* Progress bar animation */}
      <div className="w-64 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full animate-progress"
          style={{
            background: "linear-gradient(to right, #EC9DE2, #89AEFF)",
            animation: "progress 90s ease-out forwards",
          }}
        />
      </div>

      <style jsx>{`
        @keyframes progress {
          0% { width: 0%; }
          10% { width: 15%; }
          30% { width: 35%; }
          50% { width: 55%; }
          70% { width: 70%; }
          90% { width: 85%; }
          100% { width: 95%; }
        }
      `}</style>
    </div>
  )
}

export default function HomePage() {
  const [outfitSections, setOutfitSections] = useState<LookSection[]>([])
  const [loading, setLoading] = useState(true)
  const [userItemsCount, setUserItemsCount] = useState(0)
  const [itemsLoading, setItemsLoading] = useState(true)
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [generationError, setGenerationError] = useState(false)
  const [userLooks, setUserLooks] = useState<any[]>([])
  const [paywallOpen, setPaywallOpen] = useState(false);
  const refreshingRef = useRef(false)
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

  const processRecommendations = (recommendations: any[]) => {
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
    const { sections: cleaned } = filterSections(processedRecommendations, 2)
    return cleaned
  }

  // Check if a background refresh is already running (survives tab switches & remounts)
  const isRefreshRunning = () => {
    try {
      const ts = sessionStorage.getItem("rec_refresh_ts")
      if (!ts) return false
      // Consider stale after 3 minutes (n8n timeout)
      return Date.now() - Number(ts) < 3 * 60 * 1000
    } catch { return false }
  }
  const markRefreshRunning = () => {
    try { sessionStorage.setItem("rec_refresh_ts", String(Date.now())) } catch {}
  }
  const clearRefreshMark = () => {
    try { sessionStorage.removeItem("rec_refresh_ts") } catch {}
  }

  // Background refresh: trigger POST, update sections when done.
  // Even if user closes the tab — n8n still processes the request
  // and writes to DB. Next visit will pick it up via GET.
  const refreshInBackground = async () => {
    if (refreshingRef.current || isRefreshRunning()) return
    refreshingRef.current = true
    markRefreshRunning()
    console.log("[HomePage] Refreshing recommendations in background...")
    try {
      const generated = await api.post("/api/recommendations", {})
      const newSections = processRecommendations(Array.isArray(generated) ? generated : [])
      if (newSections.length > 0) {
        console.log("[HomePage] Background refresh got", newSections.length, "sections")
        setOutfitSections(newSections)
      }
    } catch (e) {
      console.error("[HomePage] Background refresh failed:", e)
    } finally {
      refreshingRef.current = false
      clearRefreshMark()
    }
  }

  // Load outfit suggestions from database API
  // Strategy: show cached data immediately, refresh in background if stale
  useEffect(() => {
    const loadOutfitSuggestions = async () => {
      try {
        console.log("[HomePage] Loading recommendations from API...")
        const response = await api.get("/api/recommendations")

        // API returns { sections: [...], stale: boolean } or legacy flat array
        let sections: any[]
        let stale = false
        if (response && typeof response === "object" && "sections" in response) {
          sections = Array.isArray(response.sections) ? response.sections : []
          stale = !!response.stale
        } else {
          sections = Array.isArray(response) ? response : []
        }

        const cleaned = processRecommendations(sections)
        console.log("[HomePage] Got", cleaned.length, "sections, stale:", stale)

        if (cleaned.length > 0) {
          // Show cached data immediately
          setOutfitSections(cleaned)
          setLoading(false)
          // If stale, refresh in background (no loading screen)
          if (stale) {
            refreshInBackground()
          }
        } else if (!isRefreshRunning() && !refreshingRef.current) {
          // No data at all — show generation screen
          console.log("[HomePage] No recommendations found, triggering generation")
          setLoading(false)
          setRecommendationsLoading(true)
          setGenerationError(false)
          refreshingRef.current = true
          markRefreshRunning()
          try {
            const generated = await api.post("/api/recommendations", {})
            setOutfitSections(processRecommendations(Array.isArray(generated) ? generated : []))
          } catch (e) {
            console.error("Auto-generation failed:", e)
            setGenerationError(true)
          } finally {
            setRecommendationsLoading(false)
            refreshingRef.current = false
            clearRefreshMark()
          }
        } else {
          // A refresh is already running — just show loading or empty
          setLoading(false)
          if (!recommendationsLoading) {
            setRecommendationsLoading(true)
          }
        }
      } catch (error) {
        console.error("Error loading outfit suggestions:", error)
        setOutfitSections([])
        setLoading(false)
      }
    }

    if (!itemsLoading && userItemsCount >= 1) {
      loadOutfitSuggestions()
    } else if (!itemsLoading) {
      setLoading(false)
    }
  }, [itemsLoading, userItemsCount])

  const handleGetRecommendations = async () => {
    setRecommendationsLoading(true)
    setGenerationError(false)
    try {
      const recommendations = await api.post("/api/recommendations", {})
      setOutfitSections(processRecommendations(recommendations))
    } catch (error) {
      console.error("Error getting recommendations:", error)
      setGenerationError(true)
      setOutfitSections([])
    } finally {
      setRecommendationsLoading(false)
    }
  }

  return (
      <div className="min-h-screen bg-gray-50 pb-10">
        <div className="px-4 py-6">
          {/* Hero for users with no items */}
          {userItemsCount === 0 && !itemsLoading && (
              <HomeHeroSection
                  userItemsCount={userItemsCount}
                  onAddItems={() => openSheet()}
                  onExploreFeatures={() => setPaywallOpen(true)}
              />
          )}

          {/* Outfit Suggestions - for users with at least 1 item */}
          {userItemsCount >= 1 && (
              <>
                {loading || itemsLoading ? (
                    <RecommendationsSkeleton />
                ) : recommendationsLoading ? (
                    <GenerationLoadingScreen />
                ) : outfitSections.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-500 mb-4">
                        {generationError ? "Не удалось сгенерировать образы. Попробуйте ещё раз." : "Пока нет рекомендаций"}
                      </p>
                      <Button
                          onClick={handleGetRecommendations}
                          disabled={recommendationsLoading}
                          variant="outline"
                          className="text-blue-400 hover:text-blue-300 border-blue-200 hover:border-blue-300 bg-transparent"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Получить рекомендации
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
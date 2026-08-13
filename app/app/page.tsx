"use client"

import { useState, useEffect, useRef } from "react"
import { OutfitCard } from "@/components/outfit-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Sparkles, Loader2, Camera } from "lucide-react"
import { HomeHeroSection } from "@/components/home-hero-section"
import { useReconcileLimits } from "@/hooks/use-reconcile-limits";
import { useFeature } from "@/hooks/use-feature";
import { SubscriptionSheet } from "@/components/subscription-sheet";
import { VisualSearchSheet } from "@/components/visual-search-sheet";
import { api } from "@/lib/api-client";
import { useAddToCloset } from "@/contexts/add-to-closet-context";
import { PartnerItemsIntroSheet } from "@/components/partner-items-intro-sheet";
import { toast } from "sonner";


interface OutfitItem {
  id: string
  name: string
  image_url: string
  color: string
  shade: string
  has_print: string
  notes?: string
  user_id?: string
  url?: string
  brand?: string
}

interface OutfitSuggestion {
  id: string
  title: string
  items: OutfitItem[]
  suggested_items_count: number
}

interface LookSection {
  title: string
  looks_count?: number
  suggestions: OutfitSuggestion[]
  source?: "user_only" | "mix" | "partner_only" | "clip" | "ai"
  source_label?: string
  rec_session_id?: string | null
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
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative mb-8 animate-fade-up">
        <div className="w-20 h-20 rounded-full border border-line animate-ping absolute inset-0 opacity-50" />
        <div className="w-20 h-20 rounded-full bg-ink flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-signal-ink animate-pulse" />
        </div>
      </div>

      <h2
        className="text-h2 text-ink text-center mb-2 animate-fade-up"
        style={{ animationDelay: "50ms" }}
      >
        Подбираем образы{dots}
      </h2>

      <p
        className="text-caption text-ink-2 text-center max-w-xs mb-6 animate-fade-up"
        style={{ animationDelay: "100ms" }}
      >
        Первая генерация занимает 1–2 минуты
      </p>

      {/* Animated tip */}
      <div
        className="bg-canvas-sunk rounded-full px-5 py-2.5 mb-6 min-w-[240px] text-center animate-fade-up"
        style={{ animationDelay: "150ms" }}
      >
        <p className="text-caption text-ink-2">{tips[tipIndex]}</p>
      </div>

      {/* Progress bar — transform-only, no width transitions */}
      <div
        className="w-64 h-1.5 bg-canvas-sunk rounded-full overflow-hidden animate-fade-up"
        style={{ animationDelay: "200ms" }}
      >
        <div className="h-full w-full origin-left bg-signal rounded-full progress-fill" />
      </div>

      <style jsx>{`
        @keyframes progress-fill {
          0% { transform: scaleX(0); }
          10% { transform: scaleX(.15); }
          30% { transform: scaleX(.35); }
          50% { transform: scaleX(.55); }
          70% { transform: scaleX(.70); }
          90% { transform: scaleX(.85); }
          100% { transform: scaleX(.95); }
        }
        .progress-fill {
          animation: progress-fill 90s ease-out forwards;
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
  const [visualSearchOpen, setVisualSearchOpen] = useState(false);
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

  // Handle item dislike
  const handleDislikeItem = async (itemId: string) => {
    try {
      const numericId = Number.parseInt(itemId)
      if (Number.isNaN(numericId)) return
      // Determine source: items with user_id are from wardrobe_user_items
      const allItems = outfitSections.flatMap(s => s.suggestions).flatMap(sg => sg.items)
      const item = allItems.find(i => i.id === itemId)
      const source = item?.user_id ? "wardrobe_user_items" : "wardrobe_items"
      await api.post("/api/items/dislike", { item_id: numericId, item_source: source })
      toast.success("Больше не будем рекомендовать эту вещь")
    } catch {
      toast.error("Не удалось сохранить")
    }
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

  // Server already runs filterSections — no need to double-filter here.
  // Just ensure structural validity (arrays exist).
  const processRecommendations = (recommendations: any[]) => {
    const validRecommendations = Array.isArray(recommendations) ? recommendations : []
    return validRecommendations
      .map((section) => ({
        ...section,
        suggestions: Array.isArray(section.suggestions)
          ? section.suggestions.map((suggestion) => ({
              ...suggestion,
              items: Array.isArray(suggestion.items) ? suggestion.items : [],
            }))
          : [],
      }))
      .filter((section) => section.suggestions.length > 0)
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
        } else if (isRefreshRunning()) {
          // A refresh is already running in another tab/session —
          // wait a bit and re-read from DB (the POST writes to DB on success)
          setLoading(false)
          setRecommendationsLoading(true)
          console.log("[HomePage] Refresh already running, polling DB in 15s...")
          setTimeout(async () => {
            try {
              const retryResponse = await api.get("/api/recommendations")
              let retrySections: any[] = []
              if (retryResponse && typeof retryResponse === "object" && "sections" in retryResponse) {
                retrySections = Array.isArray(retryResponse.sections) ? retryResponse.sections : []
              }
              const retryCleaned = processRecommendations(retrySections)
              if (retryCleaned.length > 0) {
                setOutfitSections(retryCleaned)
              }
            } catch (e) {
              console.error("[HomePage] Retry fetch failed:", e)
            } finally {
              setRecommendationsLoading(false)
              clearRefreshMark()
            }
          }, 15000)
        } else {
          // No data and no refresh running — show empty state
          setLoading(false)
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
      <div className="min-h-screen bg-background pb-10 flex flex-col">
        <div className="px-4 pt-2 pb-4 flex flex-1 flex-col">
          {/* Hero for users with no items — stretches so the CTA can sit
              in the thumb zone above the nav instead of floating mid-air. */}
          {userItemsCount === 0 && !itemsLoading && (
              <HomeHeroSection
                  userItemsCount={userItemsCount}
                  onAddItems={() => openSheet()}
                  onExploreFeatures={() => setPaywallOpen(true)}
              />
          )}

          {/* Visual search button removed */}

          {/* Outfit Suggestions - for users with at least 1 item */}
          {userItemsCount >= 1 && (
              <>
                {loading || itemsLoading ? (
                    <RecommendationsSkeleton />
                ) : recommendationsLoading ? (
                    <GenerationLoadingScreen />
                ) : outfitSections.length === 0 ? (
                    <div className="text-center py-16">
                      <div
                        className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center bg-canvas-sunk animate-fade-up"
                      >
                        <Sparkles className="h-6 w-6 text-ink-2" />
                      </div>
                      <h3
                        className="text-h2 text-ink mb-2 animate-fade-up"
                        style={{ animationDelay: "50ms" }}
                      >
                        {generationError ? "Что-то пошло не так" : "Ваши образы ждут"}
                      </h3>
                      <p
                        className="text-body text-ink-2 mb-6 max-w-[260px] mx-auto animate-fade-up"
                        style={{ animationDelay: "100ms" }}
                      >
                        {generationError ? "Попробуйте ещё раз — мы подберём для вас" : "Соберём подборки на основе вашего гардероба"}
                      </p>
                      <Button
                          onClick={handleGetRecommendations}
                          disabled={recommendationsLoading}
                          variant="signal"
                          size="lg"
                          className="px-8 animate-fade-up"
                          style={{ animationDelay: "150ms" }}
                      >
                        <Sparkles className="h-4 w-4" />
                        Создать подборки
                      </Button>
                    </div>
                ) : (
                    <div className="space-y-5">
                      {outfitSections.map((section, sectionIndex) => {
                        // Add safety checks for section data
                        if (!section || !section.suggestions || !Array.isArray(section.suggestions)) {
                          return null
                        }

                        return (
                            <div key={`${section.title || "section"}-${sectionIndex}`} className="space-y-3 animate-fade-up" style={{ animationDelay: `${sectionIndex * 50}ms` }}>
                              {/* Section Header */}
                              <div className="flex items-center justify-between">
                                <h2 className="text-h2 text-ink">{section.title || "Образы"}</h2>
                                <span className="text-caption text-ink-2">
                          {section.looks_count || section.suggestions.length} образов
                        </span>
                              </div>

                              {/* Horizontal Scrolling Container — full bleed */}
                              <div className="relative scroll-section -mx-4">
                                <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-6 pt-1 px-4 snap-x snap-mandatory">
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
                                              sectionSource={section.source}
                                              recSessionId={section.rec_session_id}
                                              onTryOnClick={handleTryOnClick}
                                              onTryOnSuccess={handleTryOnSuccess}
                                              onSaveOutfit={handleSaveOutfit}
                                              userLooks={userLooks}
                                              onDislikeItem={handleDislikeItem}
                                          />
                                        </div>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                        )
                      })}
                    </div>
                )}
              </>
          )}
        </div>

        <VisualSearchSheet
            isOpen={visualSearchOpen}
            onClose={() => setVisualSearchOpen(false)}
        />

        <SubscriptionSheet
            isOpen={paywallOpen}
            source="limit:home"
            onClose={() => setPaywallOpen(false)}
            onSuccess={() => setPaywallOpen(false)}
        />

        {/* Partner items intro — shown once when user first sees recommendations */}
        <PartnerItemsIntroSheet
          shouldShow={outfitSections.length > 0 && outfitSections.some(s => s.source === "clip" || s.suggestions?.some((sg: any) => sg.items?.some((i: any) => !i.user_id)))}
          sampleImages={
            outfitSections
              .flatMap(s => s.suggestions || [])
              .flatMap((sg: any) => sg.items || [])
              .filter((i: any) => !i.user_id && i.image_url)
              .slice(0, 2)
              .map((i: any) => i.image_url)
          }
        />
      </div>
  )
}
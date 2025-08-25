"use client"

import React from "react"

import type { ReactElement } from "react"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bookmark, BookmarkCheck, ChevronDown, ChevronUp, Heart, Loader2, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { BottomNavigation } from "@/components/bottom-navigation"
import { PaywallModal } from "@/components/paywall-modal"
import { OutfitItemsSheet } from "@/components/outfit-items-sheet"

type OutfitItem = {
  id: string
  name: string
  image_url: string
  color?: string | null
  shade?: string | null
  style?: string | null
  material?: string | null
  url?: string | null
  size_type?: string | null
  has_print?: string | null
  has_details?: string | null
  notes?: string | null
  is_basic?: boolean
  basic_item_id?: number | null
  user_id?: string | null
}

type FeedOutfit = {
  id: string
  title: string
  description?: string
  items: OutfitItem[]
  tags: string[]
  likes: number
  isLiked: boolean
  isSaved?: boolean
  preview_image_url?: string
}

type ApiResponse = {
  outfits: any[]
  nextCursor?: string | null
}

type TabKey = "popular" | "liked"

function getPreviewSrc(o?: FeedOutfit | null): string {
  const direct = (o?.preview_image_url || "").trim()
  if (direct) return direct
  const firstItem = Array.isArray(o?.items) ? (o?.items?.[0]?.image_url || "").trim() : ""
  return firstItem || "/placeholder.svg?height=1200&width=900"
}

const KEEP_BEHIND = 8
const KEEP_AHEAD = 8
const MAX_KEEP = KEEP_BEHIND + KEEP_AHEAD + 1

function getViewedOutfitsKey() {
  // Simple hash based on user agent and timestamp to prevent easy tampering
  const userAgent = typeof window !== "undefined" ? window.navigator.userAgent : ""
  const sessionStart =
    typeof window !== "undefined"
      ? window.sessionStorage.getItem("session_start") || Date.now().toString()
      : Date.now().toString()
  if (typeof window !== "undefined" && !window.sessionStorage.getItem("session_start")) {
    window.sessionStorage.setItem("session_start", sessionStart)
  }
  const hash = btoa(userAgent + sessionStart).slice(0, 8)
  return `viewed_outfits_${hash}`
}

function getViewedOutfits(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const key = getViewedOutfitsKey()
    const stored = localStorage.getItem(key)
    if (stored) {
      const parsed = JSON.parse(stored)
      return new Set(parsed.ids || [])
    }
  } catch (e) {
    console.warn("Failed to load viewed outfits:", e)
  }
  return new Set()
}

function saveViewedOutfits(viewedIds: Set<string>) {
  if (typeof window === "undefined") return
  try {
    const key = getViewedOutfitsKey()
    localStorage.setItem(
      key,
      JSON.stringify({
        ids: Array.from(viewedIds),
        timestamp: Date.now(),
      }),
    )
  } catch (e) {
    console.warn("Failed to save viewed outfits:", e)
  }
}

const BufferedImage = React.memo(
  ({
    src,
    alt,
    className,
  }: {
    src: string
    alt: string
    className?: string
  }) => {
    const [visibleIndex, setVisibleIndex] = useState(0)
    const [bufferSrcs, setBufferSrcs] = useState<[string | null, string | null]>([src, null])
    const [loadingStates, setLoadingStates] = useState<[boolean, boolean]>([true, true])

    useEffect(() => {
      if (bufferSrcs[visibleIndex] === src) return
      const nextIndex = 1 - visibleIndex
      setBufferSrcs((prev) => {
        const newBuffers = [...prev]
        newBuffers[nextIndex] = src
        return newBuffers as [string | null, string | null]
      })
      setLoadingStates((prev) => {
        const newStates = [...prev]
        newStates[nextIndex] = true
        return newStates as [boolean, boolean]
      })
    }, [src, bufferSrcs, visibleIndex])

    const handleComplete = useCallback(
      (index: number) => {
        setLoadingStates((prev) => {
          const newStates = [...prev]
          newStates[index] = false
          return newStates as [boolean, boolean]
        })

        if (index !== visibleIndex && !loadingStates[index]) {
          setTimeout(() => {
            setVisibleIndex(index)
            setBufferSrcs((prev) => {
              const newBuffers = [...prev]
              newBuffers[1 - index] = null
              return newBuffers as [string | null, string | null]
            })
          }, 100) // Increased delay for smoother transitions
        }
      },
      [visibleIndex, loadingStates],
    )

    return (
      <>
        {bufferSrcs.map((bufferSrc, idx) => {
          if (!bufferSrc) return null
          return (
            <Image
              key={`${bufferSrc}-${idx}`}
              src={bufferSrc || "/placeholder.svg"}
              alt={alt}
              fill
              loading="eager"
              fetchPriority="high"
              priority
              onLoad={() => handleComplete(idx)}
              className={cn(
                className,
                "transition-opacity duration-300 ease-out", // Smoother transition timing
                idx === visibleIndex ? "opacity-100" : "opacity-0 absolute",
              )}
            />
          )
        })}
      </>
    )
  },
)

BufferedImage.displayName = "BufferedImage"

export default function InspirationPage(): ReactElement {
  const [outfits, setOutfits] = useState<FeedOutfit[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [savedOutfitIds, setSavedOutfitIds] = useState<Set<string>>(new Set())
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<TabKey>("popular")
  const [index, setIndex] = useState(0)
  const [viewedOutfits, setViewedOutfits] = useState<Set<string>>(() => getViewedOutfits())

  const [dailyViewsUsed, setDailyViewsUsed] = useState(0)
  const [dailyViewsLimit] = useState(10) // Free users get 10 views per day
  const [showPaywall, setShowPaywall] = useState(false)
  const [isBlurred, setIsBlurred] = useState(false)
  const [userCredits, setUserCredits] = useState(0)

  const [showOutfitItems, setShowOutfitItems] = useState(false)
  const [selectedOutfitItems, setSelectedOutfitItems] = useState<OutfitItem[]>([])
  const [selectedOutfitTitle, setSelectedOutfitTitle] = useState<string>("")

  const current = outfits[index]

  useEffect(() => {
    saveViewedOutfits(viewedOutfits)
  }, [viewedOutfits])

  // Hide any global top navigation
  useEffect(() => {
    const selectors = ["header", "[data-top-navigation]", "#top-navigation", "nav[aria-label='Top']", ".top-navigation"]
    const elements = document.querySelectorAll<HTMLElement>(selectors.join(","))
    const prev: Array<{ el: HTMLElement; display: string }> = []
    elements.forEach((el) => {
      prev.push({ el, display: el.style.display })
      el.style.display = "none"
    })
    return () => prev.forEach(({ el, display }) => (el.style.display = display))
  }, [])

  useEffect(() => {
    const checkDailyLimits = async () => {
      try {
        const response = await fetch("/api/check-limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ limitType: "daily", usageType: "ideas_views" }),
        })

        if (response.ok) {
          const data = await response.json()
          if (!data.canUse) {
            setIsBlurred(true)
          }
        }
      } catch (error) {
        console.error("Error checking limits:", error)
      }
    }

    checkDailyLimits()
  }, [])

  useEffect(() => {
    if (!current || viewedOutfits.has(current.id) || isBlurred) return

    const trackView = async () => {
      try {
        // Check if user can view more
        const limitResponse = await fetch("/api/check-limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ limitType: "daily", usageType: "ideas_views" }),
        })

        if (!limitResponse.ok || !(await limitResponse.json()).canUse) {
          setIsBlurred(true)
          return
        }

        await fetch("/api/outfits/track-view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ outfitId: current.id }),
        })

        setViewedOutfits((prev) => new Set([...prev, current.id]))
        setDailyViewsUsed((prev) => prev + 1)
      } catch (e) {
        console.warn("Failed to track view:", e)
      }
    }

    const timer = setTimeout(trackView, 1000) // Track after 1 second of viewing
    return () => clearTimeout(timer)
  }, [current, viewedOutfits, isBlurred])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const [outfitsRes, likesRes] = await Promise.all([
          fetch("/api/outfits/inspiration", { cache: "no-store", credentials: "include" }),
          fetch("/api/user-likes", { cache: "no-store", credentials: "include" }),
        ])
        if (!outfitsRes.ok) throw new Error("Failed to fetch outfits")
        const data: ApiResponse = await outfitsRes.json()
        const normalized = normalizeOutfits(data.outfits)
        if (!cancelled) {
          setOutfits(normalized)
          setNextCursor(data.nextCursor ?? null)
        }
        if (likesRes.ok) {
          const likedData = await likesRes.json().catch(() => ({ liked: [] }))
          if (!cancelled) setLikedIds(new Set((likedData?.liked ?? []).map(String)))
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) setError("Не удалось загрузить образы")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setIndex(0)
  }, [activeTab])

  const filtered = useMemo(() => {
    if (activeTab === "popular") return outfits
    return outfits.filter((o) => likedIds.has(o.id))
  }, [activeTab, outfits, likedIds])

  useEffect(() => {
    if (activeTab !== "popular") return
    if (fetchingMore || !nextCursor) return
    if (index >= filtered.length - 2) void loadMore()
  }, [index, filtered.length, nextCursor, fetchingMore, activeTab])

  async function loadMore() {
    if (activeTab !== "popular") return
    if (!nextCursor || fetchingMore) return
    try {
      setFetchingMore(true)
      const res = await fetch(`/api/outfits/inspiration?cursor=${encodeURIComponent(nextCursor)}`, {
        credentials: "include",
      })
      if (!res.ok) {
        setNextCursor(null)
        return
      }
      const data: ApiResponse = await res.json()
      const extra = normalizeOutfits(data.outfits)
      setOutfits((prev) => [...prev, ...extra])
      setNextCursor(data.nextCursor ?? null)
    } catch (e) {
      console.warn("Failed to fetch more outfits:", e)
      setNextCursor(null)
    } finally {
      setFetchingMore(false)
    }
  }

  useEffect(() => {
    if (outfits.length <= MAX_KEEP) return
    if (index <= KEEP_BEHIND) return
    const start = Math.max(0, index - KEEP_BEHIND)
    const end = Math.min(outfits.length, index + KEEP_AHEAD + 1)
    const drop = start
    setOutfits((prev) => prev.slice(start, end))
    setIndex((i) => i - drop)
  }, [index, outfits])

  type Dir = "up" | "down"
  const [anim, setAnim] = useState<{ from: number; to: number; dir: Dir } | null>(null)
  const [animPhase, setAnimPhase] = useState<"idle" | "start" | "run">("idle")
  const ANIM_MS = 450

  const startTransition = useCallback(
    (dir: Dir) => {
      const to = dir === "down" ? index + 1 : index - 1
      if (to < 0 || to >= outfits.length || anim) return

      const targetOutfit = outfits[to]
      if (!targetOutfit) return

      const trackUsage = async () => {
        if (viewedOutfits.has(targetOutfit.id)) {
          return true // Skip API call if already viewed
        }

        try {
          const response = await fetch("/api/limits/consume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ featureType: "ideas_viewed" }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            if (response.status === 429) {
              // Daily limit exceeded
              setIsBlurred(true)
              return false
            }
            console.warn("Usage tracking failed:", errorData.error)
          }

          setViewedOutfits((prev) => new Set([...prev, targetOutfit.id]))
          return true
        } catch (error) {
          console.warn("Usage tracking error:", error)
          return true // Continue navigation even if tracking fails
        }
      }

      // Track usage before starting transition
      trackUsage().then((canContinue) => {
        if (!canContinue) return // Stop navigation if limit exceeded

        setAnim({ from: index, to, dir })
        setAnimPhase("start")
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setAnimPhase("run"))
        })
        window.setTimeout(() => {
          setIndex(to)
          setAnim(null)
          setAnimPhase("idle")
        }, ANIM_MS)
      })
    },
    [index, outfits, anim, viewedOutfits],
  )

  const gotoPrev = useCallback(() => startTransition("up"), [startTransition])
  const gotoNext = useCallback(() => startTransition("down"), [startTransition])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") gotoPrev()
      if (e.key === "ArrowDown") gotoNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [gotoPrev, gotoNext])

  const touchStartY = useRef<number | null>(null)
  const touchDeltaY = useRef(0)
  const isScrolling = useRef(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    touchDeltaY.current = 0
    isScrolling.current = false
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current == null) return
    touchDeltaY.current = e.touches[0].clientY - touchStartY.current

    // Prevent default scrolling behavior
    if (Math.abs(touchDeltaY.current) > 10) {
      e.preventDefault()
      isScrolling.current = true
    }
  }, [])

  const onTouchEnd = useCallback(() => {
    const threshold = 100 // Increased from 80 for smoother interaction
    if (isScrolling.current && Math.abs(touchDeltaY.current) > threshold) {
      if (touchDeltaY.current > threshold) gotoPrev()
      else if (touchDeltaY.current < -threshold) gotoNext()
    }
    touchStartY.current = null
    touchDeltaY.current = 0
    isScrolling.current = false
  }, [gotoPrev, gotoNext])

  const preloadedImages = useRef<Set<string>>(new Set())

  const preloadImage = useCallback((src: string): Promise<void> => {
    if (!src || preloadedImages.current.has(src)) return Promise.resolve()

    return new Promise((resolve) => {
      const img = new window.Image()
      img.onload = () => {
        preloadedImages.current.add(src)
        resolve()
      }
      img.onerror = () => {
        resolve() // Still resolve to not block other preloading
      }
      img.src = src
      img.loading = "eager"
    })
  }, [])

  useEffect(() => {
    if (!outfits.length) return

    const preloadPromises: Promise<void>[] = []

    // Preload current outfit and items
    const currentSrc = getPreviewSrc(current)
    if (currentSrc) preloadPromises.push(preloadImage(currentSrc))

    // Preload current outfit item thumbnails
    current?.items?.forEach((item) => {
      if (item.image_url) preloadPromises.push(preloadImage(item.image_url))
    })

    for (let offset = 1; offset <= 5; offset++) {
      const idx = index + offset
      if (idx < outfits.length) {
        const nextOutfit = outfits[idx]
        const nextSrc = getPreviewSrc(nextOutfit)
        if (nextSrc) preloadPromises.push(preloadImage(nextSrc))

        nextOutfit?.items?.forEach((item) => {
          if (item.image_url) preloadPromises.push(preloadImage(item.image_url))
        })
      }
    }

    for (let offset = 1; offset <= 2; offset++) {
      const idx = index - offset
      if (idx >= 0) {
        const prevOutfit = outfits[idx]
        const prevSrc = getPreviewSrc(prevOutfit)
        if (prevSrc) preloadPromises.push(preloadImage(prevSrc))

        // Preload previous outfit's item thumbnails
        prevOutfit?.items?.forEach((item) => {
          if (item.image_url) preloadPromises.push(preloadImage(item.image_url))
        })
      }
    }

    // Wait for critical images to load
    Promise.all(preloadPromises.slice(0, 10)).then(() => {
      // Critical images loaded, continue with the rest in background
      Promise.all(preloadPromises.slice(10))
    })
  }, [current, index, outfits, preloadImage])

  const [isSaving, setIsSaving] = useState(false)
  const [isLiking, setIsLiking] = useState(false)

  async function handleSave(outfit: FeedOutfit) {
    if (!outfit || isSaving || savedOutfitIds.has(outfit.id)) return
    setIsSaving(true)
    try {
      const res = await fetch("/api/outfits/save-to-looks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ outfitId: outfit.id }),
      })
      if (!res.ok) throw new Error("Failed to save outfit")
      setSavedOutfitIds((prev) => new Set([...prev, outfit.id]))

      await fetch("/api/outfits/track-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ outfitId: outfit.id }),
      }).catch((e) => console.warn("Failed to track save:", e))
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleLike(outfit: FeedOutfit) {
    if (!outfit || isLiking) return
    setIsLiking(true)
    try {
      const action = outfit.isLiked ? "unlike" : "like"
      const res = await fetch("/api/outfits/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ outfitId: outfit.id, action }),
      })
      if (!res.ok) throw new Error("Failed to like")
      const payload = await res.json()
      const newLikes = typeof payload?.likes === "number" ? payload.likes : outfit.likes
      const newIsLiked = typeof payload?.isLiked === "boolean" ? payload.isLiked : !outfit.isLiked

      setOutfits((prev) => prev.map((o) => (o.id === outfit.id ? { ...o, isLiked: newIsLiked, likes: newLikes } : o)))
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (newIsLiked) next.add(outfit.id)
        else next.delete(outfit.id)
        return next
      })
    } catch (e) {
      console.error(e)
    } finally {
      setIsLiking(false)
    }
  }

  async function handleBuyMoreViews() {
    try {
      const response = await fetch("/api/spend-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: 2,
          reason: "ideas_views",
          description: "Купить 5 дополнительных просмотров идей",
          usageType: "ideas_views",
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setUserCredits(data.newBalance)
        setIsBlurred(false)
        setDailyViewsUsed((prev) => Math.max(0, prev - 5)) // Reset 5 views
      } else {
        setShowPaywall(true)
      }
    } catch (error) {
      console.error("Error buying views:", error)
      setShowPaywall(true)
    }
  }

  const handleItemClick = useCallback((outfit: FeedOutfit) => {
    setSelectedOutfitItems(outfit.items || [])
    setSelectedOutfitTitle(outfit.title || "")
    setShowOutfitItems(true)
  }, [])

  useEffect(() => {
    // Clear preloaded images cache periodically to prevent memory leaks
    const interval = setInterval(() => {
      if (preloadedImages.current.size > 50) {
        preloadedImages.current.clear()
      }
    }, 30000) // Clear every 30 seconds

    return () => clearInterval(interval)
  }, [])

  const visibleItems = current?.items?.slice(0, 5) ?? []
  const remaining = Math.max(0, (current?.items?.length ?? 0) - visibleItems.length)

  const currentPreview = getPreviewSrc(current)

  const animFrom = anim ? outfits[anim.from] : null
  const animTo = anim ? outfits[anim.to] : null
  const animFromPreview = getPreviewSrc(animFrom || undefined)
  const animToPreview = getPreviewSrc(animTo || undefined)

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black text-white grid place-items-center">
        <div className="flex items-center gap-3 text-neutral-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Загрузка</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black text-white grid place-items-center p-4">
        <div className="text-center">
          <div className="text-neutral-300">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black text-white overflow-hidden overscroll-none"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Tabs persist at top */}
      <div className="absolute top-0 left-0 right-0 z-[3000] bg-black/80 backdrop-blur border-b border-neutral-900">
        <div className="mx-auto w-full max-w-[900px] px-4 lg:px-10">
          <div className="flex justify-center gap-8 py-3">
            <button
              className={cn(
                "px-2 pb-1 text-sm font-semibold transition-colors",
                activeTab === "popular" ? "text-white" : "text-neutral-400 hover:text-white",
              )}
              onClick={() => setActiveTab("popular")}
            >
              Популярные
              {activeTab === "popular" && <div className="h-0.5 bg-white rounded mt-1" />}
            </button>
            <button
              className={cn(
                "px-2 pb-1 text-sm font-semibold transition-colors",
                activeTab === "liked" ? "text-white" : "text-neutral-400 hover:text-white",
              )}
              onClick={() => setActiveTab("liked")}
            >
              Понравившиеся
              {activeTab === "liked" && <div className="h-0.5 bg-white rounded mt-1" />}
            </button>
          </div>
        </div>
      </div>

      <main className="absolute left-0 right-0 bottom-0 top-[45px] mx-auto w-full max-w-[900px] px-0 sm:px-4 lg:px-10 pt-0 sm:pt-3">
        <section className="relative h-full w-full sm:rounded-2xl overflow-hidden bg-neutral-950 touch-none select-none">
          {isBlurred && (
            <div className="absolute inset-0 z-[4000] bg-black/80 backdrop-blur-sm flex items-center justify-center">
              <div className="text-center p-6 bg-gray-900/90 rounded-xl border border-gray-700 max-w-sm mx-4">
                <Zap className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Дневной лимит исчерпан</h3>
                <p className="text-gray-300 mb-4 text-sm">
                  Вы просмотрели {dailyViewsLimit} образов сегодня. Купите дополнительные просмотры или оформите
                  подписку Pro.
                </p>
                <div className="space-y-3">
                  <Button
                    onClick={handleBuyMoreViews}
                    className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
                  >
                    Купить 5 просмотров за 2 токена
                  </Button>
                  <Button
                    onClick={() => setShowPaywall(true)}
                    variant="outline"
                    className="w-full border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                  >
                    Оформить подписку Pro
                  </Button>
                </div>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-neutral-400">Пока нет образов</div>
            </div>
          ) : (
            <>
              {!anim && (
                <Slide
                  key={`slide-${index}`}
                  title={current?.title}
                  previewSrc={currentPreview}
                  items={visibleItems}
                  remaining={remaining}
                  likes={current?.likes ?? 0}
                  onItemClick={() => current && handleItemClick(current)}
                />
              )}

              {anim && animFrom && animTo && (
                <>
                  <Slide
                    key={`from-${anim.from}`}
                    title={animFrom.title}
                    previewSrc={animFromPreview}
                    items={animFrom.items?.slice(0, 5) ?? []}
                    remaining={Math.max(0, (animFrom.items?.length ?? 0) - 5)}
                    className={cn(
                      "absolute inset-0 transition-transform duration-300 ease-out",
                      animPhase === "start" ? "translate-y-0" : "",
                      animPhase === "run" ? (anim.dir === "down" ? "-translate-y-full" : "translate-y-full") : "",
                    )}
                    likes={animFrom.likes ?? 0}
                    onItemClick={() => handleItemClick(animFrom)}
                  />
                  <Slide
                    key={`to-${anim.to}`}
                    title={animTo.title}
                    previewSrc={animToPreview}
                    items={animTo.items?.slice(0, 5) ?? []}
                    remaining={Math.max(0, (animTo.items?.length ?? 0) - 5)}
                    className={cn(
                      "absolute inset-0 transition-transform duration-300 ease-out",
                      animPhase === "start" ? (anim.dir === "down" ? "translate-y-full" : "-translate-y-full") : "",
                      animPhase === "run" ? "translate-y-0" : "",
                    )}
                    likes={animTo.likes ?? 0}
                    onItemClick={() => handleItemClick(animTo)}
                  />
                </>
              )}

              {/* Right-side controls */}
              <div className="absolute right-3 inset-y-0 flex flex-col items-center justify-center gap-3 z-[150] pointer-events-none">
                <button
                  aria-label="Предыдущий образ"
                  onClick={gotoPrev}
                  disabled={index === 0 || !!anim || filtered.length === 0}
                  className={cn(
                    "w-12 h-12 rounded-full bg-white/90 text-black flex items-center justify-center shadow-xl hover:bg-white",
                    index === 0 || !!anim || filtered.length === 0 ? "opacity-60 cursor-not-allowed" : "",
                    "pointer-events-auto",
                  )}
                >
                  <ChevronUp className="w-6 h-6" />
                </button>

                <button
                  aria-label="Следующий образ"
                  onClick={gotoNext}
                  disabled={index >= outfits.length - 1 || !!anim || filtered.length === 0}
                  className={cn(
                    "w-12 h-12 rounded-full bg-white/90 text-black flex items-center justify-center shadow-xl hover:bg-white",
                    index >= outfits.length - 1 || !!anim || filtered.length === 0
                      ? "opacity-60 cursor-not-allowed"
                      : "",
                    "pointer-events-auto",
                  )}
                >
                  <ChevronDown className="w-6 h-6" />
                </button>

                {/* Mobile: Like then Save, with larger spacing from arrows */}
                {filtered.length > 0 && (
                  <div className="mt-9 flex flex-col gap-3 pointer-events-auto sm:hidden">
                    <button
                      onClick={() => current && handleLike(current)}
                      disabled={isLiking}
                      aria-label="Лайк"
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center shadow-xl",
                        current?.isLiked
                          ? "bg-red-500 text-white"
                          : "bg-white/15 text-white hover:bg-white/25 active:bg-white/30",
                      )}
                    >
                      {isLiking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5" />}
                    </button>

                    <button
                      onClick={() => current && handleSave(current)}
                      disabled={isSaving || (!!current && savedOutfitIds.has(current.id))}
                      aria-label={
                        !!current && (savedOutfitIds.has(current.id) || current.isSaved) ? "Сохранено" : "Сохранить"
                      }
                      className={cn(
                        "w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-xl",
                        !!current && (isSaving || savedOutfitIds.has(current.id) || current.isSaved) && "opacity-80",
                      )}
                    >
                      {isSaving ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : !!current && (savedOutfitIds.has(current.id) || current.isSaved) ? (
                        <BookmarkCheck className="w-5 h-5" />
                      ) : (
                        <Bookmark className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Desktop/tablet: corners */}
              <div className="hidden sm:block">
                <div
                  className={cn("absolute bottom-3 left-3 pointer-events-auto", isBlurred ? "z-[2000]" : "z-[6000]")}
                >
                  <Button
                    onClick={() => current && handleSave(current)}
                    disabled={isSaving || (!!current && savedOutfitIds.has(current.id))}
                    className="bg-white text-black hover:bg-neutral-200 h-11 w-11 p-0 rounded-full shadow-xl"
                    aria-label={
                      !!current && (savedOutfitIds.has(current.id) || current.isSaved) ? "Сохранено" : "Сохранить"
                    }
                  >
                    {isSaving ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : !!current && (savedOutfitIds.has(current.id) || current.isSaved) ? (
                      <BookmarkCheck className="w-5 h-5" />
                    ) : (
                      <Bookmark className="w-5 h-5" />
                    )}
                  </Button>
                </div>

                <div
                  className={cn("absolute bottom-3 right-3 pointer-events-auto", isBlurred ? "z-[2000]" : "z-[6000]")}
                >
                  <Button
                    variant="secondary"
                    onClick={() => current && handleLike(current)}
                    disabled={isLiking}
                    className={cn(
                      "h-11 w-11 p-0 rounded-full shadow-xl",
                      current?.isLiked
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : "bg-white/15 text-white hover:bg-white/25",
                    )}
                    aria-label="Лайк"
                  >
                    {isLiking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Dots */}
        {filtered.length > 0 && (
          <div className="mt-3 flex justify-center gap-2 px-4">
            {filtered.map((_, i) => (
              <div
                key={i}
                className={cn("h-1.5 rounded-full transition-all", i === index ? "w-6 bg-white" : "w-2 bg-neutral-600")}
              />
            ))}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-[5000]">
        <BottomNavigation />
      </div>

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false)
          setIsBlurred(false)
        }}
      />

      <OutfitItemsSheet
        isOpen={showOutfitItems}
        onClose={() => setShowOutfitItems(false)}
        items={selectedOutfitItems}
        outfitTitle={selectedOutfitTitle}
      />
    </div>
  )
}

function Slide({
  title,
  previewSrc,
  items,
  remaining,
  likes,
  className,
  onItemClick,
}: {
  title?: string
  previewSrc: string
  items: OutfitItem[]
  remaining: number
  likes: number
  className?: string
  onItemClick?: () => void
}) {
  return (
    <div className={cn("relative h-full w-full", className)}>
      <BufferedImage
        src={previewSrc || "/placeholder.svg?height=1200&width=900&query=outfit%20preview"}
        alt={title || "Образ"}
        className="object-cover sm:object-contain bg-neutral-950"
      />

      {/* Title */}
      {!!title && (
        <div className="absolute top-3 left-3 right-24 z-20">
          <Badge variant="secondary" className="bg-white/95 text-black hover:bg-white inline-flex">
            {title}
          </Badge>
        </div>
      )}

      {/* Left rail: thumbnails */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={onItemClick}
            className="relative w-14 h-14 rounded-xl overflow-hidden ring-1 ring-white/15 bg-neutral-800 shadow-lg hover:ring-white/30 transition-all active:scale-95"
            title={item.name || "Вещь"}
          >
            {item.image_url ? (
              <BufferedItemImage src={item.image_url} alt={item.name || "Вещь"} className="object-cover" />
            ) : (
              <div className="w-full h-full bg-neutral-700" />
            )}
          </button>
        ))}

        {remaining > 0 && (
          <button
            onClick={onItemClick}
            className="w-14 h-14 rounded-xl bg-white text-black font-semibold flex items-center justify-center ring-1 ring-white/15 shadow-xl hover:bg-neutral-100 transition-all active:scale-95"
            aria-label="Показать все вещи"
            title="Показать все вещи"
          >
            <span className="text-sm">{`+${remaining}`}</span>
          </button>
        )}
      </div>
    </div>
  )
}

function normalizeOutfits(list: any[]): FeedOutfit[] {
  return (list || []).map((o: any) => ({
    id: String(o.id),
    title: o.title ?? "",
    description: o.description ?? "",
    items: Array.isArray(o.items) ? o.items : [],
    tags: Array.isArray(o.tags) ? o.tags : [],
    likes: typeof o.likes === "number" ? o.likes : 0,
    isLiked: !!o.isLiked,
    isSaved: !!o.isSaved,
    preview_image_url: typeof o?.preview_image_url === "string" ? o.preview_image_url : "",
  }))
}

const BufferedItemImage = React.memo(({ src, alt, className }: { src: string; alt: string; className?: string }) => {
  const [currentSrc, setCurrentSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const imageCache = useRef<Map<string, boolean>>(new Map())

  useEffect(() => {
    if (!src) return

    // Check if image is already cached
    if (imageCache.current.has(src)) {
      setCurrentSrc(src)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const img = new window.Image()
    img.onload = () => {
      imageCache.current.set(src, true)
      setCurrentSrc(src)
      setIsLoading(false)
    }
    img.onerror = () => {
      setIsLoading(false)
    }
    img.src = src
  }, [src])

  if (isLoading || !currentSrc) {
    return <div className={cn("bg-neutral-700 animate-pulse", className)} />
  }

  return (
    <Image
      src={currentSrc || "/placeholder.svg"}
      alt={alt}
      fill
      sizes="56px"
      className={cn("object-cover transition-opacity duration-300", className)}
    />
  )
})

BufferedItemImage.displayName = "BufferedItemImage"

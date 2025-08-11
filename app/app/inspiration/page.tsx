"use client"

import type React from "react"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Bookmark, BookmarkCheck, ChevronDown, ChevronUp, Heart, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { BottomNavigation } from "@/components/bottom-navigation"

type OutfitItem = {
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

// Prefer preview_image_url; fallback to first item's image; then placeholder
function getPreviewSrc(o?: FeedOutfit | null): string {
  const direct = (o?.preview_image_url || "").trim()
  if (direct) return direct
  const firstItem = Array.isArray(o?.items) ? (o?.items?.[0]?.image_url || "").trim() : ""
  return firstItem || "/placeholder.svg?height=1200&width=900"
}

// Windowing to avoid memory growth on long sessions
const KEEP_BEHIND = 8
const KEEP_AHEAD = 8
const MAX_KEEP = KEEP_BEHIND + KEEP_AHEAD + 1

export default function InspirationPage() {
  // Data
  const [outfits, setOutfits] = useState<FeedOutfit[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [savedOutfitIds, setSavedOutfitIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<TabKey>("popular")
  const [index, setIndex] = useState(0)

  // Hide the global top nav only on this page
  useEffect(() => {
    const selectors = [
      "header",
      "[data-top-navigation]",
      "#top-navigation",
      "nav[aria-label='Top']",
      ".top-navigation",
      "[data-role='app-header']",
    ]
    const elements = document.querySelectorAll<HTMLElement>(selectors.join(","))
    const prev: Array<{ el: HTMLElement; display: string }> = []
    elements.forEach((el) => {
      prev.push({ el, display: el.style.display })
      el.style.display = "none"
    })
    return () => prev.forEach(({ el, display }) => (el.style.display = display))
  }, [])

  // Initial load
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch("/api/outfits/inspiration")
        if (!res.ok) throw new Error("Failed to fetch outfits")
        const data: ApiResponse = await res.json()
        if (cancelled) return
        const normalized = normalizeOutfits(data.outfits)
        setOutfits(normalized)
        setNextCursor(data.nextCursor ?? null)
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

  // Reset on tab change
  useEffect(() => {
    setIndex(0)
  }, [activeTab])

  const filtered = useMemo(() => {
    if (activeTab === "popular") return outfits
    // Keep simple: liked tab shows items marked isLiked or saved
    return outfits.filter((o) => o.isLiked || savedOutfitIds.has(o.id) || o.isSaved)
  }, [activeTab, outfits, savedOutfitIds])

  // Prefetch more as we approach the end
  useEffect(() => {
    if (fetchingMore || !nextCursor) return
    if (index >= filtered.length - 2) void loadMore()
  }, [index, filtered.length, nextCursor, fetchingMore])

  async function loadMore() {
    if (!nextCursor || fetchingMore) return
    try {
      setFetchingMore(true)
      const res = await fetch(`/api/outfits/inspiration?cursor=${encodeURIComponent(nextCursor)}`)
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

  // Windowing to prevent memory growth
  useEffect(() => {
    if (outfits.length <= MAX_KEEP) return
    if (index <= KEEP_BEHIND) return
    const start = Math.max(0, index - KEEP_BEHIND)
    const end = Math.min(outfits.length, index + KEEP_AHEAD + 1)
    const drop = start
    setOutfits((prev) => prev.slice(start, end))
    setIndex((i) => i - drop)
  }, [index, outfits.length])

  // Current
  const current = filtered[index]

  // Navigation (vertical with animation)
  type Dir = "up" | "down"
  const [anim, setAnim] = useState<{ from: number; to: number; dir: Dir } | null>(null)
  const [animPhase, setAnimPhase] = useState<"idle" | "start" | "run">("idle")
  const ANIM_MS = 280

  const startTransition = useCallback(
    (dir: Dir) => {
      const to = dir === "down" ? index + 1 : index - 1
      if (to < 0 || to >= filtered.length || anim) return
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
    },
    [index, filtered.length, anim],
  )

  const gotoPrev = useCallback(() => startTransition("up"), [startTransition])
  const gotoNext = useCallback(() => startTransition("down"), [startTransition])

  // Keyboard up/down
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") gotoPrev()
      if (e.key === "ArrowDown") gotoNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [gotoPrev, gotoNext])

  // Touch vertical swipe
  const touchStartY = useRef<number | null>(null)
  const touchDeltaY = useRef(0)
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    touchDeltaY.current = 0
  }, [])
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current == null) return
    touchDeltaY.current = e.touches[0].clientY - touchStartY.current
  }, [])
  const onTouchEnd = useCallback(() => {
    const threshold = 50
    if (touchDeltaY.current > threshold) gotoPrev()
    else if (touchDeltaY.current < -threshold) gotoNext()
    touchStartY.current = null
    touchDeltaY.current = 0
  }, [gotoPrev, gotoNext])

  // Actions
  const [isSaving, setIsSaving] = useState(false)
  const [isLiking, setIsLiking] = useState(false)

  async function handleSave(outfit: FeedOutfit) {
    if (!outfit || isSaving || savedOutfitIds.has(outfit.id)) return
    setIsSaving(true)
    try {
      const res = await fetch("/api/outfits/save-to-looks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfitId: outfit.id }),
      })
      if (!res.ok) throw new Error("Failed to save outfit")
      setSavedOutfitIds((prev) => new Set([...prev, outfit.id]))
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
        body: JSON.stringify({ outfitId: outfit.id, action }),
      })
      let newLikes = outfit.likes
      let newIsLiked = !outfit.isLiked
      if (res.ok) {
        try {
          const payload = await res.json()
          if (typeof payload?.likes === "number") newLikes = payload.likes
          if (typeof payload?.isLiked === "boolean") newIsLiked = payload.isLiked
        } catch {
          newLikes = action === "like" ? (outfit.likes ?? 0) + 1 : Math.max(0, (outfit.likes ?? 0) - 1)
          newIsLiked = !outfit.isLiked
        }
      } else throw new Error("Failed to like")
      setOutfits((prev) => prev.map((o) => (o.id === outfit.id ? { ...o, isLiked: newIsLiked, likes: newLikes } : o)))
    } catch (e) {
      console.error(e)
    } finally {
      setIsLiking(false)
    }
  }

  // Helpers
  const visibleItems = current?.items?.slice(0, 5) ?? []
  const remaining = Math.max(0, (current?.items?.length ?? 0) - visibleItems.length)

  const currentPreview = getPreviewSrc(current)

  const animFrom = anim ? filtered[anim.from] : null
  const animTo = anim ? filtered[anim.to] : null
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

  if (!current) {
    return (
      <div className="fixed inset-0 bg-black text-white grid place-items-center">
        <div className="text-neutral-400">Пока нет образов</div>
      </div>
    )
  }

  return (
    // Full-viewport wrapper; ensure tabs are always above via high z-index
    <div
      className="fixed inset-0 z-[1000] bg-black text-white overflow-hidden overscroll-none"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Tabs */}
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

      {/* Stage area: one screen below tabs */}
      <main className="absolute left-0 right-0 bottom-0 top-[45px] mx-auto w-full max-w-[900px] px-0 sm:px-4 lg:px-10 pt-0 sm:pt-3">
        <section className="relative h-full w-full sm:rounded-2xl overflow-hidden bg-neutral-950 touch-pan-y">
          {/* Static (no animation) render when not animating */}
          {!anim && (
            <Slide
              key={`slide-${index}`}
              title={current.title}
              previewSrc={currentPreview}
              items={visibleItems}
              remaining={remaining}
              onOpenItems={() => {}}
            />
          )}

          {/* Animated transition layer */}
          {anim && animFrom && animTo && (
            <>
              {/* From slide */}
              <Slide
                key={`from-${anim.from}`}
                title={animFrom.title}
                previewSrc={animFromPreview}
                items={animFrom.items?.slice(0, 5) ?? []}
                remaining={Math.max(0, (animFrom.items?.length ?? 0) - 5)}
                className={cn(
                  "absolute inset-0",
                  "transition-transform duration-300 ease-out",
                  animPhase === "start" ? "translate-y-0" : "",
                  animPhase === "run" ? (anim.dir === "down" ? "-translate-y-full" : "translate-y-full") : "",
                )}
              />
              {/* To slide */}
              <Slide
                key={`to-${anim.to}`}
                title={animTo.title}
                previewSrc={animToPreview}
                items={animTo.items?.slice(0, 5) ?? []}
                remaining={Math.max(0, (animTo.items?.length ?? 0) - 5)}
                className={cn(
                  "absolute inset-0",
                  "transition-transform duration-300 ease-out",
                  animPhase === "start" ? (anim.dir === "down" ? "translate-y-full" : "-translate-y-full") : "",
                  animPhase === "run" ? "translate-y-0" : "",
                )}
              />
            </>
          )}

          {/* Right-side arrows */}
          <div className="absolute right-3 inset-y-0 flex flex-col items-center justify-center gap-3 z-[150] pointer-events-none">
            <button
              aria-label="Предыдущий образ"
              onClick={gotoPrev}
              disabled={index === 0 || !!anim}
              className={cn(
                "w-12 h-12 rounded-full bg-white/90 text-black flex items-center justify-center shadow-xl hover:bg-white",
                index === 0 || !!anim ? "opacity-60 cursor-not-allowed" : "",
                "pointer-events-auto",
              )}
            >
              <ChevronUp className="w-6 h-6" />
            </button>

            <button
              aria-label="Следующий образ"
              onClick={gotoNext}
              disabled={index >= filtered.length - 1 || !!anim}
              className={cn(
                "w-12 h-12 rounded-full bg-white/90 text-black flex items-center justify-center shadow-xl hover:bg-white",
                index >= filtered.length - 1 || !!anim ? "opacity-60 cursor-not-allowed" : "",
                "pointer-events-auto",
              )}
            >
              <ChevronDown className="w-6 h-6" />
            </button>

            {/* Mobile: icon-only Save and Like directly under arrows */}
            <div className="mt-2 flex flex-col gap-2 pointer-events-auto sm:hidden">
              <button
                onClick={() => current && handleSave(current)}
                disabled={isSaving || savedOutfitIds.has(current.id)}
                aria-label={savedOutfitIds.has(current.id) || current.isSaved ? "Сохранено" : "Сохранить"}
                className={cn(
                  "w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-xl",
                  (isSaving || savedOutfitIds.has(current.id) || current.isSaved) && "opacity-80",
                )}
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : savedOutfitIds.has(current.id) || current.isSaved ? (
                  <BookmarkCheck className="w-5 h-5" />
                ) : (
                  <Bookmark className="w-5 h-5" />
                )}
              </button>

              <button
                onClick={() => current && handleLike(current)}
                disabled={isLiking}
                aria-label="Лайк"
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center shadow-xl",
                  current.isLiked
                    ? "bg-red-500 text-white"
                    : "bg-white/15 text-white hover:bg-white/25 active:bg-white/30",
                )}
              >
                {isLiking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Desktop/tablet: icon-only buttons in corners */}
          <div className="hidden sm:block">
            <div className="absolute bottom-3 left-3 z-[2000] pointer-events-auto">
              <Button
                onClick={() => current && handleSave(current)}
                disabled={isSaving || savedOutfitIds.has(current.id)}
                className="bg-white text-black hover:bg-neutral-200 h-11 w-11 p-0 rounded-full shadow-xl"
                aria-label={savedOutfitIds.has(current.id) || current.isSaved ? "Сохранено" : "Сохранить"}
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : savedOutfitIds.has(current.id) || current.isSaved ? (
                  <BookmarkCheck className="w-5 h-5" />
                ) : (
                  <Bookmark className="w-5 h-5" />
                )}
              </Button>
            </div>

            <div className="absolute bottom-3 right-3 z-[2000] pointer-events-auto">
              <Button
                variant="secondary"
                onClick={() => current && handleLike(current)}
                disabled={isLiking}
                className={cn(
                  "h-11 w-11 p-0 rounded-full shadow-xl",
                  current.isLiked
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-white/15 text-white hover:bg-white/25",
                )}
                aria-label="Лайк"
              >
                {isLiking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </section>

        {/* Position dots */}
        <div className="mt-3 flex justify-center gap-2 px-4">
          {filtered.map((_, i) => (
            <div
              key={i}
              className={cn("h-1.5 rounded-full transition-all", i === index ? "w-6 bg-white" : "w-2 bg-neutral-600")}
            />
          ))}
        </div>
      </main>

      {/* Local bottom navigation, rendered under action buttons */}
      <div className="fixed inset-x-0 bottom-0 z-[1200]">
        <BottomNavigation />
      </div>
    </div>
  )
}

function Slide({
  title,
  previewSrc,
  items,
  remaining,
  className,
}: {
  title?: string
  previewSrc: string
  items: OutfitItem[]
  remaining: number
  className?: string
  onOpenItems?: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={cn("relative h-full w-full", className)}>
      {/* Main preview: cover on phones, contain from sm and up */}
      <Image
        src={previewSrc || "/placeholder.svg?height=1200&width=900&query=outfit%20preview"}
        alt={title || "Образ"}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 900px"
        className="object-cover sm:object-contain bg-neutral-950"
        priority={false}
      />

      {/* Title */}
      {!!title && (
        <div className="absolute top-3 left-3 right-3 z-20">
          <Badge variant="secondary" className="bg-white/95 text-black hover:bg-white inline-flex">
            {title}
          </Badge>
        </div>
      )}

      {/* Left rail: thumbnails */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
        {items.map((item) => (
          <div
            key={item.id}
            className="relative w-14 h-14 rounded-xl overflow-hidden ring-1 ring-white/15 bg-neutral-800 shadow-lg"
            title={item.name || "Вещь"}
          >
            {item.image_url ? (
              <Image
                src={item.image_url || "/placeholder.svg?height=200&width=200&query=item%20thumbnail"}
                alt={item.name || "Вещь"}
                fill
                sizes="56px"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-neutral-700" />
            )}
          </div>
        ))}

        {remaining > 0 && (
          <>
            <button
              onClick={() => setOpen(true)}
              className="w-14 h-14 rounded-xl bg-white text-black font-semibold flex items-center justify-center ring-1 ring-white/15 shadow-xl"
              aria-label="Показать все вещи"
              title="Показать все вещи"
            >
              <span className="text-sm">{`+${remaining}`}</span>
            </button>

            {/* Use shadcn Sheet to ensure it renders in a Portal above overflow-hidden */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetContent side="bottom" className="h-[70vh] bg-neutral-950 text-white">
                <SheetHeader>
                  <SheetTitle>Все вещи из образа</SheetTitle>
                </SheetHeader>
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {items.map((item) => (
                    <div key={item.id} className="space-y-2">
                      <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-neutral-800">
                        {item.image_url ? (
                          <Image
                            src={item.image_url || "/placeholder.svg?height=400&width=400&query=outfit%20item"}
                            alt={item.name || "Вещь"}
                            fill
                            sizes="200px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-neutral-700" />
                        )}
                      </div>
                      <div className="text-xs text-neutral-300 line-clamp-2">{item.name}</div>
                    </div>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </>
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

"use client"


import React, { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect, type ReactElement } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bookmark, BookmarkCheck, ChevronDown, ChevronUp, Heart, Loader2, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { BottomNavigation } from "@/components/bottom-navigation"
import { PaywallModal } from "@/components/paywall-modal"
import { OutfitItemsSheet } from "@/components/outfit-items-sheet"
import { useReconcileLimits } from "@/hooks/use-reconcile-limits";


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

const WINDOW_SIZE = 10
const WINDOW_STEP = 3
const DOWN_TRIGGER = 7   // когда локальный индекс >= 7 — сдвигаем окно вниз
const UP_TRIGGER = 2


function getPreviewSrc(o?: FeedOutfit | null): string {
  const direct = (o?.preview_image_url || "").trim()
  if (direct) return direct
  const firstItem = Array.isArray(o?.items) ? (o?.items?.[0]?.image_url || "").trim() : ""
  return firstItem || "/placeholder.svg?height=1200&width=900"
}

function getViewedOutfitsKey() {
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
  } catch (_) {}
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
  } catch (_) {}
}

// Буферизованное фото полноэкранного превью без «морганий».
const BufferedImage = React.memo(
  ({ src, alt, className }: { src: string; alt: string; className?: string }) => {
    const [visibleIndex, setVisibleIndex] = useState(0)
    const [bufferSrcs, setBufferSrcs] = useState<[string | null, string | null]>([src, null])
    const loadingRef = useRef<[boolean, boolean]>([true, true])
    const swapTimeout = useRef<number | null>(null)

    useEffect(() => {
      if (bufferSrcs[visibleIndex] === src) return
      const nextIndex = 1 - visibleIndex
      setBufferSrcs((prev) => {
        const copy = [...prev] as [string | null, string | null]
        copy[nextIndex] = src
        return copy
      })
      loadingRef.current[nextIndex] = true
    }, [src, bufferSrcs, visibleIndex])

    useEffect(() => {
      return () => {
        if (swapTimeout.current) {
          window.clearTimeout(swapTimeout.current)
          swapTimeout.current = null
        }
      }
    }, [])

    const handleComplete = useCallback(
      (index: number) => {
        loadingRef.current[index] = false
        if (index !== visibleIndex && !loadingRef.current[index]) {
          swapTimeout.current = window.setTimeout(() => {
            setVisibleIndex(index)
            setBufferSrcs((prev) => {
              const copy = [...prev] as [string | null, string | null]
              copy[1 - index] = null
              return copy
            })
          }, 80)
        }
      },
      [visibleIndex],
    )

    return (
      <>
        {bufferSrcs.map((bufferSrc, idx) => {
          if (!bufferSrc) return null
          return (
            <Image
              key={`${idx}-${bufferSrc}`}
              src={bufferSrc}
              alt={alt}
              fill
              priority={idx === visibleIndex}
              onLoadingComplete={() => handleComplete(idx)}
              loading={idx === visibleIndex ? "eager" : "lazy"}
              fetchPriority={idx === visibleIndex ? "high" : "auto"}
              className={cn(
                className,
                "transition-opacity duration-300 ease-out will-change-opacity [backface-visibility:hidden]",
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
  // Данные / состояние
  const [windowStart, setWindowStart] = useState(0) // глобальный индекс начала окна
  const adjustScrollRef = useRef(0) 
  const [outfits, setOutfits] = useState<FeedOutfit[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [savedOutfitIds, setSavedOutfitIds] = useState<Set<string>>(new Set())
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<TabKey>("popular")

  // Текущий индекс активной карточки определяется IntersectionObserver (см. ниже)
  const [index, setIndex] = useState(0)
  const [viewedOutfits, setViewedOutfits] = useState<Set<string>>(() => getViewedOutfits())

  const [dailyViewsUsed, setDailyViewsUsed] = useState(0)
  const [dailyViewsLimit] = useState(10)
  const [showPaywall, setShowPaywall] = useState(false)
  const [isBlurred, setIsBlurred] = useState(false)
  const [userCredits, setUserCredits] = useState(0)

  const [showOutfitItems, setShowOutfitItems] = useState(false)
  const [selectedOutfitItems, setSelectedOutfitItems] = useState<OutfitItem[]>([])
  const [selectedOutfitTitle, setSelectedOutfitTitle] = useState<string>("")

  // Ссылки на скролл-контейнер и карточки
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    if (activeTab === "popular") return outfits
    return outfits.filter((o) => likedIds.has(o.id))
  }, [activeTab, outfits, likedIds])

  const current = filtered[index]

  useReconcileLimits(true);

  useEffect(() => {
    saveViewedOutfits(viewedOutfits)
  }, [viewedOutfits])

  // Скрыть глобальную верхнюю навигацию на время просмотра
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

  // Проверка дневных лимитов
  useEffect(() => {
    const checkDailyLimits = async () => {
      try {
        const response = await fetch("/api/check-limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ limitType: "daily", usageType: "ideas_viewed" }),
        })
        if (response.ok) {
          const data = await response.json()
          if (!data.canUse) setIsBlurred(true)
        }
      } catch (_) {}
    }
    checkDailyLimits()
  }, [])

  // Трекинг просмотра активной карточки
  useEffect(() => {
    if (!current || viewedOutfits.has(current.id) || isBlurred) return
    const timer = setTimeout(async () => {
      try {
        const consumeRes = await fetch("/api/check-limits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ featureType: "ideas_viewed" }),
        })
        const consume = await consumeRes.json()
        if (!consumeRes.ok || !consume?.canUse) {
          setIsBlurred(true);
          return;
        }
        await fetch("/api/outfits/track-view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ outfitId: current.id }),
        })
        setViewedOutfits((prev) => new Set([...prev, current.id]))
        setDailyViewsUsed((prev) => prev + 1)
      } catch (_) {}
    }, 1000)
    return () => clearTimeout(timer)
  }, [current, viewedOutfits, isBlurred])

  // Первичная загрузка
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
        if (!cancelled) setError("Не удалось загрузить образы")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Смена вкладки -> на начало списка
  useEffect(() => {
    setIndex(0)
     setWindowStart(0)
  }, [activeTab])


  const rendered = useMemo(() => filtered.slice(windowStart, Math.min(filtered.length, windowStart + WINDOW_SIZE)),[filtered, windowStart])
  // Дозагрузка при приближении к концу
  useEffect(() => {
    if (activeTab !== "popular") return
    if (fetchingMore || !nextCursor) return
    if (index >= filtered.length - 3) void loadMore()
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
    } catch (_) {
      setNextCursor(null)
    } finally {
      setFetchingMore(false)
    }
  }

  // Управление клавиатурой
  const scrollStep = useCallback((dir: "up" | "down") => {
  const h = scrollerRef.current?.clientHeight || window.innerHeight || 0
    if (!h) return
    scrollerRef.current?.scrollBy({ top: dir === "down" ? h : -h, behavior: "smooth" })
  }, [])

  const gotoPrev = useCallback(() => scrollStep("up"), [scrollStep])
  const gotoNext = useCallback(() => scrollStep("down"), [scrollStep])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") gotoPrev()
      if (e.key === "ArrowDown") gotoNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [gotoPrev, gotoNext])

  // Определение активной карточки через IntersectionObserver (карточка считается активной при ~70% видимости)
  useEffect(() => {
    if (!scrollerRef.current || rendered.length === 0) return
    const root = scrollerRef.current
    const thresholds = [0, 0.25, 0.5, 0.7, 0.85, 1]
    const observer = new IntersectionObserver((entries) => {
      let bestIdx = index
      let bestRatio = 0
      for (const entry of entries) {
        const el = entry.target as HTMLDivElement
        const i = Number(el.dataset.index) // ГЛОБАЛЬНЫЙ индекс!
        if (entry.isIntersecting && entry.intersectionRatio >= bestRatio) {
          bestRatio = entry.intersectionRatio
          bestIdx = i
        }
      }
      if (bestRatio >= 0.7 && bestIdx !== index) setIndex(bestIdx)
    }, { root, threshold: thresholds })

    const nodes = root.querySelectorAll<HTMLDivElement>("[data-window-node='1']")
    nodes.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [rendered, windowStart, index])


  useEffect(() => {
    if (!filtered.length) return
    const localIndex = index - windowStart
    const viewH = scrollerRef.current?.clientHeight || 0

    // вниз
    if (localIndex >= DOWN_TRIGGER && windowStart + WINDOW_SIZE < filtered.length) {
      const shift = Math.min(WINDOW_STEP, filtered.length - (windowStart + WINDOW_SIZE))
      setWindowStart((ws) => ws + shift)
      adjustScrollRef.current += shift * viewH
    }

    // вверх
    if (localIndex <= UP_TRIGGER && windowStart > 0) {
      const shift = Math.min(WINDOW_STEP, windowStart)
      setWindowStart((ws) => ws - shift)
      adjustScrollRef.current -= shift * viewH
    }
  }, [index, filtered.length, windowStart])

  useLayoutEffect(() => {
    if (adjustScrollRef.current !== 0 && scrollerRef.current) {
      scrollerRef.current.scrollTop += adjustScrollRef.current
      adjustScrollRef.current = 0
    }
  }, [windowStart])

  // Прелоад ближайших изображений (текущее + окрестность)
  const preloadedImages = useRef<Set<string>>(new Set())
  const preloadImage = useCallback((src: string): Promise<void> => {
    if (!src || preloadedImages.current.has(src)) return Promise.resolve()
    return new Promise((resolve) => {
      const img = new window.Image()
      img.onload = async () => {
        try {
          // @ts-ignore
          if (typeof img.decode === "function") await img.decode()
        } catch (_) {}
        preloadedImages.current.add(src)
        resolve()
      }
      img.onerror = () => resolve()
      img.loading = "eager"
      img.src = src
    })
  }, [])

  useEffect(() => {
    if (!filtered.length) return
    const targets: string[] = []
    // Текущее превью
    const curSrc = getPreviewSrc(filtered[index])
    if (curSrc) targets.push(curSrc)
    // Следующие/предыдущие несколько карточек + миниатюры
    for (let d = 1; d <= 5; d++) {
      const ni = index + d
      const pi = index - d
      if (ni < filtered.length) {
        const next = filtered[ni]
        const s = getPreviewSrc(next)
        if (s) targets.push(s)
        next?.items?.forEach((it) => it.image_url && targets.push(it.image_url))
      }
      if (pi >= 0) {
        const prev = filtered[pi]
        const s = getPreviewSrc(prev)
        if (s) targets.push(s)
        prev?.items?.forEach((it) => it.image_url && targets.push(it.image_url))
      }
    }
    ;(async () => {
      for (const s of targets.slice(0, 12)) await preloadImage(s)
    })()
  }, [filtered, index, preloadImage])

  // Служебные обработчики
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
      }).catch(() => {})
    } catch (_) {
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
    } catch (_) {
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
          reason: "ideas_viewed",
          description: "Купить 5 дополнительных просмотров идей",
          usageType: "ideas_viewed",
        }),
      })
      if (response.ok) {
        const data = await response.json()
        setUserCredits(data.newBalance)
        setIsBlurred(false)
        setDailyViewsUsed((prev) => Math.max(0, prev - 5))
      } else {
        setShowPaywall(true)
      }
    } catch (_) {
      setShowPaywall(true)
    }
  }

  const handleItemClick = useCallback((outfit: FeedOutfit) => {
    setSelectedOutfitItems(outfit.items || [])
    setSelectedOutfitTitle(outfit.title || "")
    setShowOutfitItems(true)
  }, [])

  // Очистка кэша прелоада для контроля памяти
  useEffect(() => {
    const interval = setInterval(() => {
      if (preloadedImages.current.size > 80) preloadedImages.current.clear()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const maxStart = Math.max(0, filtered.length - WINDOW_SIZE)
    if (windowStart > maxStart) setWindowStart(maxStart)
    if (index >= filtered.length) setIndex(Math.max(0, filtered.length - 1))
  }, [filtered.length])

  // Данные для текущего экрана
  const visibleItems = current?.items?.slice(0, 5) ?? []
  const remaining = Math.max(0, (current?.items?.length ?? 0) - visibleItems.length)
  const currentPreview = getPreviewSrc(current)

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
      className="fixed inset-0 z-[1000] bg-black text-white overflow-hidden overscroll-none box-border"
      style={{
        paddingBottom: "var(--sab, env(safe-area-inset-bottom, 0px))",
        paddingTop: "var(--sat, env(safe-area-inset-top, 0px))",
      }}
    >
      {/* Верхние вкладки */}
      <div className="absolute top-0 left-0 right-0 z-[3000] bg-black/80 backdrop-blur border-b border-neutral-900">
        <div className="mx-auto w-full max-w-[900px] px-4 lg:px-10">
          <div className="flex justify-center gap-8 pt-[90px]">
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

      <main className="absolute left-0 right-0 bottom-0 top-[105px] mx-auto w-full max-w-[900px] px-0 sm:px-4 lg:px-10 pt-0 sm:pt-3">
        {/* Контейнер карточек: вертикальный скролл, снап к экрану, плавный скролл */}
        <section className="relative h-full w-full sm:rounded-2xl overflow-hidden bg-neutral-950 select-none">
          {/* Оверлей лимита */}
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

          {/* Список карточек с привязкой по экрану */}
          <div
            ref={scrollerRef}
            className={cn(
              "h-full w-full overflow-y-auto scroll-smooth snap-y snap-mandatory",
              "[-webkit-overflow-scrolling:touch]",
              "scrollbar-none", 
            )}
          >
            {rendered.length === 0 ? (
              <div className="h-full grid place-items-center">
                <div className="text-neutral-400">Пока нет образов</div>
              </div>
            ) : (
              rendered.map((o, i) => {
                const globalIndex = windowStart + i
                const isCurrent = globalIndex === index
                const items = (isCurrent ? filtered[globalIndex]?.items : o.items) ?? []
                const preview = getPreviewSrc(filtered[globalIndex] ?? o)
                const show = items.slice(0, 5)
                const rest = Math.max(0, items.length - show.length)

                return (
                  <div
                    key={o.id}
                    data-index={globalIndex}
                    data-window-node="1"
                    className="snap-start h-full w-full relative"
                  >
                    <Slide
                      title={o.title}
                      previewSrc={preview}
                      items={show}
                      remaining={rest}
                      likes={o.likes ?? 0}
                      onItemClick={() => handleItemClick(o)}
                    />
                  </div>
                )
              })
            )}

            {/* Sentinel для безопасного отступа в конце списка */}
            <div aria-hidden className="h-2" />
          </div>

          {/* Правые стрелки и экшены — поверх скролл-контейнера */}
          {filtered.length > 0 && (
            <div className="absolute right-3 inset-y-0 flex flex-col items-center justify-center gap-3 z-[150] pointer-events-none">
              <button
                aria-label="Предыдущий образ"
                onClick={gotoPrev}
                disabled={index === 0 || filtered.length === 0}
                className={cn(
                  "w-12 h-12 rounded-full bg-white/90 text-black flex items-center justify-center shadow-xl hover:bg-white",
                  index === 0 || filtered.length === 0 ? "opacity-60 cursor-not-allowed" : "",
                  "pointer-events-auto",
                )}
              >
                <ChevronUp className="w-6 h-6" />
              </button>

              <button
                aria-label="Следующий образ"
                onClick={gotoNext}
                disabled={index >= filtered.length - 1 || filtered.length === 0}
                className={cn(
                  "w-12 h-12 rounded-full bg-white/90 text-black flex items-center justify-center shadow-xl hover:bg-white",
                  index >= filtered.length - 1 || filtered.length === 0 ? "opacity-60 cursor-not-allowed" : "",
                  "pointer-events-auto",
                )}
              >
                <ChevronDown className="w-6 h-6" />
              </button>

              {/* Мобильные кнопки лайка/сохранения */}
              <div className="mt-9 flex flex-col gap-3 pointer-events-auto sm:hidden">
                <button
                  onClick={() => current && handleLike(current)}
                  disabled={isLiking}
                  aria-label="Лайк"
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center shadow-xl",
                    current?.isLiked ? "bg-red-500 text-white" : "bg-white/15 text-white hover:bg-white/25 active:bg-white/30",
                  )}
                >
                  {isLiking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5" />}
                </button>

                <button
                  onClick={() => current && handleSave(current)}
                  disabled={isSaving || (!!current && savedOutfitIds.has(current.id))}
                  aria-label={!!current && (savedOutfitIds.has(current.id) || current.isSaved) ? "Сохранено" : "Сохранить"}
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
            </div>
          )}

          {/* Desktop/tablet экшены по углам */}
          <div className="hidden sm:block">
            <div className={cn("absolute bottom-3 left-3 pointer-events-auto", isBlurred ? "z-[2000]" : "z-[6000]")}>
              <Button
                onClick={() => current && handleSave(current)}
                disabled={isSaving || (!!current && savedOutfitIds.has(current.id))}
                className="bg-white text-black hover:bg-neutral-200 h-11 w-11 p-0 rounded-full shadow-xl"
                aria-label={!!current && (savedOutfitIds.has(current.id) || current.isSaved) ? "Сохранено" : "Сохранить"}
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

            <div className={cn("absolute bottom-3 right-3 pointer-events-auto", isBlurred ? "z-[2000]" : "z-[6000]")}>
              <Button
                variant="secondary"
                onClick={() => current && handleLike(current)}
                disabled={isLiking}
                className={cn(
                  "h-11 w-11 p-0 rounded-full shadow-xl",
                  current?.isLiked ? "bg-red-500 text-white hover:bg-red-600" : "bg-white/15 text-white hover:bg-white/25",
                )}
                aria-label="Лайк"
              >
                {isLiking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </section>

        {/* Точки прогресса */}
        {filtered.length > 0 && (
          <div className="mt-3 flex justify-center gap-2 px-4">
            {filtered.map((_, i) => (
              <div key={i} className={cn("h-1.5 rounded-full transition-all", i === index ? "w-6 bg-white" : "w-2 bg-neutral-600")} />
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

// Одна карточка (вёрстка сохранена)
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
    <div className={cn("relative h-full w-full touch-pan-y", className)}>
      <BufferedImage
        src={previewSrc || "/placeholder.svg?height=1200&width=900&query=outfit%20preview"}
        alt={title || "Образ"}
        className="object-cover sm:object-contain bg-neutral-950"
      />

      {!!title && (
        <div className="absolute top-3 left-3 right-24 z-20">
          <Badge variant="secondary" className="bg-white/95 text-black hover:bg-white inline-flex">
            {title}
          </Badge>
        </div>
      )}

      {/* Левый столбец с миниатюрами (плейсхолдеры — белые до загрузки) */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={onItemClick}
            className="relative w-14 h-14 rounded-xl overflow-hidden ring-1 ring-white/15 bg-white shadow-lg hover:ring-white/30 transition-all active:scale-95"
            title={item.name || "Вещь"}
          >
            {item.image_url ? (
              <BufferedItemImage src={item.image_url} alt={item.name || "Вещь"} className="object-cover" />
            ) : (
              <div className="w-full h-full bg-white" />
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

// Буферизованные миниатюры (белый плейсхолдер до отрисовки изображения)
const BufferedItemImage = React.memo(
  ({ src, alt, className }: { src: string; alt: string; className?: string }) => {
    const [currentSrc, setCurrentSrc] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const imageCache = useRef<Map<string, boolean>>(new Map())

    useEffect(() => {
      if (!src) return
      if (imageCache.current.has(src)) {
        setCurrentSrc(src)
        setIsLoading(false)
        return
      }

      let cancelled = false
      setIsLoading(true)
      const img = new window.Image()
      img.onload = async () => {
        try {
          // @ts-ignore
          if (typeof img.decode === "function") await img.decode()
        } catch (_) {}
        if (!cancelled) {
          imageCache.current.set(src, true)
          setCurrentSrc(src)
          setIsLoading(false)
        }
      }
      img.onerror = () => {
        if (!cancelled) setIsLoading(false)
      }
      img.src = src

      return () => {
        cancelled = true
      }
    }, [src])

    if (isLoading || !currentSrc) {
      return <div className={cn("bg-white", className)} />
    }

    return (
      <Image
        src={currentSrc}
        alt={alt}
        fill
        sizes="56px"
        priority={false}
        className={cn("object-cover transition-opacity duration-300 will-change-opacity", className)}
      />
    )
  },
)
BufferedItemImage.displayName = "BufferedItemImage"

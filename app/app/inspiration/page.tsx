"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect, type ReactElement } from "react"
import Image from "next/image"
import { Bookmark, ChevronDown, ChevronUp, GalleryVerticalEnd, Heart, Loader2, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { BottomNavigation } from "@/components/bottom-navigation"
import { SubscriptionSheet } from "@/components/subscription-sheet"
import { OutfitItemsSheet } from "@/components/outfit-items-sheet"
import { useReconcileLimits } from "@/hooks/use-reconcile-limits"
import { api } from "@/lib/api-client"

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

type VibeCircle = { vibe: string; count: number; cover: string | null }

/** Кружок витрины в духе сторис: обложка — кадр образа, активный обведён акцентом. */
function VibeButton({
  label,
  cover,
  active,
  eager,
  onClick,
}: {
  label: string
  cover: string | null
  active: boolean
  eager: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="flex shrink-0 flex-col items-center gap-1.5 transition-transform duration-press active:scale-[0.96]"
    >
      <span
        className={cn(
          "block h-14 w-14 overflow-hidden rounded-full bg-canvas-sunk ring-inset transition-shadow duration-press",
          active ? "ring-2 ring-signal" : "ring-1 ring-line",
        )}
      >
        {cover ? (
          // Обложка приходит с бэкенда; alt пуст — подпись рядом дублирует смысл.
          // Первые кружки грузим сразу: они в зоне видимости, а lazy в
          // горизонтальной прокрутке откладывал их и ряд выглядел пустым.
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover"
            loading={eager ? "eager" : "lazy"}
            decoding="async"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-caption text-ink-3">
            Все
          </span>
        )}
      </span>
      <span
        className={cn(
          "max-w-[64px] truncate text-caption transition-colors duration-press",
          active ? "text-signal font-semibold" : "text-ink-3",
        )}
      >
        {label}
      </span>
    </button>
  )
}

const WINDOW_SIZE = 10
const WINDOW_STEP = 3
const DOWN_TRIGGER = 7 // когда локальный индекс >= 7 — сдвигаем окно вниз
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
const BufferedImage = React.memo(({ src, alt, className }: { src: string; alt: string; className?: string }) => {
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
            src={bufferSrc || "/placeholder.svg"}
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
})
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

  // Кружки витрины. null — «Все», обычная лента без курируемого (см.
  // _inspiration_filter в backend/app/api/outfits.py: витрина отдаётся только
  // по явно выбранному кружку, иначе она вытесняет обычные образы за LIMIT).
  const [vibes, setVibes] = useState<VibeCircle[]>([])
  const [activeVibe, setActiveVibe] = useState<string | null>(null)

  const [userGender, setUserGender] = useState<string | null>(null)
  const [viewedOutfits, setViewedOutfits] = useState<Set<string>>(() => getViewedOutfits())

  const [dailyViewsUsed, setDailyViewsUsed] = useState(0)
  const [showPaywall, setShowPaywall] = useState(false)
  const [isBlurred, setIsBlurred] = useState(false)
  const [userCredits, setUserCredits] = useState(0)

  const [showOutfitItems, setShowOutfitItems] = useState(false)
  const [selectedOutfitItems, setSelectedOutfitItems] = useState<OutfitItem[]>([])
  const [selectedOutfitTitle, setSelectedOutfitTitle] = useState<string>("")

  const [index, setIndex] = useState(0) // Declare index and setIndex variables
  const [isDesktop, setIsDesktop] = useState(false)

  // Ссылки на скролл-контейнер и карточки
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  // Верх ленты считается тем же CSS, что задаёт высоту шапки, — без замеров.
  //
  // Так вышло не от лени: сначала тут стоял ResizeObserver, и зашитый top-[135px]
  // при шапке в 57px давал зазор в 78 пикселей. Но переменная часть шапки — это
  // ровно --tg-safe-top и --tg-nav-gap, те же токены, которыми она сама себя
  // отодвигает, а остальное постоянно. Замер 2026-08-18 при --tg-safe-top = 0 и
  // --tg-nav-gap = 8px: шапка 57px, то есть фиксированная часть 49px; ряд
  // кружков добавляет ровно 92px. Значит calc даёт тот же ответ, что наблюдатель,
  // и не зависит от поддержки ResizeObserver во вьюхе Telegram.
  const HEADER_FIXED_PX = 49
  const VIBES_ROW_PX = 92
  const showVibes = activeTab === "popular" && vibes.length > 0
  const feedTop =
    `calc(var(--tg-safe-top) + var(--tg-nav-gap) + ${HEADER_FIXED_PX + (showVibes ? VIBES_ROW_PX : 0)}px)`

  const filtered = useMemo(() => {
    if (activeTab === "popular") return outfits
    return outfits.filter((o) => likedIds.has(o.id))
  }, [activeTab, outfits, likedIds])

  const current = filtered[index]

  useReconcileLimits(true)

  // Определяем десктопную платформу Telegram
  useEffect(() => {
    const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
    const platform = tg?.platform || ""
    setIsDesktop(platform === "tdesktop" || platform === "macos" || platform === "windows" || platform === "linux")
  }, [])

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
        const data = await api.post("/api/check-limits", { limitType: "daily", usageType: "ideas_viewed" })
        if (!data.canUse) setIsBlurred(true)
      } catch (_) {}
    }
    checkDailyLimits()
  }, [])

  // Трекинг просмотра активной карточки
  useEffect(() => {
    if (!current || viewedOutfits.has(current.id) || isBlurred) return
    const timer = setTimeout(async () => {
      try {
        const consume = await api.post("/api/check-limits", { featureType: "ideas_viewed" })
        if (!consume?.canUse) {
          setIsBlurred(true)
          return
        }
        await api.post("/api/outfits/track-view", { outfitId: current.id })
        setViewedOutfits((prev) => new Set([...prev, current.id]))
        setDailyViewsUsed((prev) => prev + 1)
      } catch (_) {}
    }, 1000)
    return () => clearTimeout(timer)
  }, [current, viewedOutfits, isBlurred])

  useEffect(() => {
    const loadProfile = async () => {
      try {
        console.log("[v0] Loading user profile for gender")
        const data = await api.get("/api/me/profile")
        const gender = data?.profile?.gender || ""
        console.log("[v0] User gender loaded:", gender)
        setUserGender(gender) // "" means no gender set, will load all outfits
      } catch (err) {
        console.error(err)
        setUserGender("") // fallback: load all outfits
      }
    }
    loadProfile()
  }, [])

  // Первичная загрузка
  useEffect(() => {
    if (userGender === null) {
      // Profile not loaded yet — wait
      return
    }

    console.log("[v0] Loading outfits for gender:", userGender || "(all)")
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const params = new URLSearchParams()
        if (userGender) params.set("gender", userGender)
        if (activeVibe) params.set("vibe", activeVibe)
        const [data, likedData] = await Promise.all([
          api.get(`/api/outfits/inspiration?${params.toString()}`),
          api.get("/api/user-likes").catch(() => ({ liked: [] })),
        ])
        const normalized = normalizeOutfits(data.outfits)
        if (!cancelled) {
          setOutfits(normalized)
          setNextCursor(data.nextCursor ?? null)
          setLikedIds(new Set((likedData?.liked ?? []).map(String)))
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
  }, [userGender, activeVibe])

  // Список кружков — с бэкенда, чтобы кружок не висел после удаления его образов.
  // Пол передаём: и счётчик, и обложка должны считаться по тем образам, которые
  // человек увидит, открыв кружок. Ждём загрузки профиля, иначе первый запрос
  // уйдёт без пола и покажет чужие обложки.
  useEffect(() => {
    if (userGender === null) return
    const qs = userGender ? `?gender=${encodeURIComponent(userGender)}` : ""
    api
      .get(`/api/outfits/inspiration/vibes${qs}`)
      .then((d) => setVibes(d?.vibes ?? []))
      .catch(() => setVibes([])) // витрина недоступна — просто нет кружков, лента работает
  }, [userGender])

  // Смена вкладки или кружка -> на начало списка
  useEffect(() => {
    setIndex(0)
    setWindowStart(0)
  }, [activeTab, activeVibe])

  const rendered = useMemo(
    () => filtered.slice(windowStart, Math.min(filtered.length, windowStart + WINDOW_SIZE)),
    [filtered, windowStart],
  )
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
      const params = new URLSearchParams({ cursor: nextCursor })
      if (userGender) params.set("gender", userGender)
      if (activeVibe) params.set("vibe", activeVibe)
      const data: ApiResponse = await api.get(`/api/outfits/inspiration?${params.toString()}`)
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
    const observer = new IntersectionObserver(
      (entries) => {
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
      },
      { root, threshold: thresholds },
    )

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
      await api.post("/api/outfits/save-to-looks", { outfitId: outfit.id })
      setSavedOutfitIds((prev) => new Set([...prev, outfit.id]))
      await api.post("/api/outfits/track-save", { outfitId: outfit.id }).catch(() => {})
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
      const payload = await api.post("/api/outfits/like", { outfitId: outfit.id, action })
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
      const data = await api.post("/api/spend-credits", {
        amount: 2,
        reason: "ideas_viewed",
        description: "Купить 5 дополнительных просмотров идей",
        usageType: "ideas_viewed",
      })
      setUserCredits(data.newBalance)
      setIsBlurred(false)
      setDailyViewsUsed((prev) => Math.max(0, prev - 5))
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

  // Тёмная роль тех же токенов (не отдельная палитра): полноэкранное фото
  // живёт на тёмном холсте лучше, чем на тёплой бумаге, но --canvas/--ink/--line
  // здесь — те же переменные, просто переопределены локально для ветки ленты.
  // .glass и остальные утилиты наследуют их через каскад без единой правки в globals.css.
  const darkFeedVars: React.CSSProperties = {
    ["--canvas" as any]: "0 0% 6%",
    ["--canvas-sunk" as any]: "0 0% 13%",
    ["--surface" as any]: "0 0% 6%",
    ["--ink" as any]: "0 0% 97%",
    ["--ink-2" as any]: "0 0% 72%",
    ["--ink-3" as any]: "0 0% 48%",
    ["--line" as any]: "0 0% 20%",
  }

  if (loading) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-canvas" style={darkFeedVars}>
        <div className="skeleton absolute inset-0" />
        <div className="absolute inset-x-0 bottom-24 flex justify-center px-6">
          <span className="text-caption text-ink-2">Подбираем образы</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-canvas p-6" style={darkFeedVars}>
        <div className="max-w-xs text-center">
          <p className="text-body text-ink-2 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="h-10 rounded-full border border-line px-5 text-caption font-medium text-ink transition-transform duration-press active:scale-[0.98]"
          >
            Повторить
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
    <div
      className="fixed inset-0 z-[1000] bg-canvas text-ink overflow-hidden overscroll-none box-border"
      style={{
        paddingBottom: "var(--sab, env(safe-area-inset-bottom, 0px))",
        paddingTop: isDesktop ? "0" : "var(--sat, env(safe-area-inset-top, 0px))",
        ...darkFeedVars,
      }}
    >
      {/* Верхние вкладки — стеклянный хром (LIQUID_GLASS.md: закреплённая шапка).
          Переключатель стоит на линии пилюли остальных экранов: эта страница
          прячет глобальную навигацию (см. эффект выше), поэтому место свободно, а
          --tg-safe-top + --tg-nav-gap — те же токены, что у пилюли в
          components/top-navigation.tsx. Так он попадает между нативными
          элементами Telegram, а не под них. */}
      <div className="glass glass-flush absolute top-0 left-0 right-0 z-[3000] border-b border-line">
        <div className="mx-auto w-full max-w-[900px] px-4 lg:px-10">
          <div
            className="flex justify-center pb-2"
            style={{ paddingTop: "calc(var(--tg-safe-top) + var(--tg-nav-gap))" }}
          >
            {/* Сегментированный переключатель: подписи заменены иконками, чтобы
                занять одну строку высоты пилюли и освободить место под кружки. */}
            <div className="glass flex items-center gap-1 rounded-full p-1">
              {(
                [
                  { key: "popular", Icon: GalleryVerticalEnd, label: "Лента образов" },
                  { key: "liked", Icon: Heart, label: "Понравившиеся" },
                ] as const
              ).map(({ key, Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  aria-label={label}
                  aria-pressed={activeTab === key}
                  title={label}
                  className={cn(
                    "flex h-8 w-11 items-center justify-center rounded-full transition-colors duration-press active:scale-[0.96]",
                    activeTab === key ? "bg-signal/15 text-signal" : "text-ink-3",
                  )}
                >
                  <Icon className="h-4 w-4" fill={key === "liked" && activeTab === key ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
          </div>

          {/* Кружки витрины — только на «Популярных»: во вкладке лайков лента
              фильтруется по likedIds локально, и кружок бы с ней спорил. */}
          {showVibes && (
            <div
              className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" }}
            >
              <VibeButton
                label="Все"
                cover={null}
                active={activeVibe === null}
                eager
                onClick={() => setActiveVibe(null)}
              />
              {vibes.map((v, i) => (
                <VibeButton
                  key={v.vibe}
                  label={v.vibe}
                  cover={v.cover}
                  active={activeVibe === v.vibe}
                  eager={i < 5}
                  onClick={() => setActiveVibe(v.vibe === activeVibe ? null : v.vibe)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Верх ленты — ровно под шапкой: тот же calc, что задаёт её высоту. */}
      <main
        className="absolute left-0 right-0 bottom-0 mx-auto w-full max-w-[900px] px-0 sm:px-4 lg:px-10 pt-0 sm:pt-3"
        style={{ top: feedTop }}
      >
        {/* Контейнер карточек: вертикальный скролл, снап к экрану, плавный скролл */}
        <section className="relative h-full w-full sm:rounded-2xl overflow-hidden bg-canvas select-none">
          {/* Оверлей лимита */}
          {isBlurred && (
            <div className="absolute inset-0 z-[4000] flex items-center justify-center bg-canvas/85 backdrop-blur-md">
              <div className="mx-4 max-w-sm rounded-[18px] bg-canvas-sunk p-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-signal/15">
                  <Zap className="h-6 w-6 text-signal" />
                </div>
                <h3 className="text-h2 text-ink mb-2">Дневной лимит исчерпан</h3>
                <p className="text-body text-ink-2 mb-5">
                  Вы просмотрели {dailyViewsUsed} образов сегодня. Купите дополнительные просмотры или оформите
                  подписку Pro.
                </p>
                <div className="space-y-2.5">
                  <button
                    onClick={handleBuyMoreViews}
                    className="h-11 w-full rounded-full bg-signal text-body font-semibold text-signal-ink transition-transform duration-press active:scale-[0.98]"
                  >
                    Купить 5 просмотров за 2 токена
                  </button>
                  <button
                    onClick={() => setShowPaywall(true)}
                    className="h-11 w-full rounded-full border border-line text-body font-medium text-ink transition-transform duration-press active:scale-[0.98]"
                  >
                    Оформить подписку Pro
                  </button>
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
              <div className="h-full grid place-items-center px-6">
                <p className="text-body text-ink-2">Пока нет образов</p>
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
                    className="snap-start h-full w-full relative animate-fade-up"
                    style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
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
                  "glass w-12 h-12 rounded-full text-ink flex items-center justify-center",
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
                  "glass w-12 h-12 rounded-full text-ink flex items-center justify-center",
                  index >= filtered.length - 1 || filtered.length === 0 ? "opacity-60 cursor-not-allowed" : "",
                  "pointer-events-auto",
                )}
              >
                <ChevronDown className="w-6 h-6" />
              </button>

              {/* Мобильные кнопки лайка/сохранения — стеклянные, состояние «активно» отдаёт
                  иконке единственный акцент (--signal), как «кнопка Save» из BAR.md */}
              <div className="mt-9 flex flex-col gap-3 pointer-events-auto sm:hidden">
                <button
                  onClick={() => current && handleLike(current)}
                  disabled={isLiking}
                  aria-label={current?.isLiked ? "Убрать лайк" : "Лайк"}
                  aria-pressed={!!current?.isLiked}
                  className="glass w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-press active:scale-95"
                >
                  {isLiking ? (
                    <Loader2 className="w-5 h-5 animate-spin text-ink" />
                  ) : (
                    <Heart
                      className={cn("w-5 h-5", current?.isLiked ? "text-signal" : "text-ink")}
                      fill={current?.isLiked ? "currentColor" : "none"}
                    />
                  )}
                </button>

                <button
                  onClick={() => current && handleSave(current)}
                  disabled={isSaving || (!!current && savedOutfitIds.has(current.id))}
                  aria-label={
                    !!current && (savedOutfitIds.has(current.id) || current.isSaved) ? "Сохранено" : "Сохранить"
                  }
                  aria-pressed={!!current && (savedOutfitIds.has(current.id) || current.isSaved)}
                  className="glass w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-press active:scale-95 disabled:opacity-100"
                >
                  {isSaving ? (
                    <Loader2 className="w-5 h-5 animate-spin text-ink" />
                  ) : (
                    <Bookmark
                      className={cn(
                        "w-5 h-5",
                        !!current && (savedOutfitIds.has(current.id) || current.isSaved) ? "text-signal" : "text-ink",
                      )}
                      fill={!!current && (savedOutfitIds.has(current.id) || current.isSaved) ? "currentColor" : "none"}
                    />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Desktop/tablet экшены по углам */}
          <div className="hidden sm:block">
            <div className={cn("absolute bottom-3 left-3 pointer-events-auto", isBlurred ? "z-[2000]" : "z-[6000]")}>
              <button
                onClick={() => current && handleSave(current)}
                disabled={isSaving || (!!current && savedOutfitIds.has(current.id))}
                className="glass h-11 w-11 rounded-full flex items-center justify-center transition-transform duration-press active:scale-95 disabled:opacity-100"
                aria-label={
                  !!current && (savedOutfitIds.has(current.id) || current.isSaved) ? "Сохранено" : "Сохранить"
                }
                aria-pressed={!!current && (savedOutfitIds.has(current.id) || current.isSaved)}
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin text-ink" />
                ) : (
                  <Bookmark
                    className={cn(
                      "w-5 h-5",
                      !!current && (savedOutfitIds.has(current.id) || current.isSaved) ? "text-signal" : "text-ink",
                    )}
                    fill={!!current && (savedOutfitIds.has(current.id) || current.isSaved) ? "currentColor" : "none"}
                  />
                )}
              </button>
            </div>

            <div className={cn("absolute bottom-3 right-3 pointer-events-auto", isBlurred ? "z-[2000]" : "z-[6000]")}>
              <button
                onClick={() => current && handleLike(current)}
                disabled={isLiking}
                className="glass h-11 w-11 rounded-full flex items-center justify-center transition-transform duration-press active:scale-95"
                aria-label={current?.isLiked ? "Убрать лайк" : "Лайк"}
                aria-pressed={!!current?.isLiked}
              >
                {isLiking ? (
                  <Loader2 className="w-5 h-5 animate-spin text-ink" />
                ) : (
                  <Heart
                    className={cn("w-5 h-5", current?.isLiked ? "text-signal" : "text-ink")}
                    fill={current?.isLiked ? "currentColor" : "none"}
                  />
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Точки прогресса */}
        {filtered.length > 0 && (
          <div className="mt-3 flex justify-center gap-1.5 px-4">
            {filtered.map((_, i) => (
              <div
                key={i}
                className={cn("h-1.5 w-1.5 rounded-full transition-colors duration-press", i === index ? "bg-ink" : "bg-ink-3/50")}
              />
            ))}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-[5000]">
        <BottomNavigation />
      </div>

      </div>

      {/* Шторки вынесены ЗА тёмный контейнер намеренно. Внутри него --ink
          переопределён в почти белый, и любая шторка наследовала это через
          каскад: у кнопки подписки bg-ink становился белым фоном, а
          text-signal-ink оставался белым текстом — надпись пропадала. Здесь они
          получают обычные светлые токены приложения. */}
      <SubscriptionSheet
        isOpen={showPaywall}
        source="limit:ideas_viewed"
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
    </>
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
        className="object-cover sm:object-contain bg-canvas"
      />

      {!!title && (
        <div className="absolute top-3 left-3 right-24 z-20">
          <span className="glass inline-flex max-w-full truncate rounded-full px-3 py-1.5 text-caption font-medium text-ink">
            {title}
          </span>
        </div>
      )}

      {/* Левый столбец с миниатюрами (плейсхолдеры — белые до загрузки); лесенкой fade-up по индексу */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 z-20">
        {items.map((item, i) => (
          <button
            key={item.id}
            onClick={onItemClick}
            className="relative w-14 h-14 rounded-xl overflow-hidden ring-1 ring-line/70 bg-white transition-transform duration-press active:scale-95 animate-fade-up"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
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
            className="w-14 h-14 rounded-xl bg-canvas-sunk text-ink font-semibold flex items-center justify-center ring-1 ring-line/70 transition-transform duration-press active:scale-95"
            aria-label="Показать все вещи"
            title="Показать все вещи"
          >
            <span className="text-caption">{`+${remaining}`}</span>
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
const BufferedItemImage = React.memo(({ src, alt, className }: { src: string; alt: string; className?: string }) => {
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
      src={currentSrc || "/placeholder.svg"}
      alt={alt}
      fill
      sizes="56px"
      priority={false}
      className={cn("object-cover transition-opacity duration-300 will-change-opacity", className)}
    />
  )
})
BufferedItemImage.displayName = "BufferedItemImage"

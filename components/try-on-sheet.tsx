"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import { Sparkles, Share2, Bookmark, BookmarkCheck, AlertCircle, ChevronDown } from "lucide-react"
import { toast } from "sonner"

import { CommonSheet } from "@/components/common-sheet"
import { SubscriptionSheet } from "@/components/subscription-sheet"
import FallingObjectsGame from "@/components/falling-objects-game"
import QuoteCard from "@/components/quote-card"
import { useTryOn } from "@/contexts/try-on-context"
import { api } from "@/lib/api-client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const QUOTES = [
  { text: "Мода проходит, стиль остаётся", author: "Коко Шанель" },
  { text: "Мода проходит, стиль вечен", author: "Ив Сен-Лоран" },
  { text: "Элегантность — это не быть замеченным, а быть запомненным", author: "Джорджио Армани" },
  { text: "То, что вы носите — это то, как вы представляете себя миру", author: "Миучча Прада" },
  { text: "Стиль — очень личное. Он не связан с модой", author: "Ральф Лорен" },
  { text: "Хорошо одеваться — это форма хороших манер", author: "Том Форд" },
  { text: "Стиль — это способ сказать, кто вы, не произнося ни слова", author: "Рейчел Зои" },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const GradientButton = ({
  onClick,
  disabled,
  children,
  className = "",
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full h-12 rounded-2xl text-white font-semibold text-sm transition-opacity disabled:opacity-60 ${className}`}
    style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
  >
    {children}
  </button>
)

const OutlineButton = ({
  onClick,
  disabled,
  children,
  className = "",
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full h-12 rounded-2xl font-semibold text-sm border border-[#292929]/20 text-[#292929] bg-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2 ${className}`}
  >
    {children}
  </button>
)

/** Item card used in confirming state — shows image + name */
const ItemCard = ({ item }: { item: any }) => {
  const imageUrl = item?.image_url || item?.img_url || item?.finalImageUrl || null
  const name = item?.item_name || item?.name || ""

  return (
    <div className="flex-shrink-0 w-[72px] flex flex-col items-center gap-1.5">
      <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center">
        {imageUrl ? (
          <Image src={imageUrl} alt={name || "item"} width={72} height={72} className="object-cover w-full h-full" />
        ) : (
          <span className="text-2xl">👕</span>
        )}
      </div>
      {name && (
        <p className="text-[10px] text-[#101010]/50 text-center leading-tight line-clamp-2 w-full">
          {name}
        </p>
      )}
    </div>
  )
}

/** Small item circle used in completed state */
const ItemCircle = ({ item }: { item: any }) => {
  const imageUrl = item?.image_url || item?.img_url || item?.finalImageUrl || null

  return (
    <div className="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
      {imageUrl ? (
        <Image src={imageUrl} alt={item?.item_name || item?.name || "item"} width={48} height={48} className="object-cover w-full h-full" />
      ) : (
        <span className="text-lg">👕</span>
      )}
    </div>
  )
}

/** Gradient progress bar + label */
const ProgressBlock = ({ progress, label }: { progress: number; label: string }) => (
  <div className="w-full max-w-sm mx-auto mt-4">
    <div className="relative h-2 w-full bg-gray-200 rounded-full overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full transition-[width] duration-300"
        style={{
          width: `${progress}%`,
          background: "linear-gradient(to right, #3b82f6, #a855f7, #ec4899)",
        }}
      />
    </div>
    <div className="flex justify-between text-xs mt-2 text-neutral-400">
      <span>{label}</span>
      <span>{Math.round(progress)}%</span>
    </div>
  </div>
)

// ---------------------------------------------------------------------------
// Profile completion form (shown before try-on if data is missing)
// ---------------------------------------------------------------------------

const CLOTHING_SIZES = [
  "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL",
  "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60",
]

interface ProfileFormData {
  height: string
  weight: string
  top_size: string
  bottom_size: string
}

interface ProfileFormProps {
  initial: ProfileFormData
  onSave: (data: ProfileFormData) => Promise<void>
  isSaving: boolean
}

const ProfileForm = ({ initial, onSave, isSaving }: ProfileFormProps) => {
  const [form, setForm] = useState<ProfileFormData>(initial)

  const handleNumber = (field: keyof ProfileFormData, value: string) =>
    setForm((p) => ({ ...p, [field]: value.replace(/[^0-9]/g, "") }))

  const isValid = form.height && form.weight && form.top_size && form.bottom_size

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="text-center mb-1">
        <p className="text-sm font-semibold text-[#101010]">Заполните данные для примерки</p>
        <p className="text-xs text-[#101010]/60 mt-1">
          Рост, вес и размеры нужны для точной виртуальной примерки
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Height */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#101010]/70">Рост (см)</label>
          <input
            type="text"
            inputMode="numeric"
            value={form.height}
            onChange={(e) => handleNumber("height", e.target.value)}
            placeholder="170"
            className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-[#101010] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>

        {/* Weight */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#101010]/70">Вес (кг)</label>
          <input
            type="text"
            inputMode="numeric"
            value={form.weight}
            onChange={(e) => handleNumber("weight", e.target.value)}
            placeholder="70"
            className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm text-[#101010] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>

        {/* Top size */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#101010]/70">Размер верха</label>
          <Select value={form.top_size} onValueChange={(v) => setForm((p) => ({ ...p, top_size: v }))}>
            <SelectTrigger className="h-10 rounded-xl border-gray-200 bg-white text-sm">
              <SelectValue placeholder="Размер" />
            </SelectTrigger>
            <SelectContent>
              {CLOTHING_SIZES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Bottom size */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#101010]/70">Размер низа</label>
          <Select value={form.bottom_size} onValueChange={(v) => setForm((p) => ({ ...p, bottom_size: v }))}>
            <SelectTrigger className="h-10 rounded-xl border-gray-200 bg-white text-sm">
              <SelectValue placeholder="Размер" />
            </SelectTrigger>
            <SelectContent>
              {CLOTHING_SIZES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <GradientButton onClick={() => onSave(form)} disabled={!isValid || isSaving} className="mt-2">
        <span className="flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4" />
          {isSaving ? "Сохраняем…" : "Сохранить и начать примерку"}
        </span>
      </GradientButton>
    </div>
  )
}

type ViewMode = "choose" | "quotes" | "game" | null

interface LoadingExperienceProps {
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  quotes: typeof QUOTES
  quoteIndex: number
  progress: number
}

const LoadingExperience = ({ viewMode, setViewMode, quotes, quoteIndex, progress }: LoadingExperienceProps) => {
  const GAME_HEIGHT = 300

  const GameShell = ({ children }: { children: React.ReactNode }) => (
    <div
      className="w-full rounded-xl border border-purple-200/80 bg-gradient-to-b from-purple-100/80 to-pink-100/50 flex items-center justify-center overflow-hidden"
      style={{ height: `${GAME_HEIGHT}px` }}
    >
      {children}
    </div>
  )

  if (viewMode === null || viewMode === "choose") {
    return (
      <>
        <GameShell>
          <div className="w-full px-4 max-w-xs mx-auto text-center select-none" style={{ touchAction: "manipulation" }}>
            <p className="text-sm text-neutral-600 mb-4">Пока ИИ работает, выберите, что показать:</p>
            <div className="grid grid-cols-1 gap-3">
              <button
                className="h-11 rounded-2xl bg-[#292929] text-white font-medium px-4"
                onPointerUp={() => setViewMode("game")}
              >
                Сыграть в игру
              </button>
              <button
                className="h-11 rounded-2xl border border-gray-300 text-[#101010] font-medium px-4 bg-white"
                onPointerUp={() => setViewMode("quotes")}
              >
                Посмотреть цитаты
              </button>
            </div>
          </div>
        </GameShell>
        <ProgressBlock progress={progress} label="Создаём образ…" />
      </>
    )
  }

  if (viewMode === "quotes") {
    return (
      <>
        <GameShell>
          <div className="text-center max-w-xs w-full px-4">
            <h2 className="text-base font-semibold mb-3 text-[#292929]">ИИ создаёт примерку</h2>
            <QuoteCard className="bg-white shadow-sm">
              <p className="italic text-[#292929]">"{quotes[quoteIndex].text}"</p>
              <p className="mt-2 font-medium text-[#292929]/70">— {quotes[quoteIndex].author}</p>
            </QuoteCard>
            <div className="mt-4">
              <button
                className="border border-gray-300 rounded-2xl px-4 py-2 text-sm text-[#101010] bg-white"
                onPointerUp={() => setViewMode("game")}
              >
                Переключиться на игру
              </button>
            </div>
          </div>
        </GameShell>
        <ProgressBlock progress={progress} label="Создаём образ…" />
      </>
    )
  }

  // game
  return (
    <>
      <div className="w-full rounded-xl overflow-hidden" style={{ height: `${GAME_HEIGHT}px` }}>
        <FallingObjectsGame
          analysisDone={progress >= 100}
          onRequestFinish={() => setViewMode(null)}
          onRequestReturnToPicker={() => setViewMode("choose")}
        />
      </div>
      <ProgressBlock progress={progress} label="Создаём образ…" />
    </>
  )
}

// ---------------------------------------------------------------------------
// Share helper
// ---------------------------------------------------------------------------

async function shareResult(resultUrl: string, title: string) {
  try {
    const response = await fetch(resultUrl)
    const blob = await response.blob()
    const file = new File([blob], "try-on.jpg", { type: blob.type })

    if (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({ files: [file], title })
      return
    }

    if (typeof navigator.share === "function") {
      await navigator.share({ url: resultUrl, title })
      return
    }

    // Fallback: download
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "try-on.jpg"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      throw err
    }
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * TryOnSheet — bottom sheet for virtual try-on.
 *
 * Usage: simply render this component anywhere in the tree where
 * TryOnProvider is a parent. It reads/writes state through useTryOn().
 *
 * <TryOnSheet />
 */
export function TryOnSheet() {
  const { session, sheetOpen, setSheetOpen, confirmTryOn, minimizeSession, saveTryOn, clearSession } = useTryOn()

  const [showPaywall, setShowPaywall] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

  // Profile completion state
  const [profileChecked, setProfileChecked] = useState(false)
  const [profileIncomplete, setProfileIncomplete] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileInitial, setProfileInitial] = useState<ProfileFormData>({
    height: "", weight: "", top_size: "", bottom_size: "",
  })

  // Loading experience state
  const [viewMode, setViewMode] = useState<ViewMode>(null)
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [shuffledQuotes, setShuffledQuotes] = useState(() => shuffleArray(QUOTES))
  const quoteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset loading experience state when sheet opens/closes
  useEffect(() => {
    if (sheetOpen && session?.status === "loading") {
      const newOrder = shuffleArray(QUOTES)
      setShuffledQuotes(newOrder)
      setQuoteIndex(0)
      setViewMode("choose")
      quoteTimerRef.current = setInterval(() => {
        setQuoteIndex((prev) => (prev + 1) % newOrder.length)
      }, 10000)
    } else {
      if (quoteTimerRef.current) {
        clearInterval(quoteTimerRef.current)
        quoteTimerRef.current = null
      }
    }

    return () => {
      if (quoteTimerRef.current) {
        clearInterval(quoteTimerRef.current)
        quoteTimerRef.current = null
      }
    }
  }, [sheetOpen, session?.status])

  // Reset action states when session changes
  useEffect(() => {
    setIsSaving(false)
    setIsSharing(false)
    setIsConfirming(false)
    setProfileChecked(false)
    setProfileIncomplete(false)
  }, [session?.id])

  // Check profile completeness when sheet opens in confirming state
  useEffect(() => {
    if (!sheetOpen || session?.status !== "confirming" || profileChecked) return

    let cancelled = false
    setProfileLoading(true)

    api.get("/api/me/profile-session").then((data) => {
      if (cancelled) return
      const p = data?.profile
      const hasHeight = !!p?.height
      const hasWeight = !!p?.weight
      const hasTop = !!p?.top_size
      const hasBottom = !!p?.bottom_size

      if (!hasHeight || !hasWeight || !hasTop || !hasBottom) {
        setProfileInitial({
          height: p?.height?.toString() || "",
          weight: p?.weight?.toString() || "",
          top_size: p?.top_size || "",
          bottom_size: p?.bottom_size || "",
        })
        setProfileIncomplete(true)
      }
      setProfileChecked(true)
    }).catch(() => {
      if (!cancelled) setProfileChecked(true) // proceed even on error
    }).finally(() => {
      if (!cancelled) setProfileLoading(false)
    })

    return () => { cancelled = true }
  }, [sheetOpen, session?.status, profileChecked])

  const handleClose = useCallback(() => {
    setSheetOpen(false)
  }, [setSheetOpen])

  const handleMinimize = useCallback(() => {
    minimizeSession()
  }, [minimizeSession])

  const confirmingRef = useRef(false)
  const handleConfirm = useCallback(async () => {
    if (confirmingRef.current) return
    confirmingRef.current = true
    setIsConfirming(true)
    try {
      const result = await confirmTryOn()
      if (result?.paywall) {
        setSheetOpen(false)
        setShowPaywall(true)
      }
    } catch {
      toast.error("Не удалось запустить примерку")
    } finally {
      setIsConfirming(false)
      confirmingRef.current = false
    }
  }, [confirmTryOn, setSheetOpen])

  const handleSave = useCallback(async () => {
    if (isSaving || session?.saved) return
    setIsSaving(true)
    try {
      await saveTryOn()
      toast.success("Примерка сохранена")
    } catch {
      toast.error("Не удалось сохранить примерку")
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, session?.saved, saveTryOn])

  const handleShare = useCallback(async () => {
    if (!session?.resultUrl || isSharing) return
    setIsSharing(true)
    try {
      await shareResult(session.resultUrl, session.suggestion?.title ?? "Моя примерка")
    } catch {
      toast.error("Не удалось поделиться")
    } finally {
      setIsSharing(false)
    }
  }, [session?.resultUrl, session?.suggestion?.title, isSharing])

  const handleProfileSave = useCallback(async (data: ProfileFormData) => {
    setProfileSaving(true)
    try {
      await api.post("/api/me/profile-session", {
        height: data.height || null,
        weight: data.weight || null,
        top_size: data.top_size || null,
        bottom_size: data.bottom_size || null,
      })
      setProfileIncomplete(false)
      toast.success("Данные сохранены")
    } catch {
      toast.error("Не удалось сохранить данные")
    } finally {
      setProfileSaving(false)
    }
  }, [])

  // Shared items strip used in confirming + completed states
  const items = session?.items ?? []

  // Determine whether to show minimize button (only during loading)
  const isLoading = session?.status === "loading"

  return (
    <>
      <CommonSheet
        isOpen={sheetOpen}
        onClose={handleClose}
        onMinimize={isLoading ? handleMinimize : undefined}
        swipeAction={isLoading ? "minimize" : "close"}
        title={session?.status === "confirming" ? "Виртуальная примерка" : undefined}
      >
        {/* ---- CONFIRMING (with profile check) ---- */}
        {(!session || session.status === "confirming") && (
          <>
            {/* Profile loading */}
            {profileLoading && (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[#101010]/60">Проверяем профиль…</p>
              </div>
            )}

            {/* Profile incomplete — show form */}
            {!profileLoading && profileIncomplete && (
              <ProfileForm
                initial={profileInitial}
                onSave={handleProfileSave}
                isSaving={profileSaving}
              />
            )}

            {/* Profile OK — show normal confirming */}
            {!profileLoading && !profileIncomplete && (
              <div className="flex flex-col gap-5 pb-6">
                {/* Description */}
                <p className="text-sm text-[#101010]/70 leading-relaxed">
                  Примерим этот образ на вас? AI создаст фото с вашим аватаром.
                </p>

                {/* Requirements */}
                <ul className="space-y-2">
                  {[
                    "Убедитесь, что загружен аватар",
                    "Примерка займёт 30–60 секунд",
                  ].map((req) => (
                    <li key={req} className="flex items-start gap-2 text-sm text-[#101010]/80">
                      <span
                        className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      {req}
                    </li>
                  ))}
                </ul>

                {/* Outfit title + item cards */}
                {session?.suggestion?.title && (
                  <p className="text-sm font-semibold text-[#101010]">
                    {session.suggestion.title}
                  </p>
                )}
                {items.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-1 px-1">
                    {items.slice(0, 6).map((item: any, i: number) => (
                      <ItemCard key={i} item={item} />
                    ))}
                  </div>
                )}

                {/* CTA */}
                <GradientButton onClick={handleConfirm} disabled={isConfirming} className="mt-2">
                  <span className="flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    {isConfirming ? "Запускаем…" : "Начать примерку"}
                  </span>
                </GradientButton>
              </div>
            )}
          </>
        )}

        {/* ---- LOADING ---- */}
        {session?.status === "loading" && (
          <div className="flex flex-col gap-4 pb-6">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-base font-semibold"
                style={{
                  background: "linear-gradient(to right, #EC9DE2, #89AEFF)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Создаём примерку…
              </span>
            </div>

            <LoadingExperience
              viewMode={viewMode}
              setViewMode={setViewMode}
              quotes={shuffledQuotes}
              quoteIndex={quoteIndex}
              progress={session.progress}
            />

            <p className="text-xs text-center text-neutral-400 mt-1">
              Можно свернуть и подождать в фоне
            </p>

            <button
              onClick={handleMinimize}
              className="w-full h-10 rounded-2xl border border-[#292929]/20 text-[#292929] text-sm font-medium flex items-center justify-center gap-1.5 bg-white"
            >
              <ChevronDown className="w-4 h-4" />
              Свернуть
            </button>
          </div>
        )}

        {/* ---- COMPLETED ---- */}
        {session?.status === "completed" && (
          <div className="flex flex-col gap-5 pb-6">
            {/* Result image */}
            {session.resultUrl && (
              <div
                className="relative w-full overflow-hidden rounded-2xl"
                style={{
                  aspectRatio: "3/4",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                }}
              >
                <Image
                  src={session.resultUrl}
                  alt="Результат примерки"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 480px"
                  priority
                />
              </div>
            )}

            {/* Outfit title */}
            {session.suggestion?.title && (
              <p className="text-base font-semibold text-[#101010] truncate">
                {session.suggestion.title}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              {/* Save button */}
              {session.saved ? (
                <button
                  disabled
                  className="w-full h-12 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 bg-green-50 text-green-600 border border-green-200"
                >
                  <BookmarkCheck className="w-4 h-4" />
                  Сохранено
                </button>
              ) : (
                <GradientButton onClick={handleSave} disabled={isSaving}>
                  <span className="flex items-center justify-center gap-2">
                    <Bookmark className="w-4 h-4" />
                    {isSaving ? "Сохраняем…" : "Сохранить примерку"}
                  </span>
                </GradientButton>
              )}

              {/* Share button */}
              <OutlineButton onClick={handleShare} disabled={isSharing}>
                <Share2 className="w-4 h-4" />
                {isSharing ? "Подготовка…" : "Поделиться"}
              </OutlineButton>
            </div>

            {/* Items strip */}
            {items.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-[#101010]/50">Образ</p>
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                  {items.slice(0, 6).map((item: any, i: number) => (
                    <ItemCircle key={i} item={item} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- ERROR ---- */}
        {session?.status === "error" && (
          <div className="flex flex-col items-center gap-5 py-6 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-[#101010]">Что-то пошло не так</p>
              <p className="text-sm text-[#101010]/60">
                {session.error ?? "Не удалось создать примерку. Попробуйте ещё раз."}
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <GradientButton
                onClick={() => {
                  clearSession()
                }}
              >
                Попробовать снова
              </GradientButton>
              <button
                onClick={handleClose}
                className="text-sm text-[#101010]/60 underline underline-offset-2"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
      </CommonSheet>

      {/* Paywall */}
      <SubscriptionSheet
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false)
          toast.success("Лимиты обновлены! Попробуйте ещё раз.")
        }}
        variant="limitReached"
      />
    </>
  )
}

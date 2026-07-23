"use client"

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react"
import Image from "next/image"
import { Sparkles, Download, Bookmark, BookmarkCheck, ChevronDown, Camera, Check, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { CommonSheet } from "@/components/common-sheet"
import { SaveImageSheet } from "@/components/save-image-sheet"
import { renderSinglePhoto } from "@/lib/save-image"
import { SubscriptionSheet } from "@/components/subscription-sheet"
import FallingObjectsGame from "@/components/falling-objects-game"
import { useTryOn } from "@/contexts/try-on-context"
import { api } from "@/lib/api-client"
import { normalizeImageFile } from "@/lib/image-normalize"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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

/**
 * Big item card used in the confirming state — rendered inside a 2-col grid.
 * Each card exposes a ref so the "gather" animation can compute per-item
 * translate offsets toward the avatar center.
 */
const ItemCard = ({
  item,
  gatherStyle,
}: {
  item: any
  gatherStyle?: React.CSSProperties
}) => {
  const imageUrl = item?.image_url || item?.img_url || item?.finalImageUrl || null
  const name = item?.item_name || item?.name || ""
  const color = item?.color as string | undefined

  return (
    <div
      className="flex flex-col gap-2 rounded-2xl bg-white border border-gray-100 p-2 shadow-[0_1px_4px_rgba(0,0,0,0.03)] will-change-transform"
      style={gatherStyle}
    >
      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        {imageUrl ? (
          <Image src={imageUrl} alt={name || "item"} fill sizes="(max-width: 480px) 45vw, 200px" className="object-cover" />
        ) : (
          <span className="text-4xl">👕</span>
        )}
      </div>
      {(name || color) && (
        <div className="flex flex-col gap-0.5 px-1 pb-1">
          {name && (
            <p className="text-[11px] font-medium text-[#101010] leading-tight line-clamp-2">
              {name}
            </p>
          )}
          {color && (
            <p className="text-[10px] text-[#101010]/50 leading-tight capitalize">
              {color}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * GatherStage — short animated transition played when the user taps
 * "Начать примерку". Items fly from their grid positions into the avatar
 * centered below, scale down, and fade out — creating a "собираем образ"
 * feeling before the waiting game appears.
 *
 * Items are rendered as absolutely-positioned clones over a ghost grid
 * (the ghost grid keeps layout height so the sheet doesn't jump). Each
 * clone has a staggered CSS transition toward the avatar center.
 */
const GatherStage = ({
  items,
  avatarUrl,
  onComplete,
}: {
  items: any[]
  avatarUrl: string | null
  onComplete: () => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [deltas, setDeltas] = useState<{ dx: number; dy: number }[]>([])
  const [started, setStarted] = useState(false)

  // Compute per-item translation vectors from their grid cell to the avatar.
  useLayoutEffect(() => {
    if (!avatarRef.current) return
    const avatarRect = avatarRef.current.getBoundingClientRect()
    const avatarCx = avatarRect.left + avatarRect.width / 2
    const avatarCy = avatarRect.top + avatarRect.height / 2

    const d = itemRefs.current.map((el) => {
      if (!el) return { dx: 0, dy: 0 }
      const r = el.getBoundingClientRect()
      return {
        dx: avatarCx - (r.left + r.width / 2),
        dy: avatarCy - (r.top + r.height / 2),
      }
    })
    setDeltas(d)

    // Trigger on the next frame so the initial position paints first.
    requestAnimationFrame(() => requestAnimationFrame(() => setStarted(true)))
  }, [items.length])

  // Complete the stage after the longest item transition finishes.
  useEffect(() => {
    if (!started) return
    const total = 900 + items.length * 80 + 300 // last stagger + fade
    const t = setTimeout(onComplete, total)
    return () => clearTimeout(t)
  }, [started, items.length, onComplete])

  const visibleItems = items.slice(0, 6)

  return (
    <div ref={containerRef} className="relative flex flex-col items-center gap-6 pb-6">
      {/* Ghost grid — reserves layout space and provides the start positions */}
      <div className="grid grid-cols-2 gap-3 w-full">
        {visibleItems.map((item, i) => {
          const delta = deltas[i] || { dx: 0, dy: 0 }
          const delay = i * 80
          const style: React.CSSProperties = started
            ? {
                transform: `translate(${delta.dx}px, ${delta.dy}px) scale(0.18) rotate(${(i % 2 === 0 ? -1 : 1) * 8}deg)`,
                opacity: 0,
                transition: `transform 900ms cubic-bezier(0.5, 0, 0.2, 1) ${delay}ms, opacity 700ms ease-in ${delay + 200}ms`,
              }
            : {
                transition: `transform 900ms cubic-bezier(0.5, 0, 0.2, 1), opacity 700ms ease-in`,
              }
          return (
            <div
              key={i}
              ref={(el) => { itemRefs.current[i] = el }}
              className="will-change-transform"
              style={style}
            >
              <ItemCard item={item} />
            </div>
          )
        })}
      </div>

      {/* Avatar — the gather target. Pulses softly as items arrive. */}
      <div
        ref={avatarRef}
        className="relative w-28 h-28 rounded-full overflow-hidden ring-4 ring-white shadow-[0_12px_48px_rgba(137,174,255,0.45)]"
        style={{
          background: "linear-gradient(135deg, #EC9DE2 0%, #89AEFF 100%)",
          animation: started ? "gatherPulse 900ms ease-out infinite" : undefined,
        }}
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt="avatar" fill sizes="112px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">✨</div>
        )}
      </div>

      <p className="text-sm text-[#101010]/60 text-center">
        Собираем образ…
      </p>

      {/* Scoped keyframes */}
      <style>{`
        @keyframes gatherPulse {
          0%   { box-shadow: 0 12px 48px rgba(137,174,255,0.45), 0 0 0 0 rgba(236,157,226,0.55); }
          70%  { box-shadow: 0 12px 48px rgba(137,174,255,0.45), 0 0 0 18px rgba(236,157,226,0.0); }
          100% { box-shadow: 0 12px 48px rgba(137,174,255,0.45), 0 0 0 0 rgba(236,157,226,0.0); }
        }
      `}</style>
    </div>
  )
}

/**
 * RefundErrorCard — shown when VTON generation fails.
 * Communicates that no credits were spent and invites the user to retry,
 * using a soft gradient illustration with a shield + sparkle motif.
 */
const RefundErrorCard = ({
  message,
  onRetry,
  onClose,
}: {
  message: string
  onRetry: () => void
  onClose: () => void
}) => (
  <div className="flex flex-col items-center gap-5 py-4 text-center">
    {/* Illustration: soft gradient orb with shield + sparkles */}
    <div className="relative w-32 h-32 flex items-center justify-center">
      <div
        className="absolute inset-0 rounded-full opacity-90"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, #FDE7F7 0%, #E8EFFF 55%, #DCE6FF 100%)",
        }}
      />
      <div
        className="absolute inset-4 rounded-full"
        style={{
          background:
            "linear-gradient(135deg, rgba(236,157,226,0.35), rgba(137,174,255,0.35))",
          animation: "refundFloat 2.4s ease-in-out infinite",
        }}
      />
      <div
        className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-[0_6px_20px_rgba(137,174,255,0.35)]"
        style={{ background: "linear-gradient(135deg, #EC9DE2 0%, #89AEFF 100%)" }}
      >
        <ShieldCheck className="w-8 h-8 text-white" strokeWidth={2.2} />
      </div>
      {/* Sparkles */}
      <Sparkles className="absolute top-1 right-4 w-4 h-4 text-[#EC9DE2]" />
      <Sparkles className="absolute bottom-3 left-3 w-3 h-3 text-[#89AEFF]" />
      <style>{`
        @keyframes refundFloat {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50%      { transform: scale(1.08); opacity: 1; }
        }
      `}</style>
    </div>

    <div className="space-y-2 max-w-xs">
      <p className="font-semibold text-[#101010]">Не получилось создать примерку</p>
      <p className="text-sm text-[#101010]/60 leading-relaxed">{message}</p>
      <div
        className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full text-[11px] font-medium"
        style={{
          background: "linear-gradient(135deg, rgba(236,157,226,0.12), rgba(137,174,255,0.12))",
          color: "#6E6EA3",
        }}
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        Токены не списаны — мы вернули их вам
      </div>
    </div>

    <div className="flex flex-col gap-3 w-full pt-1">
      <button
        onClick={onRetry}
        className="w-full h-12 rounded-2xl text-white font-semibold text-sm transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
      >
        <span className="flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4" />
          Попробовать снова
        </span>
      </button>
      <button
        onClick={onClose}
        className="text-sm text-[#101010]/60 underline underline-offset-2"
      >
        Закрыть
      </button>
    </div>
  </div>
)

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
          background: "linear-gradient(to right, #EC9DE2, #89AEFF)",
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

interface LoadingExperienceProps {
  showGame: boolean
  setShowGame: (v: boolean) => void
  progress: number
}

const LoadingExperience = ({ showGame, setShowGame, progress }: LoadingExperienceProps) => {
  const GAME_HEIGHT = 300

  if (!showGame) {
    return (
      <>
        <div
          className="w-full rounded-xl border border-purple-200/80 bg-gradient-to-b from-purple-100/80 to-pink-100/50 flex items-center justify-center overflow-hidden"
          style={{ height: `${GAME_HEIGHT}px` }}
        >
          <div className="w-full px-4 max-w-xs mx-auto text-center select-none" style={{ touchAction: "manipulation" }}>
            <p className="text-sm text-neutral-600 mb-4">Пока ИИ создаёт примерку:</p>
            <button
              className="w-full h-11 rounded-2xl text-white font-medium px-4 border-0 transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
              onPointerUp={() => setShowGame(true)}
            >
              Сыграть в игру
            </button>
          </div>
        </div>
        <ProgressBlock progress={progress} label="Создаём образ…" />
      </>
    )
  }

  return (
    <>
      <div className="w-full rounded-xl overflow-hidden" style={{ height: `${GAME_HEIGHT}px` }}>
        <FallingObjectsGame
          analysisDone={progress >= 100}
          onRequestFinish={() => setShowGame(false)}
        />
      </div>
      <ProgressBlock progress={progress} label="Создаём образ…" />
    </>
  )
}

// ---------------------------------------------------------------------------
// Avatar picker for try-on
// ---------------------------------------------------------------------------

interface AvatarOption {
  id: string | number
  url: string
  isPrimary?: boolean
  isNew?: boolean
}

interface AvatarPickerProps {
  selectedUrl: string | null
  onSelect: (url: string | null) => void
}

const AvatarPicker = ({ selectedUrl, onSelect }: AvatarPickerProps) => {
  const [avatars, setAvatars] = useState<AvatarOption[]>([])
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [newPhotoUrl, setNewPhotoUrl] = useState<string | null>(null)
  const [setAsAvatar, setSetAsAvatar] = useState(true)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [profileData, avatarList] = await Promise.all([
          api.get("/api/me/profile-session"),
          api.get("/api/me/avatars"),
        ])

        if (cancelled) return

        const profileAvatarUrl = profileData?.profile?.avatar_url || null
        setCurrentAvatarUrl(profileAvatarUrl)

        // Build avatar options: current first, then history (excluding current)
        const options: AvatarOption[] = []
        if (profileAvatarUrl) {
          options.push({ id: "current", url: profileAvatarUrl, isPrimary: true })
        }

        const historyAvatars = Array.isArray(avatarList) ? avatarList : []
        for (const a of historyAvatars) {
          if (a.url && a.url !== profileAvatarUrl) {
            options.push({ id: a.id, url: a.url })
          }
        }

        setAvatars(options)

        // Auto-select current avatar if nothing selected yet
        if (!selectedUrl && profileAvatarUrl) {
          onSelect(profileAvatarUrl)
        }
      } catch {
        // Silently fail — user can still proceed
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      let normalized = await normalizeImageFile(file, {
        maxWidth: 1024,
        output: "image/jpeg",
        quality: 0.9,
      })

      if (normalized.size > 5 * 1024 * 1024) {
        normalized = await normalizeImageFile(normalized, {
          maxWidth: 1024,
          output: "image/jpeg",
          quality: 0.8,
        })
      }

      const fd = new FormData()
      fd.append("file", normalized, normalized.name)
      fd.append("folder", "avatars")

      const result = await api.post("/api/upload-to-yandex", fd, { headers: {} })
      if (!result.success) throw new Error(result.error || "Upload failed")

      const url = result.url as string
      setNewPhotoUrl(url)

      // Add to avatar list and select it
      setAvatars((prev) => [{ id: "new", url, isNew: true }, ...prev])
      onSelect(url)

      // If "set as avatar" is checked (default), immediately save as primary avatar
      if (setAsAvatar) {
        try {
          if (currentAvatarUrl) {
            await api.post("/api/me/avatars", { url: currentAvatarUrl }).catch(() => {})
          }
          await api.post("/api/me/profile-session", { avatar_url: url })
          window.dispatchEvent(new CustomEvent("profile:avatar-updated", { detail: { avatar_url: url } }))
          setCurrentAvatarUrl(url)
          toast.success("Аватар обновлён")
        } catch {
          // Non-critical — photo is still selected for try-on
        }
      } else {
        // Just add to collection
        await api.post("/api/me/avatars", { url }).catch(() => {})
      }
    } catch (err: any) {
      toast.error(`Ошибка загрузки фото: ${err?.message || "Неизвестная ошибка"}`)
    } finally {
      setUploading(false)
      if (cameraInputRef.current) cameraInputRef.current.value = ""
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="w-16 h-16 rounded-full bg-gray-100 animate-pulse" />
        <div className="w-12 h-12 rounded-full bg-gray-100 animate-pulse" />
        <div className="w-12 h-12 rounded-full bg-gray-100 animate-pulse" />
      </div>
    )
  }

  const effectiveSelected = selectedUrl || currentAvatarUrl

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-[#101010]/60">Ваше фото для примерки</p>

      <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
        {/* Camera button */}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          className="flex-shrink-0 w-16 h-16 rounded-full border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:border-purple-300 hover:text-purple-400 transition-colors"
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Camera className="w-5 h-5" />
              <span className="text-[8px] leading-none">Фото</span>
            </>
          )}
        </button>

        {/* Hidden camera input (front camera on mobile) */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="user"
          onChange={handleCapture}
          className="hidden"
        />

        {/* Hidden file input (gallery fallback) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/heic,image/heif,image/jpeg,image/jpg,image/webp,image/png,image/*"
          onChange={handleCapture}
          className="hidden"
        />

        {/* Avatar options */}
        {avatars.map((avatar) => (
          <button
            key={avatar.id}
            type="button"
            onClick={() => onSelect(avatar.url)}
            className={`flex-shrink-0 relative rounded-full overflow-hidden transition-all ${
              avatar.url === effectiveSelected
                ? "ring-2 ring-offset-2 ring-purple-400 w-16 h-16"
                : "w-12 h-12 opacity-70 hover:opacity-100"
            }`}
          >
            <Image
              src={avatar.url}
              alt="Аватар"
              fill
              className="object-cover"
              sizes="64px"
            />
            {avatar.url === effectiveSelected && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
            {avatar.isPrimary && avatar.url !== effectiveSelected && (
              <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[7px] text-center py-0.5">
                Текущий
              </div>
            )}
          </button>
        ))}

        {/* Gallery button if no avatars yet */}
        {avatars.length === 0 && !uploading && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-16 h-16 rounded-full border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-0.5 text-gray-400"
          >
            <span className="text-lg">📷</span>
            <span className="text-[8px] leading-none">Галерея</span>
          </button>
        )}
      </div>

      {/* "Set as avatar" checkbox for newly captured photo */}
      {newPhotoUrl && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={setAsAvatar}
            onChange={(e) => setSetAsAvatar(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-400"
          />
          <span className="text-xs text-[#101010]/70">Использовать как новый аватар</span>
        </label>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Share helper
// ---------------------------------------------------------------------------

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
  const { session, sheetOpen, setSheetOpen, confirmTryOn, minimizeSession, saveTryOn, clearSession, setSessionAvatarUrl } = useTryOn()

  const [showPaywall, setShowPaywall] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
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
  const [showGame, setShowGame] = useState(false)
  // "gathering" plays a ~1.8s animation before the game/progress appears
  const [loadingPhase, setLoadingPhase] = useState<"gathering" | "ready">("gathering")

  // Reset game/gathering state when loading starts
  useEffect(() => {
    if (sheetOpen && session?.status === "loading") {
      setShowGame(false)
      setLoadingPhase("gathering")
    }
  }, [sheetOpen, session?.status])

  // Reset action states when session changes
  useEffect(() => {
    setIsSaving(false)
    setSaveOpen(false)
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

  const handleSavePhoto = useCallback(() => {
    if (!session?.resultUrl) return
    setSaveOpen(true)
  }, [session?.resultUrl])

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
              <>
                {/* Scrollable body — everything above the pinned CTA.
                    Bottom padding reserves space so the last item row is
                    never hidden behind the sticky footer. */}
                <div className="flex flex-col gap-5 pb-28">
                  {/* Description */}
                  <p className="text-sm text-[#101010]/70 leading-relaxed">
                    Примерим этот образ на вас? Выберите фото или сделайте новое.
                  </p>

                  {/* Avatar picker */}
                  <AvatarPicker
                    selectedUrl={session?.avatarUrl ?? null}
                    onSelect={setSessionAvatarUrl}
                  />

                  {/* Info */}
                  <p className="text-xs text-[#101010]/50 leading-relaxed">
                    Примерка займёт 30–60 секунд
                  </p>

                  {/* Outfit title + item cards (2-col grid) */}
                  {session?.suggestion?.title && (
                    <p className="text-base font-semibold text-[#101010]">
                      {session.suggestion.title}
                    </p>
                  )}
                  {items.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {items.slice(0, 6).map((item: any, i: number) => (
                        <ItemCard key={i} item={item} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Pinned CTA footer — stays glued to the bottom of the sheet
                    while the body scrolls. Negative margins cancel the parent's
                    px-6 / pb-6 so the footer is flush with the sheet edges; a
                    top gradient fades the content scrolling underneath. */}
                <div className="sticky bottom-0 -mx-6 -mb-6 px-6 pt-6 pb-5 bg-gradient-to-t from-background via-background to-background/0 pointer-events-none">
                  <div className="pointer-events-auto">
                    <GradientButton onClick={handleConfirm} disabled={isConfirming}>
                      <span className="flex items-center justify-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        {isConfirming ? "Запускаем…" : "Начать примерку"}
                      </span>
                    </GradientButton>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ---- LOADING ---- */}
        {session?.status === "loading" && (
          <div className="flex flex-col gap-4 pb-6">
            {loadingPhase === "gathering" ? (
              <GatherStage
                items={items}
                avatarUrl={session.avatarUrl}
                onComplete={() => setLoadingPhase("ready")}
              />
            ) : (
              <>
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
                  showGame={showGame}
                  setShowGame={setShowGame}
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
              </>
            )}
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

              {/* Save-to-phone button */}
              <OutlineButton onClick={handleSavePhoto}>
                <Download className="w-4 h-4" />
                Сохранить фото
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
          <RefundErrorCard
            message={
              session.error
                ? session.error.replace(/\s*Ваши?\s*кредиты\s*не\s*списаны.*$/i, "").trim() ||
                  "Что-то пошло не так при создании образа."
                : "Что-то пошло не так при создании образа."
            }
            onRetry={() => clearSession()}
            onClose={handleClose}
          />
        )}
      </CommonSheet>

      {/* Paywall */}
      <SubscriptionSheet
        isOpen={showPaywall}
        source="limit:vton_used"
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false)
          toast.success("Лимиты обновлены! Попробуйте ещё раз.")
        }}
        variant="limitReached"
      />

      <SaveImageSheet
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        render={() => renderSinglePhoto(session!.resultUrl!)}
        fileName="modemorph-tryon.png"
        title={session?.suggestion?.title ?? "Моя примерка"}
      />
    </>
  )
}

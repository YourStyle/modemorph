"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bookmark, Package, BookmarkCheck, Sparkles, User, Loader2, ThumbsUp, ThumbsDown, CircleOff, ExternalLink } from "lucide-react"
import Image from "next/image"
import { toast } from "sonner"
import { ItemDetailsModal } from "./item-details-modal"
import { CommonSheet } from "./common-sheet"
import { useTryOn } from "@/contexts/try-on-context"
import { api } from "@/lib/api-client"

interface OutfitItem {
  id: string
  name: string
  image_url: string
  color?: string
  shade?: string
  style?: string
  material?: string
  url?: string
  brand?: string
  size_type?: string
  has_print?: string
  has_details?: string
  notes?: string
  is_basic?: boolean
  basic_item_id?: number | null
  user_id?: string | null
  item_source?: "user" | "catalog"
  source?: "wardrobe_items" | "wardrobe_user_items"
}

// Canonical "is this the user's own wardrobe item?" check. Prefer explicit
// item_source from the backend; fall back to user_id for legacy cache rows.
function isUserItem(item: OutfitItem): boolean {
  if (item.item_source) return item.item_source === "user"
  return !!item.user_id
}

interface OutfitSuggestion {
  id: string
  title: string
  items: OutfitItem[]
  suggested_items_count: number
}

interface OutfitCardProps {
  suggestion: OutfitSuggestion
  sectionSource?: "user_only" | "mix" | "partner_only" | "clip" | "ai"
  onSaveOutfit?: (suggestion: OutfitSuggestion) => void
  userLooks?: any[]
  onTryOnClick?: (payload: {
    requestId: string
    suggestion: OutfitSuggestion
    items: OutfitItem[]
  }) => void
  onTryOnSuccess?: (payload: {
    requestId: string
    suggestion: OutfitSuggestion
  }) => void
  onDislikeItem?: (itemId: string) => void
}

const BRAND_LOGOS: Record<string, { display: string; logoUrl: string }> = {
  sela: { display: "SELA", logoUrl: "/brands/sela.svg" },
  lacoste: { display: "LACOSTE", logoUrl: "/brands/lacoste.svg" },
  gate31: { display: "GATE31", logoUrl: "/brands/gate31.svg" },
  loverepublic: { display: "LOVE REPUBLIC", logoUrl: "/brands/loverepublic.svg" },
  "love republic": { display: "LOVE REPUBLIC", logoUrl: "/brands/loverepublic.svg" },
}

function getBrandLogo(brand: string): { display: string; logoUrl: string } | null {
  const key = brand.toLowerCase().replace(/\s+/g, "")
  return BRAND_LOGOS[brand.toLowerCase()] || BRAND_LOGOS[key] || null
}

function getSourceBadge(source?: string): { label: string; className: string } | null {
  switch (source) {
    case "user_only":
      return { label: "Из вашего гардероба", className: "bg-gray-100 text-gray-700 border border-gray-200" }
    case "mix":
      return { label: "Подобрано для вас", className: "bg-blue-50 text-blue-700 border border-blue-200" }
    case "partner_only":
      return { label: "От партнёров", className: "bg-purple-50 text-purple-700 border border-purple-200" }
    case "clip":
      return { label: "Подобрано для вас", className: "bg-blue-50 text-blue-700 border border-blue-200" }
    case "ai":
      return { label: "Рекомендация стилиста", className: "bg-purple-50 text-purple-700 border border-purple-200" }
    default:
      return null
  }
}

export function OutfitCard({ suggestion, sectionSource, onSaveOutfit, userLooks = [], onTryOnClick, onTryOnSuccess, onDislikeItem }: OutfitCardProps) {
  const [saving, setSaving] = useState(false)
  const [showOutfitDetails, setShowOutfitDetails] = useState(false)
  const [selectedItem, setSelectedItem] = useState<OutfitItem | null>(null)
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})
  const feedbackKey = `outfit_feedback_${sectionSource || "x"}_${suggestion?.id}`
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(() => {
    if (typeof window === "undefined" || !suggestion?.id) return null
    try {
      return localStorage.getItem(feedbackKey) as "like" | "dislike" | null
    } catch {
      return null
    }
  })
  const { startTryOn, session } = useTryOn()

  const sendFeedback = (action: "like" | "dislike") => {
    if (feedback) return
    setFeedback(action)
    try { localStorage.setItem(feedbackKey, action) } catch { /* ignore */ }
    toast.success(action === "like" ? "Спасибо! Учтём в подборках" : "Спасибо за обратную связь")
    api.post("/api/usage/log", {
      feature: "ai_requests",
      action: "click",
      meta: { suggestion_id: suggestion.id, source: sectionSource ?? null, feedback: action },
    }).catch(() => {})
  }

  if (!suggestion) return null

  const items = (suggestion.items || []).filter(
    (item) => item.image_url && item.image_url.trim().length > 0,
  )
  const title = suggestion.title || "Без названия"
  const suggestedItemsCount = suggestion.suggested_items_count || 0

  const isSaved = userLooks.some(
    (look: any) =>
      look.name === title ||
      (look.items &&
        look.items.length === items.length &&
        look.items.every((item: any) => items.some((suggItem) => suggItem.id === item.id.toString()))),
  )

  const handleSaveOutfit = async () => {
    if (items.length === 0) {
      toast.error("Нет вещей для сохранения")
      return
    }
    setSaving(true)
    try {
      if (onSaveOutfit) await onSaveOutfit(suggestion)
    } catch (error) {
      console.error("Error saving outfit:", error)
    } finally {
      setSaving(false)
    }
  }

  const openTryOn = () => {
    const reqId = crypto.randomUUID()
    startTryOn(
      suggestion,
      items,
      () => onTryOnClick?.({ requestId: reqId, suggestion, items }),
      () => onTryOnSuccess?.({ requestId: reqId, suggestion }),
    )
  }

  const vtonLoading = session?.status === "loading" && session?.suggestion?.id === suggestion.id

  const handleImageError = (itemId: string) => setImageErrors((prev) => ({ ...prev, [itemId]: true }))
  const handleItemClick = (item: OutfitItem) => setSelectedItem(item)

  return (
    <>
      <Card className="bg-white border-0 overflow-hidden w-[calc(100vw-2rem)] max-w-96 shadow-[0_2px_8px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.1)] transition-all duration-300">
        <CardContent className="p-6">
          {/* Source badge */}
          {(() => {
            const badge = getSourceBadge(sectionSource)
            return badge ? (
              <div className="mb-3">
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${badge.className}`}>
                  <Sparkles className="w-3 h-3" />
                  {badge.label}
                </span>
              </div>
            ) : null
          })()}

          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2 text-lg">{title}</h3>
              {isSaved && (
                <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
                  <BookmarkCheck className="w-3 h-3 mr-1" />
                  Сохранено
                </Badge>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className={`p-2 ${isSaved ? "text-green-600" : "text-gray-400 hover:text-green-600"}`}
              onClick={handleSaveOutfit}
              disabled={saving || items.length === 0}
            >
              {isSaved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
            </Button>
          </div>

          {/* Items Grid */}
          {items.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 mb-6">
              {items.slice(0, 4).map((item, index) => {
                const hasError = imageErrors[item.id]
                return (
                  <div
                    key={`${item.id}-${index}`}
                    className="relative cursor-pointer group/item"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden">
                      {item.image_url && !hasError ? (
                        <Image
                          src={item.image_url || "/placeholder.svg"}
                          alt={item.name || "Вещь"}
                          fill
                          className="object-cover group-hover/item:scale-105 transition-transform duration-200"
                          onError={() => handleImageError(item.id)}
                          sizes="(max-width: 768px) 50vw, 25vw"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100">
                          <Package className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Hover overlay with item name */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/item:opacity-100 transition-opacity duration-200 flex items-center justify-center rounded-lg">
                      <div className="text-center px-2">
                        <p className="text-white text-xs font-medium">{item.name || "Без названия"}</p>
                        <p className="text-white/80 text-xs">{item.color || "Цвет не указан"}</p>
                      </div>
                    </div>

                    {/* Item type indicator */}
                    {!isUserItem(item) ? (
                      <div className="absolute top-2 right-2">
                        <span
                          className="inline-flex items-center text-white text-xs px-1.5 py-0.5 rounded-md font-medium"
                          style={{ background: 'linear-gradient(to right, #EC9DE2, #89AEFF)' }}
                        >
                          <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                          Рекомендуем
                        </span>
                      </div>
                    ) : (
                      <div className="absolute top-2 right-2">
                        <span
                          className="inline-flex items-center text-white text-xs px-1.5 py-0.5 rounded-md font-medium"
                          style={{ backgroundColor: '#292929' }}
                        >
                          <User className="w-2.5 h-2.5 mr-0.5" />
                          Ваше
                        </span>
                      </div>
                    )}

                    {/* Dislike item button */}
                    <button
                      type="button"
                      aria-label="Не рекомендовать"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDislikeItem?.(item.id)
                      }}
                      className="absolute bottom-2 right-2 p-1.5 rounded-full bg-white/80 hover:bg-red-50 text-gray-400 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all duration-200 z-10"
                    >
                      <CircleOff className="w-3.5 h-3.5" />
                    </button>

                    {/* Brand badge */}
                    {item.brand && item.brand.toLowerCase() !== "unknown" && (() => {
                      const brandLogo = getBrandLogo(item.brand!)
                      return (
                        <div className="absolute bottom-2 left-2 bg-white/90 rounded px-1.5 py-0.5 flex items-center">
                          {brandLogo ? (
                            <img
                              src={brandLogo.logoUrl}
                              alt={brandLogo.display}
                              style={{ height: "12px", width: "auto", maxWidth: "72px", objectFit: "contain" }}
                              onError={(e) => {
                                const el = e.currentTarget
                                el.style.display = "none"
                                const span = el.nextElementSibling as HTMLElement | null
                                if (span) span.style.display = "inline"
                              }}
                            />
                          ) : null}
                          <span
                            className="text-xs font-semibold tracking-wide"
                            style={{ color: "#4B5563", display: brandLogo ? "none" : "inline" }}
                          >
                            {item.brand}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mb-6 p-8 text-center text-gray-500">
              <p>Нет вещей для отображения</p>
            </div>
          )}

          {/* Show more items indicator */}
          {items.length > 4 && (
            <div className="mb-4 text-center">
              <p className="text-sm text-gray-500">
                +{items.length - 4} еще {items.length - 4 === 1 ? "вещь" : "вещей"}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-gray-700 bg-transparent"
              style={{ borderColor: '#292929', borderRadius: '16px', borderWidth: '1px' }}
              onClick={() => setShowOutfitDetails(true)}
            >
              Весь образ
            </Button>
            <Button
              size="sm"
              className="w-full text-white border-0"
              style={{ backgroundColor: '#292929', borderRadius: '16px' }}
              onClick={openTryOn}
              disabled={!!vtonLoading}
            >
              {vtonLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Примеряем...
                </>
              ) : (
                "Примерить"
              )}
            </Button>
          </div>

          {/* Like / Dislike feedback */}
          <div className="flex items-center justify-end gap-1.5 mt-3">
            <span className="text-xs text-gray-400 mr-1">{feedback ? (feedback === "like" ? "Вам понравилось" : "Учтём") : "Подходит?"}</span>
            <button
              type="button"
              aria-label="Нравится"
              onClick={() => sendFeedback("like")}
              disabled={!!feedback}
              className={`p-2 rounded-full transition-all duration-300 ${
                feedback === "like"
                  ? "text-white bg-emerald-500 scale-110 shadow-sm"
                  : feedback === "dislike"
                  ? "text-gray-300 bg-gray-50 scale-90 opacity-50"
                  : "text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 active:scale-95"
              } disabled:cursor-default`}
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Не нравится"
              onClick={() => sendFeedback("dislike")}
              disabled={!!feedback}
              className={`p-2 rounded-full transition-all duration-300 ${
                feedback === "dislike"
                  ? "text-white bg-red-500 scale-110 shadow-sm"
                  : feedback === "like"
                  ? "text-gray-300 bg-gray-50 scale-90 opacity-50"
                  : "text-gray-400 hover:text-red-500 hover:bg-red-50 active:scale-95"
              } disabled:cursor-default`}
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Item Details Modal */}
      {selectedItem && (
        <ItemDetailsModal
          item={{
            id: Number.parseInt(selectedItem.id),
            item_name: selectedItem.name,
            image_url: selectedItem.image_url,
            color: selectedItem.color,
            shade: selectedItem.shade,
            style: selectedItem.style,
            material: selectedItem.material,
            url: selectedItem.url,
            size_type: selectedItem.size_type,
            has_print: selectedItem.has_print,
            has_details: selectedItem.has_details,
            notes: selectedItem.notes,
            is_basic: selectedItem.is_basic || false,
            basic_item_id: selectedItem.basic_item_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            basic_material_id: null,
            is_hidden: false,
            user_id: selectedItem.user_id,
          }}
          isOpen={!!selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* Outfit Details Sheet */}
      <CommonSheet
        isOpen={showOutfitDetails}
        onClose={() => setShowOutfitDetails(false)}
        title={title}
        backgroundColor="white"
        swipeAction="close"
      >
        <div className="space-y-4">
          {/* Items Grid */}
          <div className="grid grid-cols-2 gap-3">
            {items.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="group cursor-pointer bg-gray-50 rounded-lg overflow-hidden hover:shadow-md transition-all duration-200"
                onClick={() => setSelectedItem(item)}
              >
                <div className="aspect-square relative">
                  {item.image_url && !imageErrors[item.id] ? (
                    <Image
                      src={item.image_url || "/placeholder.svg"}
                      alt={item.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-200"
                      onError={() => setImageErrors((prev) => ({ ...prev, [item.id]: true }))}
                      sizes="(max-width: 768px) 50vw, 25vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <Package className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h4 className="font-medium text-sm line-clamp-2 mb-1">{item.name}</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.color && (
                      <div
                        className="w-3 h-3 rounded-full border border-gray-200 flex-shrink-0"
                        style={{ backgroundColor: item.color.startsWith("#") ? item.color : `#${item.color}` }}
                      />
                    )}
                    <span
                      className="text-xs px-2 py-1 rounded-md text-white font-medium"
                      style={
                        isUserItem(item)
                          ? { backgroundColor: '#292929' }
                          : { background: 'linear-gradient(to right, #EC9DE2, #89AEFF)' }
                      }
                    >
                      {isUserItem(item) ? "Ваше" : "Рекомендуем"}
                    </span>
                    {item.brand && item.brand.toLowerCase() !== "unknown" && (
                      <span className="text-xs text-gray-500 font-medium">{item.brand}</span>
                    )}
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      В магазин
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSaveOutfit}
            disabled={saving || isSaved}
            className="w-full text-white border-0"
            style={{ backgroundColor: '#292929', borderRadius: '16px' }}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Сохранение...
              </>
            ) : isSaved ? (
              <>
                <BookmarkCheck className="w-4 h-4 mr-2" />
                Сохранено
              </>
            ) : (
              <>
                <Bookmark className="w-4 h-4 mr-2" />
                Сохранить образ
              </>
            )}
          </Button>
        </div>
      </CommonSheet>
    </>
  )
}

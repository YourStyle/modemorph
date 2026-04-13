"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bookmark, Package, BookmarkCheck, Sparkles, User, Loader2, ThumbsUp, ThumbsDown } from "lucide-react"
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
  user_id?: string
  source?: "wardrobe_items" | "wardrobe_user_items"
}

interface OutfitSuggestion {
  id: string
  title: string
  items: OutfitItem[]
  suggested_items_count: number
}

interface OutfitCardProps {
  suggestion: OutfitSuggestion
  sectionSource?: "clip" | "ai"
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
}

export function OutfitCard({ suggestion, sectionSource, onSaveOutfit, userLooks = [], onTryOnClick, onTryOnSuccess }: OutfitCardProps) {
  const [saving, setSaving] = useState(false)
  const [showOutfitDetails, setShowOutfitDetails] = useState(false)
  const [selectedItem, setSelectedItem] = useState<OutfitItem | null>(null)
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})
  const feedbackKey = `outfit_feedback_${suggestion?.id}`
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
    api.post("/api/usage/log", {
      feature: "ai_requests",
      action: "click",
      meta: { suggestion_id: suggestion.id, source: sectionSource ?? null, feedback: action },
    }).catch(() => {
      // fire-and-forget — ignore errors silently
    })
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
      <Card className="bg-white border-0 shadow-sm overflow-hidden w-96">
        <CardContent className="p-6">
          {/* Source badge */}
          {sectionSource && (
            <div className="mb-3">
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                sectionSource === "clip"
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-purple-50 text-purple-700 border border-purple-200"
              }`}>
                <Sparkles className="w-3 h-3" />
                {sectionSource === "clip" ? "Подобрано для вас" : "Рекомендация стилиста"}
              </span>
            </div>
          )}

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
                    {!item.user_id ? (
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

                    {/* Brand badge */}
                    {item.brand && (
                      <div className="absolute bottom-2 left-2 bg-white/90 rounded px-1.5 py-0.5 flex items-center">
                        {item.brand === "SELA" ? (
                          <svg viewBox="0 0 109 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3 w-auto text-[#00875A]">
                            <path d="M39.73 6c-7.63 0-13.25 6.02-13.25 13.97 0 8.37 5.42 14.03 13.4 14.03 5.16 0 9.89-2.6 11.92-7.55l-6.6-2.5c-.75 2.35-3 3.56-5.5 3.56-3.07 0-5.5-2.82-5.48-5.75h17.91v-2.14c0-7.6-4.52-13.62-12.4-13.62zm-5.27 10.76c.8-2.96 2.35-4.44 4.99-4.44 2.96 0 4.69 2.04 4.74 4.44h-9.73z" fill="currentColor"/>
                            <path d="M68.59 26.6c-3.51 0-5.12-1.27-5.12-4.95V6h-8.38v16.93c0 7.7 4.82 11.07 12.44 11.07 1.66 0 3.26-.1 4.67-.36.47-.08.95-.17 1.15-.21-1.77-1.79-2.85-4.17-2.97-6.9-.57.05-1.13.08-1.79.08z" fill="currentColor"/>
                            <path d="M105.03 34a3.73 3.73 0 100-7.45 3.73 3.73 0 000 7.45z" fill="currentColor"/>
                            <path d="M99.1 27.49c-1.42.15-1.89-.27-1.89-1.6V15.54c0-6.27-4.26-9.49-11.19-9.49-6.92 0-10.89 3.88-12.04 8.62l7.68 1.17c.5-2.19 1.88-3.21 4.01-3.21 2.44 0 3.66 1.28 3.66 3.27v.46l-5.92 1.02c-5.57.82-10.19 3.06-10.19 8.62 0 4.74 3.81 8.01 9.13 8.01 3.46 0 6.52-1.47 8.28-3.31 1.35 2.3 4.01 3.57 8.63 2.8 0 0-.77-1.49-.77-3.22 0-.99.22-1.93.6-2.78zm-9.77-3.64c0 2.75-2.6 4.28-5.26 4.28-1.9 0-3.02-.7-3.02-2.7 0-1.89 1.56-2.6 3.66-2.96l4.62-.74v2.12z" fill="currentColor"/>
                            <path d="M14.37 16.5c-3.21-.61-4.75-1.07-4.75-2.55 0-1.22 1.24-1.73 3.19-1.73 2.61 0 5.22 1.17 7.23 3.31l4.3-4.95s-.23-.28-.5-.53C21.58 7.72 17.48 6 12.86 6 5.84 6 1.57 9.62 1.57 15.08c0 6.07 4.67 6.99 9.03 7.85 4.22.77 5.96 1.18 5.96 2.97 0 1.43-1.74 1.93-3.85 1.93-2.86 0-6.27-1.43-8.43-3.82L0 29.35c2.46 2.91 7.79 4.65 12.41 4.65 7.63 0 12.04-3.42 12.04-9.28 0-5.87-5.32-7.24-10.08-8.21z" fill="currentColor"/>
                          </svg>
                        ) : (
                          <span className="text-xs font-medium text-gray-600">{item.brand}</span>
                        )}
                      </div>
                    )}
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

          {/* Partner item actions: shop link + add to wardrobe */}
          {items.slice(0, 4).some((item) => !item.user_id) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {items.slice(0, 4).filter((item) => !item.user_id).map((item, index) => (
                <div key={`actions-${item.id}-${index}`} className="flex gap-1.5">
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-full transition-colors"
                    >
                      В магазин
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation()
                      try {
                        await api.post("/api/wardrobe-user-items", {
                          item_name: item.name,
                          image_url: item.image_url,
                          color: item.color || "",
                          shade: item.shade || "",
                          style: item.style || "",
                          material: item.material || "",
                          clothing_type: (item as any).clothing_type || "",
                          url: item.url || "",
                          brand: item.brand || "",
                        })
                        toast.success("Добавлено в гардероб")
                      } catch {
                        toast.error("Не удалось добавить")
                      }
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-full transition-colors"
                  >
                    + В гардероб
                  </button>
                </div>
              ))}
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
          <div className="flex items-center justify-end gap-1 mt-3">
            <span className="text-xs text-gray-400 mr-1">Подходит?</span>
            <button
              type="button"
              aria-label="Нравится"
              onClick={() => sendFeedback("like")}
              disabled={!!feedback}
              className={`p-1.5 rounded-full transition-colors ${
                feedback === "like"
                  ? "text-emerald-600 bg-emerald-50"
                  : "text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"
              } disabled:cursor-default`}
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Не нравится"
              onClick={() => sendFeedback("dislike")}
              disabled={!!feedback}
              className={`p-1.5 rounded-full transition-colors ${
                feedback === "dislike"
                  ? "text-red-500 bg-red-50"
                  : "text-gray-400 hover:text-red-500 hover:bg-red-50"
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
                        item.user_id
                          ? { backgroundColor: '#292929' }
                          : { background: 'linear-gradient(to right, #EC9DE2, #89AEFF)' }
                      }
                    >
                      {item.user_id ? "Ваше" : "Рекомендуем"}
                    </span>
                    {item.brand && (
                      <span className="text-xs text-gray-500 font-medium">{item.brand}</span>
                    )}
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full transition-colors"
                    >
                      Посмотреть в магазине
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

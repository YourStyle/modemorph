"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Bookmark, Package, BookmarkCheck, Sparkles, User, Loader2 } from "lucide-react"
import Image from "next/image"
import { toast } from "sonner"
import { ItemDetailsModal } from "./item-details-modal"
import { SubscriptionSheet } from "./subscription-sheet"
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

export function OutfitCard({ suggestion, onSaveOutfit, userLooks = [], onTryOnClick, onTryOnSuccess }: OutfitCardProps) {
  const [saving, setSaving] = useState(false)
  const [showTryOnModal, setShowTryOnModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<OutfitItem | null>(null)
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})
  const [vtonLoading, setVtonLoading] = useState(false)
  const [vtonResult, setVtonResult] = useState<any>(null)
  const [tryOnRequestId, setTryOnRequestId] = useState<string | null>(null) // ⬅️ для корреляции событий
  const [showPaywall, setShowPaywall] = useState(false)

  if (!suggestion) return null

  const items = suggestion.items || []
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

  const openTryOnModal = () => {
    const reqId = crypto.randomUUID()
    setTryOnRequestId(reqId)
    onTryOnClick?.({ requestId: reqId, suggestion, items }) // ⬅️ событие наверх
    setShowTryOnModal(true)
  }

  // текущая логика VTON остаётся как была (если хочешь, потом вынесем тоже наверх)
  const handleTryOn = async () => {
        if (items.length === 0) {
          toast.error("Нет вещей для примерки")
          return
        }

        setVtonLoading(true)
        setVtonResult(null)

        try {
          // ПРОВЕРКА ЛИМИТОВ ДО выполнения примерки
          const limitCheck = await api.post("/api/check-limits", {
            featureType: "vton_used",
            count: 1,
            meta: {
              requestId: tryOnRequestId ?? crypto.randomUUID(),
            }
          })

          if (!limitCheck.canUse) {
            setVtonLoading(false)
            setShowTryOnModal(false)
            setShowPaywall(true)
            return
          }

          const vtonItems = items.map((item) => ({
            name: item.name,
            description: `${item.style || ""} ${item.has_print || ""} ${item.has_details || ""}`.trim(),
            color: item.color,
            material: item.material,
            image_url: item.image_url,
          }))

          const data = await api.post("/api/vton", {
            items: vtonItems,
            requestId: tryOnRequestId ?? crypto.randomUUID(),
          })

          if (data?.success === false) {
            throw new Error(data?.error || "Failed to process virtual try-on")
          }

          // Унифицированно достаём URL из разных возможных форматов ответа
          const imageUrl =
            data?.result?.[0]?.avatar_url ??
            data?.result?.avatar_url ??
            data?.avatar_url ??
            data?.image_url ??
            data?.url ??
            null

          if (!imageUrl) {
            throw new Error("Сервер не вернул avatar_url / image_url")
          }
          setVtonResult({ image_url: imageUrl, raw: data })

          onTryOnSuccess?.({ requestId: tryOnRequestId ?? crypto.randomUUID(), suggestion })
          toast.success("Примерка готова!")
        } catch (error) {
          console.error("Error in virtual try-on:", error)

          // Проверяем, является ли это ошибкой лимита (402 или payment_required)
          const errorMessage = error instanceof Error ? error.message : String(error)
          const isPaymentRequired =
            errorMessage.includes("402") ||
            errorMessage.includes("payment_required") ||
            errorMessage.toLowerCase().includes("лимит")

          if (isPaymentRequired) {
            setVtonLoading(false)
            setShowTryOnModal(false)
            setShowPaywall(true)
          } else {
            toast.error(error instanceof Error ? error.message : "Ошибка при примерке")
          }
        } finally {
          setVtonLoading(false)
        }
  }

  const handleImageError = (itemId: string) => setImageErrors((prev) => ({ ...prev, [itemId]: true }))
  const handleItemClick = (item: OutfitItem) => setSelectedItem(item)

  return (
    <>
      <Card className="bg-white border-0 shadow-sm overflow-hidden w-96">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2 text-lg">{title}</h3>
              {suggestedItemsCount > 0 && (
                <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
                  <Sparkles className="w-3 h-3 mr-1" />
                  {suggestedItemsCount} рекомендаций
                </Badge>
              )}
              {isSaved && (
                <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200 ml-2">
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
                        <Badge className="bg-orange-500 text-white text-xs px-1.5 py-0.5">
                          <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                          Рекомендуем
                        </Badge>
                      </div>
                    ) : (
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-blue-500 text-white text-xs px-1.5 py-0.5">
                          <User className="w-2.5 h-2.5 mr-0.5" />
                          Ваше
                        </Badge>
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

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-gray-700 border-gray-200 bg-transparent"
              onClick={openTryOnModal} // ⬅️ карточка только сообщает и открывает модалку
              disabled={vtonLoading}
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
        </CardContent>
      </Card>

      {/* Try On Modal */}
      <Dialog open={showTryOnModal} onOpenChange={setShowTryOnModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-500" />
              Виртуальная примерка
            </DialogTitle>
          </DialogHeader>
          <div className="py-6">
            {vtonLoading ? (
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
                <p className="text-gray-600 mb-2">Создаем примерку...</p>
                <p className="text-sm text-gray-500">Это может занять несколько секунд</p>
              </div>
            ) : vtonResult ? (
              <div className="text-center">
                <div className="mb-4">
                  {(() => {
                    const previewUrl = vtonResult?.image_url || vtonResult?.avatar_url
                    return previewUrl ? (
                      <Image
                        src={previewUrl}
                        alt="Virtual try-on result"
                        width={300}
                        height={400}
                        className="rounded-lg mx-auto"
                      />
                    ) : (
                      <div className="text-sm text-gray-500">Нет изображения в ответе</div>
                    )
                  })()}
                </div>
                <p className="text-green-600 font-medium">Примерка готова!</p>
                {vtonResult.message && <p className="text-sm text-gray-600 mt-2">{vtonResult.message}</p>}
              </div>
            ) : (
              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  Хотите примерить этот образ? Мы создадим виртуальную примерку с вашим аватаром.
                </p>
                <div className="space-y-2 text-sm text-gray-500">
                  <p>• Убедитесь, что у вас загружен аватар в профиле</p>
                  <p>• Примерка займет несколько секунд</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowTryOnModal(false)}>
              Закрыть
            </Button>
            {!vtonResult && (
              <Button onClick={handleTryOn} disabled={vtonLoading}>
                {vtonLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Примеряем...
                  </>
                ) : (
                  "Начать примерку"
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Subscription Sheet */}
      <SubscriptionSheet
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={() => {
          setShowPaywall(false)
          toast.success("Лимиты обновлены! Попробуйте еще раз.")
        }}
      />
    </>
  )
}

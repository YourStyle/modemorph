"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, ArrowLeft, Edit, Trash2, Calendar, MapPin, Package } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import Image from "next/image"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface OutfitItem {
  id: number
  outfit_id: number
  wardrobe_item_id: number
  position: number
  wardrobe_items: {
    id: number
    item_name: string
    size_type: string
    color: string
    shade: string
    material: string
    style: string
    image_url?: string
    is_basic: boolean
    has_print: string
    has_details: string
    notes?: string
  }
}

interface Outfit {
  id: number
  name: string
  description: string
  season: string
  occasion: string
  created_at: string
  updated_at: string
  outfit_items: OutfitItem[]
}

export default function OutfitDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [outfit, setOutfit] = useState<Outfit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set())

  const outfitId = params.id as string

  useEffect(() => {
    if (outfitId) {
      fetchOutfit()
    }
  }, [outfitId])

  const fetchOutfit = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log("Fetching outfit with ID:", outfitId)

      const response = await fetch(`/api/outfits/${outfitId}`)

      console.log("Response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("API error response:", errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      console.log("Received outfit data:", data)

      setOutfit(data.outfit)
    } catch (error) {
      console.error("Error fetching outfit:", error)
      setError(error instanceof Error ? error.message : "Failed to fetch outfit")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!outfit) return

    try {
      setDeleting(true)
      const response = await fetch(`/api/outfits/${outfit.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete outfit")
      }

      toast({
        title: "Успешно",
        description: "Образ удален",
      })

      router.push("/admin/outfits")
    } catch (error) {
      console.error("Error deleting outfit:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось удалить образ",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleImageError = (itemId: number) => {
    setImageErrors((prev) => new Set(prev).add(itemId))
  }

  const getSeasonName = (season: string) => {
    const seasons: Record<string, string> = {
      spring: "Весна",
      summer: "Лето",
      autumn: "Осень",
      winter: "Зима",
      all: "Всесезонный",
    }
    return seasons[season] || season
  }

  const getOccasionName = (occasion: string) => {
    const occasions: Record<string, string> = {
      casual: "Повседневный",
      office: "Офис",
      sport: "Спорт",
      party: "Вечеринка",
      date: "Свидание",
      formal: "Формальный",
    }
    return occasions[occasion] || occasion
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
          <span className="text-gray-600">Загрузка образа...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-600 text-lg font-semibold">Ошибка загрузки образа</div>
          <p className="text-gray-600">{error}</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={fetchOutfit}>Попробовать снова</Button>
            <Link href="/admin/outfits">
              <Button variant="outline">Вернуться к списку</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!outfit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-gray-600 text-lg">Образ не найден</div>
          <Link href="/admin/outfits">
            <Button>Вернуться к списку</Button>
          </Link>
        </div>
      </div>
    )
  }

  const sortedItems = outfit.outfit_items.sort((a, b) => a.position - b.position)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Заголовок */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <Link href="/admin/outfits">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Назад
                </Button>
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">{outfit.name}</h1>
            </div>

            {outfit.description && <p className="text-gray-600 text-lg">{outfit.description}</p>}

            {/* Метаданные */}
            <div className="flex flex-wrap gap-2 mt-4">
              {outfit.season && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {getSeasonName(outfit.season)}
                </Badge>
              )}
              {outfit.occasion && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {getOccasionName(outfit.occasion)}
                </Badge>
              )}
              <Badge variant="outline">
                {outfit.outfit_items.length} {outfit.outfit_items.length === 1 ? "вещь" : "вещей"}
              </Badge>
            </div>

            {/* Даты */}
            <div className="text-sm text-gray-500 mt-2">
              <div>Создан: {formatDate(outfit.created_at)}</div>
              {outfit.updated_at !== outfit.created_at && <div>Обновлен: {formatDate(outfit.updated_at)}</div>}
            </div>
          </div>

          {/* Действия */}
          <div className="flex gap-2 mb-8">
            <Link href={`/admin/wardrobe?edit=${outfit.id}`}>
              <Button className="flex items-center gap-2">
                <Edit className="h-4 w-4" />
                Редактировать
              </Button>
            </Link>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Удалить
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить образ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Вы уверены, что хотите удалить образ "{outfit.name}"? Это действие нельзя отменить.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Элементы образа */}
          <Card>
            <CardHeader>
              <CardTitle>Элементы образа</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>В этом образе нет элементов</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {sortedItems.map((item) => {
                    const hasError = imageErrors.has(item.wardrobe_items.id)
                    const imageUrl = item.wardrobe_items.image_url

                    return (
                      <Card key={item.id} className="overflow-hidden">
                        {/* Изображение */}
                        <div className="aspect-square bg-gray-100 relative">
                          {imageUrl && !hasError ? (
                            <Image
                              src={imageUrl || "/placeholder.svg"}
                              alt={item.wardrobe_items.item_name}
                              fill
                              className="object-cover"
                              onError={() => handleImageError(item.wardrobe_items.id)}
                              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-8 w-8 text-gray-400" />
                            </div>
                          )}

                          {/* Позиция */}
                          <Badge className="absolute top-2 left-2 bg-black/70 text-white">{item.position + 1}</Badge>
                        </div>

                        {/* Информация */}
                        <CardContent className="p-3">
                          <h3 className="font-medium text-sm mb-2 line-clamp-2">{item.wardrobe_items.item_name}</h3>

                          <div className="space-y-1 text-xs text-gray-600">
                            {item.wardrobe_items.color && (
                              <div className="flex items-center gap-2">
                                <span>Цвет:</span>
                                <span className="font-medium">{item.wardrobe_items.color}</span>
                                {item.wardrobe_items.shade && (
                                  <span className="text-gray-500">({item.wardrobe_items.shade})</span>
                                )}
                              </div>
                            )}

                            {item.wardrobe_items.material && (
                              <div>
                                <span>Материал: </span>
                                <span className="font-medium">{item.wardrobe_items.material}</span>
                              </div>
                            )}

                            {item.wardrobe_items.style && (
                              <div>
                                <span>Стиль: </span>
                                <span className="font-medium">{item.wardrobe_items.style}</span>
                              </div>
                            )}

                            {item.wardrobe_items.size_type && (
                              <div>
                                <span>Размер: </span>
                                <span className="font-medium">{item.wardrobe_items.size_type}</span>
                              </div>
                            )}
                          </div>

                          {/* Дополнительные бейджи */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {item.wardrobe_items.is_basic && (
                              <Badge variant="secondary" className="text-xs">
                                Базовая
                              </Badge>
                            )}
                            {item.wardrobe_items.has_print === "yes" && (
                              <Badge variant="outline" className="text-xs">
                                С принтом
                              </Badge>
                            )}
                            {item.wardrobe_items.has_details === "yes" && (
                              <Badge variant="outline" className="text-xs">
                                С деталями
                              </Badge>
                            )}
                          </div>

                          {item.wardrobe_items.notes && (
                            <p className="text-xs text-gray-500 mt-2 line-clamp-2">{item.wardrobe_items.notes}</p>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

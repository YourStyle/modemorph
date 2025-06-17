"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, ArrowLeft, Edit, Trash2, Calendar, MapPin, Package } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { CachedWardrobeImage } from "@/components/cached-wardrobe-image"
import { imageCache } from "@/lib/image-cache"
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
    item_type: string
    color: string
    material: string
    style: string
    size_type: string
    shade: string
    has_print: string
    has_details: string
    url: string
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

export default function OutfitDetailPage({ params }: { params: { id: string } }) {
  const [outfit, setOutfit] = useState<Outfit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    fetchOutfit()
  }, [params.id])

  // Предзагружаем изображения когда получаем данные образа
  useEffect(() => {
    if (outfit?.outfit_items) {
      const itemNames = outfit.outfit_items.map((item) => item.wardrobe_items.item_name)
      imageCache.preloadImages(itemNames)
    }
  }, [outfit])

  const fetchOutfit = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/outfits/${params.id}`)
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Образ не найден")
        }
        throw new Error("Failed to fetch outfit")
      }
      const data = await response.json()
      setOutfit(data.outfit)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      console.error("Error fetching outfit:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!outfit) return

    try {
      setDeleting(true)
      const response = await fetch(`/api/outfits?id=${outfit.id}`, {
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

  if (error || !outfit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-600 text-lg font-semibold">{error || "Образ не найден"}</div>
          <Link href="/admin/outfits">
            <Button>Вернуться к образам</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Навигация */}
        <div className="mb-6">
          <Link href="/admin/outfits">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад к образам
            </Button>
          </Link>
        </div>

        {/* Заголовок и действия */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{outfit.name}</h1>
            {outfit.description && <p className="text-gray-600 text-lg">{outfit.description}</p>}
          </div>

          <div className="flex gap-2">
            <Link href={`/admin/wardrobe?edit=${outfit.id}`}>
              <Button variant="outline">
                <Edit className="h-4 w-4 mr-2" />
                Изменить
              </Button>
            </Link>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                  <Trash2 className="h-4 w-4 mr-2" />
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
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700" disabled={deleting}>
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Информация об образе */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Информация об образе</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {outfit.season && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Сезон:</span>
                    <Badge variant="secondary">{getSeasonName(outfit.season)}</Badge>
                  </div>
                )}

                {outfit.occasion && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Повод:</span>
                    <Badge variant="outline">{getOccasionName(outfit.occasion)}</Badge>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-600">Элементов:</span>
                  <span className="font-medium">{outfit.outfit_items.length}</span>
                </div>

                <div className="pt-4 border-t">
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>Создан: {formatDate(outfit.created_at)}</div>
                    {outfit.updated_at !== outfit.created_at && <div>Обновлен: {formatDate(outfit.updated_at)}</div>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Элементы образа */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Элементы образа</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {outfit.outfit_items
                    .sort((a, b) => a.position - b.position)
                    .map((item) => (
                      <div key={item.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex gap-4">
                          {/* Кэшированное изображение */}
                          <div className="w-20 h-20 relative bg-gray-100 rounded-md overflow-hidden flex-shrink-0">
                            <CachedWardrobeImage
                              itemName={item.wardrobe_items.item_name}
                              alt={item.wardrobe_items.item_name}
                              sizes="80px"
                            />
                          </div>

                          {/* Информация */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm mb-2 line-clamp-2">
                              {item.wardrobe_items.item_name.replace(/_/g, " ").replace(/-/g, " ")}
                            </h4>

                            <div className="space-y-1 text-xs text-gray-600">
                              <div className="capitalize">{item.wardrobe_items.item_type}</div>

                              {item.wardrobe_items.color && (
                                <div>
                                  <span className="font-medium">Цвет:</span>{" "}
                                  {item.wardrobe_items.color.replace(/_/g, " ")}
                                </div>
                              )}

                              {item.wardrobe_items.material && item.wardrobe_items.material !== "nan" && (
                                <div>
                                  <span className="font-medium">Материал:</span> {item.wardrobe_items.material}
                                </div>
                              )}

                              {item.wardrobe_items.style && item.wardrobe_items.style !== "nan" && (
                                <div>
                                  <span className="font-medium">Стиль:</span> {item.wardrobe_items.style}
                                </div>
                              )}
                            </div>

                            {/* Ссылка на товар */}
                            {item.wardrobe_items.url && item.wardrobe_items.url !== "nan" && (
                              <a
                                href={item.wardrobe_items.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block mt-2 text-xs text-blue-600 hover:text-blue-800"
                              >
                                Посмотреть товар →
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

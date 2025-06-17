"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, FolderIcon as Hanger, Plus, Edit, Trash2, Eye, Calendar, MapPin } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { OutfitPreviewGrid } from "@/components/outfit-preview-grid"
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

export default function OutfitsPage() {
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchOutfits()
  }, [])

  const fetchOutfits = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/outfits")
      if (!response.ok) {
        throw new Error("Failed to fetch outfits")
      }
      const data = await response.json()
      setOutfits(data.outfits || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      console.error("Error fetching outfits:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (outfitId: number) => {
    try {
      setDeletingId(outfitId)
      const response = await fetch(`/api/outfits?id=${outfitId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete outfit")
      }

      toast({
        title: "Успешно",
        description: "Образ удален",
      })

      // Обновляем список образов
      setOutfits((prev) => prev.filter((outfit) => outfit.id !== outfitId))
    } catch (error) {
      console.error("Error deleting outfit:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось удалить образ",
        variant: "destructive",
      })
    } finally {
      setDeletingId(null)
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
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
          <span className="text-gray-600">Загрузка образов...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-600 text-lg font-semibold">Ошибка загрузки образов</div>
          <p className="text-gray-600">{error}</p>
          <Button onClick={fetchOutfits}>Попробовать снова</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Заголовок */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Hanger className="h-8 w-8 text-gray-700" />
                <h1 className="text-3xl font-bold text-gray-900">Управление образами</h1>
              </div>
              <Link href="/admin/wardrobe">
                <Button className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Создать образ
                </Button>
              </Link>
            </div>
            <p className="text-gray-600">
              Управляйте своими образами: просматривайте, редактируйте и удаляйте сохраненные комплекты одежды
            </p>
          </div>

          {/* Статистика */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <Hanger className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold">{outfits.length}</p>
                    <p className="text-gray-600">Всего образов</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <Calendar className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">{outfits.filter((o) => o.season && o.season !== "all").length}</p>
                    <p className="text-gray-600">Сезонных образов</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <MapPin className="h-8 w-8 text-purple-600" />
                  <div>
                    <p className="text-2xl font-bold">{outfits.filter((o) => o.occasion).length}</p>
                    <p className="text-gray-600">С указанным поводом</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Список образов */}
          {outfits.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Hanger className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">У вас пока нет сохраненных образов</h3>
                <p className="text-gray-600 mb-6">Создайте свой первый образ, выбрав элементы гардероба</p>
                <Link href="/admin/wardrobe">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Создать первый образ
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {outfits.map((outfit) => (
                <Card key={outfit.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-2">{outfit.name}</CardTitle>
                        {outfit.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">{outfit.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Бейджи */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {outfit.season && (
                        <Badge variant="secondary" className="text-xs">
                          {getSeasonName(outfit.season)}
                        </Badge>
                      )}
                      {outfit.occasion && (
                        <Badge variant="outline" className="text-xs">
                          {getOccasionName(outfit.occasion)}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    {/* Превью образа с кэшированными изображениями */}
                    <div className="mb-4">
                      <OutfitPreviewGrid
                        items={outfit.outfit_items.sort((a, b) => a.position - b.position)}
                        maxItems={6}
                      />
                    </div>

                    {/* Информация */}
                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                      <div>Элементов: {outfit.outfit_items.length}</div>
                      <div>Создан: {formatDate(outfit.created_at)}</div>
                      {outfit.updated_at !== outfit.created_at && <div>Обновлен: {formatDate(outfit.updated_at)}</div>}
                    </div>

                    {/* Действия */}
                    <div className="flex gap-2">
                      <Link href={`/admin/outfits/${outfit.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          <Eye className="h-4 w-4 mr-1" />
                          Просмотр
                        </Button>
                      </Link>

                      <Link href={`/admin/wardrobe?edit=${outfit.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          <Edit className="h-4 w-4 mr-1" />
                          Изменить
                        </Button>
                      </Link>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            disabled={deletingId === outfit.id}
                          >
                            {deletingId === outfit.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
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
                            <AlertDialogAction
                              onClick={() => handleDelete(outfit.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Удалить
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

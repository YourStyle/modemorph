"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Edit, Trash2, Package, ExternalLink } from "lucide-react"
import { OutfitPreviewGrid } from "@/components/outfit-preview-grid"
import { useToast } from "@/hooks/use-toast"
import Image from "next/image"
import Link from "next/link"

interface OutfitItem {
  id: number
  position: number
  wardrobe_items: {
    id: number
    item_name: string
    image_url?: string
    color?: string
    shade?: string
    material?: string
    style?: string
    url?: string
    size_type?: string
    has_print?: string
    has_details?: string
    notes?: string
    is_basic: boolean
    basic_item_id?: number | null
    created_at: string
    updated_at: string
    basic_material_id?: number | null
    is_hidden: boolean
    basic_wardrobe_items?: {
      name_ru?: string
      image_url?: string
    }
  }
}

interface Outfit {
  id: number
  name: string
  description?: string
  created_at: string
  outfit_items: OutfitItem[]
}

export default function OutfitDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [outfit, setOutfit] = useState<Outfit | null>(null)
  const [loading, setLoading] = useState(true)
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})

  const outfitId = params.id as string

  useEffect(() => {
    if (outfitId) {
      fetchOutfit()
    }
  }, [outfitId])

  const fetchOutfit = async () => {
    try {
      const response = await fetch(`/api/outfits/${outfitId}`)
      if (response.ok) {
        const data = await response.json()
        setOutfit(data.outfit)
      } else {
        toast({
          title: "Ошибка",
          description: "Не удалось загрузить образ",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error fetching outfit:", error)
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при загрузке образа",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!outfit) return

    if (confirm(`Вы уверены, что хотите удалить образ "${outfit.name}"?`)) {
      try {
        const response = await fetch(`/api/outfits/${outfit.id}`, {
          method: "DELETE",
        })

        if (response.ok) {
          toast({
            title: "Образ удален",
            description: "Образ успешно удален",
          })
          router.push("/admin/outfits")
        } else {
          throw new Error("Failed to delete outfit")
        }
      } catch (error) {
        console.error("Error deleting outfit:", error)
        toast({
          title: "Ошибка",
          description: "Не удалось удалить образ",
          variant: "destructive",
        })
      }
    }
  }

  const handleImageError = (itemId: string) => {
    setImageErrors((prev) => ({ ...prev, [itemId]: true }))
  }

  const getImageSrc = (item: OutfitItem) => {
    if (item.wardrobe_items.image_url) {
      return item.wardrobe_items.image_url
    }
    if (item.wardrobe_items.basic_wardrobe_items?.image_url) {
      return item.wardrobe_items.basic_wardrobe_items.image_url
    }
    return null
  }

  const getItemName = (item: OutfitItem) => {
    return item.wardrobe_items.item_name || item.wardrobe_items.basic_wardrobe_items?.name_ru || "Без названия"
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
            <div className="space-y-4">
              <div className="h-6 bg-gray-200 rounded w-1/4"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-48 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!outfit) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Образ не найден</h1>
          <Link href="/admin/outfits">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Вернуться к образам
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const sortedItems = outfit.outfit_items.sort((a, b) => a.position - b.position)

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/admin/outfits">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Назад
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{outfit.name}</h1>
              <p className="text-gray-500 mt-1">Создан {new Date(outfit.created_at).toLocaleDateString("ru-RU")}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Link href={`/admin/wardrobe?edit=${outfit.id}`}>
              <Button variant="outline">
                <Edit className="h-4 w-4 mr-2" />
                Редактировать
              </Button>
            </Link>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Удалить
            </Button>
          </div>
        </div>

        {/* Outfit Preview */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Превью образа</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-md mx-auto">
              <OutfitPreviewGrid items={sortedItems} />
            </div>
            {outfit.description && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold text-gray-900 mb-2">Описание</h3>
                <p className="text-gray-600">{outfit.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items Details */}
        <Card>
          <CardHeader>
            <CardTitle>Детали образа ({sortedItems.length} элементов)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {sortedItems.map((item, index) => {
                const imageSrc = getImageSrc(item)
                const itemName = getItemName(item)
                const itemKey = `${item.wardrobe_items.id}-${index}`
                const hasImageError = imageErrors[itemKey]

                return (
                  <div key={item.id}>
                    <div className="flex gap-4">
                      {/* Image */}
                      <div className="flex-shrink-0 w-24 h-24 bg-gray-100 rounded-lg overflow-hidden">
                        {imageSrc && !hasImageError ? (
                          <Image
                            src={imageSrc || "/placeholder.svg"}
                            alt={itemName}
                            width={96}
                            height={96}
                            className="w-full h-full object-cover"
                            onError={() => handleImageError(itemKey)}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-8 w-8 text-gray-400" />
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-gray-900">{itemName}</h3>
                            <p className="text-sm text-gray-500">Позиция: {item.position}</p>
                          </div>
                          <Badge variant="outline">#{item.wardrobe_items.id}</Badge>
                        </div>

                        {/* Characteristics */}
                        <div className="flex flex-wrap gap-2">
                          {item.wardrobe_items.color && <Badge variant="secondary">{item.wardrobe_items.color}</Badge>}
                          {item.wardrobe_items.shade && item.wardrobe_items.shade !== item.wardrobe_items.color && (
                            <Badge variant="outline">{item.wardrobe_items.shade}</Badge>
                          )}
                          {item.wardrobe_items.material && (
                            <Badge variant="outline">{item.wardrobe_items.material}</Badge>
                          )}
                          {item.wardrobe_items.style && <Badge variant="outline">{item.wardrobe_items.style}</Badge>}
                          {item.wardrobe_items.size_type && (
                            <Badge variant="outline">Размер: {item.wardrobe_items.size_type}</Badge>
                          )}
                        </div>

                        {/* Additional details */}
                        <div className="text-sm text-gray-600 space-y-1">
                          {item.wardrobe_items.has_print && item.wardrobe_items.has_print !== "false" && (
                            <div>Принт: {item.wardrobe_items.has_print}</div>
                          )}
                          {item.wardrobe_items.has_details && item.wardrobe_items.has_details !== "false" && (
                            <div>Детали: {item.wardrobe_items.has_details}</div>
                          )}
                          {item.wardrobe_items.notes && <div>Заметки: {item.wardrobe_items.notes}</div>}
                        </div>

                        {/* Purchase URL */}
                        {item.wardrobe_items.url && (
                          <div className="pt-2">
                            <a
                              href={item.wardrobe_items.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Ссылка на покупку
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {index < sortedItems.length - 1 && <Separator className="mt-6" />}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

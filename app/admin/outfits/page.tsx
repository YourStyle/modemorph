"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, Eye, Edit, Trash2 } from "lucide-react"
import { OutfitPreviewGrid } from "@/components/outfit-preview-grid"
import { useToast } from "@/hooks/use-toast"
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

export default function OutfitsPage() {
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    fetchOutfits()
  }, [])

  const fetchOutfits = async () => {
    try {
      const response = await fetch("/api/outfits")
      if (response.ok) {
        const data = await response.json()
        setOutfits(data.outfits || [])
      } else {
        toast({
          title: "Ошибка",
          description: "Не удалось загрузить образы",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error fetching outfits:", error)
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при загрузке образов",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (outfitId: number, outfitName: string) => {
    if (confirm(`Вы уверены, что хотите удалить образ "${outfitName}"?`)) {
      try {
        const response = await fetch(`/api/outfits/${outfitId}`, {
          method: "DELETE",
        })

        if (response.ok) {
          setOutfits((prev) => prev.filter((outfit) => outfit.id !== outfitId))
          toast({
            title: "Образ удален",
            description: "Образ успешно удален",
          })
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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">Загрузка образов...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Образы</h1>
            <p className="text-gray-600 mt-1">Управление сохраненными образами ({outfits.length})</p>
          </div>

          <Link href="/admin/wardrobe">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Создать образ
            </Button>
          </Link>
        </div>

        {/* Outfits Grid */}
        {outfits.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Нет сохраненных образов</h3>
            <p className="text-gray-600 mb-4">Создайте первый образ, выбрав вещи из гардероба</p>
            <Link href="/admin/wardrobe">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Создать образ
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {outfits.map((outfit) => {
              const sortedItems = outfit.outfit_items.sort((a, b) => a.position - b.position)

              return (
                <Card key={outfit.id} className="group hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{outfit.name}</CardTitle>
                        <p className="text-sm text-gray-500 mt-1">
                          {sortedItems.length}{" "}
                          {sortedItems.length === 1 ? "элемент" : sortedItems.length < 5 ? "элемента" : "элементов"}
                        </p>
                      </div>
                      <Badge variant="outline" className="ml-2">
                        #{outfit.id}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Outfit Preview */}
                    <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden">
                      <OutfitPreviewGrid items={sortedItems} />
                    </div>

                    {/* Description */}
                    {outfit.description && <p className="text-sm text-gray-600 line-clamp-2">{outfit.description}</p>}

                    {/* Metadata */}
                    <div className="text-xs text-gray-500">
                      Создан {new Date(outfit.created_at).toLocaleDateString("ru-RU")}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Link href={`/admin/outfits/${outfit.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full bg-transparent">
                          <Eye className="h-4 w-4 mr-2" />
                          Просмотр
                        </Button>
                      </Link>
                      <Link href={`/admin/wardrobe?edit=${outfit.id}`}>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(outfit.id, outfit.name)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

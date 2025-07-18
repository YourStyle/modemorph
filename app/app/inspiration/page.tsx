"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Heart, Bookmark, Users, Sparkles, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface OutfitItem {
  id: string
  name: string
  image_url: string
  color: string
  shade: string
  style: string
  material: string
  is_basic: boolean
  basic_item_id?: number
}

interface InspirationOutfit {
  id: string
  title: string
  description: string
  items: OutfitItem[]
  tags: string[]
  likes: number
  isLiked: boolean
}

const InspirationSkeleton = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i} className="bg-white border-0 shadow-sm overflow-hidden">
          <div className="aspect-[4/5] bg-gray-200 animate-pulse"></div>
          <CardContent className="p-4 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-3/4 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
            <div className="flex gap-2">
              <div className="h-6 bg-gray-200 rounded-full w-16 animate-pulse"></div>
              <div className="h-6 bg-gray-200 rounded-full w-20 animate-pulse"></div>
            </div>
            <div className="flex justify-between items-center">
              <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
              <div className="h-8 bg-gray-200 rounded w-20 animate-pulse"></div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function InspirationPage() {
  const [outfits, setOutfits] = useState<InspirationOutfit[]>([])
  const [loading, setLoading] = useState(true)
  const [savingOutfitId, setSavingOutfitId] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [selectedOutfit, setSelectedOutfit] = useState<InspirationOutfit | null>(null)
  const [lookName, setLookName] = useState("")
  const { toast } = useToast()

  useEffect(() => {
    fetchOutfits()
  }, [])

  const fetchOutfits = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/outfits/inspiration")

      if (response.ok) {
        const data = await response.json()
        setOutfits(data)
      } else {
        console.error("Failed to fetch outfits:", response.statusText)
        toast({
          title: "Ошибка загрузки",
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

  const handleSaveOutfit = (outfit: InspirationOutfit) => {
    setSelectedOutfit(outfit)
    setLookName(outfit.title)
    setSaveDialogOpen(true)
  }

  const confirmSaveOutfit = async () => {
    if (!selectedOutfit) return

    try {
      setSavingOutfitId(selectedOutfit.id)

      const response = await fetch("/api/outfits/save-as-look", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outfitId: selectedOutfit.id,
          lookName: lookName.trim() || selectedOutfit.title,
        }),
      })

      if (response.ok) {
        toast({
          title: "Образ сохранен!",
          description: `"${lookName || selectedOutfit.title}" добавлен в ваши образы`,
        })
        setSaveDialogOpen(false)
        setLookName("")
        setSelectedOutfit(null)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to save outfit")
      }
    } catch (error) {
      console.error("Error saving outfit:", error)
      toast({
        title: "Ошибка сохранения",
        description: error instanceof Error ? error.message : "Не удалось сохранить образ",
        variant: "destructive",
      })
    } finally {
      setSavingOutfitId(null)
    }
  }

  const toggleLike = (outfitId: string) => {
    setOutfits((prev) =>
      prev.map((outfit) =>
        outfit.id === outfitId
          ? {
              ...outfit,
              isLiked: !outfit.isLiked,
              likes: outfit.isLiked ? outfit.likes - 1 : outfit.likes + 1,
            }
          : outfit,
      ),
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="px-4 py-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-serif font-bold text-gray-900 mb-2">Вдохновение</h1>
          <p className="text-gray-600 text-sm">Откройте для себя стильные образы</p>
        </div>

        {/* Content */}
        {loading ? (
          <InspirationSkeleton />
        ) : outfits.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Пока нет образов</h3>
            <p className="text-gray-500">Образы для вдохновения появятся здесь</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {outfits.map((outfit) => (
              <Card
                key={outfit.id}
                className="bg-white border-0 shadow-sm overflow-hidden group hover:shadow-md transition-shadow"
              >
                {/* Outfit Preview */}
                <div className="aspect-[4/5] bg-gray-100 relative overflow-hidden">
                  {outfit.items.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1 p-2 h-full">
                      {outfit.items.slice(0, 4).map((item, index) => (
                        <div key={item.id} className="bg-white rounded-lg overflow-hidden shadow-sm">
                          {item.image_url ? (
                            <img
                              src={item.image_url || "/placeholder.svg"}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                              <span className="text-2xl">👕</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <span className="text-4xl">👗</span>
                    </div>
                  )}

                  {/* Items count badge */}
                  <Badge className="absolute top-3 right-3 bg-black/70 text-white">
                    {outfit.items.length}{" "}
                    {outfit.items.length === 1 ? "вещь" : outfit.items.length < 5 ? "вещи" : "вещей"}
                  </Badge>
                </div>

                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Title */}
                    <h3 className="font-semibold text-gray-900 line-clamp-2">{outfit.title}</h3>

                    {/* Description */}
                    {outfit.description && <p className="text-sm text-gray-600 line-clamp-2">{outfit.description}</p>}

                    {/* Tags */}
                    {outfit.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {outfit.tags.slice(0, 3).map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {outfit.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{outfit.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleLike(outfit.id)}
                          className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-500 transition-colors"
                        >
                          <Heart className={`h-4 w-4 ${outfit.isLiked ? "fill-red-500 text-red-500" : ""}`} />
                          <span>{outfit.likes}</span>
                        </button>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Users className="h-4 w-4" />
                          <span>{Math.floor(Math.random() * 50) + 10}</span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleSaveOutfit(outfit)}
                        disabled={savingOutfitId === outfit.id}
                        className="bg-gray-900 hover:bg-gray-800 text-white"
                      >
                        {savingOutfitId === outfit.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Bookmark className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сохранить образ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="lookName">Название образа</Label>
              <Input
                id="lookName"
                value={lookName}
                onChange={(e) => setLookName(e.target.value)}
                placeholder="Введите название..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={confirmSaveOutfit} disabled={savingOutfitId !== null}>
                {savingOutfitId ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Сохранение...
                  </>
                ) : (
                  "Сохранить"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

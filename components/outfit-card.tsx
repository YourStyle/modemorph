"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Heart, Sparkles, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface OutfitItem {
  id: string
  name: string
  color?: string
  material?: string
  style_description?: string
  image_url: string
}

interface OutfitCardProps {
  id: string
  title: string
  description?: string
  image_url: string
  items?: OutfitItem[]
  likes_count?: number
  is_liked?: boolean
  tags?: string[]
  onLike?: (id: string) => void
  onSave?: (id: string) => void
}

export function OutfitCard({
  id,
  title,
  description,
  image_url,
  items = [],
  likes_count = 0,
  is_liked = false,
  tags = [],
  onLike,
  onSave,
}: OutfitCardProps) {
  const [liked, setLiked] = useState(is_liked)
  const [likesCount, setLikesCount] = useState(likes_count)
  const [isVtonLoading, setIsVtonLoading] = useState(false)
  const [vtonResult, setVtonResult] = useState<any>(null)
  const [showVtonDialog, setShowVtonDialog] = useState(false)

  const handleLike = async () => {
    try {
      const response = await fetch("/api/outfits/like", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ outfit_id: id }),
      })

      if (response.ok) {
        const newLiked = !liked
        setLiked(newLiked)
        setLikesCount((prev) => (newLiked ? prev + 1 : prev - 1))
        onLike?.(id)
      }
    } catch (error) {
      console.error("Error liking outfit:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось поставить лайк",
        variant: "destructive",
      })
    }
  }

  const handleVirtualTryOn = async () => {
    setIsVtonLoading(true)
    try {
      const response = await fetch("/api/vton", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outfit_id: id,
          items: items,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setVtonResult(data.result)
        setShowVtonDialog(true)
        toast({
          title: "Успешно",
          description: "Виртуальная примерка завершена",
        })
      } else {
        throw new Error(data.error || "Virtual try-on failed")
      }
    } catch (error) {
      console.error("Error with virtual try-on:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось выполнить виртуальную примерку",
        variant: "destructive",
      })
    } finally {
      setIsVtonLoading(false)
    }
  }

  const handleSave = () => {
    onSave?.(id)
    toast({
      title: "Сохранено",
      description: "Образ добавлен в избранное",
    })
  }

  return (
    <>
      <Card className="group overflow-hidden hover:shadow-lg transition-shadow duration-300">
        <div className="relative aspect-[3/4] overflow-hidden">
          <img
            src={image_url || "/placeholder.svg?height=400&width=300"}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />

          {/* Action buttons overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleVirtualTryOn}
                disabled={isVtonLoading}
                className="bg-white/90 hover:bg-white text-black"
              >
                {isVtonLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {isVtonLoading ? "Примеряем..." : "Примерить"}
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-lg line-clamp-1">{title}</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLike}
              className={`p-1 ${liked ? "text-red-500" : "text-gray-400"}`}
            >
              <Heart className={`h-5 w-5 ${liked ? "fill-current" : ""}`} />
              <span className="ml-1 text-sm">{likesCount}</span>
            </Button>
          </div>

          {description && <p className="text-sm text-gray-600 mb-3 line-clamp-2">{description}</p>}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {tags.slice(0, 3).map((tag, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{tags.length - 3}
                </Badge>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSave} className="flex-1 bg-transparent">
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Virtual Try-On Result Dialog */}
      <Dialog open={showVtonDialog} onOpenChange={setShowVtonDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Результат виртуальной примерки</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {vtonResult && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Исходное фото</h4>
                  <img
                    src={vtonResult.original_avatar || "/placeholder.svg"}
                    alt="Original avatar"
                    className="w-full rounded-lg"
                  />
                </div>
                <div>
                  <h4 className="font-medium mb-2">С примеркой</h4>
                  <img
                    src={vtonResult.result_image || "/placeholder.svg"}
                    alt="Virtual try-on result"
                    className="w-full rounded-lg"
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowVtonDialog(false)}>
                Закрыть
              </Button>
              {vtonResult?.result_image && (
                <Button onClick={() => window.open(vtonResult.result_image, "_blank")}>Скачать результат</Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

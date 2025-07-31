"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Heart, Eye, Shirt, Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface OutfitItem {
  id: string
  wardrobe_items: {
    id: string
    name: string
    image_url: string
    color?: string
    material?: string
    description?: string
  }
}

interface Outfit {
  id: string
  name: string
  description?: string
  style?: string
  occasion?: string
  season?: string
  image_url?: string
  likes_count?: number
  is_liked?: boolean
  outfit_items?: OutfitItem[]
}

interface OutfitCardProps {
  outfit: Outfit
  onLike?: (outfitId: string) => void
  onView?: (outfit: Outfit) => void
}

export function OutfitCard({ outfit, onLike, onView }: OutfitCardProps) {
  const [isLiked, setIsLiked] = useState(outfit.is_liked || false)
  const [likesCount, setLikesCount] = useState(outfit.likes_count || 0)
  const [showVtonResult, setShowVtonResult] = useState(false)
  const [vtonResult, setVtonResult] = useState<any>(null)
  const [isVtonLoading, setIsVtonLoading] = useState(false)

  const handleLike = async () => {
    try {
      const response = await fetch("/api/outfits/like", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outfit_id: outfit.id,
          liked: !isLiked,
        }),
      })

      if (response.ok) {
        setIsLiked(!isLiked)
        setLikesCount((prev) => (isLiked ? prev - 1 : prev + 1))
        onLike?.(outfit.id)
      }
    } catch (error) {
      console.error("Error liking outfit:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось обновить лайк",
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
          outfit_id: outfit.id,
        }),
      })

      if (response.ok) {
        const result = await response.json()
        setVtonResult(result.result)
        setShowVtonResult(true)
      } else {
        const error = await response.json()
        toast({
          title: "Ошибка",
          description: error.error || "Не удалось выполнить виртуальную примерку",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error with virtual try-on:", error)
      toast({
        title: "Ошибка",
        description: "Сервис виртуальной примерки временно недоступен",
        variant: "destructive",
      })
    } finally {
      setIsVtonLoading(false)
    }
  }

  return (
    <>
      <Card className="group hover:shadow-lg transition-shadow duration-200">
        <CardContent className="p-0">
          {/* Image */}
          <div className="relative aspect-[3/4] overflow-hidden rounded-t-lg">
            <img
              src={outfit.image_url || "/placeholder.svg?height=400&width=300"}
              alt={outfit.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />

            {/* Overlay with actions */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onView?.(outfit)}
                  className="bg-white/90 hover:bg-white"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Просмотр
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleVirtualTryOn}
                  disabled={isVtonLoading}
                  className="bg-white/90 hover:bg-white"
                >
                  {isVtonLoading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Shirt className="h-4 w-4 mr-1" />
                  )}
                  {isVtonLoading ? "Примерка..." : "Примерить"}
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-lg line-clamp-1">{outfit.name}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLike}
                className={`p-1 ${isLiked ? "text-red-500" : "text-gray-400"}`}
              >
                <Heart className={`h-5 w-5 ${isLiked ? "fill-current" : ""}`} />
              </Button>
            </div>

            {outfit.description && <p className="text-sm text-gray-600 mb-3 line-clamp-2">{outfit.description}</p>}

            {/* Tags */}
            <div className="flex flex-wrap gap-1 mb-3">
              {outfit.style && (
                <Badge variant="secondary" className="text-xs">
                  {outfit.style}
                </Badge>
              )}
              {outfit.occasion && (
                <Badge variant="outline" className="text-xs">
                  {outfit.occasion}
                </Badge>
              )}
              {outfit.season && (
                <Badge variant="outline" className="text-xs">
                  {outfit.season}
                </Badge>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{likesCount} лайков</span>
              {outfit.outfit_items && <span>{outfit.outfit_items.length} вещей</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Virtual Try-On Result Modal */}
      <Dialog open={showVtonResult} onOpenChange={setShowVtonResult}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Результат виртуальной примерки</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {vtonResult && (
              <div className="text-center">
                {vtonResult.image_url ? (
                  <img
                    src={vtonResult.image_url || "/placeholder.svg"}
                    alt="Virtual try-on result"
                    className="max-w-full h-auto rounded-lg mx-auto"
                  />
                ) : (
                  <div className="p-8 text-gray-500">
                    <p>Результат виртуальной примерки</p>
                    <pre className="mt-4 text-xs bg-gray-100 p-4 rounded overflow-auto">
                      {JSON.stringify(vtonResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

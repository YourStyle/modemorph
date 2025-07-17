"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Bookmark, BookmarkCheck, Sparkles, User, Clock } from "lucide-react"
import { toast } from "sonner"

interface OutfitItem {
  id: string
  name: string
  image_url: string
  color: string
  shade: string
  has_print: string
  notes?: string
  user_id?: string
}

interface OutfitSuggestion {
  id: string
  title: string
  items: OutfitItem[]
  suggested_items_count: number
}

interface OutfitCardProps {
  suggestion: OutfitSuggestion
}

export function OutfitCard({ suggestion }: OutfitCardProps) {
  const [isSaved, setIsSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showTryOnModal, setShowTryOnModal] = useState(false)
  const [userLooks, setUserLooks] = useState<any[]>([])

  useEffect(() => {
    loadUserLooks()
  }, [])

  const loadUserLooks = async () => {
    try {
      const response = await fetch("/api/user-looks")
      if (response.ok) {
        const looks = await response.json()
        setUserLooks(looks)

        // Check if this outfit is already saved
        const isAlreadySaved = looks.some(
          (look: any) =>
            look.name === suggestion.title ||
            (look.items &&
              look.items.length === suggestion.items.length &&
              look.items.every((item: any) => suggestion.items.some((suggItem) => suggItem.id === item.id.toString()))),
        )
        setIsSaved(isAlreadySaved)
      }
    } catch (error) {
      console.error("Error loading user looks:", error)
    }
  }

  const handleSaveOutfit = async () => {
    setSaving(true)
    try {
      // Transform items to the format expected by the API
      const items = suggestion.items.map((item) => ({
        type: item.user_id ? "user" : "basic",
        id: Number.parseInt(item.id),
      }))

      const response = await fetch("/api/user-looks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: suggestion.title,
          description: `Рекомендованный образ с ${suggestion.suggested_items_count} предложенными вещами`,
          items,
        }),
      })

      if (response.ok) {
        setIsSaved(true)
        toast.success("Образ сохранен в вашу коллекцию!")
      } else {
        throw new Error("Failed to save outfit")
      }
    } catch (error) {
      console.error("Error saving outfit:", error)
      toast.error("Ошибка сохранения образа")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Card className="bg-white border-0 shadow-sm overflow-hidden w-96">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2 text-lg">{suggestion.title}</h3>
              {suggestion.suggested_items_count > 0 && (
                <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
                  <Sparkles className="w-3 h-3 mr-1" />
                  {suggestion.suggested_items_count} рекомендаций
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
              disabled={saving || isSaved}
            >
              {isSaved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
            </Button>
          </div>

          {/* Items Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {suggestion.items.slice(0, 4).map((item, index) => (
              <div key={`${item.id}-${index}`} className="relative">
                <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden">
                  <img
                    src={item.image_url || "/placeholder.svg"}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Item overlay with info */}
                <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors rounded-lg flex items-end p-2">
                  <div className="bg-white/90 backdrop-blur-sm rounded px-2 py-1 opacity-0 hover:opacity-100 transition-opacity">
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-xs text-gray-600">{item.color}</p>
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
            ))}
          </div>

          {/* Show more items indicator */}
          {suggestion.items.length > 4 && (
            <div className="mb-4 text-center">
              <p className="text-sm text-gray-500">
                +{suggestion.items.length - 4} еще {suggestion.items.length - 4 === 1 ? "вещь" : "вещей"}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-gray-700 border-gray-200 bg-transparent"
              onClick={() => setShowTryOnModal(true)}
            >
              Примерить
            </Button>
 
          </div>
        </CardContent>
      </Card>

      {/* Try On Modal */}
      <Dialog open={showTryOnModal} onOpenChange={setShowTryOnModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              Скоро будет доступно
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <p className="text-gray-600 mb-4">
              Совсем скор�� вы сможете сразу на себе примерять образы, но нужно чуть-чуть подождать.
            </p>
            <div className="flex justify-center">
              <div className="animate-pulse flex space-x-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animation-delay-200"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animation-delay-400"></div>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setShowTryOnModal(false)}>Понятно</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

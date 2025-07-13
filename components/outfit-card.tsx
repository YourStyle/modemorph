"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bookmark, BookmarkCheck, Sparkles } from "lucide-react"
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
    <Card className="bg-white border-0 shadow-sm overflow-hidden">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-2">{suggestion.title}</h3>
            {suggestion.suggested_items_count > 0 && (
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                <Sparkles className="w-3 h-3 mr-1" />
                {suggestion.suggested_items_count} рекомендаций
              </Badge>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className={`p-2 ${isSaved ? "text-blue-600" : "text-gray-400 hover:text-blue-600"}`}
            onClick={handleSaveOutfit}
            disabled={saving || isSaved}
          >
            {isSaved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
          </Button>
        </div>

        {/* Items Grid */}
        <div className="grid grid-cols-2 gap-3">
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

              {/* Suggested item indicator */}
              {!item.user_id && (
                <div className="absolute top-2 right-2">
                  <Badge className="bg-blue-500 text-white text-xs px-1.5 py-0.5">
                    <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                    Новое
                  </Badge>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Show more items indicator */}
        {suggestion.items.length > 4 && (
          <div className="mt-3 text-center">
            <p className="text-sm text-gray-500">
              +{suggestion.items.length - 4} еще {suggestion.items.length - 4 === 1 ? "вещь" : "вещей"}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-gray-700 border-gray-200 bg-transparent">
            Примерить
          </Button>
          <Button size="sm" className="flex-1 bg-gray-900 hover:bg-gray-800 text-white">
            Подробнее
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

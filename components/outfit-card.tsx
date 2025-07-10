"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ThumbsDown, Bookmark, User } from "lucide-react"
import Image from "next/image"

interface OutfitItem {
  id: string
  name: string
  image_url: string
  category: string
}

interface OutfitSuggestion {
  id: string
  title: string
  items: OutfitItem[]
  suggested_items_count: number
  source?: string
}

interface OutfitCardProps {
  suggestion: OutfitSuggestion
}

export function OutfitCard({ suggestion }: OutfitCardProps) {
  return (
    <Card className="bg-gray-100 border-0 overflow-hidden">
      <CardContent className="p-6">
        {/* Outfit Items Grid */}
        <div className="grid grid-cols-3 gap-4 min-h-[300px] mb-6">
          {suggestion.items.map((item, index) => (
            <div
              key={item.id}
              className={`flex items-center justify-center ${
                suggestion.items.length === 1
                  ? "col-span-3"
                  : suggestion.items.length === 2 && index === 0
                    ? "col-span-2"
                    : suggestion.items.length === 3 && index === 0
                      ? "col-span-3"
                      : suggestion.items.length === 4 && index < 2
                        ? "col-span-3"
                        : suggestion.items.length === 5 && index === 0
                          ? "col-span-3"
                          : ""
              }`}
            >
              <div className="relative w-full h-full max-w-[120px] max-h-[120px]">
                <Image
                  src={item.image_url || "/placeholder.svg"}
                  alt={item.name}
                  fill
                  className="object-contain"
                  sizes="120px"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Suggestion Info */}
        <div className="text-center mb-4">
          <p className="text-sm text-gray-600">
            {suggestion.suggested_items_count} предмет
            {suggestion.suggested_items_count === 1 ? "" : suggestion.suggested_items_count < 5 ? "а" : "ов"} предложен
            {suggestion.suggested_items_count === 1 ? "" : "о"}
          </p>
          {suggestion.source && <p className="text-xs text-gray-500 mt-1">{suggestion.source}</p>}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-4">
          <Button variant="ghost" size="sm" className="p-2 hover:bg-gray-200">
            <ThumbsDown className="w-5 h-5 text-gray-600" />
          </Button>

          <Button variant="default" size="sm" className="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800">
            <User className="w-4 h-4 mr-2" />
            Avatar
          </Button>

          <Button variant="ghost" size="sm" className="p-2 hover:bg-gray-200">
            <Bookmark className="w-5 h-5 text-gray-600" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

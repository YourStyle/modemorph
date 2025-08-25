"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Plus, ExternalLink, Loader2 } from "lucide-react"

type OutfitItem = {
  id: string
  name: string
  image_url: string
  color?: string | null
  shade?: string | null
  style?: string | null
  material?: string | null
  url?: string | null
  size_type?: string | null
  has_print?: string | null
  has_details?: string | null
  notes?: string | null
  is_basic?: boolean
  basic_item_id?: number | null
  user_id?: string | null
}

interface OutfitItemsSheetProps {
  isOpen: boolean
  onClose: () => void
  items: OutfitItem[]
  outfitTitle?: string
}

export function OutfitItemsSheet({ isOpen, onClose, items, outfitTitle }: OutfitItemsSheetProps) {
  const [addingItems, setAddingItems] = useState<Set<string>>(new Set())

  const handleAddToWardrobe = async (item: OutfitItem) => {
    if (addingItems.has(item.id)) return

    setAddingItems((prev) => new Set([...prev, item.id]))

    try {
      const response = await fetch("/api/wardrobe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: item.name,
          image_url: item.image_url,
          color: item.color,
          shade: item.shade,
          style: item.style,
          material: item.material,
          url: item.url,
          size_type: item.size_type,
          has_print: item.has_print === "true",
          has_details: item.has_details === "true",
          notes: item.notes,
          is_basic: item.is_basic,
          basic_item_id: item.basic_item_id,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to add item to wardrobe")
      }

      // Show success feedback (you could add a toast here)
      console.log("Item added to wardrobe successfully")
    } catch (error) {
      console.error("Error adding item to wardrobe:", error)
    } finally {
      setAddingItems((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[80vh] bg-neutral-900 border-neutral-800 text-white z-[6000]">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-white">{outfitTitle ? `Вещи из "${outfitTitle}"` : "Вещи из образа"}</SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-4 overflow-y-auto max-h-[calc(80vh-120px)] pb-safe">
          {items.map((item) => (
            <div key={item.id} className="bg-neutral-800 rounded-xl overflow-hidden border border-neutral-700">
              <div className="aspect-square relative">
                {item.image_url ? (
                  <Image
                    src={item.image_url || "/placeholder.svg"}
                    alt={item.name || "Вещь"}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                ) : (
                  <div className="w-full h-full bg-neutral-700 flex items-center justify-center">
                    <span className="text-neutral-500 text-sm">Нет фото</span>
                  </div>
                )}
              </div>

              <div className="p-3 space-y-3">
                <h3 className="font-medium text-sm line-clamp-2">{item.name}</h3>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleAddToWardrobe(item)}
                    disabled={addingItems.has(item.id)}
                    className="flex-1 bg-white text-black hover:bg-neutral-200 h-8 text-xs"
                  >
                    {addingItems.has(item.id) ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-3 h-3 mr-1" />В гардероб
                      </>
                    )}
                  </Button>

                  {item.url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(item.url!, "_blank")}
                      className="flex-1 h-8 text-xs border-neutral-600 hover:bg-neutral-700 text-white"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />В магазине
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

"use client"

import Image from "next/image"
import { useMemo, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bookmark, BookmarkCheck, Heart, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

export interface FeedOutfitItem {
  id: string
  name: string
  image_url: string
  color?: string
  shade?: string
  style?: string
  material?: string
  url?: string
  size_type?: string
  has_print?: string
  has_details?: string
  notes?: string
  is_basic?: boolean
  basic_item_id?: number | null
  user_id?: string | null
}

export interface FeedOutfit {
  id: string
  title: string
  description?: string
  items: FeedOutfitItem[]
  tags: string[]
  likes: number
  isLiked: boolean
  isSaved?: boolean
  preview_image_url?: string
}

interface Props {
  outfit: FeedOutfit
  onSave?: (outfitId: string) => void
  onLike?: (outfitId: string, action: "like" | "unlike") => void
}

export default function InspirationFeedItem({ outfit, onSave, onLike }: Props) {
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(!!outfit.isSaved)
  const [likes, setLikes] = useState(outfit.likes ?? 0)
  const [isLiked, setIsLiked] = useState(!!outfit.isLiked)
  const [isLiking, setIsLiking] = useState(false)

  const preview = useMemo(() => {
    return outfit.preview_image_url || outfit.items?.[0]?.image_url || "/placeholder.svg?height=1200&width=900"
  }, [outfit.preview_image_url, outfit.items])

  async function handleSave() {
    if (isSaving || isSaved) return
    setIsSaving(true)
    try {
      // Preferred: existing route that saves outfit into user_looks
      let res = await fetch("/api/outfits/save-to-looks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfitId: outfit.id }),
      })

      if (!res.ok) {
        // Fallback: directly create in /api/user-looks
        res = await fetch("/api/user-looks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: outfit.title,
            original_outfit_id: outfit.id,
            items: outfit.items,
          }),
        })
        if (!res.ok) throw new Error("Failed to save outfit")
      }

      setIsSaved(true)
      onSave?.(outfit.id)
      toast.success("Образ сохранён в ваши образы")
    } catch (e) {
      console.error(e)
      toast.error("Не удалось сохранить образ")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleLike() {
    if (isLiking) return
    setIsLiking(true)
    try {
      const action = isLiked ? "unlike" : "like"
      const res = await fetch("/api/outfits/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfitId: outfit.id, action }),
      })
      if (!res.ok) throw new Error("Failed to like")
      setIsLiked(!isLiked)
      setLikes((v) => (action === "like" ? v + 1 : Math.max(0, v - 1)))
      onLike?.(outfit.id, action)
    } catch (e) {
      console.error(e)
      toast.error("Не удалось обновить лайк")
    } finally {
      setIsLiking(false)
    }
  }

  const visibleItems = (outfit.items ?? []).slice(0, 5)
  const remaining = Math.max(0, (outfit.items ?? []).length - visibleItems.length)

  return (
    <section className="relative w-full">
      {/* Media container */}
      <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-900">
        <Image
          src={preview || "/placeholder.svg"}
          alt={outfit.title || "Образ"}
          fill
          priority={false}
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
        />

        {/* Items vertical rail (left) */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-3">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="relative w-12 h-12 rounded-xl overflow-hidden ring-1 ring-white/10 bg-neutral-800"
            >
              {item.image_url ? (
                <Image
                  src={item.image_url || "/placeholder.svg"}
                  alt={item.name || "Вещь"}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-neutral-700" />
              )}
            </div>
          ))}

          {/* If more items, show Sheet trigger */}
          {remaining > 0 && (
            <Sheet>
              <SheetTrigger asChild>
                <button
                  className="w-12 h-12 rounded-xl bg-white/10 text-white flex items-center justify-center ring-1 ring-white/10 hover:bg-white/20 transition"
                  aria-label="Показать все вещи"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[70vh] bg-neutral-950 text-white">
                <SheetHeader>
                  <SheetTitle>Все вещи из образа</SheetTitle>
                </SheetHeader>
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {(outfit.items ?? []).map((item) => (
                    <div key={item.id} className="space-y-2">
                      <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-neutral-800">
                        {item.image_url ? (
                          <Image
                            src={item.image_url || "/placeholder.svg"}
                            alt={item.name || "Вещь"}
                            fill
                            sizes="200px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-neutral-700" />
                        )}
                      </div>
                      <div className="text-xs text-neutral-300 line-clamp-2">{item.name}</div>
                    </div>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>

        {/* Title and tags (top-left) */}
        <div className="absolute top-3 left-3 right-3 flex flex-col gap-2">
          {outfit.title && (
            <div className="inline-flex items-center gap-2">
              <Badge variant="secondary" className="bg-white/90 text-black hover:bg-white">
                {outfit.title}
              </Badge>
            </div>
          )}
        </div>

        {/* Actions (bottom-left) */}
        <div className="absolute bottom-3 left-3 flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={isSaving || isSaved}
            className="bg-white text-black hover:bg-neutral-200 h-10 px-4 rounded-full"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : isSaved ? (
              <BookmarkCheck className="w-4 h-4 mr-2" />
            ) : (
              <Bookmark className="w-4 h-4 mr-2" />
            )}
            {isSaved ? "Сохранено" : "Сохранить"}
          </Button>

          <Button
            variant="secondary"
            onClick={handleLike}
            disabled={isLiking}
            className="bg-white/10 text-white hover:bg-white/20 h-10 px-4 rounded-full"
          >
            {isLiking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Heart className="w-4 h-4 mr-2" />}
            <span className={isLiked ? "text-red-400" : ""}>{likes}</span>
          </Button>
        </div>
      </div>
    </section>
  )
}

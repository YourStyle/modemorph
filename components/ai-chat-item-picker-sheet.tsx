"use client"

import { useEffect, useState } from "react"
import { CommonSheet } from "@/components/common-sheet"
import { Package, Search } from "lucide-react"
import { api } from "@/lib/api-client"

export interface AttachableWardrobeItem {
  id: number
  item_name: string
  color?: string | null
  image_url?: string | null
}

interface AiChatItemPickerSheetProps {
  isOpen: boolean
  onClose: () => void
  onPick: (item: AttachableWardrobeItem) => void
}

/**
 * Lightweight single-pick wardrobe grid for "спросить про конкретную вещь"
 * (attach an item to the question). Deliberately not UserWardrobeGrid — that
 * component owns edit/delete/category-filter UI meant for the wardrobe
 * screen; this only needs "tap an item, get it back".
 */
export function AiChatItemPickerSheet({ isOpen, onClose, onPick }: AiChatItemPickerSheetProps) {
  const [items, setItems] = useState<AttachableWardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    api
      .get("/api/wardrobe-user-items")
      .then((data) => {
        if (cancelled) return
        setItems(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  const filtered = query.trim()
    ? items.filter((i) => i.item_name?.toLowerCase().includes(query.trim().toLowerCase()))
    : items

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Выберите вещь" backgroundColor="white" swipeAction="close">
      <div className="flex flex-col gap-3 pb-6">
        <div className="flex items-center gap-2 rounded-full border border-line bg-canvas-sunk px-3.5 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по гардеробу"
            className="w-full bg-transparent text-body text-ink placeholder:text-ink-3 focus:outline-none"
          />
        </div>

        {loading && (
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton aspect-square rounded-xl" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-canvas-sunk px-4 py-10 text-center">
            <Package className="h-6 w-6 text-ink-3" strokeWidth={1.75} />
            <p className="text-body font-semibold text-ink">Ничего не нашлось</p>
            <p className="text-caption text-ink-2">Добавьте вещи в гардероб, чтобы спрашивать о них ассистента.</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onPick(item)
                  onClose()
                }}
                className="group flex flex-col gap-1.5 text-left transition-transform duration-press active:scale-95"
              >
                <div className="aspect-square overflow-hidden rounded-xl bg-canvas-sunk">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.item_name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).src = "/placeholder.svg?height=150&width=150"
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-5 w-5 text-ink-3" strokeWidth={1.75} />
                    </div>
                  )}
                </div>
                <p className="truncate text-[11px] text-ink-2">{item.item_name}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </CommonSheet>
  )
}

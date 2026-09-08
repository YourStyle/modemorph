"use client"

import { useEffect, useState } from "react"
import { CommonSheet } from "./common-sheet"
import { api } from "@/lib/api-client"
import { toast } from "sonner"
import { X, EyeOff } from "lucide-react"

interface DislikedItem {
  item_id: number
  item_source: string
  item_name?: string
  image_url?: string
}

interface HiddenItemsSheetProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Вещи, скрытые из рекомендаций.
 *
 * Дизлайк ставился только в одну сторону: POST /api/items/dislike вызывался с
 * главной, а DELETE и GET не вызывались ниоткуда. Человек, скрывший вещь по
 * ошибке, не увидел бы её больше никогда.
 */
export function HiddenItemsSheet({ isOpen, onClose }: HiddenItemsSheetProps) {
  const [items, setItems] = useState<DislikedItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    void load()
    // База — 6 постановок дизлайка за 90 дней. Без события открытия у фичи не
    // будет вообще никакого сигнала, снимут её или нет.
    void api.post("/api/usage/log", { feature: "item_dislike", action: "screen_view" })
  }, [isOpen])

  const load = async () => {
    setLoading(true)
    try {
      setItems(await api.get("/api/items/dislikes"))
    } catch (error) {
      console.error("Error loading hidden items:", error)
      toast.error("Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (item: DislikedItem) => {
    const prev = items
    setItems((all) => all.filter((i) => !(i.item_id === item.item_id && i.item_source === item.item_source)))
    try {
      // api.delete прокидывает options в request, а тот сериализует body для
      // любого метода кроме GET — отдельный клиент под DELETE-с-телом не нужен.
      await api.delete("/api/items/dislike", {
        body: { item_id: item.item_id, item_source: item.item_source },
      })
      void api.post("/api/usage/log", {
        feature: "item_dislike",
        action: "undo",
        meta: { item_source: item.item_source },
      })
      toast.success("Вещь вернётся в рекомендации")
    } catch (error) {
      console.error("Error restoring item:", error)
      setItems(prev)
      toast.error("Не получилось вернуть вещь")
    }
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Скрытые из рекомендаций">
      <div className="pb-8">
        {loading && <div className="skeleton h-24 w-full rounded-xl" />}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <EyeOff className="h-6 w-6 text-ink-3" />
            <p className="text-body text-ink-2">Пока ничего не скрыто</p>
            <p className="text-caption text-ink-3">
              Скрытые вещи не появляются в подборках. Вернуть их можно здесь.
            </p>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {items.map((item) => (
              <div
                key={`${item.item_source}-${item.item_id}`}
                className="relative rounded-xl overflow-hidden bg-canvas-sunk ring-1 ring-inset ring-line"
              >
                <div className="aspect-square flex items-center justify-center p-2">
                  <img
                    src={item.image_url || "/placeholder.svg"}
                    alt={item.item_name || "Вещь"}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).src = "/placeholder.svg"
                    }}
                  />
                </div>
                <p className="px-2 pb-2 text-micro text-ink-2 truncate">{item.item_name || "Вещь"}</p>
                <button
                  onClick={() => handleRestore(item)}
                  aria-label={`Вернуть «${item.item_name || "вещь"}» в рекомендации`}
                  className="absolute top-1 right-1 flex h-8 w-8 items-center justify-center"
                >
                  <span className="glass flex h-6 w-6 items-center justify-center rounded-full text-ink">
                    <X className="h-3.5 w-3.5" />
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </CommonSheet>
  )
}

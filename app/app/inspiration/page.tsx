"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { Heart, ChevronUp, ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
// IMPORTANT: BottomNavigation is a named export, not default.
import { BottomNavigation } from "@/components/bottom-navigation"

type Outfit = {
  id: number
  name?: string | null
  description?: string | null
  preview_image_url?: string | null
  preview_url?: string | null
  likes_count?: number | null
  // Optional items for small cards if present
  outfit_items?: Array<{
    id: number
    wardrobe_items?: {
      id: number
      item_name?: string | null
      image_url?: string | null
    } | null
  }>
}

export default function InspirationPage() {
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [likingId, setLikingId] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Fetch inspiration feed
  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch("/api/outfits/inspiration", { cache: "no-store" })
        if (!res.ok) throw new Error("Failed to load inspiration")
        const data = await res.json()
        // Accept either { outfits } or array
        const list: Outfit[] = Array.isArray(data) ? data : (data.outfits ?? [])
        if (active) {
          setOutfits(list)
          setIndex(0)
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const current = outfits[index] || null
  const imgSrc =
    (current?.preview_image_url && current.preview_image_url.trim()) ||
    (current?.preview_url && current.preview_url.trim()) ||
    "/placeholder.svg?height=1200&width=900"

  const goNext = useCallback(() => {
    setIndex((i) => (i < outfits.length - 1 ? i + 1 : i))
  }, [outfits.length])

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i))
  }, [])

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault()
        goNext()
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault()
        goPrev()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goNext, goPrev])

  // Basic vertical swipe
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let startY = 0
    let endY = 0

    function onTouchStart(e: TouchEvent) {
      startY = e.touches[0]?.clientY ?? 0
    }
    function onTouchMove(e: TouchEvent) {
      endY = e.touches[0]?.clientY ?? 0
    }
    function onTouchEnd() {
      const delta = endY - startY
      const threshold = 40
      if (delta < -threshold) {
        goNext()
      } else if (delta > threshold) {
        goPrev()
      }
      startY = 0
      endY = 0
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: true })
    el.addEventListener("touchend", onTouchEnd)
    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
    }
  }, [goNext, goPrev])

  async function handleLike(outfitId: number) {
    try {
      setLikingId(outfitId)
      const res = await fetch("/api/outfits/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfit_id: outfitId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to like")
      }
      // Optimistic local increment
      setOutfits((prev) => prev.map((o) => (o.id === outfitId ? { ...o, likes_count: (o.likes_count ?? 0) + 1 } : o)))
    } catch (e) {
      console.error("Like error", e)
    } finally {
      setLikingId(null)
    }
  }

  const smallCards = useMemo(() => {
    const items = current?.outfit_items ?? []
    return items.slice(0, 8) // compact list
  }, [current])

  return (
    <main
      ref={containerRef}
      className="relative min-h-[100dvh] bg-black text-white overflow-hidden"
      aria-label="Inspiration feed"
    >
      {loading ? (
        <div className="flex items-center justify-center h-[100dvh]">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      ) : current ? (
        <>
          {/* Up/Down controls */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4 z-30">
            <button
              aria-label="Previous"
              onClick={goPrev}
              className="pointer-events-auto hidden sm:flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 transition"
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <button
              aria-label="Next"
              onClick={goNext}
              className="pointer-events-auto hidden sm:flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 transition"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>

          {/* Large Photo area with side paddings on large screens */}
          <section className="relative mx-auto w-full h-[100dvh]">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-full md:max-w-[900px] lg:max-w-[1100px] md:px-6 lg:px-10">
                <div className="relative w-full h-full">
                  <Image
                    src={imgSrc || "/placeholder.svg?height=1200&width=900&query=inspiration-large-photo"}
                    alt={current?.name || "Outfit"}
                    fill
                    priority
                    className="object-contain md:object-cover"
                  />
                </div>
              </div>
            </div>

            {/* Small item cards strip at bottom-left (inside the photo area) */}
            {smallCards.length > 0 && (
              <div className="absolute left-4 bottom-24 z-40 hidden sm:flex gap-2">
                {smallCards.map((it) => {
                  const wi = it.wardrobe_items
                  const src = (wi?.image_url && wi.image_url.trim()) || "/placeholder.svg?height=140&width=100"
                  return (
                    <div
                      key={it.id}
                      className="relative h-24 w-18 rounded-md overflow-hidden border border-white/10 bg-white/5"
                      style={{ width: 72, height: 96 }}
                    >
                      <Image
                        src={src || "/placeholder.svg"}
                        alt={wi?.item_name || "Item"}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )
                })}
              </div>
            )}

            {/* Like button bottom-right, above BottomNavigation */}
            <div className="absolute right-4 bottom-24 z-50">
              <Button
                size="icon"
                className="h-12 w-12 rounded-full bg-white text-black hover:bg-neutral-200"
                onClick={() => current?.id && handleLike(current.id)}
                aria-label="Like outfit"
                disabled={likingId === current?.id}
              >
                {likingId === current?.id ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Heart className="h-5 w-5" />
                )}
              </Button>
              <div className="mt-2 text-center text-xs text-neutral-300">{(current?.likes_count ?? 0).toString()}</div>
            </div>

            {/* Index indicator top-right */}
            <div className="absolute top-4 right-4 z-40 text-xs text-neutral-300">
              {index + 1}/{outfits.length}
            </div>
          </section>
        </>
      ) : (
        <div className="flex items-center justify-center h-[100dvh] text-neutral-400">Нет данных для вдохновения</div>
      )}

      {/* Always render BottomNavigation on this page; keep it UNDER the action buttons */}
      <div className="fixed bottom-0 inset-x-0 z-20">
        <BottomNavigation />
      </div>
    </main>
  )
}

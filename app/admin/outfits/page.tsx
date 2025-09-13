"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

type OutfitListItem = {
  id: number
  name?: string | null
  description?: string | null
  preview_image_url?: string | null
  preview_url?: string | null
  created_at?: string
  likes_count?: number
  saves_count?: number
  views_count?: number
  gender?: string | null
}

export default function AdminOutfitsPage() {
  const [outfits, setOutfits] = useState<OutfitListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/outfits", { cache: "no-store" })
        if (!res.ok) throw new Error("Failed to fetch outfits")
        const data = await res.json()
        // Support either { outfits } or plain array
        const list: OutfitListItem[] = Array.isArray(data) ? data : (data.outfits ?? [])
        if (active) setOutfits(list)
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Unknown error")
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Загрузка образов...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 font-medium mb-3">Ошибка: {error}</p>
        <Button onClick={() => location.reload()}>Обновить</Button>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Образы</h1>
      </div>
      {outfits.length === 0 ? (
        <div className="text-center text-muted-foreground">Образы не найдены</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {outfits.map((o) => {
            const preview =
              (o.preview_image_url && o.preview_image_url.trim()) || (o.preview_url && o.preview_url.trim()) || ""
            const src = preview || "/placeholder.svg?height=200&width=160"
            return (
              <Link key={o.id} href={`/admin/outfits/${o.id}`} className="block">
                <Card className="hover:shadow-md transition">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base truncate">{o.name || "Без названия"}</CardTitle>
                    {o.gender && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {o.gender === "male" ? "Мужской" : o.gender === "female" ? "Женский" : "Унисекс"}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="w-full aspect-[4/5] bg-muted rounded-md overflow-hidden flex items-center justify-center">
                      {preview ? (
                        <img
                          src={src || "/placeholder.svg"}
                          alt="Outfit preview"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <svg className="h-8 w-8 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path
                              d="M3 3l18 18M21 15V5a2 2 0 00-2-2H9"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M3 9v10a2 2 0 002 2h10"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span className="text-xs">Нет превью</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>❤️ {o.likes_count ?? 0}</span>
                      <span>🔖 {o.saves_count ?? 0}</span>
                      <span>👁️ {o.views_count ?? 0}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

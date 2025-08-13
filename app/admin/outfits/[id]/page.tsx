"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Loader2, Edit, Heart, Eye, Bookmark, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type WardrobeItem = {
  id: number
  item_name?: string | null
  image_url?: string | null
  color?: string | null
  material?: string | null
  style?: string | null
  size_type?: string | null
  url?: string | null
}

type OutfitItem = {
  id: number
  position?: number
  wardrobe_items: WardrobeItem
}

type Outfit = {
  id: number
  name?: string | null
  description?: string | null
  preview_image_url?: string | null
  preview_url?: string | null
  outfit_items: OutfitItem[]
  likes_count?: number
  saves_count?: number
  views_count?: number
  created_at: string
}

export default function AdminOutfitDetailsPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const outfitId = useMemo(() => Number(params?.id), [params?.id])
  const [outfit, setOutfit] = useState<Outfit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  // Edit meta form (preview smaller + upload)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [previewUrl, setPreviewUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!outfitId || Number.isNaN(outfitId)) return
    let active = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/outfits/${outfitId}`, { cache: "no-store" })
        if (!res.ok) throw new Error("Failed to fetch outfit")
        const data = await res.json()
        const o: Outfit = data.outfit ?? data
        if (active) {
          setOutfit(o)
          setName(o.name ?? "")
          setDescription(o.description ?? "")
          setPreviewUrl(o.preview_image_url ?? o.preview_url ?? "")
        }
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
  }, [outfitId])

  const sortedItems = useMemo(
    () => [...(outfit?.outfit_items ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [outfit?.outfit_items],
  )

  const previewSrc = previewUrl?.trim() || "/placeholder.svg?height=300&width=240"

  async function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault()
    if (!outfit) return
    if (!previewUrl.trim()) {
      toast({ title: "Поле превью обязательно", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/outfits/${outfit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || null,
          description: description || null,
          preview_image_url: previewUrl || null,
          preview_url: previewUrl || null,
          items: sortedItems.map((oi) => oi.wardrobe_items.id),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || "Failed to save outfit")
      }
      toast({ title: "Сохранено", description: "Данные образа обновлены" })
      const ref = await fetch(`/api/outfits/${outfit.id}`, { cache: "no-store" })
      const refData = await ref.json()
      setOutfit(refData.outfit ?? refData)
    } catch (e) {
      console.error(e)
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Ошибка сохранения",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  async function handlePreviewFile(file: File) {
    try {
      setUploading(true)
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload-image", { method: "POST", body: fd })
      if (!res.ok) throw new Error("Upload failed")
      const data = await res.json()
      if (data?.url) {
        setPreviewUrl(data.url)
        toast({ title: "Загружено", description: "Превью обновлено" })
      }
    } catch (e) {
      console.error(e)
      toast({ title: "Ошибка загрузки", description: "Не удалось загрузить файл", variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteOutfit() {
    if (!outfit) return

    const confirmed = confirm(
      `Вы уверены, что хотите удалить образ "${outfit.name || "Без названия"}"? Это действие нельзя отменить.`,
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/outfits/${outfit.id}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to delete outfit")
      }

      toast({
        title: "Удалено",
        description: "Образ успешно удален",
      })

      // Redirect to outfits list after successful deletion
      router.push("/admin/outfits")
    } catch (e) {
      console.error(e)
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Ошибка удаления",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Загрузка образа...</span>
      </div>
    )
  }

  if (error || !outfit) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 font-medium mb-3">Ошибка: {error || "Образ не найден"}</p>
        <Button onClick={() => location.reload()}>Обновить</Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">{outfit.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Создан {new Date(outfit.created_at).toLocaleDateString("ru-RU")}
          </p>
          <div className="mt-3 flex gap-3">
            <Button variant="outline" onClick={() => router.push(`/admin/wardrobe?edit=${outfit.id}`)}>
              <Edit className="h-4 w-4 mr-2" />
              Редактировать состав (на странице гардероба)
            </Button>
            <Button variant="destructive" onClick={handleDeleteOutfit} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить образ
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Статистика</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-md border">
                <Heart className="h-5 w-5 text-rose-500" />
                <div>
                  <div className="text-sm text-muted-foreground">Лайки</div>
                  <div className="font-semibold">{outfit.likes_count ?? 0}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-md border">
                <Eye className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Просмотры</div>
                  <div className="font-semibold">{outfit.views_count ?? 0}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-md border">
                <Bookmark className="h-5 w-5 text-emerald-600" />
                <div>
                  <div className="text-sm text-muted-foreground">Сохранения</div>
                  <div className="font-semibold">{outfit.saves_count ?? 0}</div>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Просмотры учитываются только в пользовательском приложении (/app). В админке просмотры не считаются.
            </p>
          </CardContent>
        </Card>

        {/* Smaller Preview + meta edit */}
        <Card>
          <CardHeader>
            <CardTitle>Превью и данные образа</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="w-full max-w-xs">
                <div className="relative aspect-[4/5] bg-muted rounded-md overflow-hidden">
                  {previewUrl?.trim() ? (
                    <Image src={previewSrc || "/placeholder.svg"} alt="Outfit preview" fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <svg className="h-8 w-8 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path
                          d="M3 3l18 18M21 15V5a2 2 0 00-2-2H9"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path d="M3 9v10a2 2 0 002 2h10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-xs">Нет превью</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="preview-url">Ссылка на превью</Label>
                <Input
                  id="preview-url"
                  value={previewUrl}
                  onChange={(e) => setPreviewUrl(e.target.value)}
                  placeholder="https://..."
                  type="url"
                  required
                />
                <div className="flex items-center gap-3">
                  <Label
                    htmlFor="preview-file"
                    className="inline-flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm"
                  >
                    Загрузить файл
                  </Label>
                  <input
                    id="preview-file"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files && e.target.files[0] && void handlePreviewFile(e.target.files[0])}
                  />
                  {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveMeta} className="space-y-4">
              <div>
                <Label htmlFor="name">Название</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" />
              </div>
              <div>
                <Label htmlFor="description">Описание</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Описание"
                  rows={4}
                />
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? "Сохранение..." : "Сохранить изменения"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Items (compact list) */}
        <Card>
          <CardHeader>
            <CardTitle>Вещи в образе ({sortedItems.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {sortedItems.length === 0 ? (
              <div className="text-muted-foreground">Нет вещей</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedItems.map((oi) => {
                  const wi = oi.wardrobe_items
                  const src =
                    wi?.image_url && wi.image_url.trim().length > 0
                      ? wi.image_url
                      : "/placeholder.svg?height=200&width=160"
                  return (
                    <div key={oi.id} className="space-y-2">
                      <div className="relative w-full aspect-[4/5] bg-muted rounded-md overflow-hidden">
                        <Image
                          src={src || "/placeholder.svg"}
                          alt={wi?.item_name || "Item"}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="text-sm truncate">{wi?.item_name || "Без названия"}</div>
                      <div className="flex flex-wrap gap-1">
                        {wi?.color && (
                          <Badge variant="outline" className="text-xs">
                            {wi.color}
                          </Badge>
                        )}
                        {wi?.material && (
                          <Badge variant="outline" className="text-xs">
                            {wi.material}
                          </Badge>
                        )}
                        {wi?.style && (
                          <Badge variant="outline" className="text-xs">
                            {wi.style}
                          </Badge>
                        )}
                        {wi?.url && (
                          <a
                            href={wi.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Ссылка
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

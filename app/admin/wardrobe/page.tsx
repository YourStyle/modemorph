"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

import { WardrobeItemCard } from "@/components/wardrobe-item-card"
import { useSelectedItems } from "@/contexts/selected-items-context"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth-context"

import { Eye, EyeOff, Loader2, Plus, Save, Settings, Shirt, Upload, X } from "lucide-react"
import type { WardrobeItem } from "@/lib/wardrobe"

const itemHasPrint = (val: any): boolean => {
  if (typeof val === "boolean") return val
  if (val == null) return false
  const s = String(val).trim().toLowerCase()
  return s === "y" || s === "yes" || s === "true" || s === "да" || s === "есть" || s === "1"
}

export default function WardrobePage() {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterClothingType, setFilterClothingType] = useState<string>("")
  const [filterColor, setFilterColor] = useState<string>("")
  const [filterMaterial, setFilterMaterial] = useState<string>("")
  const [filterPrint, setFilterPrint] = useState<"any" | "yes" | "no">("any")
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "name">("newest")

  const [isUpdatingAll, setIsUpdatingAll] = useState(false)

  const {
    selectedItems,
    setItems: setSelectedItems,
    setEditingOutfitId,
    addItem,
    removeItem,
    isSelected,
    clearItems,
  } = useSelectedItems()

  const [editingOutfit, setEditingOutfit] = useState<any>(null)
  const [isCreatingOutfit, setIsCreatingOutfit] = useState(false)

  // Save/Update outfit modal state
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [outfitName, setOutfitName] = useState("")
  const [outfitDescription, setOutfitDescription] = useState("")
  const [previewUrl, setPreviewUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [previewUploading, setPreviewUploading] = useState(false)

  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()

  const { user, loading: authLoading } = useAuth()

  // Load edit mode by query (?edit=ID), but do not navigate when toggling mode
  const editParam = useMemo(() => searchParams.get("edit"), [searchParams])

  const fetchItems = useCallback(async (filters: { search: string }) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.search) params.append("search", filters.search)
      const response = await fetch(`/api/wardrobe?${params.toString()}`)
      if (!response.ok) throw new Error("Failed to fetch wardrobe items")
      const data = await response.json()
      setItems(data.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      console.error("Error fetching wardrobe items:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchItems({ search: "" })
  }, [fetchItems])

  const handleRetry = () => {
    void fetchItems({ search })
  }

  const handleHideAll = async () => {
    setIsUpdatingAll(true)
    try {
      const response = await fetch("/api/wardrobe/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hideAll: true }),
      })
      if (!response.ok) throw new Error("Failed to hide all items")
      toast({ title: "Все вещи скрыты", description: "Элементы скрыты из публичного просмотра" })
      setItems((prev) => prev.map((it) => ({ ...it, is_hidden: true })))
    } catch (e) {
      console.error(e)
      toast({ title: "Ошибка", description: "Не удалось скрыть все вещи", variant: "destructive" })
    } finally {
      setIsUpdatingAll(false)
    }
  }

  const handleShowAll = async () => {
    setIsUpdatingAll(true)
    try {
      const response = await fetch("/api/wardrobe/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hideAll: false }),
      })
      if (!response.ok) throw new Error("Failed to show all items")
      toast({ title: "Все вещи показаны", description: "Элементы теперь видны" })
      setItems((prev) => prev.map((it) => ({ ...it, is_hidden: false })))
    } catch (e) {
      console.error(e)
      toast({ title: "Ошибка", description: "Не удалось показать все вещи", variant: "destructive" })
    } finally {
      setIsUpdatingAll(false)
    }
  }

  const handleVisibilityChange = (itemId: number, isHidden: boolean) => {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, is_hidden: isHidden } : it)))
  }

  const handleDelete = (itemId: number) => {
    setItems((prev) => prev.filter((it) => it.id !== itemId))
  }

  const handleRefresh = () => {
    void fetchItems({ search })
  }

  const handleItemSelect = (item: WardrobeItem) => {
    const withType = { ...item, type: "user" as const }
    if (isSelected("user", item.id)) {
      removeItem("user", item.id)
    } else {
      addItem(withType)
    }
  }

  const handleCreateOutfitToggle = () => {
    // Do NOT navigate. Just toggle the mode and local state.
    if (isCreatingOutfit) {
      clearItems()
      setEditingOutfit(null)
      setEditingOutfitId(null)
    }
    setIsCreatingOutfit((v) => !v)
  }

  const handleEditItem = (itemId: number) => {
    router.push(`/admin/wardrobe/edit?id=${itemId}`)
  }

  // Save outfit actions

  const openSaveModal = () => {
    setSaveModalOpen(true)
  }

  const handlePreviewFile = async (file: File) => {
    try {
      setPreviewUploading(true)
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload-image", { method: "POST", body: fd })
      if (!res.ok) throw new Error("Не удалось загрузить файл")
      const data = await res.json()
      if (data?.url) setPreviewUrl(data.url)
      toast({ title: "Загружено", description: "Превью обновлено" })
    } catch (e) {
      console.error(e)
      toast({ title: "Ошибка загрузки", description: "Не удалось загрузить файл", variant: "destructive" })
    } finally {
      setPreviewUploading(false)
    }
  }

  const handleSaveOutfit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!previewUrl.trim()) {
      toast({
        title: "Превью обязательно",
        description: "Укажите ссылку или загрузите изображение",
        variant: "destructive",
      })
      return
    }
    setSaving(true)
    try {
      const itemIds = selectedItems.map((it) => it.id)
      const payload = {
        name: outfitName || editingOutfit?.name || "Образ",
        description: outfitDescription || null,
        preview_url: previewUrl,
        items: itemIds,
      }
      const url = editingOutfit?.id ? `/api/outfits/${editingOutfit.id}` : "/api/outfits"
      const method = editingOutfit?.id ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Не удалось сохранить образ")
      }

      toast({ title: "Сохранено", description: editingOutfit?.id ? "Образ обновлён" : "Образ создан" })
      setSaveModalOpen(false)

      // Exit edit mode and clear query ?edit=... WITHOUT page switch:
      clearItems()
      setEditingOutfit(null)
      setEditingOutfitId(null)
      setIsCreatingOutfit(false)

      // Clear only the query param; same path to avoid page switch:
      const params = new URLSearchParams(window.location.search)
      params.delete("edit")
      // This replace updates URL; Next.js will re-render but not change page
      router.replace(window.location.pathname + (params.toString() ? `?${params.toString()}` : ""), { scroll: false })
    } catch (e) {
      console.error(e)
      toast({
        title: "Ошибка",
        description: e instanceof Error ? e.message : "Не удалось сохранить",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const loadOutfitForEditing = async (outfitId: number) => {
    try {
      const response = await fetch(`/api/outfits/${outfitId}`, { cache: "no-store" })
      if (!response.ok) throw new Error("Failed to load outfit")
      const data = await response.json()
      const outfit = data.outfit

      // Fill selection with outfit items
      const outfitItems: (WardrobeItem & { type: "user" })[] = (outfit.outfit_items || [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((item: any) => ({
          ...item.wardrobe_items,
          image_url: item.wardrobe_items?.image_url || item.wardrobe_items?.basic_wardrobe_items?.image_url || null,
          type: "user" as const,
        }))

      setSelectedItems(outfitItems)
      setEditingOutfitId(outfitId)
      setEditingOutfit(outfit)

      setOutfitName(outfit.name ?? "")
      setOutfitDescription(outfit.description ?? "")
      setPreviewUrl(outfit.preview_url ?? "")

      setIsCreatingOutfit(true)
      toast({ title: "Режим редактирования", description: `Загружен образ "${outfit.name}"` })
    } catch (e) {
      console.error("Error loading outfit:", e)
      toast({ title: "Ошибка", description: "Не удалось загрузить образ", variant: "destructive" })
    }
  }

  useEffect(() => {
    if (editParam) {
      void loadOutfitForEditing(Number(editParam))
    }
  }, [editParam])

  const filteredAndSortedItems = useMemo(() => {
    let arr = [...items]

    // Client-side filtering
    const q = search.trim().toLowerCase()
    if (q) {
      arr = arr.filter((it) => {
        const name = (it.item_name || "").toLowerCase()
        const color = (it.color || "").toLowerCase()
        const material = (it.material || "").toLowerCase()
        const style = (it.style || "").toLowerCase()
        return name.includes(q) || color.includes(q) || material.includes(q) || style.includes(q)
      })
    }

    if (filterClothingType) {
      arr = arr.filter((it: any) => (it.clothing_type || "").toLowerCase() === filterClothingType.toLowerCase())
    }
    if (filterColor.trim()) {
      const c = filterColor.trim().toLowerCase()
      arr = arr.filter((it: any) => (it.color || "").toLowerCase().includes(c))
    }
    if (filterMaterial.trim()) {
      const m = filterMaterial.trim().toLowerCase()
      arr = arr.filter((it: any) => (it.material || "").toLowerCase().includes(m))
    }
    if (filterPrint !== "any") {
      const want = filterPrint === "yes"
      arr = arr.filter((it: any) => itemHasPrint(it.has_print) === want)
    }

    // Sorting
    arr.sort((a: any, b: any) => {
      if (sortOrder === "name") {
        return (a.item_name || "").localeCompare(b.item_name || "", "ru")
      }
      // Prefer created_at; fallback to id
      const aT = a.created_at ? new Date(a.created_at).getTime() : a.id || 0
      const bT = b.created_at ? new Date(b.created_at).getTime() : b.id || 0
      return sortOrder === "newest" ? bT - aT : aT - bT
    })

    return arr
  }, [items, search, filterClothingType, filterColor, filterMaterial, filterPrint, sortOrder])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-lg font-semibold">Загрузка...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-600 text-lg font-semibold">Необходима авторизация</div>
          <Button onClick={() => router.push("/auth/login")}>Войти</Button>
        </div>
      </div>
    )
  }

  const hiddenCount = items.filter((i) => i.is_hidden).length
  const visibleCount = items.length - hiddenCount

  return (
    <div className="min-h-screen bg-gray-50 pb-40">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <Shirt className="h-8 w-8 text-gray-700" />
                <h1 className="text-3xl font-bold text-gray-900">Мой гардероб</h1>
              </div>

              {/* Actions: show upload only when NOT in create/edit mode */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={handleShowAll}
                    disabled={isUpdatingAll || items.length === 0 || hiddenCount === 0}
                    className="flex items-center justify-center gap-2 bg-transparent min-w-0"
                  >
                    {isUpdatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    <span className="whitespace-nowrap">Показать все</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleHideAll}
                    disabled={isUpdatingAll || items.length === 0 || visibleCount === 0}
                    className="flex items-center justify-center gap-2 bg-transparent min-w-0"
                  >
                    {isUpdatingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />}
                    <span className="whitespace-nowrap">Скрыть все</span>
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Link href="/admin/wardrobe/basics" className="flex-1">
                    <Button
                      variant="outline"
                      className="flex items-center justify-center gap-2 bg-transparent w-full min-w-0"
                    >
                      <Settings className="h-4 w-4" />
                      <span className="whitespace-nowrap">Базовые элементы</span>
                    </Button>
                  </Link>
                  <Link href="/admin/wardrobe/add" className="flex-1">
                    <Button className="flex items-center justify-center gap-2 w-full min-w-0">
                      <Plus className="h-4 w-4" />
                      <span className="whitespace-nowrap">Добавить вещь</span>
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-sm text-gray-600">
              <p className="flex-1">
                Коллекция одежды с фотографиями и подробной информацией.
                <span className="font-medium ml-1">
                  {isCreatingOutfit
                    ? "Нажмите на карточки, чтобы выбрать вещи для образа."
                    : "Нажмите на карточку, чтобы посмотреть детали."}
                </span>
              </p>
              {hiddenCount > 0 && (
                <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap">
                  {hiddenCount} скрыто
                </div>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm p-4 md:p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="search">Поиск</Label>
                <Input
                  id="search"
                  placeholder="Название, материал, стиль, цвет"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="clothing_type">Тип</Label>
                <select
                  id="clothing_type"
                  className="w-full h-10 border rounded-md px-3 bg-white"
                  value={filterClothingType}
                  onChange={(e) => setFilterClothingType(e.target.value)}
                >
                  <option value="">Все</option>
                  <option value="верхняя">верхняя</option>
                  <option value="нижняя">нижняя</option>
                  <option value="платье">платье</option>
                  <option value="комбинезон">комбинезон</option>
                  <option value="верхняя одежда">верхняя одежда</option>
                  <option value="обувь">обувь</option>
                  <option value="аксессуар">аксессуар</option>
                  <option value="часы">часы</option>
                  <option value="головной убор">головной убор</option>
                  <option value="спорт">спорт</option>
                </select>
              </div>

              <div>
                <Label htmlFor="color">Цвет</Label>
                <Input
                  id="color"
                  placeholder="например: белый"
                  value={filterColor}
                  onChange={(e) => setFilterColor(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="material">Материал</Label>
                <Input
                  id="material"
                  placeholder="например: хлопок"
                  value={filterMaterial}
                  onChange={(e) => setFilterMaterial(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="print">Принт</Label>
                <select
                  id="print"
                  className="w-full h-10 border rounded-md px-3 bg-white"
                  value={filterPrint}
                  onChange={(e) => setFilterPrint(e.target.value as any)}
                >
                  <option value="any">любой</option>
                  <option value="yes">есть</option>
                  <option value="no">нет</option>
                </select>
              </div>

              <div>
                <Label htmlFor="sort">Сортировать</Label>
                <select
                  id="sort"
                  className="w-full h-10 border rounded-md px-3 bg-white"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                >
                  <option value="newest">новизне (новые сначала)</option>
                  <option value="oldest">старые сначала</option>
                  <option value="name">по названию</option>
                </select>
              </div>

              <div className="md:col-span-2 flex items-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("")
                    setFilterClothingType("")
                    setFilterColor("")
                    setFilterMaterial("")
                    setFilterPrint("any")
                    setSortOrder("newest")
                  }}
                >
                  Сбросить
                </Button>
                <Button onClick={() => void fetchItems({ search })}>Обновить</Button>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="bg-white rounded-lg shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-600">Загрузка...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12">
                <Shirt className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Ничего не найдено</h3>
                <p className="text-gray-600">Попробуйте изменить параметры поиска или фильтры</p>
                <Link href="/admin/wardrobe/add" className="mt-4 inline-block">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Добавить первую вещь
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                {/* Sticky status bar at top; no upload button in edit mode; do not duplicate "save" here */}
                <div className="sticky top-0 z-30 bg-white border-b border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-900">
                      Найдено: {items.length} {items.length === 1 ? "вещь" : items.length < 5 ? "вещи" : "вещей"}
                    </h2>
                    <div className="flex gap-2">

                      <Button
                        onClick={handleCreateOutfitToggle}
                        variant={isCreatingOutfit ? "destructive" : "default"}
                        className="flex items-center gap-2 shadow-sm"
                      >
                        {isCreatingOutfit ? (
                          <>
                            <X className="h-4 w-4" />
                            Отменить
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Создать образ
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {isCreatingOutfit && (
                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-blue-800">
                          <Plus className="h-5 w-5" />
                          <span className="font-medium">Режим создания/редактирования образа</span>
                        </div>
                        <Button
                          onClick={handleCreateOutfitToggle}
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-blue-600 mt-1">
                        Выберите вещи для образа. Выбрано: {selectedItems.length}
                      </p>
                    </div>
                  )}
                </div>

                {/* Grid */}
                <div className="p-6 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredAndSortedItems.map((item) =>
                      isCreatingOutfit ? (
                        <SelectableItemCard
                          key={item.id}
                          item={item}
                          selected={isSelected("user", item.id)}
                          onToggle={() => handleItemSelect(item)}
                        />
                      ) : (
                        <WardrobeItemCard
                          key={item.id}
                          item={item}
                          isAdmin={true}
                          onVisibilityChange={handleVisibilityChange}
                          onDelete={handleDelete}
                          onRefresh={handleRefresh}
                          onEdit={handleEditItem}
                        />
                      ),
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Custom bottom bar: thumbnails + single "Сохранить образ" button */}
      {isCreatingOutfit && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t shadow-lg">
          <div className="max-w-6xl mx-auto px-4 py-3">
            {/* Thumbnails row */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {selectedItems.length === 0 ? (
                <span className="text-sm text-gray-500">Вы ещё не выбрали вещи</span>
              ) : (
                selectedItems.map((it) => (
                  <div key={`${it.type}-${it.id}`} className="relative w-12 h-12 rounded-md overflow-hidden border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.image_url || "/placeholder.svg"}
                      alt={it.item_name || "Выбранная вещь"}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(it.type, it.id)}
                      className="absolute -top-1 -right-1 bg-white/90 rounded-full border shadow p-0.5 hover:bg-white"
                      aria-label="Убрать из образа"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">
                Выбрано: <span className="font-medium">{selectedItems.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => clearItems()} disabled={selectedItems.length === 0}>
                  Очистить
                </Button>
                <Button onClick={openSaveModal} className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Сохранить образ
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save modal with required preview field (URL or file) */}
      <Dialog open={saveModalOpen} onOpenChange={setSaveModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingOutfit ? "Обновить образ" : "Создать образ"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveOutfit} className="space-y-4">
            <div>
              <Label htmlFor="outfit-name">Название образа</Label>
              <Input
                id="outfit-name"
                value={outfitName}
                onChange={(e) => setOutfitName(e.target.value)}
                placeholder="Например: Летний casual"
              />
            </div>
            <div>
              <Label htmlFor="outfit-preview">Ссылка на превью (обязательно)</Label>
              <Input
                id="outfit-preview"
                type="url"
                required
                value={previewUrl}
                onChange={(e) => setPreviewUrl(e.target.value)}
                placeholder="https://..."
              />
              <div className="flex items-center gap-3 mt-2">
                <Label
                  htmlFor="outfit-preview-file"
                  className="inline-flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm"
                >
                  Загрузить файл
                </Label>
                <input
                  id="outfit-preview-file"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files && e.target.files[0] && void handlePreviewFile(e.target.files[0])}
                />
                {previewUploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            </div>
            <div>
              <Label htmlFor="outfit-description">Описание</Label>
              <Textarea
                id="outfit-description"
                value={outfitDescription}
                onChange={(e) => setOutfitDescription(e.target.value)}
                placeholder="Краткое описание образа"
                rows={3}
              />
            </div>
            <Separator />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSaveModalOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Сохранение..." : "Сохранить образ"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SelectableItemCard({
  item,
  selected,
  onToggle,
}: {
  item: WardrobeItem
  selected: boolean
  onToggle: () => void
}) {
  const borderClass = selected ? "ring-2 ring-blue-500" : "ring-1 ring-transparent hover:ring-gray-200"
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "group text-left rounded-lg overflow-hidden bg-white transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
        borderClass,
      )}
      aria-pressed={selected}
    >
      <div className="relative aspect-square bg-gray-100">
        {item.image_url ? (
          <Image
            src={item.image_url || "/placeholder.svg"}
            alt={item.item_name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-200"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-gray-400 text-sm">Нет фото</span>
          </div>
        )}
        {selected && <div className="absolute inset-0 bg-blue-500/10 pointer-events-none" aria-hidden="true" />}
      </div>
      <div className="p-3">
        <div className="font-medium text-sm line-clamp-2">{item.item_name}</div>
        <div className="flex items-center gap-2 mt-1">
          {item.color && (
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-gray-500">{item.color}</span>
            </div>
          )}
          {item.size_type && <span className="text-xs text-gray-500">{item.size_type}</span>}
        </div>
      </div>
    </button>
  )
}

"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"
import { Plus, ChevronDown, ChevronUp, Search, Sparkles, LayoutGrid, Shirt } from "lucide-react"
import { useAddToCloset } from "@/contexts/add-to-closet-context"
import { useAIAnalysis } from "@/contexts/ai-analysis-context"

import { Input } from "@/components/ui/input"
import { useReconcileLimits } from "@/hooks/use-reconcile-limits"
import { SubscriptionSheet } from "@/components/subscription-sheet"

import { useToast } from "@/hooks/use-toast"
import { useFeature } from "@/hooks/use-feature"
import { normalizeImageFile } from "@/lib/image-normalize"
import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"

import { StyleProfileCard } from "@/components/style-profile-card"
import { StyleCheckSheet } from "@/components/style-check-sheet"
import { normalizeClothingType, clothingCategories } from "@/lib/clothing-types"

interface BasicWardrobeItem {
  id: number
  item_name: string
  description?: string
  clothing_type: string
  image_url?: string
  material?: string
  style?: string
  color?: string
  shade?: string
  has_print?: string
  has_details?: string
  gender?: string
}

interface WardrobeListItem {
  id: number
  item_name: string
  image_url?: string
  clothing_type?: string
  created_at?: string
}

interface UploadedPhoto {
  file: File
  preview: string
  id: string
}

// === Лента категорий — главный элемент экрана, "сразу под заголовком" ===
// Она же навигация/фильтр/витрина: реальные фото вещей вместо белой карточки
// "Ваш гардероб" + дропдауна сортировки, которые раньше занимали этот блок.
const RIBBON_CATEGORY_ORDER = [
  "light-upper",
  "warm-upper",
  "dresses-skirts",
  "pants",
  "sets",
  "outerwear",
  "shoes",
] as const

const RIBBON_CATEGORY_LABELS: Record<(typeof RIBBON_CATEGORY_ORDER)[number], string> = {
  "light-upper": "Верх",
  "warm-upper": "Тёплое",
  "dresses-skirts": "Платья",
  pants: "Брюки",
  sets: "Костюмы",
  outerwear: "Куртки",
  shoes: "Обувь",
}

interface RibbonCategory {
  id: string
  label: string
  image?: string
}

function buildRibbonCategories(items: WardrobeListItem[]): RibbonCategory[] {
  const buckets = new Map<string, string | undefined>()

  for (const item of items) {
    const canonical = normalizeClothingType(item.clothing_type)
    if (!canonical) continue

    const categoryKey = RIBBON_CATEGORY_ORDER.find((key) =>
      (clothingCategories[key].types as readonly string[]).includes(canonical),
    )
    if (!categoryKey) continue

    if (!buckets.has(categoryKey) || (!buckets.get(categoryKey) && item.image_url)) {
      buckets.set(categoryKey, item.image_url)
    }
  }

  return RIBBON_CATEGORY_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    id: key,
    label: RIBBON_CATEGORY_LABELS[key],
    image: buckets.get(key),
  }))
}

function CategoryRibbon({
  loading,
  items,
  active,
  onSelect,
}: {
  loading: boolean
  items: WardrobeListItem[]
  active: string
  onSelect: (id: string) => void
}) {
  const categories = useMemo(() => buildRibbonCategories(items), [items])

  // Пустое состояние ленты — скелетоны-шиммер, а не значок камеры по центру:
  // камера уже есть ниже, в пустом состоянии самой сетки, дублировать не нужно.
  if (loading) {
    return (
      <div className="flex gap-4 mb-4 overflow-x-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="skeleton w-14 h-14 rounded-full" />
            <div className="skeleton h-2.5 w-9 rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (categories.length === 0) return null

  return (
    <div className="flex gap-4 mb-4 overflow-x-auto scrollbar-hide -mx-4 px-4">
      <button onClick={() => onSelect("all")} className="flex flex-col items-center gap-1.5 shrink-0">
        <span
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center bg-ink ring-2 transition-transform duration-press ease-out active:scale-95",
            active === "all" ? "ring-signal" : "ring-transparent",
          )}
        >
          <LayoutGrid className="w-5 h-5 text-signal-ink" />
        </span>
        <span className={cn("text-caption whitespace-nowrap", active === "all" ? "text-ink font-semibold" : "text-ink-2")}>
          Все
        </span>
      </button>

      {categories.map((cat) => {
        const isActive = active === cat.id
        return (
          <button key={cat.id} onClick={() => onSelect(cat.id)} className="flex flex-col items-center gap-1.5 shrink-0">
            {/* Постоянная волосяная обводка (не только у активной) — иначе на
                молочно-бежевом гардеробе фото сливаются с --canvas-sunk и кружок
                читается только по силуэту (артефакт фикстур, но подложка дешёвая). */}
            <span
              className={cn(
                "w-14 h-14 rounded-full overflow-hidden bg-canvas-sunk ring-1 ring-line transition-transform duration-press ease-out active:scale-95",
                isActive && "ring-2 ring-signal",
              )}
            >
              {cat.image ? (
                <img src={cat.image} alt={cat.label} className="w-full h-full object-cover" />
              ) : null}
            </span>
            <span className={cn("text-caption whitespace-nowrap", isActive ? "text-ink font-semibold" : "text-ink-2")}>
              {cat.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Skeleton component for basic wardrobe items — тот же язык, что у "Ваших вещей":
// карточка без обводки/тени, радиус наследуется от Card (18px), утопленные полоски.
const BasicItemsSkeleton = () => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
        <Card key={i} className="border-0 overflow-hidden">
          <div className="skeleton aspect-square" />
          <div className="p-2.5 space-y-2">
            <div className="skeleton h-2.5 rounded-full w-4/5" />
            <div className="skeleton h-2.5 rounded-full w-2/5" />
          </div>
        </Card>
      ))}
    </div>
  )
}

export default function WardrobePage() {
  const [basicItems, setBasicItems] = useState<BasicWardrobeItem[]>([])
  const [isLoadingBasicItems, setIsLoadingBasicItems] = useState(true)
  const [showAllBasicItems, setShowAllBasicItems] = useState(false)
  const [userItemsCount, setUserItemsCount] = useState(0)
  const [userItems, setUserItems] = useState<WardrobeListItem[]>([])
  const [addingItemId, setAddingItemId] = useState<number | null>(null)
  const [refreshUserItems, setRefreshUserItems] = useState(0)
  const [selectedPhotos, setSelectedPhotos] = useState<UploadedPhoto[]>([])
  const [isLoadingUserItems, setIsLoadingUserItems] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const { toast } = useToast()
  const { openSheet, setOnAnalysisSuccess } = useAddToCloset()
  const aiAnalysis = useAIAnalysis()

  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState("all")
  const [dominantStyle, setDominantStyle] = useState<string | null>(null)
  const [styleTags, setStyleTags] = useState<string[]>([])
  const [styleCheckOpen, setStyleCheckOpen] = useState(false)

  useReconcileLimits(true)

  const { log, consume } = useFeature()

  const [userGender, setUserGender] = useState("")

  // Обработчик успешного анализа
  const handleAnalysisSuccess = useCallback(async (payload: any) => {
    console.log("[WardrobePage] handleAnalysisSuccess called with payload:", payload)

    if (!payload) {
      console.warn("[WardrobePage] handleAnalysisSuccess called with null/undefined payload")
      return
    }

    const { photos, analysisResults, batchId } = payload

    if (!photos || !analysisResults || !batchId) {
      console.warn("[WardrobePage] Missing required fields in payload:", { photos, analysisResults, batchId })
      return
    }

    // Очищаем selectedPhotos СРАЗУ после успешного анализа
    selectedPhotos.forEach((photo) => {
      if (typeof window !== "undefined") {
        URL.revokeObjectURL(photo.preview)
      }
    })
    setSelectedPhotos([])

    // Обновляем данные пользователя
    fetchUserItems()
    setRefreshUserItems((prev) => prev + 1)

    // считаем, сколько фото проанализировано успешно (есть items)
    const succeeded = analysisResults.filter((r: any) => r.success && r.items && r.items.length > 0).length
    if (succeeded <= 0) return

    // спишем ровно за успешно распознанные фото, а не за все загруженные —
    // нераспознанные/отклонённые ИИ фото лимит не тратят
    const res = await consume(
      "wardrobe_items_anlyzed",
      {
        pagePath: "/app/wardrobe",
        requestId: batchId,
        photosCount: photos.length,
        succeeded,
      },
      succeeded,
    )
    if (!res.ok && res.code === "payment_required") {
      setPaywallOpen(true)
    }
  }, [consume, selectedPhotos, setRefreshUserItems])

  // Регистрируем обработчик анализа в контексте
  useEffect(() => {
    console.log("[WardrobePage] Registering analysis success handler")
    setOnAnalysisSuccess(handleAnalysisSuccess)
    return () => {
      console.log("[WardrobePage] Unregistering analysis success handler")
      setOnAnalysisSuccess(null)
    }
  }, [setOnAnalysisSuccess, handleAnalysisSuccess])

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await api.get("/api/me/profile")
        setUserGender(data?.profile?.gender || "")
        if (data?.profile?.dominant_style) setDominantStyle(data.profile.dominant_style)
        if (data?.profile?.style_tags) setStyleTags(data.profile.style_tags.split(",").filter(Boolean))
      } catch (err) {
        console.error(err)
      }
    }
    loadProfile()
  }, [])

  useEffect(() => {
    fetchUserItems()
  }, [sortBy, searchQuery, refreshUserItems])

  useEffect(() => {
    if (!userGender) return
    fetchBasicItems()
  }, [sortBy, searchQuery, userGender])

  // Listen for wardrobe item additions from background widget
  useEffect(() => {
    const handleWardrobeItemAdded = () => {
      console.log("[WardrobePage] Wardrobe item added, refreshing items")
      setRefreshUserItems((prev) => prev + 1)
    }

    window.addEventListener("wardrobe-item-added", handleWardrobeItemAdded)
    return () => {
      window.removeEventListener("wardrobe-item-added", handleWardrobeItemAdded)
    }
  }, [])

  const fetchBasicItems = async () => {
    try {
      setIsLoadingBasicItems(true)
      const data = await api.get(`/api/basic-wardrobe-items?gender=${userGender}`)
      console.log("Loaded basic items:", data)
      // Ensure data is an array
      const itemsArray = Array.isArray(data) ? data : []
      setBasicItems(itemsArray)
    } catch (error) {
      console.error("Error fetching basic items:", error)
      setBasicItems([])
    } finally {
      setIsLoadingBasicItems(false)
    }
  }

  const fetchUserItems = async () => {
    try {
      setIsLoadingUserItems(true)

      // Строим URL с параметрами
      const params = new URLSearchParams()
      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim())
      }
      params.append("sort", sortBy)

      const data = await api.get(`/api/wardrobe-user-items?${params.toString()}`)
      const items = Array.isArray(data) ? data : []
      setUserItems(items)
      setUserItemsCount(items.length)
    } catch (error) {
      console.error("Error fetching user items:", error)
    } finally {
      setIsLoadingUserItems(false)
    }
  }

  const handleAddToWardrobe = () => {
    void log("wardrobe_items_anlyzed", "click", { pagePath: "/app/wardrobe" })
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    // Проверяем есть ли активный анализ
    const activeSession = aiAnalysis.getActiveSession()
    if (activeSession) {
      toast({
        title: "Дождитесь завершения текущего анализа",
        variant: "destructive",
      })
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      return
    }

    const prepared = await Promise.all(
      files.map(async (file) => {
        let normalizedFile = file
        if (typeof window !== "undefined") {
          try {
            normalizedFile = await normalizeImageFile(file, {
              maxWidth: 1024,
              output: "image/jpeg",
              quality: 0.9,
            })
          } catch (error) {
            console.error("Error normalizing image:", error)
            // Fall back to original file if normalization fails
            normalizedFile = file
          }
        }

        return {
          file: normalizedFile,
          preview: typeof window !== "undefined" ? URL.createObjectURL(normalizedFile) : "",
          id: Math.random().toString(36).substr(2, 9),
        } as UploadedPhoto
      }),
    )

    setSelectedPhotos(prepared)
    console.log("[WardrobePage] Opening sheet with photos:", prepared)
    openSheet(prepared)

    // Очищаем input для возможности повторного выбора тех же файлов
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleAddBaseItem = async (item: BasicWardrobeItem) => {
    try {
      setAddingItemId(item.id)
      console.log("Adding base item:", item)

      const payload = {
        item_name: item.item_name, // Убедимся что передается правильное название
        basic_item_id: item.id,
        material: item.material || "",
        style: item.style || "",
        color: item.color || "",
        shade: item.shade || "",
        has_print: item.has_print || "нет",
        has_details: item.has_details || "нет",
        size_type: "M", // Размер по умолчанию
        notes: "",
        image_url: item.image_url,
      }

      console.log("Sending payload:", payload)

      const result = await api.post("/api/wardrobe-user-items", payload)
      console.log("Item added successfully:", result)

      toast({
        title: "Вещь добавлена",
        description: `${item.item_name} добавлена в ваш гардероб`,
      })

      // Обновляем список базовых вещей (чтобы скрыть добавленную)
      fetchBasicItems()
      // Обновляем количество пользовательских вещей
      fetchUserItems()
      // Принудительно обновляем UserWardrobeGrid
      setRefreshUserItems((prev) => prev + 1)
    } catch (error) {
      console.error("Error adding base item:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось добавить вещь в гардероб",
        variant: "destructive",
      })
    } finally {
      setAddingItemId(null)
    }
  }

  const displayedBasicItems = showAllBasicItems ? basicItems : basicItems.slice(0, 12)

  const handleRemovePhoto = (photoId: string) => {
    setSelectedPhotos((prev) => {
      const photoToRemove = prev.find((p) => p.id === photoId)
      if (photoToRemove && typeof window !== "undefined") {
        URL.revokeObjectURL(photoToRemove.preview)
      }
      return prev.filter((p) => p.id !== photoId)
    })
  }

  // Поиск и сортировка не показываются, пока вещей мало — сортировать восемь
  // вещей нечем, а контролы над пустой/короткой сеткой только добавляют хром.
  const showSearchAndSort = userItemsCount >= 8

  return (
    // pb-32 здесь дублировал pb-[...96px...] у app/app/layout-client.tsx main —
    // раунд 5 критика: первый ряд товара срезан таббаром. Сама обрезка идёт не
    // отсюда (таббар — position:fixed, он перекрывает низ ЛЮБОГО кадра
    // независимо от скролла), а от избытка хрома НАД сеткой; но лишний нижний
    // паддинг здесь был реальным найденным дублем — почищено.
    <div className="min-h-screen bg-background pb-6">
      <div className="px-4 pt-2 pb-6">
        {/* Заголовка «Гардероб» здесь намеренно нет: активный пункт таб-бара
            внизу уже называет раздел, а H1 повторял ту же подпись и съедал
            верх экрана. Первым идёт сразу товар. */}

        {/* Лента категорий: навигация, фильтр и витрина реальных вещей
            одновременно. */}
        <CategoryRibbon
          loading={isLoadingUserItems}
          items={userItems}
          active={activeCategory}
          onSelect={setActiveCategory}
        />

        {/* Style profile — одна строка, тап открывает разбор в шите. Раньше это
            была карточка + отдельный ряд чипов-процентов (~145px) — товар на
            экране гардероба важнее статистики о товаре. */}
        <StyleProfileCard
          dominantStyle={dominantStyle}
          styleTags={styleTags}
          userItemsCount={userItemsCount}
        />

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/heic,image/heif,image/heic-sequence,image/jpeg,image/jpg,image/webp,image/png"
          onChange={handleFileSelect}
          className="hidden"
          multiple
        />

        <div className="flex gap-3 mb-4">
          <Button onClick={handleAddToWardrobe} className="flex-1 h-12">
            + Добавить
          </Button>
          <Button onClick={() => setStyleCheckOpen(true)} variant="outline" className="h-12 px-4">
            <Sparkles className="h-4 w-4 mr-1.5 text-ink-2" />
            <span>Подойдёт?</span>
          </Button>
        </div>

        {/* Поиск и сортировка — только когда есть что сортировать */}
        {showSearchAndSort && (
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-ink-3 h-4 w-4" />
              <Input
                placeholder="Поиск..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12"
              />
            </div>

            <Select value={sortBy} onValueChange={(value: "newest" | "oldest" | "name") => setSortBy(value)}>
              <SelectTrigger className="flex-1 h-12 rounded-full border-transparent bg-canvas-sunk text-ink">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Сначала новые</SelectItem>
                <SelectItem value="oldest">Сначала старые</SelectItem>
                <SelectItem value="name">По названию</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* User's Wardrobe — без заголовка "Ваши вещи": дублировал H1 "Гардероб"
            на этом же экране (раунд 5 критика). */}
        <div className="mb-8">
          <UserWardrobeGrid
            onItemsChange={setUserItemsCount}
            refreshTrigger={refreshUserItems}
            searchQuery={searchQuery}
            sortBy={sortBy}
            categoryFilter={activeCategory}
            onAddFirstItem={handleAddToWardrobe}
          />
        </div>

        {/* Basic Items */}
        <div>
          <h2 className="text-h2 text-foreground mb-4">Рекомендуемые базовые вещи</h2>

          {isLoadingBasicItems ? (
            <BasicItemsSkeleton />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {displayedBasicItems.map((item, index) => (
                  <Card
                    key={item.id}
                    className="border-0 overflow-hidden relative group animate-fade-up"
                    style={{ animationDelay: `${Math.min(index, 7) * 45}ms` }}
                  >
                    <div className="aspect-square bg-canvas-sunk flex items-center justify-center relative">
                      {item.image_url ? (
                        <img
                          src={item.image_url || "/placeholder.svg"}
                          alt={item.item_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Shirt className="h-6 w-6 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
                      )}

                      {/* Кнопка добавления - всегда видна на мобильных и планшетах, при наведении на десктопе.
                          Кликабельна вся плашка (реальная зона касания = вся миниатюра), видимый чип
                          в центре остаётся прежнего маленького размера — это только визуальная подсказка. */}
                      <button
                        type="button"
                        onClick={() => handleAddBaseItem(item)}
                        disabled={addingItemId === item.id}
                        aria-label={`Добавить «${item.item_name}» в гардероб`}
                        className="absolute inset-0 flex items-center justify-center bg-ink/20 opacity-100 transition-opacity disabled:pointer-events-none md:opacity-0 md:group-hover:opacity-100"
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-flex h-7 items-center rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground transition-transform duration-press",
                            addingItemId === item.id && "opacity-50",
                          )}
                        >
                          {addingItemId === item.id ? (
                            <div className="w-3 h-3 border border-ink-3 border-t-transparent rounded-full animate-spin mr-1" />
                          ) : (
                            <Plus className="h-3 w-3 mr-1" />
                          )}
                          {addingItemId === item.id ? "..." : "Добавить"}
                        </span>
                      </button>
                    </div>
                    <div className="px-2.5 pt-2 pb-2.5">
                      <h3 className="text-caption font-semibold text-ink truncate">
                        {item.item_name}
                      </h3>
                      {item.description && (
                        <p className="text-caption text-ink-2 truncate mt-0.5">{item.description}</p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              {basicItems.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-ink-2">Все базовые вещи уже добавлены в ваш гардероб!</p>
                </div>
              )}

              {/* Кнопка показать/скрыть все под сеткой */}
              {basicItems.length > 12 && (
                <div className="flex justify-center mt-6">
                  <Button variant="outline" onClick={() => setShowAllBasicItems(!showAllBasicItems)}>
                    {showAllBasicItems ? (
                      <>
                        Скрыть <ChevronUp className="h-4 w-4 ml-1" />
                      </>
                    ) : (
                      <>
                        Показать все ({basicItems.length}) <ChevronDown className="h-4 w-4 ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <SubscriptionSheet
        isOpen={paywallOpen}
        source="limit:wardrobe"
        onClose={() => setPaywallOpen(false)}
        onSuccess={() => setPaywallOpen(false)}
      />

      <StyleCheckSheet
        isOpen={styleCheckOpen}
        onClose={() => setStyleCheckOpen(false)}
      />
    </div>
  )
}

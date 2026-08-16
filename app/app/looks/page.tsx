"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, Download, Trash2, Search, Sparkles, MoreVertical, Shirt, Package } from "lucide-react"
import { SaveImageSheet } from "@/components/save-image-sheet"
import { renderSinglePhoto, renderLookGrid } from "@/lib/save-image"
import { AddCollectionSheet } from "@/components/add-collection-sheet"
import { CreateLookSheet } from "@/components/create-look-sheet"
import { AddOutfitsToCollectionSheet } from "@/components/add-outfits-to-collection-sheet"
import { CollectionFilterModal } from "@/components/collection-filter-modal"
import { toast } from "sonner"
import { useReconcileLimits } from "@/hooks/use-reconcile-limits"
import { SubscriptionSheet } from "@/components/subscription-sheet"
import { useFeature } from "@/hooks/use-feature"
import { api } from "@/lib/api-client"

interface ExpandedItem {
  id: number
  item_name?: string
  name_ru?: string
  image_url?: string
  color?: string
  material?: string
  source: "user" | "basic"
}

interface SavedLook {
  id: number
  name: string
  description?: string
  items: Array<{ type: string; id: number }>
  expandedItems?: ExpandedItem[]
  image_url?: string
  created_at: string
}

interface LooksSection {
  id: number
  name: string
  description?: string
  section_looks?: Array<{
    look_id: number
    user_looks: SavedLook
  }>
  created_at: string
}

// Лесенка появления карточек — максимум 8 шагов, дальше все карточки одной
// задержкой (тот же язык, что и components/user-wardrobe-grid.tsx).
const MAX_STAGGER_STEPS = 8
const STAGGER_STEP_MS = 45

function itemsLabel(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod100 >= 11 && mod100 <= 14) return "вещей"
  if (mod10 === 1) return "вещь"
  if (mod10 >= 2 && mod10 <= 4) return "вещи"
  return "вещей"
}

function looksLabel(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod100 >= 11 && mod100 <= 14) return "образов"
  if (mod10 === 1) return "образ"
  if (mod10 >= 2 && mod10 <= 4) return "образа"
  return "образов"
}

// Мозаика вещей образа — одна поверхность со швами в 1px (--line), а не
// отдельная скруглённая плашка под каждой картинкой. Образ читается как один
// объект; радиус живёт только на внешней Card.
function LookMosaic({ items }: { items: ExpandedItem[] }) {
  const shown = items.slice(0, 4)
  const overflow = items.length - shown.length

  if (shown.length === 0) {
    return (
      <div className="aspect-square bg-canvas-sunk ring-1 ring-inset ring-line flex items-center justify-center">
        <Package className="w-6 h-6 text-ink-3" />
      </div>
    )
  }

  const gridClass =
    shown.length === 1 ? "grid-cols-1 grid-rows-1" : shown.length === 2 ? "grid-cols-2 grid-rows-1" : "grid-cols-2 grid-rows-2"

  return (
    // p-px тем же --line, что и шов между плитками — светлая вещь (белое,
    // кремовое) на canvas-sunk получает контур по периметру мозаики, а не
    // только внутренние швы. Один и тот же 1px везде, нигде не удваивается.
    <div className={`grid ${gridClass} gap-px aspect-square bg-line p-px`}>
      {shown.map((item, index) => {
        const name = item.source === "user" ? item.item_name : item.name_ru
        const isLast = index === shown.length - 1
        return (
          <div
            key={`${item.source}-${item.id}-${index}`}
            className={`relative bg-canvas-sunk flex items-center justify-center p-2.5 ${
              shown.length === 3 && index === 0 ? "row-span-2" : ""
            }`}
          >
            <img
              src={item.image_url || "/placeholder.svg"}
              alt={name || "Вещь"}
              className="max-w-full max-h-full object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = "/placeholder.svg"
              }}
            />
            {overflow > 0 && isLast && (
              <div className="absolute inset-0 bg-ink/60 flex items-center justify-center">
                <span className="text-body font-bold text-signal-ink">+{overflow}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function LooksPage() {
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([])
  const [sections, setSections] = useState<LooksSection[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddCollectionOpen, setIsAddCollectionOpen] = useState(false)
  const [isCreateLookOpen, setIsCreateLookOpen] = useState(false)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [saveTarget, setSaveTarget] = useState<
    null | { render: () => Promise<Blob>; fileName: string; title?: string }
  >(null)
  const [addOutfitsSheet, setAddOutfitsSheet] = useState<{
    isOpen: boolean
    sectionId: number
    sectionName: string
    existingLookIds: number[]
  }>({
    isOpen: false,
    sectionId: 0,
    sectionName: "",
    existingLookIds: [],
  })
  const [filterModal, setFilterModal] = useState<{
    isOpen: boolean
    sectionId: number
    sectionName: string
    looks: SavedLook[]
  }>({
    isOpen: false,
    sectionId: 0,
    sectionName: "",
    looks: [],
  })

  const { log, consume } = useFeature()
  useReconcileLimits(true)

  // Split looks into regular and try-on (try-ons have image_url set)
  const regularLooks = useMemo(() => savedLooks.filter((l) => !l.image_url), [savedLooks])
  const tryOnLooks = useMemo(() => savedLooks.filter((l) => !!l.image_url), [savedLooks])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      await Promise.all([loadSavedLooks(), loadSections()])
    } catch (error) {
      console.error("Error loading data:", error)
      toast.error("Ошибка загрузки данных")
    } finally {
      setLoading(false)
    }
  }

  const loadSavedLooks = async () => {
    try {
      const looks = await api.get("/api/user-looks")
      setSavedLooks(looks)
    } catch (error) {
      console.error("Error loading saved looks:", error)
    }
  }

  const loadSections = async () => {
    try {
      const sectionsData = await api.get("/api/looks-sections")
      setSections(sectionsData)
    } catch (error) {
      console.error("Error loading sections:", error)
    }
  }

  const handleCreateLook = async (lookData: {
    name: string
    description: string
    items: Array<{ type: string; id: number }>
  }) => {
    try {
      const requestId = crypto.randomUUID()
      void log("outfits_saved", "attempt", {
        pagePath: "/app/looks",
        requestId,
        itemsCount: lookData?.items?.length ?? 0,
      })

      const newLook = await api.post("/api/user-looks", lookData)
      setSavedLooks((prev) => [newLook, ...prev])
      toast.success("Образ создан успешно!")

      const bill = await consume("outfits_saved", { pagePath: "/app/looks", requestId, lookId: newLook?.id }, 1)
      if (!bill.ok && bill.code === "payment_required") setPaywallOpen(true)
    } catch (error) {
      console.error("Error creating look:", error)
      toast.error("Ошибка создания образа")
    }
  }

  const handleAddCollection = async (name: string, description?: string) => {
    try {
      const newSection = await api.post("/api/looks-sections", { name, description })
      setSections((prev) => [{ ...newSection, section_looks: [] }, ...prev])
      toast.success("Подборка создана успешно!")
      setIsAddCollectionOpen(false)
    } catch (error) {
      console.error("Error creating section:", error)
      toast.error("Ошибка создания подборки")
    }
  }

  const handleDeleteLook = async (lookId: number) => {
    try {
      await api.delete(`/api/user-looks/${lookId}`)
      setSavedLooks((prev) => prev.filter((look) => look.id !== lookId))
      toast.success("Образ удален")
    } catch (error) {
      console.error("Error deleting look:", error)
      toast.error("Ошибка удаления образа")
    }
  }

  const handleOpenAddOutfits = (section: LooksSection) => {
    const existingLookIds = section.section_looks?.map((sl) => sl.look_id) || []
    setAddOutfitsSheet({
      isOpen: true,
      sectionId: section.id,
      sectionName: section.name,
      existingLookIds,
    })
  }

  const handleOpenFilter = (section: LooksSection) => {
    const sectionLooks = section.section_looks?.map((sl) => sl.user_looks) || []
    setFilterModal({
      isOpen: true,
      sectionId: section.id,
      sectionName: section.name,
      looks: sectionLooks,
    })
  }

  const handleAddOutfitsToCollection = async (sectionId: number, lookIds: number[]) => {
    try {
      const promises = lookIds.map((lookId) =>
        api.post(`/api/looks-sections/${sectionId}/looks`, { look_id: lookId })
      )

      await Promise.all(promises)
      toast.success(`Добавлено ${lookIds.length} образов в подборку`)
      loadSections() // Reload sections to show new outfits
    } catch (error) {
      console.error("Error adding outfits to collection:", error)
      toast.error("Ошибка добавления образов")
    }
  }

  const handleSaveLookPhoto = (look: SavedLook) => {
    const urls = (look.expandedItems || []).map((it) => it.image_url || "").filter(Boolean)
    if (urls.length === 0) {
      toast.error("Нет изображений для сохранения")
      return
    }
    setSaveTarget({
      render: () => renderLookGrid(urls, look.name),
      fileName: `modemorph-look-${look.id}.png`,
      title: look.name,
    })
  }

  const handleSaveTryOnPhoto = (look: SavedLook) => {
    if (!look.image_url) return
    setSaveTarget({
      render: () => renderSinglePhoto(look.image_url!),
      fileName: `modemorph-tryon-${look.id}.png`,
      title: look.name,
    })
  }

  // Действия карточки живут в меню за иконкой "ещё" — не висят поверх фото
  // постоянно и работают на тач-устройствах (в отличие от group-hover).
  const LookCard = ({
    look,
    index,
    showDelete = false,
    className = "w-full",
  }: {
    look: SavedLook
    index: number
    showDelete?: boolean
    className?: string
  }) => {
    const items = look.expandedItems || []

    return (
      <Card
        className={`border-0 overflow-hidden relative group animate-fade-up ${className}`}
        style={{ animationDelay: `${Math.min(index, MAX_STAGGER_STEPS - 1) * STAGGER_STEP_MS}ms` }}
      >
        <LookMosaic items={items} />

        <div className="absolute top-2 right-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="group -m-2 flex h-11 w-11 items-center justify-center"
                aria-label="Действия с образом"
              >
                <span className="glass flex h-7 w-7 items-center justify-center rounded-full text-ink transition-transform duration-press group-active:scale-95">
                  <MoreVertical className="h-3.5 w-3.5" />
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleSaveLookPhoto(look)}>
                <Download className="h-4 w-4 mr-2" />
                Сохранить фото
              </DropdownMenuItem>
              {showDelete && (
                <DropdownMenuItem onClick={() => handleDeleteLook(look.id)} className="text-red-600 focus:text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="px-3 pt-2.5 pb-3">
          <h4 className="text-caption font-semibold text-ink truncate">{look.name}</h4>
          <p className="text-caption text-ink-2 mt-0.5">
            {items.length} {itemsLabel(items.length)}
          </p>
        </div>
      </Card>
    )
  }

  const TryOnCard = ({ look, index }: { look: SavedLook; index: number }) => {
    return (
      <Card
        className="border-0 overflow-hidden relative group flex-shrink-0 w-36 animate-fade-up"
        style={{ animationDelay: `${Math.min(index, MAX_STAGGER_STEPS - 1) * STAGGER_STEP_MS}ms` }}
      >
        <div className="aspect-[3/4] relative bg-canvas-sunk">
          {look.image_url && (
            <img
              src={look.image_url}
              alt={look.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = "/placeholder.svg"
              }}
            />
          )}
        </div>

        <div className="absolute top-2 right-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="group -m-2 flex h-11 w-11 items-center justify-center"
                aria-label="Действия с примеркой"
              >
                <span className="glass flex h-7 w-7 items-center justify-center rounded-full text-ink transition-transform duration-press group-active:scale-95">
                  <MoreVertical className="h-3.5 w-3.5" />
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleSaveTryOnPhoto(look)}>
                <Download className="h-4 w-4 mr-2" />
                Сохранить фото
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDeleteLook(look.id)} className="text-red-600 focus:text-red-600">
                <Trash2 className="h-4 w-4 mr-2" />
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="px-3 pt-2.5 pb-3">
          <h4 className="text-caption font-semibold text-ink truncate">{look.name}</h4>
        </div>
      </Card>
    )
  }

  const AddOutfitCard = ({ section }: { section: LooksSection }) => {
    return (
      <button
        onClick={() => handleOpenAddOutfits(section)}
        className="flex-shrink-0 w-36 aspect-square rounded-[18px] border border-dashed border-line bg-canvas-sunk/50 flex flex-col items-center justify-center gap-2 text-ink-2 transition-colors duration-press hover:bg-canvas-sunk active:scale-[.98]"
      >
        <Plus className="w-5 h-5" />
        <span className="text-caption font-semibold">Добавить образы</span>
      </button>
    )
  }

  const CollectionSection = ({ section }: { section: LooksSection }) => {
    const sectionLooks = section.section_looks?.map((sl) => sl.user_looks) || []
    const hasLooks = sectionLooks.length > 0

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-body font-semibold text-ink">{section.name}</h3>
            <p className="text-caption text-ink-2">
              {sectionLooks.length} {looksLabel(sectionLooks.length)}
            </p>
          </div>
          {hasLooks && (
            // gap-4 — не эстетика: с исходным gap-1 (4px) две 44px-зоны касания
            // физически перекрывались бы (визуальный размер иконок не трогаем).
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleOpenFilter(section)}
                aria-label="Поиск и фильтры"
                className="group -m-1.5 flex h-11 w-11 items-center justify-center"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition-[background-color,transform] duration-press group-hover:bg-canvas-sunk group-active:scale-95">
                  <Search className="w-4 h-4" />
                </span>
              </button>
              <button
                onClick={() => handleOpenAddOutfits(section)}
                aria-label="Добавить образы в подборку"
                className="group -m-1.5 flex h-11 w-11 items-center justify-center"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition-[background-color,transform] duration-press group-hover:bg-canvas-sunk group-active:scale-95">
                  <Plus className="w-4 h-4" />
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="relative scroll-section">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 pt-1">
            {!hasLooks && <AddOutfitCard section={section} />}
            {sectionLooks.map((look, index) => (
              <LookCard key={look.id} look={look} index={index} className="w-36 flex-shrink-0" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="px-4 pt-2 pb-6 space-y-8">
        {/* Header skeleton */}
        <div className="space-y-3">
          <div className="skeleton h-8 w-32 rounded-full" />
          <div className="space-y-2">
            <div className="skeleton h-[52px] w-full rounded-full" />
            <div className="skeleton h-10 w-full rounded-full" />
          </div>
        </div>

        {/* All looks grid skeleton */}
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <div className="skeleton h-5 w-24 rounded-full" />
            <div className="skeleton h-4 w-14 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-[18px] overflow-hidden">
                <div className="skeleton aspect-square" />
                <div className="px-3 pt-2.5 pb-3 space-y-1.5">
                  <div className="skeleton h-3 w-4/5 rounded-full" />
                  <div className="skeleton h-2.5 w-2/5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-2 pb-6 space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <h1 className="text-h1 text-ink">Образы</h1>

        <div className="space-y-2">
          <Button onClick={() => setIsCreateLookOpen(true)} variant="signal" size="lg" className="w-full">
            <Plus className="w-5 h-5" />
            Создать образ
          </Button>

          {/* Подборка — второстепенное действие, поэтому тише и мельче
              основной кнопки, а не такая же пилюля рядом. h-11 — минимум касания,
              а не просто эстетика: раньше была h-10 (40px). */}
          <button
            onClick={() => setIsAddCollectionOpen(true)}
            className="w-full h-11 rounded-full border border-line text-ink-2 text-caption font-semibold flex items-center justify-center gap-1.5 transition-[background-color,transform] duration-press ease-out active:scale-[.98] hover:bg-canvas-sunk"
          >
            <Plus className="w-3.5 h-3.5" />
            Новая подборка
          </button>
        </div>
      </div>

      {/* All Looks — плотная сетка, а не карусель с картонками (планка: whering
          wishlist grid) */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-h2 text-ink">Все образы</h2>
          <span className="text-caption text-ink-2">
            {regularLooks.length} {looksLabel(regularLooks.length)}
          </span>
        </div>

        {regularLooks.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {regularLooks.map((look, index) => (
              <LookCard key={look.id} look={look} index={index} showDelete />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="w-11 h-11 rounded-full bg-canvas-sunk flex items-center justify-center">
              <Shirt className="w-5 h-5 text-ink-2" />
            </div>
            <p className="text-body text-ink-2 max-w-[220px]">Сохраните первый образ — и он всегда будет под рукой</p>
          </div>
        )}
      </div>

      {/* Try-Ons Section */}
      {tryOnLooks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-h2 text-ink flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-ink-2" />
              Примерки
            </h2>
            <span className="text-caption text-ink-2">{tryOnLooks.length} примерок</span>
          </div>

          <div className="relative scroll-section">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 pt-1">
              {tryOnLooks.map((look, index) => (
                <TryOnCard key={look.id} look={look} index={index} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Collections */}
      {sections.length > 0 && (
        <div className="space-y-8">
          <h2 className="text-h2 text-ink">Подборки</h2>
          {sections.map((section) => (
            <CollectionSection key={section.id} section={section} />
          ))}
        </div>
      )}

      {/* Sheets */}
      <CreateLookSheet isOpen={isCreateLookOpen} onClose={() => setIsCreateLookOpen(false)} onSave={handleCreateLook} />

      <AddCollectionSheet
        isOpen={isAddCollectionOpen}
        onClose={() => setIsAddCollectionOpen(false)}
        onAdd={handleAddCollection}
      />

      <AddOutfitsToCollectionSheet
        isOpen={addOutfitsSheet.isOpen}
        onClose={() => setAddOutfitsSheet((prev) => ({ ...prev, isOpen: false }))}
        sectionId={addOutfitsSheet.sectionId}
        sectionName={addOutfitsSheet.sectionName}
        existingLookIds={addOutfitsSheet.existingLookIds}
        onAdd={handleAddOutfitsToCollection}
      />

      <CollectionFilterModal
        isOpen={filterModal.isOpen}
        onClose={() => setFilterModal((prev) => ({ ...prev, isOpen: false }))}
        sectionName={filterModal.sectionName}
        looks={filterModal.looks}
      />

      {saveTarget && (
        <SaveImageSheet
          key={saveTarget.fileName}
          open
          onClose={() => setSaveTarget(null)}
          render={saveTarget.render}
          fileName={saveTarget.fileName}
          title={saveTarget.title}
        />
      )}

      {paywallOpen && (
        <SubscriptionSheet
          isOpen={paywallOpen}
          source="limit:outfits_saved"
          onClose={() => setPaywallOpen(false)}
          onSuccess={() => setPaywallOpen(false)}
        />
      )}
    </div>
  )
}

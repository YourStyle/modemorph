"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, ExternalLink, Trash2, Search, Sparkles } from "lucide-react"
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

export default function LooksPage() {
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([])
  const [sections, setSections] = useState<LooksSection[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddCollectionOpen, setIsAddCollectionOpen] = useState(false)
  const [isCreateLookOpen, setIsCreateLookOpen] = useState(false)
  const [paywallOpen, setPaywallOpen] = useState(false)
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
      console.log("Loaded looks:", looks)
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

  const LookCard = ({ look, showDelete = false }: { look: SavedLook; showDelete?: boolean }) => {
    const items = look.expandedItems || []
    console.log(`Rendering look ${look.id} with ${items.length} items:`, items)

    return (
      <Card className="p-4 bg-gray-100 border-0 relative group hover:shadow-md transition-shadow flex-shrink-0 w-80">
        <div className="grid grid-cols-3 gap-3 min-h-[240px]">
          {items.length === 0 ? (
            <div className="col-span-3 flex items-center justify-center text-gray-500">
              <p>Нет вещей для отображения</p>
            </div>
          ) : (
            items.slice(0, 6).map((item, index) => {
              const itemName = item.source === "user" ? item.item_name : item.name_ru
              const imageUrl = item.image_url || "/placeholder.svg"

              console.log(`Rendering item ${index}:`, { itemName, imageUrl, source: item.source })

              return (
                <div
                  key={`${item.source}-${item.id}-${index}`}
                  className={`flex items-center justify-center bg-white rounded-lg p-2 ${
                    items.length === 1
                      ? "col-span-3"
                      : items.length === 2 && index === 0
                        ? "col-span-2"
                        : items.length === 3 && index === 0
                          ? "col-span-3"
                          : items.length === 4 && index < 2
                            ? "col-span-3"
                            : items.length === 5 && index === 0
                              ? "col-span-3"
                              : ""
                  }`}
                >
                  <img
                    src={imageUrl || "/placeholder.svg"}
                    alt={itemName || "Item"}
                    className="max-w-full max-h-[100px] object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      console.log(`Image failed to load: ${target.src}`)
                      target.src = "/placeholder.svg"
                    }}
                    onLoad={() => {
                      console.log(`Image loaded successfully: ${imageUrl}`)
                    }}
                  />
                </div>
              )
            })
          )}
        </div>

        <div className="mt-4">
          <h4 className="font-medium text-base truncate">{look.name}</h4>
          {look.description && <p className="text-sm text-gray-500 truncate mt-1">{look.description}</p>}
          <p className="text-xs text-gray-400 mt-1">
            {items.length} вещей ({look.items?.length || 0} в данных)
          </p>
        </div>

        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <Button variant="ghost" size="sm" className="p-1 h-auto">
            <ExternalLink className="w-4 h-4" />
          </Button>
          {showDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-auto text-red-500 hover:text-red-700"
              onClick={(e) => {
                e.stopPropagation()
                handleDeleteLook(look.id)
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        {paywallOpen && (
          <SubscriptionSheet
            isOpen={paywallOpen}
            onClose={() => setPaywallOpen(false)}
            onSuccess={() => setPaywallOpen(false)}
          />
        )}
      </Card>
    )
  }

  const AddOutfitCard = ({ section }: { section: LooksSection }) => {
    return (
      <Card
        onClick={() => handleOpenAddOutfits(section)}
        className="p-4 bg-white border-2 border-dashed border-gray-300 hover:border-gray-400 cursor-pointer transition-colors flex-shrink-0 w-80 min-h-[320px] flex items-center justify-center group"
      >
        <div className="text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-gray-200 transition-colors">
            <Plus className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-gray-600 font-medium">Добавить образы</p>
          <p className="text-sm text-gray-400 mt-1">Выберите образы для подборки</p>
        </div>
      </Card>
    )
  }

  const CollectionSection = ({ section }: { section: LooksSection }) => {
    const sectionLooks = section.section_looks?.map((sl) => sl.user_looks) || []
    const hasLooks = sectionLooks.length > 0

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">{section.name}</h3>
            <p className="text-sm text-gray-500">
              {sectionLooks.length} образ{sectionLooks.length !== 1 ? "ов" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasLooks && (
              <div className="flex flex-col gap-2 w-full md:flex-row md:gap-4">
                <Button
                  onClick={() => handleOpenFilter(section)}
                  variant="outline"
                  size="sm"
                  className="text-gray-700 border-gray-200 hover:bg-gray-50 w-full md:w-auto"
                >
                  <Search className="w-4 h-4 mr-1" />
                  Поиск и фильтры
                </Button>
                <Button
                  onClick={() => handleOpenAddOutfits(section)}
                  variant="outline"
                  size="sm"
                  className="text-gray-700 border-gray-200 hover:bg-gray-50 w-full md:w-auto"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Добавить образы
                </Button>
              </div>
            )}

            <Button variant="ghost" size="sm" className="p-2">
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="relative min-h-[200px]">
          <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
            {!hasLooks && <AddOutfitCard section={section} />}
            {sectionLooks.map((look) => (
              <LookCard key={look.id} look={look} />
            ))}
          </div>

          {sectionLooks.length > 0 && (
            <>
              <div className="absolute top-1/2 -translate-y-1/2 left-0 w-8 h-full bg-gradient-to-r from-white to-transparent pointer-events-none opacity-50" />
              <div className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-full bg-gradient-to-l from-white to-transparent pointer-events-none opacity-50" />
            </>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="px-4 py-6 space-y-8 animate-pulse">
        {/* Header Skeleton */}
        <div className="space-y-4">
          <div className="h-9 bg-gray-200 rounded-lg w-48" />
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="h-12 bg-gray-200 rounded-xl w-full sm:flex-1" />
            <div className="h-12 bg-gray-200 rounded-xl w-full sm:flex-1" />
          </div>
        </div>

        {/* All Looks Section Skeleton */}
        <div className="space-y-4">
          <div>
            <div className="h-7 bg-gray-200 rounded-lg w-40 mb-2" />
            <div className="h-5 bg-gray-200 rounded w-24" />
          </div>
          <div className="flex gap-4 overflow-x-hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-shrink-0 w-80">
                <div className="p-4 bg-gray-100 rounded-lg border border-gray-200">
                  <div className="grid grid-cols-3 gap-3 min-h-[240px]">
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <div key={j} className="bg-gray-200 rounded-lg h-24" />
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-gray-900">Образы</h1>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={() => setIsCreateLookOpen(true)}
            className="w-full sm:flex-1 bg-gray-900 hover:bg-gray-800 text-white h-12 rounded-xl font-medium"
          >
            <Plus className="w-5 h-5 mr-2" />
            Создать образ
          </Button>

          <Button
            onClick={() => setIsAddCollectionOpen(true)}
            variant="outline"
            className="w-full sm:flex-1 border-gray-200 text-gray-700 hover:bg-gray-50 h-12 rounded-xl font-medium"
          >
            <Plus className="w-5 h-5 mr-2" />
            Добавить в чемодан
          </Button>
        </div>
      </div>

      {/* All Looks Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Все образы</h2>
            <p className="text-sm text-gray-500">{regularLooks.length} образов</p>
          </div>
        </div>

        <div className="relative">
          {regularLooks.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
              {regularLooks.map((look) => (
                <LookCard key={look.id} look={look} showDelete={true} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-md"
                style={{ background: "linear-gradient(135deg, #EC9DE2, #89AEFF)" }}
              >
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Сохраните первый образ</h3>
              <p className="text-sm text-gray-500 mb-5 max-w-xs">Получите рекомендации на главной странице и сохраняйте понравившиеся образы здесь.</p>
              <Button
                onClick={() => setIsCreateLookOpen(true)}
                className="rounded-2xl text-white text-sm font-semibold px-6 py-3 shadow-md border-0"
                style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Создать первый образ
              </Button>
            </div>
          )}

          {regularLooks.length > 1 && (
            <>
              <div className="absolute top-1/2 -translate-y-1/2 left-0 w-8 h-full bg-gradient-to-r from-white to-transparent pointer-events-none opacity-50" />
              <div className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-full bg-gradient-to-l from-white to-transparent pointer-events-none opacity-50" />
            </>
          )}
        </div>
      </div>

      {/* Try-Ons Section */}
      {tryOnLooks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                Примерки
              </h2>
              <p className="text-sm text-gray-500">{tryOnLooks.length} примерок</p>
            </div>
          </div>

          <div className="relative">
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
              {tryOnLooks.map((look) => (
                <Card
                  key={look.id}
                  className="p-0 bg-gray-100 border-0 relative group hover:shadow-md transition-shadow flex-shrink-0 w-64 overflow-hidden"
                >
                  {/* Try-on result image */}
                  {look.image_url && (
                    <div className="aspect-[3/4] relative">
                      <img
                        src={look.image_url}
                        alt={look.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.src = "/placeholder.svg"
                        }}
                      />
                    </div>
                  )}

                  <div className="p-3">
                    <h4 className="font-medium text-sm truncate">{look.name}</h4>
                    <p className="text-xs text-gray-400 mt-1">
                      {look.expandedItems?.length || look.items?.length || 0} вещей
                    </p>
                  </div>

                  {/* Delete button */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-1 h-auto text-red-500 hover:text-red-700 bg-white/80 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteLook(look.id)
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {tryOnLooks.length > 1 && (
              <>
                <div className="absolute top-1/2 -translate-y-1/2 left-0 w-8 h-full bg-gradient-to-r from-white to-transparent pointer-events-none opacity-50" />
                <div className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-full bg-gradient-to-l from-white to-transparent pointer-events-none opacity-50" />
              </>
            )}
          </div>
        </div>
      )}

      {/* Collections */}
      {sections.length > 0 && (
        <div className="space-y-8">
          <h2 className="text-xl font-semibold text-gray-900">Подборки</h2>
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
    </div>
  )
}

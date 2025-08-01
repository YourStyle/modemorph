"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, ExternalLink, Trash2, Search } from "lucide-react"
import { PastelLoader } from "@/components/pastel-loader"
import { AddCollectionSheet } from "@/components/add-collection-sheet"
import { CreateLookSheet } from "@/components/create-look-sheet"
import { AddOutfitsToCollectionSheet } from "@/components/add-outfits-to-collection-sheet"
import { CollectionFilterModal } from "@/components/collection-filter-modal"
import { toast } from "sonner"

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
      const response = await fetch("/api/user-looks")
      if (response.ok) {
        const looks = await response.json()
        console.log("Loaded looks:", looks)
        setSavedLooks(looks)
      } else {
        throw new Error("Failed to load looks")
      }
    } catch (error) {
      console.error("Error loading saved looks:", error)
    }
  }

  const loadSections = async () => {
    try {
      const response = await fetch("/api/looks-sections")
      if (response.ok) {
        const sectionsData = await response.json()
        setSections(sectionsData)
      } else {
        throw new Error("Failed to load sections")
      }
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
      const response = await fetch("/api/user-looks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(lookData),
      })

      if (response.ok) {
        const newLook = await response.json()
        setSavedLooks((prev) => [newLook, ...prev])
        toast.success("Образ создан успешно!")
      } else {
        throw new Error("Failed to create look")
      }
    } catch (error) {
      console.error("Error creating look:", error)
      toast.error("Ошибка создания образа")
    }
  }

  const handleAddCollection = async (name: string, description?: string) => {
    try {
      const response = await fetch("/api/looks-sections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, description }),
      })

      if (response.ok) {
        const newSection = await response.json()
        setSections((prev) => [{ ...newSection, section_looks: [] }, ...prev])
        toast.success("Подборка создана успешно!")
        setIsAddCollectionOpen(false)
      } else {
        throw new Error("Failed to create section")
      }
    } catch (error) {
      console.error("Error creating section:", error)
      toast.error("Ошибка создания подборки")
    }
  }

  const handleDeleteLook = async (lookId: number) => {
    try {
      const response = await fetch(`/api/user-looks/${lookId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setSavedLooks((prev) => prev.filter((look) => look.id !== lookId))
        toast.success("Образ удален")
      } else {
        throw new Error("Failed to delete look")
      }
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
        fetch(`/api/looks-sections/${sectionId}/looks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ look_id: lookId }),
        }),
      )

      const responses = await Promise.all(promises)
      const failedCount = responses.filter((r) => !r.ok).length

      if (failedCount === 0) {
        toast.success(`Добавлено ${lookIds.length} образов в подборку`)
        loadSections() // Reload sections to show new outfits
      } else {
        toast.error(`Ошибка добавления ${failedCount} образов`)
      }
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
              <>
                <Button
                  onClick={() => handleOpenFilter(section)}
                  variant="outline"
                  size="sm"
                  className="text-gray-700 border-gray-200 hover:bg-gray-50"
                >
                  <Search className="w-4 h-4 mr-1" />
                  Поиск и фильтры
                </Button>
                <Button
                  onClick={() => handleOpenAddOutfits(section)}
                  variant="outline"
                  size="sm"
                  className="text-gray-700 border-gray-200 hover:bg-gray-50"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Добавить образы
                </Button>
              </>
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
      <div className="flex items-center justify-center min-h-[400px]">
        <PastelLoader />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-gray-900">Образы</h1>

        <div className="flex gap-3">
          <Button
            onClick={() => setIsCreateLookOpen(true)}
            className="flex-1 bg-gray-900 hover:bg-gray-800 text-white h-12 rounded-xl font-medium"
          >
            <Plus className="w-5 h-5 mr-2" />
            Создать образ
          </Button>

          <Button
            onClick={() => setIsAddCollectionOpen(true)}
            variant="outline"
            className="flex-1 border-gray-200 text-gray-700 hover:bg-gray-50 h-12 rounded-xl font-medium"
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
            <p className="text-sm text-gray-500">{savedLooks.length} образов</p>
          </div>
        </div>

        <div className="relative">
          {savedLooks.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
              {savedLooks.map((look) => (
                <LookCard key={look.id} look={look} showDelete={true} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">У вас пока нет сохраненных образов</p>
              <Button
                onClick={() => setIsCreateLookOpen(true)}
                variant="outline"
                className="text-gray-700 border-gray-200"
              >
                <Plus className="w-4 h-4 mr-2" />
                Создать первый образ
              </Button>
            </div>
          )}

          {savedLooks.length > 1 && (
            <>
              <div className="absolute top-1/2 -translate-y-1/2 left-0 w-8 h-full bg-gradient-to-r from-white to-transparent pointer-events-none opacity-50" />
              <div className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-full bg-gradient-to-l from-white to-transparent pointer-events-none opacity-50" />
            </>
          )}
        </div>
      </div>

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

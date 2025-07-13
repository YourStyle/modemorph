"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, ExternalLink, Trash2 } from "lucide-react"
import { PastelLoader } from "@/components/pastel-loader"
import { AddCollectionSheet } from "@/components/add-collection-sheet"
import { CreateLookDialog } from "@/components/create-look-dialog"
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

  const handleAddCollection = async (name: string) => {
    try {
      const response = await fetch("/api/looks-sections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      })

      if (response.ok) {
        const newSection = await response.json()
        setSections((prev) => [{ ...newSection, section_looks: [] }, ...prev])
        toast.success("Подборка создана успешно!")
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

  const LookCard = ({ look, showDelete = false }: { look: SavedLook; showDelete?: boolean }) => {
    const items = look.expandedItems || []

    return (
      <Card className="p-4 bg-gray-100 border-0 relative group hover:shadow-md transition-shadow flex-shrink-0 w-64">
        <div className="grid grid-cols-3 gap-2 min-h-[200px]">
          {items.slice(0, 6).map((item, index) => (
            <div
              key={`${item.source}-${item.id}-${index}`}
              className={`flex items-center justify-center ${
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
                src={item.image_url || "/placeholder.svg"}
                alt={item.item_name || item.name_ru || "Item"}
                className="max-w-full max-h-[80px] object-contain"
              />
            </div>
          ))}
        </div>

        <div className="mt-3">
          <h4 className="font-medium text-sm truncate">{look.name}</h4>
          {look.description && <p className="text-xs text-gray-500 truncate mt-1">{look.description}</p>}
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

  const CollectionSection = ({ section }: { section: LooksSection }) => {
    const sectionLooks = section.section_looks?.map((sl) => sl.user_looks) || []

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">{section.name}</h3>
            <p className="text-sm text-gray-500">
              {sectionLooks.length} образ{sectionLooks.length !== 1 ? "ов" : ""}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="p-2">
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>

        {/* Horizontal scrolling for collection looks */}
        <div className="relative">
          {sectionLooks.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
              {sectionLooks.map((look) => (
                <LookCard key={look.id} look={look} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>В этой подборке пока нет образов</p>
            </div>
          )}

          {sectionLooks.length > 1 && (
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
            Добавить подборку
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

        {/* Horizontal scrolling for all looks */}
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

      {/* Dialogs */}
      <CreateLookDialog
        isOpen={isCreateLookOpen}
        onClose={() => setIsCreateLookOpen(false)}
        onSave={handleCreateLook}
      />

      <AddCollectionSheet
        isOpen={isAddCollectionOpen}
        onClose={() => setIsAddCollectionOpen(false)}
        onAdd={handleAddCollection}
      />
    </div>
  )
}

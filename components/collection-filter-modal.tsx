"use client"

import { useState, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Search, X, Filter } from "lucide-react"

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

interface CollectionFilterModalProps {
  isOpen: boolean
  onClose: () => void
  sectionName: string
  looks: SavedLook[]
}

export function CollectionFilterModal({ isOpen, onClose, sectionName, looks }: CollectionFilterModalProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([])

  // Extract unique colors and materials from all looks
  const { availableColors, availableMaterials } = useMemo(() => {
    const colors = new Set<string>()
    const materials = new Set<string>()

    looks.forEach((look) => {
      look.expandedItems?.forEach((item) => {
        if (item.color) colors.add(item.color)
        if (item.material) materials.add(item.material)
      })
    })

    return {
      availableColors: Array.from(colors).sort(),
      availableMaterials: Array.from(materials).sort(),
    }
  }, [looks])

  // Filter looks based on search and filters
  const filteredLooks = useMemo(() => {
    return looks.filter((look) => {
      // Search filter
      const matchesSearch =
        searchQuery === "" ||
        look.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        look.description?.toLowerCase().includes(searchQuery.toLowerCase())

      // Color filter
      const matchesColor =
        selectedColors.length === 0 ||
        look.expandedItems?.some((item) => item.color && selectedColors.includes(item.color))

      // Material filter
      const matchesMaterial =
        selectedMaterials.length === 0 ||
        look.expandedItems?.some((item) => item.material && selectedMaterials.includes(item.material))

      return matchesSearch && matchesColor && matchesMaterial
    })
  }, [looks, searchQuery, selectedColors, selectedMaterials])

  const toggleColor = (color: string) => {
    setSelectedColors((prev) => (prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]))
  }

  const toggleMaterial = (material: string) => {
    setSelectedMaterials((prev) => (prev.includes(material) ? prev.filter((m) => m !== material) : [...prev, material]))
  }

  const clearFilters = () => {
    setSearchQuery("")
    setSelectedColors([])
    setSelectedMaterials([])
  }

  const LookCard = ({ look }: { look: SavedLook }) => {
    const items = look.expandedItems || []

    return (
      <Card className="p-3 bg-gray-50 border-0 hover:shadow-md transition-shadow">
        <div className="grid grid-cols-3 gap-2 min-h-[120px] mb-3">
          {items.length === 0 ? (
            <div className="col-span-3 flex items-center justify-center text-gray-500">
              <p className="text-sm">Нет вещей</p>
            </div>
          ) : (
            items.slice(0, 6).map((item, index) => {
              const itemName = item.source === "user" ? item.item_name : item.name_ru
              const imageUrl = item.image_url || "/placeholder.svg"

              return (
                <div
                  key={`${item.source}-${item.id}-${index}`}
                  className="flex items-center justify-center bg-white rounded-lg p-1"
                >
                  <img
                    src={imageUrl || "/placeholder.svg"}
                    alt={itemName || "Item"}
                    className="max-w-full max-h-[60px] object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.src = "/placeholder.svg"
                    }}
                  />
                </div>
              )
            })
          )}
        </div>

        <div>
          <h4 className="font-medium text-sm truncate">{look.name}</h4>
          {look.description && <p className="text-xs text-gray-500 truncate mt-1">{look.description}</p>}
          <p className="text-xs text-gray-400 mt-1">{items.length} вещей</p>
        </div>
      </Card>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Поиск в подборке "{sectionName}"
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Поиск по названию или описанию..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filters */}
          <div className="space-y-3">
            {/* Colors */}
            {availableColors.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Цвета</h4>
                <div className="flex flex-wrap gap-2">
                  {availableColors.map((color) => (
                    <Badge
                      key={color}
                      variant={selectedColors.includes(color) ? "default" : "outline"}
                      className="cursor-pointer hover:bg-gray-100"
                      onClick={() => toggleColor(color)}
                    >
                      {color}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Materials */}
            {availableMaterials.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Материалы</h4>
                <div className="flex flex-wrap gap-2">
                  {availableMaterials.map((material) => (
                    <Badge
                      key={material}
                      variant={selectedMaterials.includes(material) ? "default" : "outline"}
                      className="cursor-pointer hover:bg-gray-100"
                      onClick={() => toggleMaterial(material)}
                    >
                      {material}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Clear filters */}
            {(searchQuery || selectedColors.length > 0 || selectedMaterials.length > 0) && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="w-fit bg-transparent">
                <X className="w-4 h-4 mr-1" />
                Очистить фильтры
              </Button>
            )}
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Найдено: {filteredLooks.length} из {looks.length} образов
              </p>
            </div>

            {filteredLooks.length === 0 ? (
              <div className="text-center py-8">
                <Filter className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Образы не найдены</p>
                <p className="text-sm text-gray-400 mt-1">Попробуйте изменить параметры поиска</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLooks.map((look) => (
                  <LookCard key={look.id} look={look} />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

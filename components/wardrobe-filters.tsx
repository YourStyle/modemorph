"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Search, Filter, X, ChevronDown, ChevronUp } from "lucide-react"
import { getClothingTypesByCategory, getClothingTypeName } from "@/lib/clothing-types"

interface WardrobeFiltersProps {
  onFilterChange: (filters: { search: string; types: string[] }) => void
  selectedTypes: string[]
}

export function WardrobeFilters({ onFilterChange, selectedTypes }: WardrobeFiltersProps) {
  const [search, setSearch] = useState("")
  const [openCategories, setOpenCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const categories = getClothingTypesByCategory()

  useEffect(() => {
    setLoading(false)
  }, [])

  useEffect(() => {
    onFilterChange({ search, types: selectedTypes })
  }, [search, selectedTypes, onFilterChange])

  const handleTypeToggle = (type: string) => {
    const newTypes = selectedTypes.includes(type) ? selectedTypes.filter((t) => t !== type) : [...selectedTypes, type]

    onFilterChange({ search, types: newTypes })
  }

  const handleCategoryToggle = (categoryKey: string) => {
    setOpenCategories((prev) =>
      prev.includes(categoryKey) ? prev.filter((key) => key !== categoryKey) : [...prev, categoryKey],
    )
  }

  const handleSelectAllInCategory = (categoryTypes: string[]) => {
    const allSelected = categoryTypes.every((type) => selectedTypes.includes(type))

    if (allSelected) {
      // Убираем все типы из этой категории
      const newTypes = selectedTypes.filter((type) => !categoryTypes.includes(type))
      onFilterChange({ search, types: newTypes })
    } else {
      // Добавляем все типы из этой категории
      const newTypes = [...new Set([...selectedTypes, ...categoryTypes])]
      onFilterChange({ search, types: newTypes })
    }
  }

  const clearFilters = () => {
    setSearch("")
    onFilterChange({ search: "", types: [] })
  }

  const clearTypes = () => {
    onFilterChange({ search, types: [] })
  }

  return (
    <div className="space-y-4">
      {/* Поиск */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Поиск по названию, цвету, материалу..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Фильтры по типу */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span className="font-medium">Тип одежды:</span>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearTypes}
              disabled={selectedTypes.length === 0}
              className="text-xs"
            >
              Очистить типы
            </Button>
          </div>
        </div>

        {/* Быстрый выбор всех */}
        <div className="flex gap-2">
          <Button
            variant={selectedTypes.length === 0 ? "default" : "outline"}
            size="sm"
            onClick={() => onFilterChange({ search, types: [] })}
          >
            Все типы
          </Button>
        </div>

        {/* Категории типов одежды */}
        {!loading && (
          <div className="space-y-2">
            {categories.map((category) => {
              const isOpen = openCategories.includes(category.categoryKey)
              const selectedInCategory = category.types.filter((type) => selectedTypes.includes(type.value))
              const allSelectedInCategory = category.types.length === selectedInCategory.length
              const someSelectedInCategory = selectedInCategory.length > 0 && !allSelectedInCategory

              return (
                <Collapsible
                  key={category.categoryKey}
                  open={isOpen}
                  onOpenChange={() => handleCategoryToggle(category.categoryKey)}
                >
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{category.categoryName}</span>
                        {selectedInCategory.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {selectedInCategory.length}
                          </Badge>
                        )}
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="space-y-2 pl-4 pt-2">
                    {/* Выбрать все в категории */}
                    <div className="flex items-center space-x-2 py-1">
                      <Checkbox
                        id={`category-${category.categoryKey}`}
                        checked={allSelectedInCategory}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelectedInCategory
                        }}
                        onCheckedChange={() => handleSelectAllInCategory(category.types.map((t) => t.value))}
                      />
                      <label
                        htmlFor={`category-${category.categoryKey}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        Выбрать все
                      </label>
                    </div>

                    {/* Отдельные типы */}
                    <div className="grid grid-cols-1 gap-2">
                      {category.types.map((type) => (
                        <div key={type.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={type.value}
                            checked={selectedTypes.includes(type.value)}
                            onCheckedChange={() => handleTypeToggle(type.value)}
                          />
                          <label htmlFor={type.value} className="text-sm cursor-pointer flex-1">
                            {type.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        )}
      </div>

      {/* Активные фильтры */}
      {(search || selectedTypes.length > 0) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Активные фильтры:</span>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-6">
              Очистить все
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {search && (
              <Badge variant="secondary" className="gap-1">
                Поиск: {search}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setSearch("")} />
              </Badge>
            )}

            {selectedTypes.map((type) => (
              <Badge key={type} variant="secondary" className="gap-1">
                {getClothingTypeName(type)}
                <X className="h-3 w-3 cursor-pointer" onClick={() => handleTypeToggle(type)} />
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

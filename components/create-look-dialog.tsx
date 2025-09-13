"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { X, Plus } from "lucide-react"

interface WardrobeItem {
  id: number
  item_name: string
  image_url?: string
  color: string
  material: string
  basic_wardrobe_items?: {
    name_ru: string
  }
  gender?: string
}

interface BasicItem {
  id: number
  name_ru: string
  description?: string
  image_url?: string
  gender?: string
}

interface SelectedItem {
  id: number
  name: string
  image_url?: string
  type: "user" | "basic"
  color?: string
  material?: string
  gender?: string
}

interface CreateLookDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (look: { name: string; description: string; items: Array<{ type: string; id: number }> }) => void
}

export function CreateLookDialog({ isOpen, onClose, onSave }: CreateLookDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([])
  const [basicItems, setBasicItems] = useState<BasicItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadWardrobeItems()
      loadBasicItems()
    }
  }, [isOpen])

  const loadWardrobeItems = async () => {
    setLoadingItems(true)
    try {
      const response = await fetch("/api/wardrobe-user-items")
      if (response.ok) {
        const items = await response.json()
        setWardrobeItems(items)
      }
    } catch (error) {
      console.error("Error loading wardrobe items:", error)
    } finally {
      setLoadingItems(false)
    }
  }

  const loadBasicItems = async () => {
    try {
      const response = await fetch("/api/basic-wardrobe-items")
      if (response.ok) {
        const items = await response.json()
        setBasicItems(items)
      }
    } catch (error) {
      console.error("Error loading basic items:", error)
    }
  }

  const handleUserItemToggle = (item: WardrobeItem) => {
    const selectedItem: SelectedItem = {
      id: item.id,
      name: item.item_name,
      image_url: item.image_url,
      type: "user",
      color: item.color,
      material: item.material,
      gender: item.gender,
    }

    setSelectedItems((prev) => {
      const isSelected = prev.some((selected) => selected.id === item.id && selected.type === "user")
      if (isSelected) {
        return prev.filter((selected) => !(selected.id === item.id && selected.type === "user"))
      } else {
        return [...prev, selectedItem]
      }
    })
  }

  const handleBasicItemToggle = (item: BasicItem) => {
    const selectedItem: SelectedItem = {
      id: item.id,
      name: item.name_ru,
      image_url: item.image_url,
      type: "basic",
      gender: item.gender,
    }

    setSelectedItems((prev) => {
      const isSelected = prev.some((selected) => selected.id === item.id && selected.type === "basic")
      if (isSelected) {
        return prev.filter((selected) => !(selected.id === item.id && selected.type === "basic"))
      } else {
        return [...prev, selectedItem]
      }
    })
  }

  const removeSelectedItem = (item: SelectedItem) => {
    setSelectedItems((prev) => prev.filter((selected) => !(selected.id === item.id && selected.type === item.type)))
  }

  const handleSave = async () => {
    if (!name.trim() || selectedItems.length === 0) {
      return
    }

    setLoading(true)
    try {
      // Transform items to the format expected by the API
      const items = selectedItems.map((item) => ({
        type: item.type,
        id: item.id,
      }))

      await onSave({
        name: name.trim(),
        description: description.trim(),
        items,
      })

      // Reset form
      setName("")
      setDescription("")
      setSelectedItems([])
      onClose()
    } catch (error) {
      console.error("Error saving look:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName("")
    setDescription("")
    setSelectedItems([])
    onClose()
  }

  const isUserItemSelected = (item: WardrobeItem) =>
    selectedItems.some((selected) => selected.id === item.id && selected.type === "user")

  const isBasicItemSelected = (item: BasicItem) =>
    selectedItems.some((selected) => selected.id === item.id && selected.type === "basic")

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Создать образ</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Form fields */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="look-name">Название образа</Label>
              <Input
                id="look-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Введите название образа"
              />
            </div>

            <div>
              <Label htmlFor="look-description">Описание (необязательно)</Label>
              <Textarea
                id="look-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Добавьте описание образа"
                rows={3}
              />
            </div>
          </div>

          {/* Selected items */}
          {selectedItems.length > 0 && (
            <div>
              <Label>Выбранные вещи ({selectedItems.length})</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedItems.map((item, index) => (
                  <div
                    key={`${item.type}-${item.id}-${index}`}
                    className="relative bg-gray-100 rounded-lg p-2 flex items-center gap-2"
                  >
                    {item.image_url && (
                      <img
                        src={item.image_url || "/placeholder.svg"}
                        alt={item.name}
                        className="w-8 h-8 object-cover rounded"
                      />
                    )}
                    <span className="text-sm">{item.name}</span>
                    <span className="text-xs text-gray-500">({item.type === "user" ? "Мои" : "Базовые"})</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeSelectedItem(item)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items selection tabs */}
          <div>
            <Label>Выберите вещи</Label>
            <Tabs defaultValue="wardrobe" className="mt-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="wardrobe">Мой гардероб ({wardrobeItems.length})</TabsTrigger>
                <TabsTrigger value="basic">Базовые вещи ({basicItems.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="wardrobe" className="mt-4">
                {loadingItems ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  </div>
                ) : wardrobeItems.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-96 overflow-y-auto">
                    {wardrobeItems.map((item) => {
                      const isSelected = isUserItemSelected(item)
                      return (
                        <Card
                          key={`user-${item.id}`}
                          className={`cursor-pointer transition-all hover:shadow-md relative ${
                            isSelected ? "ring-2 ring-blue-500 bg-blue-50" : ""
                          }`}
                          onClick={() => handleUserItemToggle(item)}
                        >
                          <div className="p-3">
                            {item.image_url ? (
                              <img
                                src={item.image_url || "/placeholder.svg"}
                                alt={item.item_name}
                                className="w-full h-20 object-cover rounded mb-2"
                              />
                            ) : (
                              <div className="w-full h-20 bg-gray-200 rounded mb-2 flex items-center justify-center">
                                <span className="text-gray-400 text-xs">Нет фото</span>
                              </div>
                            )}
                            <h4 className="text-xs font-medium truncate">{item.item_name}</h4>
                            <p className="text-xs text-gray-500 truncate">{item.color}</p>
                            {isSelected && (
                              <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                                <Plus className="h-3 w-3" />
                              </div>
                            )}
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>В вашем гардеробе пока нет вещей</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="basic" className="mt-4">
                {basicItems.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-96 overflow-y-auto">
                    {basicItems.map((item) => {
                      const isSelected = isBasicItemSelected(item)
                      return (
                        <Card
                          key={`basic-${item.id}`}
                          className={`cursor-pointer transition-all hover:shadow-md relative ${
                            isSelected ? "ring-2 ring-green-500 bg-green-50" : ""
                          }`}
                          onClick={() => handleBasicItemToggle(item)}
                        >
                          <div className="p-3">
                            {item.image_url ? (
                              <img
                                src={item.image_url || "/placeholder.svg"}
                                alt={item.name_ru}
                                className="w-full h-20 object-cover rounded mb-2"
                              />
                            ) : (
                              <div className="w-full h-20 bg-gray-200 rounded mb-2 flex items-center justify-center">
                                <span className="text-gray-400 text-xs">Нет фото</span>
                              </div>
                            )}
                            <h4 className="text-xs font-medium truncate">{item.name_ru}</h4>
                            <p className="text-xs text-gray-500 truncate">{item.description}</p>
                            {isSelected && (
                              <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                                <Plus className="h-3 w-3" />
                              </div>
                            )}
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>Базовые вещи не найдены</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleClose}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || selectedItems.length === 0 || loading}>
              {loading ? "Сохранение..." : "Сохранить образ"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

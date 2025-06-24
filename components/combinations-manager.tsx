"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, Trash2, X, GripVertical, ImageIcon, Edit, ChevronDown } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase, checkSupabaseConnection } from "@/lib/supabase/client"
import Image from "next/image"

interface BasicItem {
  id: number
  name_ru: string
  image_url: string | null
}

interface BasicMaterial {
  id: number
  name_ru: string
  image_url: string | null
}

interface CombinationElement {
  id: number
  basic_item_id: number | null
  basic_material_id: number | null
  position: number
  basic_wardrobe_items?: BasicItem
  basic_materials?: BasicMaterial
}

interface Combination {
  id: number
  name: string
  description: string | null
  combination_type: "items" | "materials"
  combination_elements: CombinationElement[]
}

interface SelectedElement {
  id: number | null
  tempId: string
}

// Компонент для выбора элемента с изображением
function ElementSelector({
  value,
  onValueChange,
  items,
  placeholder,
}: {
  value: string
  onValueChange: (value: string) => void
  items: (BasicItem | BasicMaterial)[]
  placeholder: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedItem = items.find((item) => item.id.toString() === value)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md bg-white text-left hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedItem ? (
            <>
              <div className="relative w-6 h-6 rounded overflow-hidden border bg-gray-50 flex-shrink-0">
                {selectedItem.image_url ? (
                  <Image
                    src={selectedItem.image_url || "/placeholder.svg"}
                    alt={selectedItem.name_ru}
                    fill
                    className="object-contain"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <ImageIcon className="h-3 w-3 text-gray-400" />
                  </div>
                )}
              </div>
              <span className="truncate text-sm">{selectedItem.name_ru}</span>
            </>
          ) : (
            <span className="text-gray-500 text-sm">{placeholder}</span>
          )}
        </div>
        <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onValueChange(item.id.toString())
                setIsOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
            >
              <div className="relative w-8 h-8 rounded overflow-hidden border bg-gray-50 flex-shrink-0">
                {item.image_url ? (
                  <Image
                    src={item.image_url || "/placeholder.svg"}
                    alt={item.name_ru}
                    fill
                    className="object-contain"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-gray-400" />
                  </div>
                )}
              </div>
              <span className="text-sm">{item.name_ru}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function CombinationsManager() {
  const [combinations, setCombinations] = useState<Combination[]>([])
  const [basicItems, setBasicItems] = useState<BasicItem[]>([])
  const [basicMaterials, setBasicMaterials] = useState<BasicMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingCombination, setEditingCombination] = useState<Combination | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedElements, setSelectedElements] = useState<SelectedElement[]>([{ id: null, tempId: "1" }])
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    combination_type: "items" as "items" | "materials",
  })
  const { toast } = useToast()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      if (!supabase) {
        throw new Error("Supabase не настроен")
      }

      await checkSupabaseConnection()

      // Загружаем все данные параллельно
      const [combinationsResult, itemsResult, materialsResult] = await Promise.all([
        supabase
          .from("combinations")
          .select(`
            *,
            combination_elements (
              *,
              basic_wardrobe_items (id, name_ru, image_url),
              basic_materials (id, name_ru, image_url)
            )
          `)
          .order("created_at", { ascending: false }),
        supabase.from("basic_wardrobe_items").select("id, name_ru, image_url").order("name_ru"),
        supabase.from("basic_materials").select("id, name_ru, image_url").order("name_ru"),
      ])

      if (combinationsResult.error) throw combinationsResult.error
      if (itemsResult.error) throw itemsResult.error
      if (materialsResult.error) throw materialsResult.error

      setCombinations(combinationsResult.data || [])
      setBasicItems(itemsResult.data || [])
      setBasicMaterials(materialsResult.data || [])
    } catch (err) {
      console.error("Error fetching data:", err)
      const errorMessage = err instanceof Error ? err.message : "Неизвестная ошибка при загрузке данных"
      setError(errorMessage)
      toast({
        title: "Ошибка",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleTypeChange = (value: "items" | "materials") => {
    setFormData((prev) => ({ ...prev, combination_type: value }))
    setSelectedElements([{ id: null, tempId: "1" }]) // Сбрасываем выбранные элементы
  }

  const addElement = () => {
    const maxElements = formData.combination_type === "items" ? 5 : 3 // Увеличил лимит
    if (selectedElements.length < maxElements) {
      const newTempId = Date.now().toString()
      setSelectedElements([...selectedElements, { id: null, tempId: newTempId }])
    }
  }

  const removeElement = (tempId: string) => {
    if (selectedElements.length > 1) {
      setSelectedElements(selectedElements.filter((el) => el.tempId !== tempId))
    }
  }

  const updateElement = (tempId: string, value: number | null) => {
    setSelectedElements(selectedElements.map((el) => (el.tempId === tempId ? { ...el, id: value } : el)))
  }

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) return

    const newElements = [...selectedElements]
    const draggedElement = newElements[draggedIndex]
    newElements.splice(draggedIndex, 1)
    newElements.splice(dropIndex, 0, draggedElement)

    setSelectedElements(newElements)
    setDraggedIndex(null)
  }

  const getElementData = (elementId: number | null) => {
    if (formData.combination_type === "items") {
      return basicItems.find((item) => item.id === elementId)
    } else {
      return basicMaterials.find((material) => material.id === elementId)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      combination_type: "items",
    })
    setSelectedElements([{ id: null, tempId: "1" }])
    setEditingCombination(null)
  }

  const handleEdit = (combination: Combination) => {
    setEditingCombination(combination)
    setFormData({
      name: combination.name,
      description: combination.description || "",
      combination_type: combination.combination_type,
    })

    // Загружаем элементы сочетания
    const elements = combination.combination_elements
      .sort((a, b) => a.position - b.position)
      .map((element, index) => ({
        id: element.basic_item_id || element.basic_material_id,
        tempId: `edit_${index}_${Date.now()}`,
      }))

    setSelectedElements(elements.length > 0 ? elements : [{ id: null, tempId: "1" }])
    setIsEditDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      if (!supabase) {
        throw new Error("Supabase не настроен")
      }

      // Фильтруем пустые элементы
      const validElements = selectedElements.filter((el) => el.id !== null)

      if (validElements.length < 2) {
        throw new Error("Необходимо выбрать минимум 2 элемента для сочетания")
      }

      if (editingCombination) {
        // Обновляем существующее сочетание
        const { error: updateError } = await supabase
          .from("combinations")
          .update({
            name: formData.name,
            description: formData.description || null,
            combination_type: formData.combination_type,
          })
          .eq("id", editingCombination.id)

        if (updateError) throw updateError

        // Удаляем старые элементы
        const { error: deleteError } = await supabase
          .from("combination_elements")
          .delete()
          .eq("combination_id", editingCombination.id)

        if (deleteError) throw deleteError

        // Создаем новые элементы
        const elements = validElements.map((element, index) => ({
          combination_id: editingCombination.id,
          basic_item_id: formData.combination_type === "items" ? element.id : null,
          basic_material_id: formData.combination_type === "materials" ? element.id : null,
          position: index + 1,
        }))

        const { error: elementsError } = await supabase.from("combination_elements").insert(elements)

        if (elementsError) throw elementsError

        toast({
          title: "Успешно",
          description: "Сочетание успешно обновлено",
        })

        setIsEditDialogOpen(false)
      } else {
        // Создаем новое сочетание
        const { data: combination, error: combinationError } = await supabase
          .from("combinations")
          .insert({
            name: formData.name,
            description: formData.description || null,
            combination_type: formData.combination_type,
          })
          .select()
          .single()

        if (combinationError) throw combinationError

        // Создаем элементы сочетания
        const elements = validElements.map((element, index) => ({
          combination_id: combination.id,
          basic_item_id: formData.combination_type === "items" ? element.id : null,
          basic_material_id: formData.combination_type === "materials" ? element.id : null,
          position: index + 1,
        }))

        const { error: elementsError } = await supabase.from("combination_elements").insert(elements)

        if (elementsError) throw elementsError

        toast({
          title: "Успешно",
          description: "Сочетание успешно создано",
        })

        setIsAddDialogOpen(false)
      }

      // Обновляем список и сбрасываем форму
      await fetchData()
      resetForm()
    } catch (error) {
      console.error("Error saving combination:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить сочетание",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Вы уверены, что хотите удалить это сочетание?")) {
      return
    }

    try {
      if (!supabase) {
        throw new Error("Supabase не настроен")
      }

      const { error } = await supabase.from("combinations").delete().eq("id", id)

      if (error) throw error

      toast({
        title: "Успешно",
        description: "Сочетание успешно удалено",
      })

      await fetchData()
    } catch (error) {
      console.error("Error deleting combination:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось удалить сочетание",
        variant: "destructive",
      })
    }
  }

  const getElementName = (element: CombinationElement) => {
    if (element.basic_wardrobe_items) {
      return element.basic_wardrobe_items.name_ru
    }
    if (element.basic_materials) {
      return element.basic_materials.name_ru
    }
    return "Неизвестный элемент"
  }

  const getElementImage = (element: CombinationElement) => {
    if (element.basic_wardrobe_items) {
      return element.basic_wardrobe_items.image_url
    }
    if (element.basic_materials) {
      return element.basic_materials.image_url
    }
    return null
  }

  const renderDialog = (isEdit: boolean) => (
    <Dialog
      open={isEdit ? isEditDialogOpen : isAddDialogOpen}
      onOpenChange={isEdit ? setIsEditDialogOpen : setIsAddDialogOpen}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать сочетание" : "Добавить сочетание"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Например: Классическое сочетание"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="combination_type">Тип сочетания *</Label>
              <Select value={formData.combination_type} onValueChange={handleTypeChange} required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="items">Сочетание вещей (до 5 элементов)</SelectItem>
                  <SelectItem value="materials">Сочетание материалов (до 3 элементов)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Элементы сочетания * (перетащите для изменения порядка)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {selectedElements.map((element, index) => {
                  const elementData = getElementData(element.id)
                  return (
                    <div
                      key={element.tempId}
                      className="relative border rounded-lg bg-white p-3 cursor-grab"
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                    >
                      <div className="flex flex-col items-center space-y-2">
                        <GripVertical className="h-4 w-4 text-gray-400 absolute top-2 left-2" />

                        {selectedElements.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute top-1 right-1 h-6 w-6 p-0"
                            onClick={() => removeElement(element.tempId)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}

                        <div className="relative w-20 h-20 rounded-lg overflow-hidden border bg-gray-50">
                          {elementData?.image_url ? (
                            <Image
                              src={elementData.image_url || "/placeholder.svg"}
                              alt={elementData.name_ru}
                              fill
                              className="object-contain"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-gray-400" />
                            </div>
                          )}
                        </div>

                        <ElementSelector
                          value={element.id?.toString() || ""}
                          onValueChange={(value) =>
                            updateElement(element.tempId, value ? Number.parseInt(value) : null)
                          }
                          items={formData.combination_type === "items" ? basicItems : basicMaterials}
                          placeholder={`Выберите ${formData.combination_type === "items" ? "вещь" : "материал"}`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {selectedElements.length < (formData.combination_type === "items" ? 5 : 3) && (
                <Button type="button" variant="outline" size="sm" onClick={addElement} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить элемент
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Дополнительная информация о сочетании"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (isEdit) {
                  setIsEditDialogOpen(false)
                } else {
                  setIsAddDialogOpen(false)
                }
                resetForm()
              }}
              disabled={isSubmitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )

  if (!supabase) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="font-medium text-red-800">Supabase не настроен</h3>
        <p className="text-red-700 mt-1">Для работы с сочетаниями необходимо настроить Supabase.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="font-medium text-red-800">Ошибка загрузки</h3>
        <p className="text-red-700 mt-1">{error}</p>
        <Button onClick={fetchData} className="mt-2" variant="outline" size="sm">
          Попробовать снова
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Сочетания</h2>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Добавить сочетание
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : combinations.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">Нет сочетаний. Добавьте первое сочетание.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {combinations.map((combination) => (
            <Card key={combination.id}>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>{combination.name}</span>
                  <div className="flex gap-2">
                    <Badge variant={combination.combination_type === "items" ? "default" : "secondary"}>
                      {combination.combination_type === "items" ? "Вещи" : "Материалы"}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(combination)}>
                      <Edit className="h-4 w-4 text-blue-500" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(combination.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {combination.combination_elements
                      .sort((a, b) => a.position - b.position)
                      .map((element) => (
                        <div key={element.id} className="flex flex-col items-center gap-2">
                          <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                            {getElementImage(element) ? (
                              <Image
                                src={getElementImage(element) || "/placeholder.svg"}
                                alt={getElementName(element)}
                                fill
                                className="object-contain"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                                <ImageIcon className="h-6 w-6 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs text-center">
                            {getElementName(element)}
                          </Badge>
                        </div>
                      ))}
                  </div>
                  {combination.description && <p className="text-sm text-gray-600">{combination.description}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Диалоги */}
      {renderDialog(false)}
      {renderDialog(true)}
    </div>
  )
}

"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Loader2, Plus, Trash2, Upload, ImageIcon, Edit, Copy } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import Image from "next/image"
import { supabase, checkSupabaseConnection } from "@/lib/supabase/client"
import { Checkbox } from "@/components/ui/checkbox"

interface BasicItem {
  id: number
  name_ru: string
  name_en: string
  description: string | null
  image_url: string | null
  materials?: BasicMaterial[]
}

interface BasicMaterial {
  id: number
  name_ru: string
  name_en: string
}

export function BasicItemsManager() {
  const [items, setItems] = useState<BasicItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<BasicItem | null>(null)
  const [formData, setFormData] = useState({
    name_ru: "",
    name_en: "",
    description: "",
  })
  const { toast } = useToast()
  const [basicMaterials, setBasicMaterials] = useState<BasicMaterial[]>([])
  const [selectedMaterials, setSelectedMaterials] = useState<number[]>([])

  useEffect(() => {
    fetchItems()
  }, [])

  const fetchItems = async () => {
    setLoading(true)
    setError(null)

    try {
      if (!supabase) {
        throw new Error("Supabase не настроен")
      }

      await checkSupabaseConnection()

      // Получаем базовые вещи с их материалами
      const { data, error } = await supabase
        .from("basic_wardrobe_items")
        .select(`
          *,
          basic_item_materials (
            basic_materials (
              id,
              name_ru,
              name_en
            )
          )
        `)
        .order("name_ru")

      if (error) {
        console.error("Error fetching basic items:", error)
        throw new Error(`Ошибка загрузки базовых вещей: ${error.message}`)
      }

      // Преобразуем данные для удобства использования
      const itemsWithMaterials = (data || []).map((item: any) => ({
        ...item,
        materials: item.basic_item_materials?.map((rel: any) => rel.basic_materials) || [],
      }))

      setItems(itemsWithMaterials)

      // Загружаем все доступные материалы
      const { data: materialsData } = await supabase
        .from("basic_materials")
        .select("id, name_ru, name_en")
        .order("name_ru")
      setBasicMaterials(materialsData || [])
    } catch (err) {
      console.error("Error fetching basic items:", err)
      const errorMessage = err instanceof Error ? err.message : "Неизвестная ошибка при загрузке базовых вещей"
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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setImageFile(file)

      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const openAddDialog = () => {
    setFormData({
      name_ru: "",
      name_en: "",
      description: "",
    })
    setImageFile(null)
    setImagePreview(null)
    setEditingItem(null)
    setSelectedMaterials([])
    setIsAddDialogOpen(true)
  }

  const openEditDialog = (item: BasicItem) => {
    setFormData({
      name_ru: item.name_ru,
      name_en: item.name_en || "",
      description: item.description || "",
    })
    setImageFile(null)
    setImagePreview(item.image_url)
    setEditingItem(item)
    // Устанавливаем выбранные материалы
    setSelectedMaterials(item.materials?.map((m) => m.id) || [])
    setIsEditDialogOpen(true)
  }

  // Функция для загрузки изображения через API
  const uploadImage = async (file: File): Promise<{ success: boolean; url?: string; error?: string }> => {
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("prefix", "basic_elements/items")

      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to upload image")
      }

      return { success: true, url: result.url }
    } catch (error) {
      console.error("Error uploading image:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  // Функция для сохранения связей с материалами
  const saveMaterialRelations = async (itemId: number, materialIds: number[]) => {
    if (!supabase) return

    try {
      // Удаляем старые связи
      await supabase.from("basic_item_materials").delete().eq("basic_item_id", itemId)

      // Добавляем новые связи
      if (materialIds.length > 0) {
        const relations = materialIds.map((materialId) => ({
          basic_item_id: itemId,
          basic_material_id: materialId,
        }))

        const { error } = await supabase.from("basic_item_materials").insert(relations)

        if (error) {
          console.error("Error saving material relations:", error)
          throw new Error(`Ошибка сохранения материалов: ${error.message}`)
        }
      }
    } catch (error) {
      console.error("Error in saveMaterialRelations:", error)
      throw error
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      if (!supabase) {
        throw new Error("Supabase не настроен")
      }

      let imageUrl = editingItem?.image_url || null

      // Загружаем изображение через API если выбрано новое
      if (imageFile) {
        toast({
          title: "Загрузка изображения...",
          description: "Пожалуйста, подождите",
        })

        const uploadResult = await uploadImage(imageFile)

        if (uploadResult.success && uploadResult.url) {
          imageUrl = uploadResult.url
          toast({
            title: "Изображение загружено",
            description: "Изображение успешно сохранено в облаке",
          })
        } else {
          throw new Error(`Ошибка загрузки изображения: ${uploadResult.error}`)
        }
      }

      const itemData = {
        name_ru: formData.name_ru,
        name_en: formData.name_en || formData.name_ru,
        description: formData.description || null,
        image_url: imageUrl,
      }

      if (editingItem) {
        // Редактирование
        const { data, error } = await supabase
          .from("basic_wardrobe_items")
          .update(itemData)
          .eq("id", editingItem.id)
          .select()
          .single()

        if (error) {
          throw new Error(`Ошибка обновления базовой вещи: ${error.message}`)
        }

        // Сохраняем связи с материалами
        await saveMaterialRelations(editingItem.id, selectedMaterials)

        toast({
          title: "Успешно",
          description: "Базовая вещь успешно обновлена",
        })

        setIsEditDialogOpen(false)
      } else {
        // Создание
        const { data, error } = await supabase.from("basic_wardrobe_items").insert([itemData]).select().single()

        if (error) {
          throw new Error(`Ошибка создания базовой вещи: ${error.message}`)
        }

        // Сохраняем связи с материалами
        await saveMaterialRelations(data.id, selectedMaterials)

        toast({
          title: "Успешно",
          description: "Базовая вещь успешно создана",
        })

        setIsAddDialogOpen(false)
      }

      // Обновляем список
      await fetchItems()

      setFormData({
        name_ru: "",
        name_en: "",
        description: "",
      })
      setImageFile(null)
      setImagePreview(null)
      setEditingItem(null)
      setSelectedMaterials([])
    } catch (error) {
      console.error("Error saving basic item:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить базовую вещь",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Вы уверены, что хотите удалить эту базовую вещь?")) {
      return
    }

    try {
      if (!supabase) {
        throw new Error("Supabase не настроен")
      }

      const { error } = await supabase.from("basic_wardrobe_items").delete().eq("id", id)

      if (error) {
        throw new Error(`Ошибка удаления базовой вещи: ${error.message}`)
      }

      toast({
        title: "Успешно",
        description: "Базовая вещь успешно удалена",
      })

      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch (error) {
      console.error("Error deleting basic item:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось удалить базовую вещь",
        variant: "destructive",
      })
    }
  }

  const handleCopy = async (id: number) => {
    try {
      const response = await fetch("/api/basic-items/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to copy item")
      }

      toast({
        title: "Успешно",
        description: "Базовая вещь успешно скопирована",
      })

      fetchItems()
    } catch (error) {
      console.error("Error copying item:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось скопировать базовую вещь",
        variant: "destructive",
      })
    }
  }

  if (!supabase) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="font-medium text-red-800">Supabase не настроен</h3>
        <p className="text-red-700 mt-1">Для работы с базовыми вещами необходимо настроить Supabase.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="font-medium text-red-800">Ошибка загрузки</h3>
        <p className="text-red-700 mt-1">{error}</p>
        <Button onClick={fetchItems} className="mt-2" variant="outline" size="sm">
          Попробовать снова
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Базовые вещи</h2>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Добавить базовую вещь
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">Нет базовых вещей. Добавьте первую базовую вещь.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>{item.name_ru}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(item)}>
                      <Edit className="h-4 w-4 text-blue-500" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleCopy(item.id)}>
                      <Copy className="h-4 w-4 text-green-500" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {item.image_url ? (
                    <div className="relative aspect-square w-full overflow-hidden rounded-md bg-gray-50">
                      <Image
                        src={item.image_url || "/placeholder.svg"}
                        alt={item.name_ru}
                        fill
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    <div className="aspect-square w-full bg-gray-100 rounded-md flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Название (EN):</span> {item.name_en || "Не указано"}
                  </div>
                  {item.description && (
                    <div>
                      <span className="font-medium">Описание:</span> {item.description}
                    </div>
                  )}
                  {item.materials && item.materials.length > 0 && (
                    <div>
                      <span className="font-medium">Материалы:</span> {item.materials.map((m) => m.name_ru).join(", ")}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Диалог добавления/редактирования базовой вещи */}
      <Dialog
        open={isAddDialogOpen || isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false)
            setIsEditDialogOpen(false)
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editingItem ? "Редактировать базовую вещь" : "Добавить базовую вещь"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4 pb-20">
                <div className="space-y-2">
                  <Label htmlFor="name_ru">Название (RU) *</Label>
                  <Input
                    id="name_ru"
                    name="name_ru"
                    value={formData.name_ru}
                    onChange={handleInputChange}
                    placeholder="Например: Белая рубашка"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name_en">Название (EN)</Label>
                  <Input
                    id="name_en"
                    name="name_en"
                    value={formData.name_en}
                    onChange={handleInputChange}
                    placeholder="Например: White shirt"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Описание</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Дополнительная информация о базовой ��е��и"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Материалы</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded p-2">
                    {basicMaterials.map((material) => (
                      <div key={material.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`material-${material.id}`}
                          checked={selectedMaterials.includes(material.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedMaterials([...selectedMaterials, material.id])
                            } else {
                              setSelectedMaterials(selectedMaterials.filter((id) => id !== material.id))
                            }
                          }}
                        />
                        <Label htmlFor={`material-${material.id}`} className="text-sm">
                          {material.name_ru}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image">Изображение</Label>
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById("image")?.click()}
                      className="w-full"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Выбрать изображение
                    </Button>
                    <Input id="image" type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                  </div>
                  {imagePreview && (
                    <div className="mt-2 relative w-48 h-48 mx-auto overflow-hidden rounded-md bg-gray-50">
                      <Image src={imagePreview || "/placeholder.svg"} alt="Preview" fill className="object-contain" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setImageFile(null)
                          setImagePreview(null)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </form>
          </div>

          <DialogFooter className="flex-shrink-0 sticky bottom-0 bg-white pt-4 border-t mt-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false)
                setIsEditDialogOpen(false)
              }}
              disabled={isSubmitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isSubmitting} onClick={handleSubmit}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingItem ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

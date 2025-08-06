"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Loader2, Plus, Trash2, Edit } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { supabase, checkSupabaseConnection } from "@/lib/supabase/client"

interface BasicMaterial {
  id: number
  name_ru: string
  name_en: string
  description: string | null
  properties: string | null
  image_url: string | null
}

export function BasicMaterialsManager() {
  const [materials, setMaterials] = useState<BasicMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<BasicMaterial | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name_ru: "",
    name_en: "",
    description: "",
    properties: "",
  })
  const { toast } = useToast()

  useEffect(() => {
    fetchMaterials()
  }, [])

  const fetchMaterials = async () => {
    setLoading(true)
    setError(null)

    try {
      if (!supabase) {
        throw new Error("Supabase не настроен")
      }

      await checkSupabaseConnection()

      const { data, error } = await supabase.from("basic_materials").select("*").order("name_ru")

      if (error) {
        console.error("Error fetching basic materials:", error)
        throw new Error(`Ошибка загрузки базовых материалов: ${error.message}`)
      }

      setMaterials(data || [])
    } catch (err) {
      console.error("Error fetching basic materials:", err)
      const errorMessage = err instanceof Error ? err.message : "Неизвестная ошибка при загрузке базовых материалов"
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

  const openAddDialog = () => {
    setFormData({ name_ru: "", name_en: "", description: "", properties: "" })
    setEditingMaterial(null)
    setIsAddDialogOpen(true)
  }

  const openEditDialog = (material: BasicMaterial) => {
    setFormData({
      name_ru: material.name_ru,
      name_en: material.name_en || "",
      description: material.description || "",
      properties: material.properties || "",
    })
    setEditingMaterial(material)
    setIsEditDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      if (!supabase) {
        throw new Error("Supabase не настроен")
      }

      const materialData = {
        name_ru: formData.name_ru,
        name_en: formData.name_en || formData.name_ru,
        description: formData.description || null,
        properties: formData.properties || null,
      }

      if (editingMaterial) {
        // Редактирование
        const { data, error } = await supabase
          .from("basic_materials")
          .update(materialData)
          .eq("id", editingMaterial.id)
          .select()
          .single()

        if (error) {
          throw new Error(`Ошибка обновления базового материала: ${error.message}`)
        }

        toast({
          title: "Успешно",
          description: "Базовый материал успешно обновлен",
        })

        setMaterials((prev) => prev.map((material) => (material.id === editingMaterial.id ? data : material)))
        setIsEditDialogOpen(false)
      } else {
        // Создание
        const { data, error } = await supabase.from("basic_materials").insert([materialData]).select().single()

        if (error) {
          throw new Error(`Ошибка создания базового материала: ${error.message}`)
        }

        toast({
          title: "Успешно",
          description: "Базовый материал успешно создан",
        })

        setMaterials((prev) => [...prev, data])
        setIsAddDialogOpen(false)
      }

      setFormData({
        name_ru: "",
        name_en: "",
        description: "",
        properties: "",
      })
    } catch (error) {
      console.error("Error saving basic material:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить базовый материал",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Вы уверены, что хотите удалить этот базовый материал?")) {
      return
    }

    try {
      if (!supabase) {
        throw new Error("Supabase не настроен")
      }

      const { error } = await supabase.from("basic_materials").delete().eq("id", id)

      if (error) {
        throw new Error(`Ошибка удаления базового материала: ${error.message}`)
      }

      toast({
        title: "Успешно",
        description: "Базовый материал успешно удален",
      })

      setMaterials((prev) => prev.filter((material) => material.id !== id))
    } catch (error) {
      console.error("Error deleting basic material:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось удалить базовый материал",
        variant: "destructive",
      })
    }
  }

  if (!supabase) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="font-medium text-red-800">Supabase не настроен</h3>
        <p className="text-red-700 mt-1">Для работы с базовыми материалами н��обходимо настроить Supabase.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="font-medium text-red-800">Ошибка загрузки</h3>
        <p className="text-red-700 mt-1">{error}</p>
        <Button onClick={fetchMaterials} className="mt-2" variant="outline" size="sm">
          Попробовать снова
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Базовые материалы</h2>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Добавить материал
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : materials.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">Нет базовых материалов. Добавьте первый материал.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {materials.map((material) => (
            <Card key={material.id}>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>{material.name_ru}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(material)}>
                      <Edit className="h-4 w-4 text-blue-500" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(material.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <span className="font-medium">Название (EN):</span> {material.name_en || "Не указано"}
                  </div>
                  {material.description && (
                    <div>
                      <span className="font-medium">Описание:</span> {material.description}
                    </div>
                  )}
                  {material.properties && (
                    <div>
                      <span className="font-medium">Свойства:</span> {material.properties}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Диалог добавления/редактирования базового материала */}
      <Dialog
        open={isAddDialogOpen || isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddDialogOpen(false)
            setIsEditDialogOpen(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMaterial ? "Редактировать базовый материал" : "Добавить базовый материал"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name_ru">Название (RU) *</Label>
                <Input
                  id="name_ru"
                  name="name_ru"
                  value={formData.name_ru}
                  onChange={handleInputChange}
                  placeholder="Например: Хлопок"
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
                  placeholder="Например: Cotton"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Описание</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Дополнительная информация о материале"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="properties">Свойства</Label>
                <Textarea
                  id="properties"
                  name="properties"
                  value={formData.properties}
                  onChange={handleInputChange}
                  placeholder="Свойства материала (нап��им��р: ��ягкий, д��шащ��й, прочный)"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingMaterial ? "Сохранить" : "Добавить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

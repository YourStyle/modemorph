"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"

interface ClothingType {
  id: number
  code: string
  name_ru: string
  name_en: string
  category: string | null
  description: string | null
}

const CATEGORIES = [
  { value: "light-upper", label: "Легкая верхняя одежда" },
  { value: "warm-upper", label: "Теплая верхняя одежда" },
  { value: "dresses-skirts", label: "Платья и юбки" },
  { value: "pants", label: "Брюки и джинсы" },
  { value: "sets", label: "Комплекты" },
  { value: "outerwear", label: "Верхняя одежда" },
  { value: "other", label: "Другое" },
]

export function ClothingTypesManager() {
  const [types, setTypes] = useState<ClothingType[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    code: "",
    name_ru: "",
    name_en: "",
    category: "",
    description: "",
  })
  const { toast } = useToast()

  // Загружаем типы одежды при монтировании компонента
  useEffect(() => {
    fetchTypes()
  }, [])

  const fetchTypes = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/clothing-types")
      if (!response.ok) {
        throw new Error("Failed to fetch clothing types")
      }
      const data = await response.json()
      setTypes(data.types || [])
    } catch (error) {
      console.error("Error fetching clothing types:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить типы одежды",
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

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const response = await fetch("/api/clothing-types", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create clothing type")
      }

      toast({
        title: "Успешно",
        description: "Тип одежды успешно создан",
      })

      // Обновляем список и закрываем диалог
      await fetchTypes()
      setIsAddDialogOpen(false)
      setFormData({
        code: "",
        name_ru: "",
        name_en: "",
        category: "",
        description: "",
      })
    } catch (error) {
      console.error("Error creating clothing type:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось создать тип одежды",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Вы уверены, что хотите удалить этот тип одежды?")) {
      return
    }

    try {
      const response = await fetch(`/api/clothing-types?id=${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete clothing type")
      }

      toast({
        title: "Успешно",
        description: "Тип одежды успешно удален",
      })

      // Обновляем список
      await fetchTypes()
    } catch (error) {
      console.error("Error deleting clothing type:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось удалить тип одежды",
        variant: "destructive",
      })
    }
  }

  const getCategoryLabel = (categoryValue: string | null) => {
    if (!categoryValue) return "Не указана"
    const category = CATEGORIES.find((c) => c.value === categoryValue)
    return category ? category.label : categoryValue
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Типы одежды</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-gray-500">Компонент управления типами одежды будет реализован после настройки Supabase.</p>
      </CardContent>
    </Card>
  )
}

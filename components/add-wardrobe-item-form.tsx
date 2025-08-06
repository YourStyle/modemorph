'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { BasicItem, ClothingType } from '@/types'

interface AddWardrobeItemFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

export function AddWardrobeItemForm({ onSuccess, onCancel }: AddWardrobeItemFormProps) {
  const [formData, setFormData] = useState({
    item_name: '',
    clothing_type: '',
    color: '',
    basic_wardrobe_item_id: ''
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [basicItems, setBasicItems] = useState<BasicItem[]>([])
  const [clothingTypes, setClothingTypes] = useState<ClothingType[]>([])

  const loadBasicItems = async () => {
    try {
      const response = await fetch('/api/basic-items')
      if (response.ok) {
        const data = await response.json()
        setBasicItems(data.items || [])
      }
    } catch (error) {
      console.error('Error loading basic items:', error)
    }
  }

  const loadClothingTypes = async () => {
    try {
      const response = await fetch('/api/clothing-types')
      if (response.ok) {
        const data = await response.json()
        setClothingTypes(data.types || [])
      }
    } catch (error) {
      console.error('Error loading clothing types:', error)
    }
  }

  useEffect(() => {
    loadBasicItems()
    loadClothingTypes()
  }, [])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.item_name || !formData.clothing_type || !formData.color || !imageFile) {
      toast.error('Пожалуйста, заполните все поля и загрузите изображение')
      return
    }

    setIsLoading(true)

    try {
      // Загружаем изображение
      const imageFormData = new FormData()
      imageFormData.append('file', imageFile)
      
      const uploadResponse = await fetch('/api/upload-to-yandex', {
        method: 'POST',
        body: imageFormData
      })

      if (!uploadResponse.ok) {
        throw new Error('Ошибка загрузки изображения')
      }

      const { url: imageUrl } = await uploadResponse.json()

      // Создаем элемент гардероба
      const itemData = {
        ...formData,
        image_url: imageUrl,
        basic_wardrobe_item_id: formData.basic_wardrobe_item_id ? parseInt(formData.basic_wardrobe_item_id) : null
      }

      const response = await fetch('/api/wardrobe/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(itemData)
      })

      if (!response.ok) {
        throw new Error('Ошибка создания элемента')
      }

      toast.success('Элемент успешно добавлен в гардероб!')
      
      // Сбрасываем форму
      setFormData({
        item_name: '',
        clothing_type: '',
        color: '',
        basic_wardrobe_item_id: ''
      })
      setImageFile(null)
      setImagePreview(null)
      
      onSuccess?.()

    } catch (error) {
      console.error('Error adding item:', error)
      toast.error('Ошибка при добавлении элемента')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Добавить элемент в гардероб</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Загрузка изображения */}
          <div className="space-y-2">
            <Label>Изображение</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview || "/placeholder.svg"}
                    alt="Preview"
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={removeImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="mt-4">
                    <Label htmlFor="image-upload" className="cursor-pointer">
                      <span className="mt-2 block text-sm font-medium text-gray-900">
                        Нажмите для загрузки изображения
                      </span>
                    </Label>
                    <Input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Название */}
          <div className="space-y-2">
            <Label htmlFor="item_name">Название</Label>
            <Input
              id="item_name"
              value={formData.item_name}
              onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
              placeholder="Введите название элемента"
              required
            />
          </div>

          {/* Тип одежды */}
          <div className="space-y-2">
            <Label>Тип одежды</Label>
            <Select
              value={formData.clothing_type}
              onValueChange={(value) => setFormData({ ...formData, clothing_type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите тип одежды" />
              </SelectTrigger>
              <SelectContent>
                {clothingTypes.map((type) => (
                  <SelectItem key={type.id} value={type.name}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Цвет */}
          <div className="space-y-2">
            <Label htmlFor="color">Цвет</Label>
            <Input
              id="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              placeholder="Введите цвет"
              required
            />
          </div>

          {/* Базовый элемент */}
          <div className="space-y-2">
            <Label>Базовый элемент (опционально)</Label>
            <Select
              value={formData.basic_wardrobe_item_id}
              onValueChange={(value) => setFormData({ ...formData, basic_wardrobe_item_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите базовый элемент" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Не выбрано</SelectItem>
                {basicItems.map((item) => (
                  <SelectItem key={item.id} value={item.id.toString()}>
                    {item.name_ru} ({item.clothing_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Кнопки */}
          <div className="flex gap-4">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? 'Добавление...' : 'Добавить элемент'}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Отмена
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

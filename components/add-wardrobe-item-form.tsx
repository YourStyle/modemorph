'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { X, Upload, Plus } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
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
    material: '',
    brand: '',
    price: '',
    description: '',
    tags: [] as string[]
  })
  
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [basicItems, setBasicItems] = useState<BasicItem[]>([])
  const [clothingTypes, setClothingTypes] = useState<ClothingType[]>([])
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    loadBasicItems()
    loadClothingTypes()
  }, [])

  const loadBasicItems = async () => {
    try {
      const response = await fetch('/api/basic-items')
      if (response.ok) {
        const data = await response.json()
        setBasicItems(data)
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
        setClothingTypes(data)
      }
    } catch (error) {
      console.error('Error loading clothing types:', error)
    }
  }

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

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }))
      setNewTag('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.item_name || !formData.clothing_type || !imageFile) {
      toast({
        title: "Ошибка",
        description: "Пожалуйста, заполните все обязательные поля и загрузите изображение",
        variant: "destructive"
      })
      return
    }

    setIsLoading(true)

    try {
      // Upload image first
      const imageFormData = new FormData()
      imageFormData.append('file', imageFile)
      
      const imageResponse = await fetch('/api/upload-to-yandex', {
        method: 'POST',
        body: imageFormData
      })

      if (!imageResponse.ok) {
        throw new Error('Failed to upload image')
      }

      const { url: imageUrl } = await imageResponse.json()

      // Create wardrobe item
      const itemData = {
        ...formData,
        image_url: imageUrl,
        price: formData.price ? parseFloat(formData.price) : null
      }

      const response = await fetch('/api/wardrobe/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(itemData)
      })

      if (!response.ok) {
        throw new Error('Failed to create item')
      }

      toast({
        title: "Успешно!",
        description: "Вещь добавлена в гардероб"
      })

      // Reset form
      setFormData({
        item_name: '',
        clothing_type: '',
        color: '',
        material: '',
        brand: '',
        price: '',
        description: '',
        tags: []
      })
      setImageFile(null)
      setImagePreview('')

      onSuccess?.()
    } catch (error) {
      console.error('Error creating item:', error)
      toast({
        title: "Ошибка",
        description: "Не удалось добавить вещь в гардероб",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Добавить вещь в гардероб</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Image Upload */}
          <div className="space-y-2">
            <Label htmlFor="image">Изображение *</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview || "/placeholder.svg"}
                    alt="Preview"
                    className="max-w-full h-48 object-cover mx-auto rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      setImageFile(null)
                      setImagePreview('')
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-2">Загрузите изображение вещи</p>
                  <Input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="max-w-xs mx-auto"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="item_name">Название *</Label>
              <Input
                id="item_name"
                value={formData.item_name}
                onChange={(e) => handleInputChange('item_name', e.target.value)}
                placeholder="Например: Белая рубашка"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clothing_type">Тип одежды *</Label>
              <Select
                value={formData.clothing_type}
                onValueChange={(value) => handleInputChange('clothing_type', value)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите тип" />
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="color">Цвет</Label>
              <Input
                id="color"
                value={formData.color}
                onChange={(e) => handleInputChange('color', e.target.value)}
                placeholder="Например: Белый"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="material">Материал</Label>
              <Input
                id="material"
                value={formData.material}
                onChange={(e) => handleInputChange('material', e.target.value)}
                placeholder="Например: Хлопок"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="brand">Бренд</Label>
              <Input
                id="brand"
                value={formData.brand}
                onChange={(e) => handleInputChange('brand', e.target.value)}
                placeholder="Например: Zara"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Цена</Label>
              <Input
                id="price"
                type="number"
                value={formData.price}
                onChange={(e) => handleInputChange('price', e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Дополнительная информация о вещи"
              rows={3}
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Теги</Label>
            <div className="flex gap-2 mb-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Добавить тег"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
              />
              <Button type="button" onClick={addTag} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                  {tag}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => removeTag(tag)}
                  />
                </Badge>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? 'Добавление...' : 'Добавить в гардероб'}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
              >
                Отмена
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

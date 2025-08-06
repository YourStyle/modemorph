'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { X, Upload, Plus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { ColorPicker } from './color-picker'

interface BasicItem {
  id: number
  name_ru: string
  name_en: string
  clothing_type: string
}

interface AddWardrobeItemFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

// Захардкоженные типы одежды
const CLOTHING_TYPES = [
  { value: 'tops', label: 'Верх' },
  { value: 'bottoms', label: 'Низ' },
  { value: 'dresses', label: 'Платья' },
  { value: 'outerwear', label: 'Верхняя одежда' },
  { value: 'shoes', label: 'Обувь' },
  { value: 'accessories', label: 'Аксессуары' },
  { value: 'underwear', label: 'Нижнее белье' },
  { value: 'sportswear', label: 'Спортивная одежда' }
]

const SIZE_TYPES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '36', '38', '40', '42', '44', '46', '48', '50']

const MATERIALS = [
  'Хлопок', 'Лен', 'Шерсть', 'Шелк', 'Полиэстер', 'Вискоза', 
  'Эластан', 'Джинса', 'Кожа', 'Замша', 'Кашемир', 'Другое'
]

const STYLES = [
  'Классический', 'Casual', 'Спортивный', 'Романтический', 
  'Минимализм', 'Бохо', 'Гранж', 'Винтаж', 'Другой'
]

export function AddWardrobeItemForm({ onSuccess, onCancel }: AddWardrobeItemFormProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [basicItems, setBasicItems] = useState<BasicItem[]>([])
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [customTags, setCustomTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')

  const [formData, setFormData] = useState({
    item_name: '',
    clothing_type: '',
    size_type: '',
    material: '',
    style: '',
    color: '#000000',
    shade: '',
    has_print: false,
    has_details: false,
    is_basic: false,
    basic_item_id: null as number | null,
    notes: ''
  })

  useEffect(() => {
    loadBasicItems()
  }, [])

  const loadBasicItems = async () => {
    try {
      const response = await fetch('/api/basic-items')
      if (response.ok) {
        const data = await response.json()
        setBasicItems(data.items || [])
      }
    } catch (error) {
      console.error('Error loading basic items:', error)
      // Fallback - продолжаем работу без базовых вещей
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedImage(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const uploadImage = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/upload-to-yandex', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error('Failed to upload image')
    }

    const data = await response.json()
    return data.url
  }

  const addCustomTag = () => {
    if (newTag.trim() && !customTags.includes(newTag.trim())) {
      setCustomTags([...customTags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeCustomTag = (tag: string) => {
    setCustomTags(customTags.filter(t => t !== tag))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      let imageUrl = ''
      
      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage)
      }

      const itemData = {
        ...formData,
        image_url: imageUrl,
        custom_tags: customTags
      }

      const response = await fetch('/api/wardrobe/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(itemData)
      })

      if (!response.ok) {
        throw new Error('Failed to add item')
      }

      toast({
        title: 'Успешно!',
        description: 'Вещь добавлена в гардероб'
      })

      onSuccess?.()
    } catch (error) {
      console.error('Error adding item:', error)
      toast({
        title: 'Ошибка',
        description: 'Не удалось добавить вещь',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Добавить новую вещь</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Фото */}
          <div className="space-y-2">
            <Label>Фото вещи</Label>
            <div className="flex items-center gap-4">
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview || "/placeholder.svg"}
                    alt="Preview"
                    className="w-24 h-24 object-cover rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute -top-2 -right-2 h-6 w-6 p-0"
                    onClick={() => {
                      setSelectedImage(null)
                      setImagePreview('')
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                  <Upload className="h-8 w-8 text-gray-400" />
                </div>
              )}
              <div>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  id="image-upload"
                />
                <Label htmlFor="image-upload" className="cursor-pointer">
                  <Button type="button" variant="outline" asChild>
                    <span>Выбрать фото</span>
                  </Button>
                </Label>
              </div>
            </div>
          </div>

          {/* Название */}
          <div className="space-y-2">
            <Label htmlFor="item_name">Название вещи *</Label>
            <Input
              id="item_name"
              value={formData.item_name}
              onChange={(e) => setFormData(prev => ({ ...prev, item_name: e.target.value }))}
              placeholder="Например: Белая рубашка"
              required
            />
          </div>

          {/* Тип одежды */}
          <div className="space-y-2">
            <Label>Тип одежды *</Label>
            <Select
              value={formData.clothing_type}
              onValueChange={(value) => setFormData(prev => ({ ...prev, clothing_type: value }))}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите тип одежды" />
              </SelectTrigger>
              <SelectContent>
                {CLOTHING_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Размер */}
          <div className="space-y-2">
            <Label>Размер</Label>
            <Select
              value={formData.size_type}
              onValueChange={(value) => setFormData(prev => ({ ...prev, size_type: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите размер" />
              </SelectTrigger>
              <SelectContent>
                {SIZE_TYPES.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Материал */}
          <div className="space-y-2">
            <Label>Материал</Label>
            <Select
              value={formData.material}
              onValueChange={(value) => setFormData(prev => ({ ...prev, material: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите материал" />
              </SelectTrigger>
              <SelectContent>
                {MATERIALS.map((material) => (
                  <SelectItem key={material} value={material}>
                    {material}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Стиль */}
          <div className="space-y-2">
            <Label>Стиль</Label>
            <Select
              value={formData.style}
              onValueChange={(value) => setFormData(prev => ({ ...prev, style: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите стиль" />
              </SelectTrigger>
              <SelectContent>
                {STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Цвет */}
          <div className="space-y-2">
            <Label>Основной цвет</Label>
            <div className="flex items-center gap-2">
              <ColorPicker
                color={formData.color}
                onChange={(color) => setFormData(prev => ({ ...prev, color }))}
              />
              <Input
                value={formData.color}
                onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                className="w-24"
              />
            </div>
          </div>

          {/* Оттенок */}
          <div className="space-y-2">
            <Label htmlFor="shade">Оттенок</Label>
            <Input
              id="shade"
              value={formData.shade}
              onChange={(e) => setFormData(prev => ({ ...prev, shade: e.target.value }))}
              placeholder="Например: светлый, темный, яркий"
            />
          </div>

          {/* Переключатели */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="has_print">Есть принт</Label>
              <Switch
                id="has_print"
                checked={formData.has_print}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, has_print: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="has_details">Есть детали</Label>
              <Switch
                id="has_details"
                checked={formData.has_details}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, has_details: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_basic">Базовая вещь</Label>
              <Switch
                id="is_basic"
                checked={formData.is_basic}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_basic: checked }))}
              />
            </div>
          </div>

          {/* Базовая вещь */}
          {basicItems.length > 0 && (
            <div className="space-y-2">
              <Label>Связать с базовой вещью</Label>
              <Select
                value={formData.basic_item_id?.toString() || ''}
                onValueChange={(value) => setFormData(prev => ({ 
                  ...prev, 
                  basic_item_id: value ? parseInt(value) : null 
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите базовую вещь" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Не связывать</SelectItem>
                  {basicItems.map((item) => (
                    <SelectItem key={item.id} value={item.id.toString()}>
                      {item.name_ru}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Пользовательские теги */}
          <div className="space-y-2">
            <Label>Пользовательские теги</Label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Добавить тег"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
              />
              <Button type="button" onClick={addCustomTag} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {customTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {customTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeCustomTag(tag)}>
                    {tag} <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Заметки */}
          <div className="space-y-2">
            <Label htmlFor="notes">Заметки</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Дополнительная информация о вещи"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Кнопки */}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Добавление...' : 'Добавить вещь'}
        </Button>
      </div>
    </form>
  )
}

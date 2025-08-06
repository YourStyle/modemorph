'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { createOutfit, updateOutfit, getOutfitById } from '@/api/outfits'
import { WardrobeItem } from '@/types'
import ImageUpload from '@/components/ImageUpload'
import Image from 'next/image'

interface SaveOutfitDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedItems: WardrobeItem[]
  editingOutfitId?: number | null
  onSave?: () => void
}

export function SaveOutfitDialog({
  isOpen,
  onClose,
  selectedItems,
  editingOutfitId,
  onSave
}: SaveOutfitDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [loadingOutfit, setLoadingOutfit] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    season: '',
    occasion: '',
    preview_image_url: ''
  })

  // Загружаем данные образа при редактировании
  useEffect(() => {
    if (editingOutfitId && isOpen) {
      loadOutfitData()
    } else if (!editingOutfitId && isOpen) {
      // Сбрасываем форму для нового образа
      setFormData({
        name: '',
        description: '',
        season: '',
        occasion: '',
        preview_image_url: ''
      })
    }
  }, [editingOutfitId, isOpen])

  const loadOutfitData = async () => {
    if (!editingOutfitId) return

    try {
      setLoadingOutfit(true)
      const outfit = await getOutfitById(editingOutfitId.toString())
      setFormData({
        name: outfit.name || '',
        description: outfit.description || '',
        season: outfit.season || '',
        occasion: outfit.occasion || '',
        preview_image_url: outfit.preview_image_url || ''
      })
    } catch (error) {
      console.error('Error loading outfit:', error)
      toast({
        title: 'Ошибка',
        description: 'Не удалось загрузить данные образа',
        variant: 'destructive'
      })
    } finally {
      setLoadingOutfit(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Введите название образа',
        variant: 'destructive'
      })
      return
    }

    if (!formData.preview_image_url) {
      toast({
        title: 'Ошибка',
        description: 'Загрузите превью изображение',
        variant: 'destructive'
      })
      return
    }

    if (!editingOutfitId && selectedItems.length === 0) {
      toast({
        title: 'Ошибка',
        description: 'Выберите хотя бы одну вещь для образа',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)

    try {
      const outfitData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        season: formData.season || null,
        occasion: formData.occasion || null,
        preview_image_url: formData.preview_image_url,
        item_ids: selectedItems.map(item => item.id)
      }

      if (editingOutfitId) {
        await updateOutfit(editingOutfitId, outfitData)
        toast({
          title: 'Успешно',
          description: 'Образ обновлен'
        })
      } else {
        await createOutfit(outfitData)
        toast({
          title: 'Успешно',
          description: 'Образ создан'
        })
      }

      onSave?.()
      onClose()
    } catch (error) {
      console.error('Error saving outfit:', error)
      toast({
        title: 'Ошибка',
        description: editingOutfitId ? 'Не удалось обновить образ' : 'Не удалось создать образ',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingOutfitId ? 'Редактировать образ' : 'Создать образ'}
          </DialogTitle>
        </DialogHeader>

        {loadingOutfit ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
              <p>Загрузка данных образа...</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Превью изображение */}
            <div className="space-y-2">
              <Label htmlFor="preview">
                Превью изображение <span className="text-red-500">*</span>
              </Label>
              <ImageUpload
                value={formData.preview_image_url}
                onChange={(url) => setFormData(prev => ({ ...prev, preview_image_url: url }))}
                onRemove={() => setFormData(prev => ({ ...prev, preview_image_url: '' }))}
                disabled={loading}
              />
            </div>

            {/* Название */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Название образа <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Введите название образа"
                disabled={loading}
                required
              />
            </div>

            {/* Описание */}
            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Описание образа (необязательно)"
                disabled={loading}
                rows={3}
              />
            </div>

            {/* Сезон и повод */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="season">Сезон</Label>
                <Select
                  value={formData.season}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, season: value }))}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите сезон" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spring">Весна</SelectItem>
                    <SelectItem value="summer">Лето</SelectItem>
                    <SelectItem value="autumn">Осень</SelectItem>
                    <SelectItem value="winter">Зима</SelectItem>
                    <SelectItem value="all-season">Всесезонный</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="occasion">Повод</Label>
                <Select
                  value={formData.occasion}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, occasion: value }))}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите повод" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casual">Повседневный</SelectItem>
                    <SelectItem value="work">Работа</SelectItem>
                    <SelectItem value="party">Вечеринка</SelectItem>
                    <SelectItem value="formal">Официальный</SelectItem>
                    <SelectItem value="sport">Спорт</SelectItem>
                    <SelectItem value="vacation">Отпуск</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Выбранные вещи */}
            {selectedItems.length > 0 && (
              <div className="space-y-2">
                <Label>Выбранные вещи ({selectedItems.length})</Label>
                <div className="grid grid-cols-4 gap-2 p-4 bg-gray-50 rounded-lg max-h-40 overflow-y-auto">
                  {selectedItems.map((item) => (
                    <div key={item.id} className="text-center">
                      <div className="aspect-square bg-white rounded-lg overflow-hidden mb-1">
                        <Image
                          src={item.image_url || '/placeholder.svg'}
                          alt={item.item_name || item.basic_wardrobe_items?.name_ru || 'Вещь'}
                          width={80}
                          height={80}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-xs text-gray-600 truncate">
                        {item.item_name || item.basic_wardrobe_items?.name_ru || 'Без названия'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Сохранение...' : (editingOutfitId ? 'Обновить' : 'Создать')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

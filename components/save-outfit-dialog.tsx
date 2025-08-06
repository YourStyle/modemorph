'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { createOutfit } from '@/lib/api/outfits'

interface SaveOutfitDialogProps {
  selectedItems: string[]
  previewImage?: string
  onSuccess?: () => void
  children: React.ReactNode
}

export function SaveOutfitDialog({ selectedItems, previewImage, onSuccess, children }: SaveOutfitDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    season: '',
    occasion: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      toast.error('Пожалуйста, введите название образа')
      return
    }

    if (selectedItems.length === 0) {
      toast.error('Выберите хотя бы одну вещь для образа')
      return
    }

    if (!previewImage) {
      toast.error('Необходимо изображение для предварительного просмотра')
      return
    }

    setIsLoading(true)

    try {
      await createOutfit({
        name: formData.name,
        description: formData.description || undefined,
        season: formData.season || undefined,
        occasion: formData.occasion || undefined,
        preview_image_url: previewImage,
        item_ids: selectedItems.map(id => parseInt(id))
      })

      toast.success('Образ успешно сохранен!')
      
      // Сбрасываем форму
      setFormData({
        name: '',
        description: '',
        season: '',
        occasion: ''
      })
      
      setOpen(false)
      onSuccess?.()

    } catch (error) {
      console.error('Error saving outfit:', error)
      toast.error(error instanceof Error ? error.message : 'Ошибка при сохранении образа')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Сохранить образ</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Название образа *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Введите название образа"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Описание образа (необязательно)"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Сезон</Label>
              <Select
                value={formData.season}
                onValueChange={(value) => setFormData(prev => ({ ...prev, season: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите сезон" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Не указан</SelectItem>
                  <SelectItem value="spring">Весна</SelectItem>
                  <SelectItem value="summer">Лето</SelectItem>
                  <SelectItem value="autumn">Осень</SelectItem>
                  <SelectItem value="winter">Зима</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Повод</Label>
              <Select
                value={formData.occasion}
                onValueChange={(value) => setFormData(prev => ({ ...prev, occasion: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите повод" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Не указан</SelectItem>
                  <SelectItem value="casual">Повседневный</SelectItem>
                  <SelectItem value="work">Работа</SelectItem>
                  <SelectItem value="party">Вечеринка</SelectItem>
                  <SelectItem value="sport">Спорт</SelectItem>
                  <SelectItem value="formal">Официальный</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {previewImage && (
            <div className="space-y-2">
              <Label>Предварительный просмотр</Label>
              <div className="border rounded-lg p-2">
                <img
                  src={previewImage || "/placeholder.svg"}
                  alt="Предварительный просмотр образа"
                  className="w-full h-32 object-cover rounded"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Сохранение...' : 'Сохранить образ'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Save, Eye, Heart, Trash2 } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { getOutfitById, updateOutfit, deleteOutfit } from '@/lib/api/outfits'

interface OutfitData {
  id: number
  name: string
  description?: string
  season?: string
  occasion?: string
  preview_image_url: string
  likes: number
  views_count: number
  favorites_count: number
  created_at: string
  updated_at: string
  outfit_items?: Array<{
    id: number
    position?: number
    wardrobe_items: {
      id: number
      item_name: string
      image_url?: string
      clothing_type?: string
      color?: string
      basic_wardrobe_items?: {
        name_ru: string
        name_en: string
      }
    }
  }>
}

export default function OutfitDetailPage() {
  const params = useParams()
  const router = useRouter()
  const outfitId = params.id as string

  const [outfit, setOutfit] = useState<OutfitData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    season: '',
    occasion: ''
  })

  const loadOutfit = async () => {
    try {
      setIsLoading(true)
      const data = await getOutfitById(outfitId)
      setOutfit(data)
      setFormData({
        name: data.name,
        description: data.description || '',
        season: data.season || '',
        occasion: data.occasion || ''
      })
    } catch (error) {
      console.error('Error loading outfit:', error)
      toast.error('Ошибка при загрузке образа')
      router.push('/admin/outfits')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (outfitId) {
      loadOutfit()
    }
  }, [outfitId])

  const handleSave = async () => {
    if (!outfit) return

    try {
      setIsSaving(true)
      const updatedOutfit = await updateOutfit(outfit.id, formData)
      setOutfit(updatedOutfit)
      setIsEditing(false)
      toast.success('Образ успешно обновлен')
    } catch (error) {
      console.error('Error updating outfit:', error)
      toast.error('Ошибка при обновлении образа')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!outfit) return

    try {
      setIsDeleting(true)
      await deleteOutfit(outfit.id)
      toast.success('Образ удален')
      router.push('/admin/outfits')
    } catch (error) {
      console.error('Error deleting outfit:', error)
      toast.error('Ошибка при удалении образа')
    } finally {
      setIsDeleting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">Загрузка образа...</div>
        </div>
      </div>
    )
  }

  if (!outfit) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Образ не найден</h1>
          <Button onClick={() => router.push('/admin/outfits')}>
            Вернуться к образам
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.push('/admin/outfits')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к образам
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{outfit.name}</h1>
            <p className="text-muted-foreground">
              Создан {formatDate(outfit.created_at)}
              {outfit.updated_at !== outfit.created_at && (
                <span> • Обновлен {formatDate(outfit.updated_at)}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Отмена
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                Редактировать
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Удалить
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить образ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Это действие нельзя отменить. Образ "{outfit.name}" будет удален навсегда.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isDeleting ? 'Удаление...' : 'Удалить'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Preview Image */}
        <Card>
          <CardHeader>
            <CardTitle>Предварительный просмотр</CardTitle>
          </CardHeader>
          <CardContent>
            <img
              src={outfit.preview_image_url || "/placeholder.svg"}
              alt={outfit.name}
              className="w-full h-96 object-cover rounded-lg"
            />
            
            {/* Stats */}
            <div className="flex gap-4 mt-4">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {outfit.views_count} просмотров
              </Badge>
              <Badge variant="secondary" className="flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {outfit.likes} лайков
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Outfit Details */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Информация об образе</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Название</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Описание</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
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
                </>
              ) : (
                <>
                  <div>
                    <Label className="text-sm font-medium">Название</Label>
                    <p className="text-lg">{outfit.name}</p>
                  </div>

                  {outfit.description && (
                    <div>
                      <Label className="text-sm font-medium">Описание</Label>
                      <p className="text-muted-foreground">{outfit.description}</p>
                    </div>
                  )}

                  <div className="flex gap-4">
                    {outfit.season && (
                      <div>
                        <Label className="text-sm font-medium">Сезон</Label>
                        <Badge variant="outline" className="ml-2">
                          {outfit.season}
                        </Badge>
                      </div>
                    )}
                    {outfit.occasion && (
                      <div>
                        <Label className="text-sm font-medium">Повод</Label>
                        <Badge variant="outline" className="ml-2">
                          {outfit.occasion}
                        </Badge>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Outfit Items */}
          {outfit.outfit_items && outfit.outfit_items.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Вещи в образе ({outfit.outfit_items.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {outfit.outfit_items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      {item.wardrobe_items.image_url && (
                        <img
                          src={item.wardrobe_items.image_url || "/placeholder.svg"}
                          alt={item.wardrobe_items.item_name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {item.wardrobe_items.item_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.wardrobe_items.clothing_type}
                          {item.wardrobe_items.color && ` • ${item.wardrobe_items.color}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

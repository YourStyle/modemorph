'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Edit, Trash2, Eye, Heart, Star, TrendingUp } from 'lucide-react'
import { getOutfitById, deleteOutfit, incrementViewCount } from '@/api/outfits'
import { Outfit } from '@/types'
import { useToast } from '@/hooks/use-toast'
import Image from 'next/image'
import Link from 'next/link'

export default function OutfitDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [outfit, setOutfit] = useState<Outfit | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  const outfitId = params.id as string

  useEffect(() => {
    if (outfitId) {
      loadOutfit()
      // Увеличиваем счетчик просмотров
      incrementViewCount(outfitId)
    }
  }, [outfitId])

  const loadOutfit = async () => {
    try {
      setLoading(true)
      const data = await getOutfitById(outfitId)
      setOutfit(data)
    } catch (error) {
      console.error('Error fetching outfit:', error)
      toast({
        title: 'Ошибка',
        description: 'Не удалось загрузить образ',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!outfit) return

    if (!confirm(`Вы уверены, что хотите удалить образ "${outfit.name}"?`)) {
      return
    }

    try {
      setDeleting(true)
      await deleteOutfit(outfit.id)
      toast({
        title: 'Успешно',
        description: 'Образ удален'
      })
      router.push('/admin/outfits')
    } catch (error) {
      console.error('Error deleting outfit:', error)
      toast({
        title: 'Ошибка',
        description: 'Не удалось удалить образ',
        variant: 'destructive'
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleEdit = () => {
    if (outfit) {
      router.push(`/admin/wardrobe?mode=edit-outfit&outfitId=${outfit.id}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Загрузка образа...</p>
        </div>
      </div>
    )
  }

  if (!outfit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Образ не найден</h1>
          <p className="text-gray-600 mb-4">Образ с указанным ID не существует</p>
          <Link href="/admin/outfits">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Вернуться к образам
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Заголовок */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <Link href="/admin/outfits">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Назад
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{outfit.name}</h1>
                <p className="text-gray-600">
                  Создан {new Date(outfit.created_at).toLocaleDateString('ru-RU')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleEdit}>
                <Edit className="w-4 h-4 mr-2" />
                Редактировать
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleting ? 'Удаление...' : 'Удалить'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Основная информация */}
            <div className="lg:col-span-2 space-y-6">
              {/* Превью изображение */}
              <Card>
                <CardContent className="p-6">
                  <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4">
                    <Image
                      src={outfit.preview_image_url || '/placeholder.svg'}
                      alt={outfit.name}
                      width={800}
                      height={450}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  {outfit.description && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Описание</h3>
                      <p className="text-gray-600">{outfit.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Элементы образа */}
              <Card>
                <CardHeader>
                  <CardTitle>Элементы образа</CardTitle>
                </CardHeader>
                <CardContent>
                  {outfit.outfit_items && outfit.outfit_items.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {outfit.outfit_items
                        .sort((a, b) => (a.position || 0) - (b.position || 0))
                        .map((item) => (
                          <div key={item.id} className="text-center">
                            <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-2">
                              <Image
                                src={item.wardrobe_items.image_url || '/placeholder.svg'}
                                alt={item.wardrobe_items.item_name || 'Вещь'}
                                width={150}
                                height={150}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {item.wardrobe_items.item_name || 
                               item.wardrobe_items.basic_wardrobe_items?.name_ru || 
                               'Без названия'}
                            </p>
                            {item.wardrobe_items.color && (
                              <div className="flex items-center justify-center gap-1 mt-1">
                                <div
                                  className="w-3 h-3 rounded-full border border-gray-300"
                                  style={{ backgroundColor: item.wardrobe_items.color }}
                                />
                                <span className="text-xs text-gray-500">
                                  {item.wardrobe_items.color}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-4">
                      Нет элементов в образе
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Боковая панель */}
            <div className="space-y-6">
              {/* Метаданные */}
              <Card>
                <CardHeader>
                  <CardTitle>Информация</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {outfit.season && (
                    <div>
                      <h4 className="font-medium text-gray-900">Сезон</h4>
                      <Badge variant="secondary" className="mt-1">
                        {outfit.season === 'spring' && 'Весна'}
                        {outfit.season === 'summer' && 'Лето'}
                        {outfit.season === 'autumn' && 'Осень'}
                        {outfit.season === 'winter' && 'Зима'}
                        {outfit.season === 'all-season' && 'Всесезонный'}
                      </Badge>
                    </div>
                  )}

                  {outfit.occasion && (
                    <div>
                      <h4 className="font-medium text-gray-900">Повод</h4>
                      <Badge variant="outline" className="mt-1">
                        {outfit.occasion === 'casual' && 'Повседневный'}
                        {outfit.occasion === 'work' && 'Работа'}
                        {outfit.occasion === 'party' && 'Вечеринка'}
                        {outfit.occasion === 'formal' && 'Официальный'}
                        {outfit.occasion === 'sport' && 'Спорт'}
                        {outfit.occasion === 'vacation' && 'Отпуск'}
                      </Badge>
                    </div>
                  )}

                  <div>
                    <h4 className="font-medium text-gray-900">Элементов</h4>
                    <p className="text-gray-600">
                      {outfit.outfit_items?.length || 0} {
                        (outfit.outfit_items?.length || 0) === 1 ? 'вещь' : 
                        (outfit.outfit_items?.length || 0) < 5 ? 'вещи' : 'вещей'
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Аналитика */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Аналитика
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-gray-600">Просмотры</span>
                    </div>
                    <span className="font-semibold text-gray-900">
                      {outfit.views_count || 0}
                    </span>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Heart className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-gray-600">Лайки</span>
                    </div>
                    <span className="font-semibold text-gray-900">
                      {outfit.likes || 0}
                    </span>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm text-gray-600">В избранном</span>
                    </div>
                    <span className="font-semibold text-gray-900">
                      {outfit.favorites_count || 0}
                    </span>
                  </div>

                  {(outfit.views_count || 0) > 0 && (
                    <>
                      <Separator />
                      <div className="text-xs text-gray-500 text-center">
                        Последнее обновление: {new Date(outfit.updated_at).toLocaleDateString('ru-RU')}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

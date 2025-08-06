'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Filter } from 'lucide-react'
import { OutfitCard } from '@/components/OutfitCard'
import { toast } from 'sonner'
import { getOutfits } from '@/lib/api/outfits'
import Link from 'next/link'

interface Outfit {
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
  outfit_items?: Array<{
    wardrobe_items: {
      id: number
      item_name: string
      image_url?: string
      clothing_type?: string
      color?: string
    }
  }>
}

export default function OutfitsPage() {
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [filteredOutfits, setFilteredOutfits] = useState<Outfit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [seasonFilter, setSeasonFilter] = useState('')
  const [occasionFilter, setOccasionFilter] = useState('')

  const loadOutfits = async () => {
    try {
      setIsLoading(true)
      const data = await getOutfits()
      setOutfits(data)
      setFilteredOutfits(data)
    } catch (error) {
      console.error('Error loading outfits:', error)
      toast.error('Ошибка при загрузке образов')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadOutfits()
  }, [])

  useEffect(() => {
    let filtered = outfits

    // Поиск по названию и описанию
    if (searchQuery) {
      filtered = filtered.filter(outfit =>
        outfit.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (outfit.description && outfit.description.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    }

    // Фильтр по сезону
    if (seasonFilter) {
      filtered = filtered.filter(outfit => outfit.season === seasonFilter)
    }

    // Фильтр по поводу
    if (occasionFilter) {
      filtered = filtered.filter(outfit => outfit.occasion === occasionFilter)
    }

    setFilteredOutfits(filtered)
  }, [outfits, searchQuery, seasonFilter, occasionFilter])

  const handleOutfitDeleted = (deletedId: number) => {
    setOutfits(prev => prev.filter(outfit => outfit.id !== deletedId))
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSeasonFilter('')
    setOccasionFilter('')
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">Загрузка образов...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Образы</h1>
          <p className="text-muted-foreground">
            Управление коллекцией образов ({filteredOutfits.length} из {outfits.length})
          </p>
        </div>
        <Link href="/admin/wardrobe">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Создать образ
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Фильтры и поиск
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по названию или описанию..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Все сезоны" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все сезоны</SelectItem>
                <SelectItem value="spring">Весна</SelectItem>
                <SelectItem value="summer">Лето</SelectItem>
                <SelectItem value="autumn">Осень</SelectItem>
                <SelectItem value="winter">Зима</SelectItem>
              </SelectContent>
            </Select>

            <Select value={occasionFilter} onValueChange={setOccasionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Все поводы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все поводы</SelectItem>
                <SelectItem value="casual">Повседневный</SelectItem>
                <SelectItem value="work">Работа</SelectItem>
                <SelectItem value="party">Вечеринка</SelectItem>
                <SelectItem value="sport">Спорт</SelectItem>
                <SelectItem value="formal">Официальный</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={clearFilters}>
              Сбросить фильтры
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{outfits.length}</div>
            <p className="text-sm text-muted-foreground">Всего образов</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {outfits.reduce((sum, outfit) => sum + (outfit.views_count || 0), 0)}
            </div>
            <p className="text-sm text-muted-foreground">Всего просмотров</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {outfits.reduce((sum, outfit) => sum + (outfit.likes || 0), 0)}
            </div>
            <p className="text-sm text-muted-foreground">Всего лайков</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {new Set(outfits.map(outfit => outfit.season).filter(Boolean)).size}
            </div>
            <p className="text-sm text-muted-foreground">Сезонов</p>
          </CardContent>
        </Card>
      </div>

      {/* Outfits Grid */}
      {filteredOutfits.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-muted-foreground">
              {outfits.length === 0 ? (
                <>
                  <p className="text-lg mb-2">Пока нет образов</p>
                  <p>Создайте свой первый образ, выбрав вещи из гардероба</p>
                </>
              ) : (
                <>
                  <p className="text-lg mb-2">Образы не найдены</p>
                  <p>Попробуйте изменить параметры поиска или фильтры</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredOutfits.map((outfit) => (
            <OutfitCard
              key={outfit.id}
              outfit={outfit}
              onEdit={(outfit) => {
                // Redirect to edit page
                window.location.href = `/admin/outfits/${outfit.id}`
              }}
              onDelete={handleOutfitDeleted}
              onView={(outfit) => {
                // Redirect to view page
                window.location.href = `/admin/outfits/${outfit.id}`
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

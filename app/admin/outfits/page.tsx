'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Filter } from 'lucide-react'
import { OutfitCard } from '@/components/OutfitCard'
import { Outfit } from '@/types'
import { getOutfits, deleteOutfit } from '@/api/outfits'
import { useToast } from '@/hooks/use-toast'

export default function OutfitsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadOutfits()
  }, [])

  const loadOutfits = async () => {
    try {
      const data = await getOutfits()
      console.log('Loaded outfits:', data)
      setOutfits(data)
    } catch (error) {
      console.error('Error loading outfits:', error)
      toast({
        title: 'Ошибка',
        description: 'Не удалось загрузить образы',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredOutfits = outfits.filter(outfit => {
    const name = outfit.name || ''
    const description = outfit.description || ''
    const query = searchQuery.toLowerCase()
    
    return name.toLowerCase().includes(query) || 
           description.toLowerCase().includes(query)
  })

  const handleCreateOutfit = () => {
    router.push('/admin/wardrobe?mode=create-outfit')
  }

  const handleViewOutfit = (outfit: Outfit) => {
    router.push(`/admin/outfits/${outfit.id}`)
  }

  const handleEditOutfit = (outfit: Outfit) => {
    router.push(`/admin/wardrobe?mode=edit-outfit&outfitId=${outfit.id}`)
  }

  const handleDeleteOutfit = async (outfit: Outfit) => {
    if (!confirm(`Вы уверены, что хотите удалить образ "${outfit.name}"?`)) {
      return
    }

    try {
      const success = await deleteOutfit(outfit.id)
      if (success) {
        setOutfits(prev => prev.filter(o => o.id !== outfit.id))
        toast({
          title: 'Успешно',
          description: 'Образ удален'
        })
      } else {
        throw new Error('Failed to delete outfit')
      }
    } catch (error) {
      console.error('Error deleting outfit:', error)
      toast({
        title: 'Ошибка',
        description: 'Не удалось удалить образ',
        variant: 'destructive'
      })
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-gray-200 rounded-lg h-80"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Мои образы</h1>
        <Button onClick={handleCreateOutfit}>
          <Plus className="w-4 h-4 mr-2" />
          Создать образ
        </Button>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Поиск образов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Button variant="outline">
          <Filter className="w-4 h-4 mr-2" />
          Фильтры
        </Button>
      </div>

      {filteredOutfits.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            {searchQuery ? 'Образы не найдены' : 'У вас пока нет образов'}
          </div>
          {!searchQuery && (
            <Button onClick={handleCreateOutfit}>
              <Plus className="w-4 h-4 mr-2" />
              Создать первый образ
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredOutfits.map((outfit) => (
            <OutfitCard
              key={outfit.id}
              outfit={outfit}
              onView={handleViewOutfit}
              onEdit={handleEditOutfit}
              onDelete={handleDeleteOutfit}
              showActions={true}
            />
          ))}
        </div>
      )}
    </div>
  )
}

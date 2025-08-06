'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Eye, Edit, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'

interface Outfit {
  id: string
  name: string
  description?: string
  preview_image_url?: string
  created_at: string
  views_count: number
  likes_count: number
  outfit_items: Array<{
    id: string
    wardrobe_item_id: string
    wardrobe_items: {
      id: string
      name: string
      image_url: string
      color: string
      clothing_type: string
    }
  }>
}

export default function OutfitsPage() {
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchOutfits()
  }, [])

  const fetchOutfits = async () => {
    try {
      const response = await fetch('/api/outfits')
      if (response.ok) {
        const data = await response.json()
        setOutfits(data)
      }
    } catch (error) {
      console.error('Error fetching outfits:', error)
      toast({
        title: 'Ошибка',
        description: 'Не удалось загрузить образы',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const deleteOutfit = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить этот образ?')) return

    try {
      const response = await fetch(`/api/outfits/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setOutfits(outfits.filter(outfit => outfit.id !== id))
        toast({
          title: 'Успех',
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

  const handleCreateOutfit = () => {
    router.push('/admin/wardrobe?mode=create')
  }

  if (loading) {
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Управление образами</h1>
        <Button onClick={handleCreateOutfit} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Создать образ
        </Button>
      </div>

      {outfits.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-lg text-muted-foreground mb-4">Образы не найдены</p>
            <Button onClick={handleCreateOutfit} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Создать первый образ
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {outfits.map((outfit) => (
            <Card key={outfit.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{outfit.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                    >
                      <Link href={`/admin/outfits/${outfit.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/admin/wardrobe?mode=edit&outfitId=${outfit.id}`)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteOutfit(outfit.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {outfit.description && (
                  <p className="text-sm text-muted-foreground">{outfit.description}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-3">
                  {outfit.outfit_items.slice(0, 3).map((item) => (
                    <Badge key={item.id} variant="secondary" className="text-xs">
                      {item.wardrobe_items.name}
                    </Badge>
                  ))}
                  {outfit.outfit_items.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{outfit.outfit_items.length - 3}
                    </Badge>
                  )}
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Просмотры: {outfit.views_count}</span>
                  <span>Лайки: {outfit.likes_count}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Создан: {new Date(outfit.created_at).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

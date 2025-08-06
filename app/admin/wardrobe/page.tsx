'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Plus, Eye, EyeOff, Edit, Trash2, ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { WardrobeItemCard } from '@/components/wardrobe-item-card'
import { SelectedItemsPanel } from './SelectedItemsPanel'
import { SaveOutfitDialog } from '@/components/save-outfit-dialog'
import { useSelectedItems } from '@/contexts/selected-items-context'

interface WardrobeItem {
  id: string
  name: string
  image_url: string
  color: string
  clothing_type: string
  is_basic: boolean
  is_hidden: boolean
  created_at: string
}

interface Outfit {
  id: string
  name: string
  description?: string
  outfit_items: Array<{
    wardrobe_items: WardrobeItem
  }>
}

function WardrobePageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { selectedItems, addItem, removeItem, clearSelection } = useSelectedItems()
  
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [filteredItems, setFilteredItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [selectedType, setSelectedType] = useState('all')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  
  // Режимы работы
  const mode = searchParams.get('mode') // 'create' или 'edit'
  const outfitId = searchParams.get('outfitId')
  const isEditMode = mode === 'create' || mode === 'edit'
  
  const [currentOutfit, setCurrentOutfit] = useState<Outfit | null>(null)

  useEffect(() => {
    fetchItems()
    
    // Если режим редактирования, загружаем образ
    if (mode === 'edit' && outfitId) {
      loadOutfitForEdit(outfitId)
    }
  }, [mode, outfitId])

  useEffect(() => {
    filterItems()
  }, [items, searchTerm, showHidden, selectedType])

  const fetchItems = async () => {
    try {
      const response = await fetch('/api/wardrobe')
      if (response.ok) {
        const data = await response.json()
        setItems(data)
      }
    } catch (error) {
      console.error('Error fetching items:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadOutfitForEdit = async (id: string) => {
    try {
      const response = await fetch(`/api/outfits/${id}`)
      if (response.ok) {
        const outfit = await response.json()
        setCurrentOutfit(outfit)
        
        // Добавляем вещи образа в выбранные
        outfit.outfit_items.forEach((item: any) => {
          addItem(item.wardrobe_items)
        })
      }
    } catch (error) {
      console.error('Error fetching outfit:', error)
    }
  }

  const filterItems = () => {
    let filtered = items

    // Фильтр по поисковому запросу
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.clothing_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.color.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Фильтр по типу
    if (selectedType !== 'all') {
      if (selectedType === 'basic') {
        filtered = filtered.filter(item => item.is_basic)
      } else {
        filtered = filtered.filter(item => item.clothing_type === selectedType)
      }
    }

    // Фильтр скрытых вещей
    if (!showHidden) {
      filtered = filtered.filter(item => !item.is_hidden)
    }

    setFilteredItems(filtered)
  }

  const toggleItemVisibility = async (id: string, isHidden: boolean) => {
    try {
      const response = await fetch('/api/wardrobe/visibility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_hidden: !isHidden })
      })

      if (response.ok) {
        setItems(items.map(item =>
          item.id === id ? { ...item, is_hidden: !isHidden } : item
        ))
      }
    } catch (error) {
      console.error('Error toggling visibility:', error)
    }
  }

  const deleteItem = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить эту вещь?')) return

    try {
      const response = await fetch(`/api/wardrobe/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setItems(items.filter(item => item.id !== id))
        removeItem(id)
      }
    } catch (error) {
      console.error('Error deleting item:', error)
    }
  }

  const handleItemClick = (item: WardrobeItem) => {
    if (isEditMode) {
      const isSelected = selectedItems.some(selected => selected.id === item.id)
      if (isSelected) {
        removeItem(item.id)
      } else {
        addItem(item)
      }
    }
  }

  const handleExitEditMode = () => {
    clearSelection()
    router.push('/admin/wardrobe')
  }

  const handleSaveOutfit = () => {
    if (selectedItems.length === 0) {
      alert('Выберите хотя бы одну вещь для образа')
      return
    }
    setShowSaveDialog(true)
  }

  const clothingTypes = [...new Set(items.map(item => item.clothing_type))]

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">Загрузка гардероба...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      {/* Заголовок */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          {isEditMode && (
            <Button variant="ghost" onClick={handleExitEditMode}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Button>
          )}
          <h1 className="text-3xl font-bold">
            {mode === 'create' ? 'Создание образа' : 
             mode === 'edit' ? `Редактирование: ${currentOutfit?.name || 'Образ'}` : 
             'Управление гардеробом'}
          </h1>
        </div>
        
        {!isEditMode && (
          <Button asChild>
            <Link href="/admin/wardrobe/add">
              <Plus className="h-4 w-4 mr-2" />
              Добавить вещь
            </Link>
          </Button>
        )}
        
        {isEditMode && (
          <Button onClick={handleSaveOutfit} disabled={selectedItems.length === 0}>
            <Save className="h-4 w-4 mr-2" />
            Сохранить образ
          </Button>
        )}
      </div>

      {/* Фильтры */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Поиск по названию, типу или цвету..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="show-hidden"
                checked={showHidden}
                onCheckedChange={setShowHidden}
              />
              <Label htmlFor="show-hidden">Показать скрытые</Label>
            </div>
          </div>

          <Tabs value={selectedType} onValueChange={setSelectedType}>
            <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
              <TabsTrigger value="all">Все</TabsTrigger>
              <TabsTrigger value="basic">Базовые</TabsTrigger>
              {clothingTypes.slice(0, 4).map(type => (
                <TabsTrigger key={type} value={type}>
                  {type}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* Сетка вещей */}
      {filteredItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-lg text-muted-foreground mb-4">
              {searchTerm || selectedType !== 'all' ? 'Вещи не найдены' : 'Гардероб пуст'}
            </p>
            {!searchTerm && selectedType === 'all' && (
              <Button asChild>
                <Link href="/admin/wardrobe/add">
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить первую вещь
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredItems.map((item) => (
            <WardrobeItemCard
              key={item.id}
              item={item}
              isSelected={selectedItems.some(selected => selected.id === item.id)}
              isEditMode={isEditMode}
              onItemClick={() => handleItemClick(item)}
              onToggleVisibility={() => toggleItemVisibility(item.id, item.is_hidden)}
              onDelete={() => deleteItem(item.id)}
            />
          ))}
        </div>
      )}

      {/* Панель выбранных вещей */}
      {isEditMode && <SelectedItemsPanel />}

      {/* Диалог сохранения образа */}
      <SaveOutfitDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        selectedItems={selectedItems}
        existingOutfit={currentOutfit}
        onSave={() => {
          setShowSaveDialog(false)
          clearSelection()
          router.push('/admin/outfits')
        }}
      />
    </div>
  )
}

export default function WardrobePage() {
  return (
    <Suspense fallback={<div>Загрузка...</div>}>
      <WardrobePageContent />
    </Suspense>
  )
}

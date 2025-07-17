"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { PastelLoader } from "@/components/pastel-loader"
import { useToast } from "@/hooks/use-toast"

interface UserWardrobeItem {
  id: number
  item_name: string
  image_url?: string
  color: string
  shade: string
  material: string
  size_type: string
  notes?: string
  created_at: string
}

interface UserWardrobeGridProps {
  onItemsChange?: (count: number) => void
  refreshTrigger?: number
}

export function UserWardrobeGrid({ onItemsChange, refreshTrigger }: UserWardrobeGridProps) {
  const [items, setItems] = useState<UserWardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null)
  const { toast } = useToast()

  const fetchUserItems = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/wardrobe-user-items")
      if (response.ok) {
        const data = await response.json()
        const itemsArray = Array.isArray(data) ? data : []
        setItems(itemsArray)
        onItemsChange?.(itemsArray.length)
      } else {
        console.error("Failed to fetch user items:", response.statusText)
        setItems([])
        onItemsChange?.(0)
      }
    } catch (error) {
      console.error("Error fetching user items:", error)
      setItems([])
      onItemsChange?.(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUserItems()
  }, [refreshTrigger])

  const handleDelete = async (itemId: number) => {
    try {
      setDeletingItemId(itemId)

      const response = await fetch(`/api/wardrobe-user-items/${itemId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        // Remove item from local state
        const updatedItems = items.filter((item) => item.id !== itemId)
        setItems(updatedItems)
        onItemsChange?.(updatedItems.length)

        toast({
          title: "Вещь удалена",
          description: "Вещь успешно удалена из вашего гардероба",
        })
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to delete item")
      }
    } catch (error) {
      console.error("Error deleting item:", error)
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось удалить вещь",
        variant: "destructive",
      })
    } finally {
      setDeletingItemId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <PastelLoader size={40} />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">У вас пока нет вещей в гардеробе</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {items.map((item) => (
        <Card key={item.id} className="bg-white border-0 shadow-sm overflow-hidden relative group">
          <div className="aspect-square bg-gray-100 flex items-center justify-center relative">
            {item.image_url ? (
              <img
                src={item.image_url || "/placeholder.svg"}
                alt={item.item_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl">👕</span>
            )}

            {/* Delete button - показывается при наведении */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                onClick={() => handleDelete(item.id)}
                size="sm"
                variant="destructive"
                disabled={deletingItemId === item.id}
                className="h-8 w-8 p-0"
              >
                {deletingItemId === item.id ? (
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>

          <div className="p-3">
            <h3 className="font-medium text-gray-900 text-xs mb-1 line-clamp-2 leading-tight">{item.item_name}</h3>
            <div className="flex flex-wrap gap-1 mb-2">
              <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{item.color}</span>
              <span className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{item.size_type}</span>
            </div>
            {item.notes && <p className="text-xs text-gray-500 line-clamp-2 leading-tight">{item.notes}</p>}
          </div>
        </Card>
      ))}
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, MoreVertical } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { PastelLoader } from "@/components/pastel-loader"
import { useToast } from "@/hooks/use-toast"

interface WardrobeItem {
  id: number
  item_name: string
  image_url?: string
  material: string
  color: string
  style: string
  has_print: string
  shade: string
  has_details: string
  size_type?: string
  notes?: string
}

interface UserWardrobeGridProps {
  onItemsChange?: (count: number) => void
}

export function UserWardrobeGrid({ onItemsChange }: UserWardrobeGridProps) {
  const [items, setItems] = useState<WardrobeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchItems()
  }, [])

  useEffect(() => {
    onItemsChange?.(items.length)
  }, [items.length, onItemsChange])

  const fetchItems = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/wardrobe-user-items")
      if (response.ok) {
        const data = await response.json()
        const itemsArray = Array.isArray(data) ? data : []
        setItems(itemsArray)
      } else {
        console.error("Failed to fetch wardrobe items")
        setItems([])
      }
    } catch (error) {
      console.error("Error fetching wardrobe items:", error)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteItem = async (itemId: number) => {
    try {
      setIsDeleting(true)
      const response = await fetch(`/api/wardrobe/${itemId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        const updatedItems = items.filter((item) => item.id !== itemId)
        setItems(updatedItems)
        toast({
          title: "Вещь удалена",
          description: "Вещь успешно удалена из вашего гардероба",
        })
      } else {
        throw new Error("Failed to delete item")
      }
    } catch (error) {
      console.error("Error deleting item:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось удалить вещь. Попробуйте еще раз.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setDeleteItemId(null)
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
        <p className="text-gray-500 mb-4">У вас пока нет вещей в гардеробе</p>
        <p className="text-sm text-gray-400">Добавьте первую вещь, чтобы начать создавать свой стиль</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {items.map((item) => (
          <Card key={item.id} className="bg-white border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="relative">
                <div className="aspect-square bg-gray-100 flex items-center justify-center">
                  {item.image_url ? (
                    <img
                      src={item.image_url || "/placeholder.svg"}
                      alt={item.item_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl">👕</span>
                  )}
                </div>

                {/* Dropdown menu всегда видно в правом верхнем углу */}
                <div className="absolute top-2 right-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 w-8 p-0 bg-white/90 hover:bg-white shadow-sm"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setDeleteItemId(item.id)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="p-4">
                <h3 className="font-medium text-gray-900 text-sm mb-2 line-clamp-2">{item.item_name}</h3>
                <div className="flex flex-wrap gap-1">
                  {item.size_type && (
                    <Badge variant="default" className="text-xs px-2 py-0">
                      {item.size_type}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs px-2 py-0">
                    {item.material}
                  </Badge>
                  <Badge variant="outline" className="text-xs px-2 py-0">
                    {item.color}
                  </Badge>
                </div>
                {item.notes && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{item.notes}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Диалог подтверждения удаления */}
      <AlertDialog open={deleteItemId !== null} onOpenChange={() => setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить вещь?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Вещь будет удалена из вашего гардероба навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItemId && handleDeleteItem(deleteItemId)}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

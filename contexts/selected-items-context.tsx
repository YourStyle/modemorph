"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { WardrobeItem } from "@/lib/wardrobe"

interface SelectedItemsContextType {
  selectedItems: WardrobeItem[]
  isSelected: (itemId: number) => boolean
  toggleItem: (item: WardrobeItem) => void
  removeItem: (itemId: number) => void
  clearItems: () => void
  setItems: (items: WardrobeItem[]) => void
  editingOutfitId: number | null
  setEditingOutfitId: (id: number | null) => void
}

const SelectedItemsContext = createContext<SelectedItemsContextType | undefined>(undefined)

export function SelectedItemsProvider({ children }: { children: ReactNode }) {
  const [selectedItems, setSelectedItems] = useState<WardrobeItem[]>([])
  const [editingOutfitId, setEditingOutfitId] = useState<number | null>(null)

  const isSelected = useCallback(
    (itemId: number) => {
      return selectedItems.some((item) => item.id === itemId)
    },
    [selectedItems],
  )

  const toggleItem = useCallback((item: WardrobeItem) => {
    setSelectedItems((prev) => {
      const isItemSelected = prev.some((i) => i.id === item.id)
      if (isItemSelected) {
        return prev.filter((i) => i.id !== item.id)
      } else {
        return [...prev, item]
      }
    })
  }, [])

  const removeItem = useCallback((itemId: number) => {
    setSelectedItems((prev) => prev.filter((item) => item.id !== itemId))
  }, [])

  const clearItems = useCallback(() => {
    setSelectedItems([])
  }, [])

  const setItems = useCallback((items: WardrobeItem[]) => {
    setSelectedItems(items)
  }, [])

  return (
    <SelectedItemsContext.Provider
      value={{
        selectedItems,
        isSelected,
        toggleItem,
        removeItem,
        clearItems,
        setItems,
        editingOutfitId,
        setEditingOutfitId,
      }}
    >
      {children}
    </SelectedItemsContext.Provider>
  )
}

export function useSelectedItems() {
  const context = useContext(SelectedItemsContext)
  if (context === undefined) {
    throw new Error("useSelectedItems must be used within a SelectedItemsProvider")
  }
  return context
}

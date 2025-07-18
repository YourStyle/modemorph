"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

export interface WardrobeItem {
  id: number
  item_name: string
  size_type?: string
  color?: string
  shade?: string
  material?: string
  style?: string
  image_url?: string
  is_basic?: boolean
  has_print?: string
  has_details?: string
  notes?: string
  type: "basic" | "user"
}

interface SelectedItemsContextType {
  selectedItems: WardrobeItem[]
  addItem: (item: WardrobeItem) => void
  removeItem: (type: "basic" | "user", id: number) => void
  clearItems: () => void
  isSelected: (type: "basic" | "user", id: number) => boolean
}

const SelectedItemsContext = createContext<SelectedItemsContextType | undefined>(undefined)

export function SelectedItemsProvider({ children }: { children: ReactNode }) {
  const [selectedItems, setSelectedItems] = useState<WardrobeItem[]>([])

  const addItem = (item: WardrobeItem) => {
    setSelectedItems((prev) => {
      // Check if item already exists
      const exists = prev.some((existingItem) => existingItem.type === item.type && existingItem.id === item.id)
      if (exists) {
        return prev
      }
      return [...prev, item]
    })
  }

  const removeItem = (type: "basic" | "user", id: number) => {
    setSelectedItems((prev) => prev.filter((item) => !(item.type === type && item.id === id)))
  }

  const clearItems = () => {
    setSelectedItems([])
  }

  const isSelected = (type: "basic" | "user", id: number) => {
    return selectedItems.some((item) => item.type === type && item.id === id)
  }

  return (
    <SelectedItemsContext.Provider
      value={{
        selectedItems,
        addItem,
        removeItem,
        clearItems,
        isSelected,
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

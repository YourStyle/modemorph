"use client"

import { useEffect, useState } from "react"

interface UserWardrobeGridProps {
  onItemsChange?: (count: number) => void
  refreshTrigger?: number
  searchQuery?: string
  sortBy?: string
}

export function UserWardrobeGrid({
  onItemsChange,
  refreshTrigger,
  searchQuery = "",
  sortBy = "newest",
}: UserWardrobeGridProps) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(false)

  const fetchItems = async () => {
    try {
      setLoading(true)

      const params = new URLSearchParams()
      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim())
      }
      params.append("sort", sortBy)

      const response = await fetch(`/api/wardrobe-user-items?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setItems(Array.isArray(data) ? data : [])
        onItemsChange?.(Array.isArray(data) ? data.length : 0)
      } else {
        console.error("Failed to fetch items")
        setItems([])
        onItemsChange?.(0)
      }
    } catch (error) {
      console.error("Error fetching items:", error)
      setItems([])
      onItemsChange?.(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems()
  }, [refreshTrigger, searchQuery, sortBy])

  return (
    <div>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={index}>{item.name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, ExternalLink } from "lucide-react"
import { PastelLoader } from "@/components/pastel-loader"
import { AddCollectionSheet } from "@/components/add-collection-sheet"

interface LookItem {
  id: string
  name: string
  image_url: string
  category: string
}

interface SavedLook {
  id: string
  name: string
  items: LookItem[]
  created_at: string
}

interface Collection {
  id: string
  name: string
  looks_count: number
  looks: SavedLook[]
}

// Mock data for saved looks
const mockSavedLooks: SavedLook[] = [
  {
    id: "look1",
    name: "Офисный стиль",
    items: [
      {
        id: "item1",
        name: "Черный топ с бантом",
        image_url: "/placeholder.svg?height=200&width=150",
        category: "tops",
      },
      {
        id: "item2",
        name: "Коричневая сумка",
        image_url: "/placeholder.svg?height=180&width=160",
        category: "accessories",
      },
      {
        id: "item3",
        name: "Коричневая юбка",
        image_url: "/placeholder.svg?height=150&width=140",
        category: "bottoms",
      },
      {
        id: "item4",
        name: "Черные сапоги",
        image_url: "/placeholder.svg?height=200&width=120",
        category: "shoes",
      },
      {
        id: "item5",
        name: "Черные лоферы",
        image_url: "/placeholder.svg?height=120&width=160",
        category: "shoes",
      },
    ],
    created_at: "2024-01-15",
  },
  {
    id: "look2",
    name: "Повседневный образ",
    items: [
      {
        id: "item6",
        name: "Черная водолазка",
        image_url: "/placeholder.svg?height=200&width=150",
        category: "tops",
      },
      {
        id: "item7",
        name: "Бежевая юбка",
        image_url: "/placeholder.svg?height=180&width=140",
        category: "bottoms",
      },
      {
        id: "item8",
        name: "Черная сумка",
        image_url: "/placeholder.svg?height=160&width=140",
        category: "accessories",
      },
      {
        id: "item9",
        name: "Черные лоферы",
        image_url: "/placeholder.svg?height=120&width=160",
        category: "shoes",
      },
    ],
    created_at: "2024-01-10",
  },
]

// Mock data for collections
const mockCollections: Collection[] = [
  {
    id: "collection1",
    name: "Все",
    looks_count: 2,
    looks: mockSavedLooks,
  },
  {
    id: "collection2",
    name: "Тест",
    looks_count: 1,
    looks: [mockSavedLooks[1]],
  },
]

export default function LooksPage() {
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddCollectionOpen, setIsAddCollectionOpen] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setSavedLooks(mockSavedLooks)
      setCollections(mockCollections)
      setLoading(false)
    }

    loadData()
  }, [])

  const handleAddCollection = (name: string) => {
    const newCollection: Collection = {
      id: `collection_${Date.now()}`,
      name,
      looks_count: 0,
      looks: [],
    }
    setCollections((prev) => [...prev, newCollection])
  }

  const LookCard = ({ look }: { look: SavedLook }) => (
    <Card className="p-4 bg-gray-100 border-0 relative group hover:shadow-md transition-shadow flex-shrink-0 w-64">
      <div className="grid grid-cols-3 gap-2 min-h-[200px]">
        {look.items.slice(0, 6).map((item, index) => (
          <div
            key={item.id}
            className={`flex items-center justify-center ${
              look.items.length === 1
                ? "col-span-3"
                : look.items.length === 2 && index === 0
                  ? "col-span-2"
                  : look.items.length === 3 && index === 0
                    ? "col-span-3"
                    : look.items.length === 4 && index < 2
                      ? "col-span-3"
                      : look.items.length === 5 && index === 0
                        ? "col-span-3"
                        : ""
            }`}
          >
            <img
              src={item.image_url || "/placeholder.svg"}
              alt={item.name}
              className="max-w-full max-h-[80px] object-contain"
            />
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 h-auto"
      >
        <ExternalLink className="w-4 h-4" />
      </Button>
    </Card>
  )

  const CollectionSection = ({ collection }: { collection: Collection }) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">{collection.name}</h3>
          <p className="text-sm text-gray-500">
            {collection.looks_count} look{collection.looks_count !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="p-2">
          <ExternalLink className="w-4 h-4" />
        </Button>
      </div>

      {/* Horizontal scrolling for collection looks */}
      <div className="relative">
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
          {collection.looks.map((look) => (
            <LookCard key={look.id} look={look} />
          ))}
        </div>
        {collection.looks.length > 1 && (
          <>
            <div className="absolute top-1/2 -translate-y-1/2 left-0 w-8 h-full bg-gradient-to-r from-white to-transparent pointer-events-none opacity-50" />
            <div className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-full bg-gradient-to-l from-white to-transparent pointer-events-none opacity-50" />
          </>
        )}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <PastelLoader />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-gray-900">Образы</h1>

        <Button
          onClick={() => setIsAddCollectionOpen(true)}
          className="w-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 h-12 rounded-xl font-medium"
        >
          <Plus className="w-5 h-5 mr-2" />
          Добавить подборку
        </Button>
      </div>

      {/* All Looks Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Все образы</h2>
            <p className="text-sm text-gray-500">{savedLooks.length} образов</p>
          </div>
          <Button variant="ghost" size="sm" className="p-2">
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>

        {/* Horizontal scrolling for all looks */}
        <div className="relative">
          <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4">
            {savedLooks.map((look) => (
              <LookCard key={look.id} look={look} />
            ))}
          </div>
          {savedLooks.length > 1 && (
            <>
              <div className="absolute top-1/2 -translate-y-1/2 left-0 w-8 h-full bg-gradient-to-r from-white to-transparent pointer-events-none opacity-50" />
              <div className="absolute top-1/2 -translate-y-1/2 right-0 w-8 h-full bg-gradient-to-l from-white to-transparent pointer-events-none opacity-50" />
            </>
          )}
        </div>
      </div>

      {/* Collections */}
      <div className="space-y-8">
        {collections.map((collection) => (
          <CollectionSection key={collection.id} collection={collection} />
        ))}
      </div>

      {/* Add Collection Sheet */}
      <AddCollectionSheet
        isOpen={isAddCollectionOpen}
        onClose={() => setIsAddCollectionOpen(false)}
        onAdd={handleAddCollection}
      />
    </div>
  )
}

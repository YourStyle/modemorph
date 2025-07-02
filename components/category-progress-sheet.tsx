"use client"

import type React from "react"

import { useState } from "react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Shirt, SaladIcon as Dress, Footprints, PocketIcon as Jacket } from "lucide-react"

interface CategoryProgressSheetProps {
  children: React.ReactNode
}

const categories = [
  { name: "Верхняя одежда", icon: Jacket, current: 0, target: 3, color: "text-yellow-400" },
  { name: "Брюки", icon: Shirt, current: 1, target: 5, color: "text-blue-400" },
  { name: "Обувь", icon: Footprints, current: 1, target: 4, color: "text-gray-400" },
  { name: "Платья", icon: Dress, current: 0, target: 3, color: "text-teal-400" },
]

export function CategoryProgressSheet({ children }: CategoryProgressSheetProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom" className="h-auto rounded-t-3xl border-0 p-0">
        <div className="bg-gray-800 text-white p-8 rounded-t-3xl">
          <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-8" />

          <div className="space-y-6 mb-8">
            {categories.map((category) => {
              const Icon = category.icon
              const progress = (category.current / category.target) * 100

              return (
                <div key={category.name} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className={`w-5 h-5 ${category.color}`} />
                      <span className="font-medium">{category.name}</span>
                    </div>
                    <span className="text-gray-300 text-sm">
                      {category.current}/{category.target}
                    </span>
                  </div>
                  <Progress value={progress} className="h-2 bg-gray-700" />
                </div>
              )
            })}
          </div>

          <Button className="w-full bg-white text-gray-900 hover:bg-gray-100 rounded-2xl py-4 text-lg font-semibold">
            Добавить в гардероб
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

"use client"

import { Button } from "@/components/ui/button"
import { ColorDisplay } from "@/components/color-display"

interface ColorPaletteProps {
  onColorSelect: (color: string) => void
  selectedColor?: string
}

const POPULAR_COLORS = [
  { name: "Черный", hex: "#000000" },
  { name: "Белый", hex: "#FFFFFF" },
  { name: "Серый", hex: "#808080" },
  { name: "Синий", hex: "#0000FF" },
  { name: "Красный", hex: "#FF0000" },
  { name: "Зеленый", hex: "#008000" },
  { name: "Желтый", hex: "#FFFF00" },
  { name: "Коричневый", hex: "#8B4513" },
  { name: "Розовый", hex: "#FFC0CB" },
  { name: "Фиолетовый", hex: "#800080" },
  { name: "Оранжевый", hex: "#FFA500" },
  { name: "Голубой", hex: "#87CEEB" },
  { name: "Бежевый", hex: "#F5F5DC" },
  { name: "Золотой", hex: "#FFD700" },
  { name: "Серебряный", hex: "#C0C0C0" },
  { name: "Темно-синий", hex: "#000080" },
]

export function ColorPalette({ onColorSelect, selectedColor }: ColorPaletteProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Популярные цвета:</p>
      <div className="grid grid-cols-8 gap-2">
        {POPULAR_COLORS.map((color) => (
          <Button
            key={color.hex}
            variant="outline"
            size="sm"
            className={`p-2 h-auto ${selectedColor === color.hex ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => onColorSelect(color.hex)}
            title={color.name}
          >
            <ColorDisplay color={color.hex} size="md" />
          </Button>
        ))}
      </div>
    </div>
  )
}

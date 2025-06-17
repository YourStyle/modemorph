"use client"

import { cn } from "@/lib/utils"

interface ColorDisplayProps {
  color: string
  size?: "sm" | "md" | "lg"
  showLabel?: boolean
  className?: string
}

export function ColorDisplay({ color, size = "md", showLabel = false, className }: ColorDisplayProps) {
  // Проверяем, является ли цвет hex форматом
  const isHexColor = color && color.match(/^#[0-9A-Fa-f]{6}$/)

  // Размеры для разных вариантов
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  }

  // Если цвет не в hex формате, показываем текст
  if (!isHexColor) {
    return <span className={cn("text-sm text-gray-600", className)}>{color || "Не указан"}</span>
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn("rounded-full border border-gray-300 flex-shrink-0", sizeClasses[size])}
        style={{ backgroundColor: color }}
        title={color}
      />
      {showLabel && <span className="text-sm text-gray-600">{color}</span>}
    </div>
  )
}

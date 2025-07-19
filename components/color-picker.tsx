"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pipette, Palette } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  label?: string
  placeholder?: string
  imagePreview?: string
}

const PRESET_COLORS = [
  "#000000",
  "#FFFFFF",
  "#808080",
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#FFFF00",
  "#FF00FF",
  "#00FFFF",
  "#FFA500",
  "#800080",
  "#008000",
  "#000080",
  "#800000",
  "#808000",
  "#C0C0C0",
  "#F5F5DC",
  "#FFD700",
  "#FFC0CB",
  "#87CEEB",
  "#DDA0DD",
  "#98FB98",
  "#F0E68C",
  "#D2B48C",
]

export function ColorPicker({ value, onChange, label, placeholder, imagePreview }: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(value || "#808080")
  const [isPickingFromImage, setIsPickingFromImage] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    setHexInput(value || "#808080")
  }, [value])

  const handleColorChange = (color: string) => {
    const validColor = color.startsWith("#") ? color : `#${color}`
    setHexInput(validColor)
    onChange(validColor)
  }

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value

    if (!inputValue.startsWith("#")) {
      inputValue = `#${inputValue}`
    }

    setHexInput(inputValue)

    if (/^#[0-9A-Fa-f]{6}$/.test(inputValue)) {
      onChange(inputValue.toUpperCase())
    }
  }

  const loadImageToCanvas = () => {
    if (!imagePreview || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      // Устанавливаем размер canvas равным размеру изображения
      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)

      // Показываем canvas
      canvas.style.display = "block"
      canvas.style.maxWidth = "300px"
      canvas.style.maxHeight = "200px"
      canvas.style.cursor = "crosshair"
      canvas.style.border = "2px solid #3b82f6"
      canvas.style.borderRadius = "8px"
    }
    img.src = imagePreview
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPickingFromImage || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    const imageData = ctx.getImageData(x, y, 1, 1)
    const [r, g, b] = imageData.data

    const hex =
      `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase()

    handleColorChange(hex)
    setIsPickingFromImage(false)

    // Скрываем canvas
    canvas.style.display = "none"

    toast({
      title: "Цвет выбран",
      description: `Выбран цвет: ${hex}`,
    })
  }

  const toggleImagePicker = () => {
    if (!imagePreview) {
      toast({
        title: "Нет изображения",
        description: "Сначала загрузите изображение вещи",
        variant: "destructive",
      })
      return
    }

    if (!isPickingFromImage) {
      setIsPickingFromImage(true)
      loadImageToCanvas()
    } else {
      setIsPickingFromImage(false)
      if (canvasRef.current) {
        canvasRef.current.style.display = "none"
      }
    }
  }

  const currentColor = value || "#808080"

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}

      {/* Основной ряд с цветом и кнопками */}
      <div className="flex gap-2">
        <div className="flex items-center gap-2 flex-1">
          <div
            className="w-10 h-10 rounded border-2 border-gray-300 cursor-pointer flex-shrink-0"
            style={{ backgroundColor: currentColor }}
            onClick={() => setShowPresets(!showPresets)}
            title="Кликните для выбора готового цвета"
          />
          <Input
            value={hexInput}
            onChange={handleHexInputChange}
            placeholder={placeholder || "#808080"}
            className="flex-1"
            maxLength={7}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setShowPresets(!showPresets)}
          title="Готовые цвета"
        >
          <Palette className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant={isPickingFromImage ? "default" : "outline"}
          size="icon"
          onClick={toggleImagePicker}
          title={isPickingFromImage ? "Отменить выбор" : "Выбрать цвет с изображения"}
        >
          <Pipette className="h-4 w-4" />
        </Button>
      </div>

      {/* Готовые цвета */}
      {showPresets && (
        <div className="p-3 border rounded-lg bg-gray-50">
          <Label className="text-sm font-medium mb-2 block">Готовые цвета</Label>
          <div className="grid grid-cols-8 gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`w-8 h-8 rounded border-2 cursor-pointer hover:scale-110 transition-transform ${
                  currentColor.toUpperCase() === color ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-300"
                }`}
                style={{ backgroundColor: color }}
                onClick={() => {
                  handleColorChange(color)
                  setShowPresets(false)
                }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}

      {/* Canvas для выбора цвета с изображения */}
      <canvas ref={canvasRef} onClick={handleCanvasClick} className="hidden" />

      {/* Подсказка при выборе цвета */}
      {isPickingFromImage && (
        <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
          <strong>Режим выбора цвета:</strong> Кликните по изображению выше, чтобы выбрать цвет
        </div>
      )}
    </div>
  )
}

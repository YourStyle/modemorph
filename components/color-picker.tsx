"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Pipette, Palette } from "lucide-react"
import { toast } from "sonner"

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  imagePreview?: string | null
}

const PRESET_COLORS = [
  "#000000",
  "#FFFFFF",
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#FFFF00",
  "#FF00FF",
  "#00FFFF",
  "#800000",
  "#008000",
  "#000080",
  "#808000",
  "#800080",
  "#008080",
  "#C0C0C0",
  "#808080",
  "#FFA500",
  "#FFC0CB",
  "#A52A2A",
  "#DDA0DD",
  "#98FB98",
  "#F0E68C",
  "#DEB887",
  "#D2691E",
]

export function ColorPicker({ value, onChange, imagePreview }: ColorPickerProps) {
  const [isPickingFromImage, setIsPickingFromImage] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (isPickingFromImage && imagePreview && canvasRef.current && imageRef.current) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      const img = imageRef.current

      img.onload = () => {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        ctx?.drawImage(img, 0, 0)
      }

      if (img.complete) {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        ctx?.drawImage(img, 0, 0)
      }
    }
  }, [isPickingFromImage, imagePreview])

  const handleImageClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !isPickingFromImage) return

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

    const hexColor = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
      .toString(16)
      .padStart(2, "0")}`

    onChange(hexColor)
    setIsPickingFromImage(false)
    toast.success(`Выбран цвет: ${hexColor}`)
  }

  const handlePipetteClick = () => {
    if (!imagePreview) {
      toast.error("Сначала загрузите изображение")
      return
    }
    setIsPickingFromImage(!isPickingFromImage)
  }

  const handlePresetColorClick = (color: string) => {
    onChange(color)
    setShowPalette(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value
    if (/^#[0-9A-F]{6}$/i.test(color)) {
      onChange(color)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1">
          <div
            className="w-10 h-10 rounded border border-gray-300 flex-shrink-0"
            style={{ backgroundColor: value || "#ffffff" }}
          />
          <Input type="text" value={value} onChange={handleInputChange} placeholder="#000000" className="font-mono" />
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePipetteClick}
          className={`p-2 ${isPickingFromImage ? "bg-blue-100 border-blue-300" : ""}`}
          title="Выбрать цвет с изображения"
        >
          <Pipette className="h-4 w-4" />
        </Button>

        <Popover open={showPalette} onOpenChange={setShowPalette}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="p-2 bg-transparent" title="Палитра цветов">
              <Palette className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="grid grid-cols-8 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => handlePresetColorClick(color)}
                  title={color}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Canvas для выбора цвета с изображения */}
      {isPickingFromImage && imagePreview && (
        <div className="relative">
          <div className="text-sm text-blue-600 mb-2">Кликните по изображению, чтобы выбрать цвет</div>
          <div className="relative border-2 border-blue-300 rounded-lg overflow-hidden">
            <img
              ref={imageRef}
              src={imagePreview || "/placeholder.svg"}
              alt="Color picker"
              className="max-w-full h-auto"
              style={{ maxHeight: "300px" }}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              onClick={handleImageClick}
              style={{ maxHeight: "300px" }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

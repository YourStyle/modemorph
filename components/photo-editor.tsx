"use client"

import type React from "react"
import { useRef, useEffect, useState } from "react"
import { Slider } from "@/components/ui/slider"
import { RotateCcw, Undo2, Redo2, Crop, Eraser, Settings, X, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface PhotoEditorProps {
  imageUrl: string
  onSave: (editedImageUrl: string) => void
  onCancel: () => void
}

export function PhotoEditor({ imageUrl, onSave, onCancel }: PhotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [tool, setTool] = useState<"erase" | "restore">("erase")
  const [brushSize, setBrushSize] = useState(60)
  const [offset, setOffset] = useState(0)
  const [history, setHistory] = useState<ImageData[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)

      // Save initial state to history
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      setHistory([imageData])
      setHistoryIndex(0)
    }
    img.src = imageUrl
  }, [imageUrl])

  const saveToHistory = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(imageData)
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }

  const undo = () => {
    if (historyIndex > 0) {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const prevIndex = historyIndex - 1
      ctx.putImageData(history[prevIndex], 0, 0)
      setHistoryIndex(prevIndex)
    }
  }

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const nextIndex = historyIndex + 1
      ctx.putImageData(history[nextIndex], 0, 0)
      setHistoryIndex(nextIndex)
    }
  }

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    draw(e)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const pos = getMousePos(e)

    ctx.globalCompositeOperation = tool === "erase" ? "destination-out" : "source-over"
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, brushSize / 2, 0, 2 * Math.PI)
    ctx.fill()
  }

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false)
      saveToHistory()
    }
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob)
        onSave(url)
      }
    }, "image/png")
  }

  const removeBackground = () => {
    // Placeholder for background removal functionality
    console.log("Remove background")
  }

  return (
    <div className="h-full flex flex-col bg-ink">
      {/* Header — floating glass control bar over the canvas, not a solid plate */}
      <div className="flex items-center justify-between p-3 backdrop-blur-xl bg-black/30 border-b border-white/10">
        <button
          onClick={onCancel}
          className="p-2.5 rounded-full text-white/80 transition-transform duration-press active:scale-90"
          aria-label="Отменить"
        >
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <button
          onClick={handleSave}
          className="p-2.5 rounded-full bg-signal text-signal-ink transition-transform duration-press active:scale-90"
          aria-label="Сохранить"
        >
          <Check className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex items-center justify-center p-4 relative">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full rounded-[14px] border border-white/10 cursor-crosshair"
          style={{
            background:
              "url(\"data:image/svg+xml,%3csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3e%3cdefs%3e%3cpattern id='a' patternUnits='userSpaceOnUse' width='20' height='20'%3e%3crect fill='%23ffffff' width='10' height='10'/%3e%3crect fill='%23f0f0f0' x='10' y='10' width='10' height='10'/%3e%3c/pattern%3e%3c/defs%3e%3crect width='100%25' height='100%25' fill='url(%23a)'/%3e%3c/svg%3e\")",
          }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
        />

        {/* Brush Preview */}
        {isDrawing && (
          <div
            className="absolute pointer-events-none border-2 border-signal rounded-full"
            style={{
              width: brushSize,
              height: brushSize,
              backgroundColor: "hsl(var(--signal) / 0.2)",
            }}
          />
        )}
      </div>

      {/* Controls — floating glass panel, not a solid plate */}
      <div className="p-4 backdrop-blur-xl bg-black/30 border-t border-white/10 space-y-4">
        {/* Sliders */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/80 text-caption">Смещение</span>
              <span className="text-white text-caption font-medium">{offset}</span>
            </div>
            <Slider
              value={[offset]}
              onValueChange={(value) => setOffset(value[0])}
              max={100}
              step={1}
              className="w-full"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/80 text-caption">Кисть</span>
              <span className="text-white text-caption font-medium">{brushSize}</span>
            </div>
            <Slider
              value={[brushSize]}
              onValueChange={(value) => setBrushSize(value[0])}
              min={10}
              max={200}
              step={5}
              className="w-full"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={removeBackground}
            className="flex flex-col items-center gap-1 py-2 px-3 rounded-[14px] text-white/70 transition-transform duration-press active:scale-95"
          >
            <Crop className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-micro">Удалить фон</span>
          </button>

          <div className="flex gap-1">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              className="p-2.5 rounded-full text-white/70 transition-transform duration-press active:scale-90 disabled:opacity-30"
              aria-label="Отменить действие"
            >
              <Undo2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              className="p-2.5 rounded-full text-white/70 transition-transform duration-press active:scale-90 disabled:opacity-30"
              aria-label="Повторить действие"
            >
              <Redo2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Tool Selection */}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => setTool("erase")}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 px-6 rounded-full transition-transform duration-press active:scale-95",
              tool === "erase" ? "bg-signal text-signal-ink" : "text-white/70"
            )}
          >
            <Eraser className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-micro">Стереть</span>
          </button>
          <button
            onClick={() => setTool("restore")}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 px-6 rounded-full transition-transform duration-press active:scale-95",
              tool === "restore" ? "bg-signal text-signal-ink" : "text-white/70"
            )}
          >
            <RotateCcw className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-micro">Восстановить</span>
          </button>
          <button className="flex flex-col items-center gap-1 py-2.5 px-6 rounded-full text-white/70 transition-transform duration-press active:scale-95">
            <Settings className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-micro">Настроить</span>
          </button>
        </div>
      </div>
    </div>
  )
}

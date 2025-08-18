"use client"

import type React from "react"
import { useRef, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { RotateCcw, Undo2, Redo2, Crop, Eraser, Settings, X, Check } from "lucide-react"

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
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-white">
          <X className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleSave} className="text-white">
          <Check className="h-4 w-4" />
        </Button>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex items-center justify-center p-4 relative">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full border border-gray-600 cursor-crosshair"
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
            className="absolute pointer-events-none border-2 border-pink-500 rounded-full"
            style={{
              width: brushSize,
              height: brushSize,
              backgroundColor: "rgba(236, 72, 153, 0.2)",
            }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-gray-700 space-y-4">
        {/* Sliders */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white text-sm">Смещение</span>
              <span className="text-pink-400 text-sm">{offset}</span>
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
              <span className="text-white text-sm">Кисть</span>
              <span className="text-pink-400 text-sm">{brushSize}</span>
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
          <Button variant="ghost" size="sm" onClick={removeBackground} className="text-white flex-col h-auto py-2">
            <Crop className="h-5 w-5 mb-1" />
            <span className="text-xs">Удалить фон</span>
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={undo} disabled={historyIndex <= 0} className="text-white">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              className="text-white"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tool Selection */}
        <div className="flex justify-center gap-4">
          <Button
            variant={tool === "erase" ? "default" : "ghost"}
            size="sm"
            onClick={() => setTool("erase")}
            className="flex-col h-auto py-3 px-6"
          >
            <Eraser className="h-6 w-6 mb-1" />
            <span className="text-xs">Стереть</span>
          </Button>
          <Button
            variant={tool === "restore" ? "default" : "ghost"}
            size="sm"
            onClick={() => setTool("restore")}
            className="flex-col h-auto py-3 px-6"
          >
            <RotateCcw className="h-6 w-6 mb-1" />
            <span className="text-xs">Восстановить</span>
          </Button>
          <Button variant="ghost" size="sm" className="flex-col h-auto py-3 px-6">
            <Settings className="h-6 w-6 mb-1" />
            <span className="text-xs">Настроить</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

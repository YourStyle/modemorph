"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { X, ChevronDown } from "lucide-react"

interface CommonSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  backgroundColor?: "white" | "dark"
  onMinimize?: () => void
  /** Поведение при свайпе вниз: 'close' (по умолчанию) или 'minimize' */
  swipeAction?: 'close' | 'minimize'
}

export function CommonSheet({
  isOpen,
  onClose,
  title,
  children,
  backgroundColor = "white",
  onMinimize,
  swipeAction = 'close'
}: CommonSheetProps) {
  const isDark = backgroundColor === "dark"
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef<number>(0)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    // Начинаем отслеживать только если касание на drag handle
    const target = e.target as HTMLElement
    if (!target.closest('.drag-handle')) return

    startYRef.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return

    const currentY = e.touches[0].clientY
    const deltaY = currentY - startYRef.current

    // Позволяем свайпить только вниз
    if (deltaY > 0) {
      setDragY(deltaY)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)

    // Если протащили больше 100px - выполняем действие
    if (dragY > 100) {
      if (swipeAction === 'minimize' && onMinimize) {
        onMinimize()
      } else {
        onClose()
      }
    }

    // Сбрасываем позицию
    setDragY(0)
  }

  // Сбрасываем dragY при закрытии шторки
  useEffect(() => {
    if (!isOpen) {
      setDragY(0)
      setIsDragging(false)
    }
  }, [isOpen])

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        ref={contentRef}
        side="bottom"
        className="h-[80vh] rounded-t-3xl border-0 p-0 bg-[#F9FAFB]"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="drag-handle flex justify-center py-3 cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Кнопка сворачивания (если передана) */}
        {onMinimize && (
          <button
            onClick={onMinimize}
            className="absolute top-4 right-16 p-2 rounded-full transition-colors z-10 text-[#101010] hover:bg-gray-200"
            aria-label="Свернуть в виджет"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full transition-colors z-10 text-[#101010] hover:bg-gray-200"
        >
          <X className="w-5 h-5" />
        </button>

        {title && (
          <SheetHeader className="px-6 pb-4">
            <SheetTitle className="text-center text-xl font-semibold text-[#101010]">
              {title}
            </SheetTitle>
          </SheetHeader>
        )}

        <div className={cn("px-6 pb-6 h-full overflow-y-auto text-[#101010]", !title && "pt-4")}>{children}</div>
      </SheetContent>
    </Sheet>
  )
}

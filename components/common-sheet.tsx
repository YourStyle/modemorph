"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { Sheet, SheetContent } from "@/components/ui/sheet"

interface CommonSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function CommonSheet({ isOpen, onClose, title, children }: CommonSheetProps) {
  const [startY, setStartY] = useState(0)
  const [currentY, setCurrentY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown)
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose])

  // Touch handlers for swipe to close
  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY)
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return

    const currentTouchY = e.touches[0].clientY
    const deltaY = currentTouchY - startY

    if (deltaY > 0) {
      // Only allow downward swipes
      setCurrentY(deltaY)
      if (sheetRef.current) {
        sheetRef.current.style.transform = `translateY(${deltaY}px)`
      }
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return

    const sheetHeight = sheetRef.current?.offsetHeight || 0
    const threshold = sheetHeight * 0.5 // 50% of sheet height

    if (currentY > threshold) {
      onClose()
    } else {
      // Snap back to original position
      if (sheetRef.current) {
        sheetRef.current.style.transform = "translateY(0px)"
      }
    }

    setIsDragging(false)
    setCurrentY(0)
    setStartY(0)
  }

  // Mouse handlers for desktop drag
  const handleMouseDown = (e: React.MouseEvent) => {
    setStartY(e.clientY)
    setIsDragging(true)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return

    const deltaY = e.clientY - startY

    if (deltaY > 0) {
      setCurrentY(deltaY)
      if (sheetRef.current) {
        sheetRef.current.style.transform = `translateY(${deltaY}px)`
      }
    }
  }

  const handleMouseUp = () => {
    if (!isDragging) return

    const sheetHeight = sheetRef.current?.offsetHeight || 0
    const threshold = sheetHeight * 0.5

    if (currentY > threshold) {
      onClose()
    } else {
      if (sheetRef.current) {
        sheetRef.current.style.transform = "translateY(0px)"
      }
    }

    setIsDragging(false)
    setCurrentY(0)
    setStartY(0)
  }

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, startY, currentY])

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className="h-auto max-h-[90vh] bg-slate-800 border-0 text-white rounded-t-3xl p-0 transition-transform duration-200"
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-4 cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1 bg-gray-400 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 pb-6">
          <h3 className="text-sm font-medium text-gray-300">{title}</h3>
        </div>

        {/* Content */}
        <div className="px-6 pb-8">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

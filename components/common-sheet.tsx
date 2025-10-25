"use client"

import type React from "react"
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
}

export function CommonSheet({ isOpen, onClose, title, children, backgroundColor = "white", onMinimize }: CommonSheetProps) {
  const isDark = backgroundColor === "dark"

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className="h-[80vh] rounded-t-3xl border-0 p-0 bg-[#F9FAFB]"
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3 cursor-grab active:cursor-grabbing">
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

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
        className={cn("h-[80vh] rounded-t-3xl border-0 p-0", isDark ? "bg-slate-800" : "bg-white")}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3 cursor-grab active:cursor-grabbing">
          <div className={cn("w-12 h-1 rounded-full", isDark ? "bg-gray-600" : "bg-gray-300")} />
        </div>

        {/* Кнопка сворачивания (если передана) */}
        {onMinimize && (
          <button
            onClick={onMinimize}
            className={cn(
              "absolute top-4 right-16 p-2 rounded-full transition-colors z-10",
              isDark
                ? "text-gray-300 hover:text-white hover:bg-gray-700"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
            )}
            aria-label="Свернуть в виджет"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={onClose}
          className={cn(
            "absolute top-4 right-4 p-2 rounded-full transition-colors z-10",
            isDark
              ? "text-gray-300 hover:text-white hover:bg-gray-700"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
          )}
        >
          <X className="w-5 h-5" />
        </button>

        {title && (
          <SheetHeader className="px-6 pb-4">
            <SheetTitle className={cn("text-center text-xl font-semibold", isDark ? "text-white" : "text-gray-900")}>
              {title}
            </SheetTitle>
          </SheetHeader>
        )}

        <div className={cn("px-6 pb-6 h-full overflow-y-auto", !title && "pt-4")}>{children}</div>
      </SheetContent>
    </Sheet>
  )
}

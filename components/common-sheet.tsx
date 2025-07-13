"use client"

import type { ReactNode } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CommonSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  backgroundColor?: "white" | "dark"
}

export function CommonSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  backgroundColor = "white",
}: CommonSheetProps) {
  const isDark = backgroundColor === "dark"

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className={`h-[90vh] ${isDark ? "bg-slate-800 text-white" : "bg-white text-gray-900"} rounded-t-3xl`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className={`flex-shrink-0 pb-4 ${isDark ? "border-gray-700" : "border-gray-200"} border-b`}>
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className={`text-xl font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {title}
                </SheetTitle>
                {subtitle && <p className={`text-sm mt-1 ${isDark ? "text-gray-300" : "text-gray-500"}`}>{subtitle}</p>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className={`p-2 ${isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-400 hover:text-gray-600"}`}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </SheetHeader>

          {/* Content */}
          <div className="flex-1 overflow-y-auto py-4">{children}</div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

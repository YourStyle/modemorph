"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface CommonSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  backgroundColor?: "white" | "dark"
}

export function CommonSheet({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  backgroundColor = "white" 
}: CommonSheetProps) {
  const isDark = backgroundColor === "dark"
  
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="bottom" 
        className={cn(
          "h-[80vh] rounded-t-3xl border-0 p-0",
          isDark ? "bg-slate-800" : "bg-white"
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3 cursor-grab active:cursor-grabbing">
          <div className={cn(
            "w-12 h-1 rounded-full",
            isDark ? "bg-gray-600" : "bg-gray-300"
          )} />
        </div>
        
        <SheetHeader className="px-6 pb-4">
          <SheetTitle className={cn(
            "text-center text-xl font-semibold",
            isDark ? "text-white" : "text-gray-900"
          )}>
            {title}
          </SheetTitle>
        </SheetHeader>
        
        <div className="px-6 pb-6 h-full overflow-y-auto">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}

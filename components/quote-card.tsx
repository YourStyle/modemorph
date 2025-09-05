"use client"

import { Quote } from "lucide-react"
import { cn } from "@/lib/utils"

export function QuoteCard({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-white/10 bg-white/5",
        "px-4 py-3 min-h-[96px]",
        "text-sm leading-relaxed text-neutral-100",
        className
      )}
    >
      <Quote aria-hidden className="absolute left-3 top-3 size-4 opacity-40" />
      <div className="pl-6">{children}</div>
    </div>
  )
}

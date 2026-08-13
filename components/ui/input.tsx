import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-full border border-transparent bg-canvas-sunk px-4 py-2 text-[15px] text-ink ring-offset-background transition-colors duration-enter ease-out file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/15 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-[15px]",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

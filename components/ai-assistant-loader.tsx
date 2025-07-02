"use client"

import { cn } from "@/lib/utils"

interface AIAssistantLoaderProps {
  size?: number
  className?: string
}

export function AIAssistantLoader({ size = 32, className }: AIAssistantLoaderProps) {
  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "linear-gradient(165deg, rgba(255,255,255,1) 0%, rgb(220, 220, 220) 40%, rgb(170, 170, 170) 98%, rgb(10, 10, 10) 100%)",
        }}
      >
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{
            boxShadow: `
              0 -${size * 0.067}px ${size * 0.133}px ${size * 0.133}px #ffffff40 inset,
              0 -${size * 0.033}px ${size * 0.1}px ${size * 0.067}px #ffffff50 inset,
              0 -${size * 0.013}px ${size * 0.033}px #ffffff80 inset,
              0 -${size * 0.02}px ${size * 0.013}px #ffffffBB inset,
              0 ${size * 0.013}px 0px #ffffff,
              0 ${size * 0.013}px ${size * 0.02}px #ffffff,
              0 ${size * 0.033}px ${size * 0.033}px #ffffff90,
              0 ${size * 0.067}px ${size * 0.1}px #ffffff60,
              0 ${size * 0.067}px ${size * 0.133}px ${size * 0.133}px #ffffff40
            `,
            filter: "blur(2px)",
            animationDuration: "2s",
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
          }}
        />
      </div>
    </div>
  )
}

"use client"

import { cn } from "@/lib/utils"

interface AIAssistantLoaderProps {
  size?: number
  className?: string
}

/**
 * Small orbiting-dot spinner used both as the AI tab's signature icon
 * (bottom-navigation.tsx, always mounted on every screen, size=28) and as
 * a loading indicator during AI work. Token-only, transform-only motion —
 * the spin comes from Tailwind's built-in `animate-spin`, which is already
 * subject to the global prefers-reduced-motion override in app/globals.css.
 *
 * The dot is ink, not signal: this component is mounted on every screen of
 * the app via the bottom nav, so a signal-colored dot would silently spend
 * the app's one-accent-per-screen budget everywhere, all the time.
 */
export function AIAssistantLoader({ size = 32, className }: AIAssistantLoaderProps) {
  const dot = Math.max(4, Math.round(size * 0.22))

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      {/* static track */}
      <div className="absolute inset-0 rounded-full border-2 border-canvas-sunk" />
      {/* orbiting dot — rotate only, composited */}
      <div className="absolute inset-0 animate-spin" style={{ animationDuration: "1.4s" }}>
        <span
          className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-ink"
          style={{ width: dot, height: dot, marginTop: -dot / 2 }}
        />
      </div>
    </div>
  )
}

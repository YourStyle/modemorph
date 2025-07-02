"use client"

interface PastelLoaderProps {
  size?: number
}

export function PastelLoader({ size = 32 }: PastelLoaderProps) {
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full animate-spin"
        style={{
          background: "conic-gradient(from 0deg, #FFB6C1, #DDA0DD, #98FB98, #87CEEB, #F0E68C, #FFB6C1)",
          animationDuration: "1.5s",
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
        }}
      >
        <div className="absolute inset-1 rounded-full bg-white" />
      </div>
    </div>
  )
}

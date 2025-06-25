"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Package } from "lucide-react"
import { cn } from "@/lib/utils"

interface CachedWardrobeImageProps {
  itemName: string
  className?: string
  alt?: string
}

export function CachedWardrobeImage({ itemName, className, alt }: CachedWardrobeImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let isMounted = true

    const loadImage = async () => {
      try {
        setIsLoading(true)
        setError(false)

        const response = await fetch("/api/images/match", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ itemName }),
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        if (isMounted) {
          if (data.imageUrl) {
            setImageUrl(data.imageUrl)
          } else {
            setError(true)
          }
          setIsLoading(false)
        }
      } catch (err) {
        if (isMounted) {
          setError(true)
          setIsLoading(false)
        }
      }
    }

    if (itemName) {
      loadImage()
    } else {
      setIsLoading(false)
      setError(true)
    }

    return () => {
      isMounted = false
    }
  }, [itemName])

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center bg-gray-100 animate-pulse", className)}>
        <Package className="h-8 w-8 text-gray-400" />
      </div>
    )
  }

  if (error || !imageUrl) {
    return (
      <div className={cn("flex items-center justify-center bg-gray-100", className)}>
        <Package className="h-8 w-8 text-gray-400" />
      </div>
    )
  }

  return (
    <div className={cn("relative", className)}>
      <Image
        src={imageUrl || "/placeholder.svg"}
        alt={alt || itemName}
        fill
        className="object-contain"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        onError={() => setError(true)}
      />
    </div>
  )
}

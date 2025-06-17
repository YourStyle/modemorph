"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Package } from "lucide-react"
import { imageCache } from "@/lib/image-cache"

interface CachedWardrobeImageProps {
  itemName: string
  alt: string
  className?: string
  sizes?: string
  priority?: boolean
}

export function CachedWardrobeImage({ itemName, alt, className, sizes, priority }: CachedWardrobeImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadImage = async () => {
      try {
        setLoading(true)
        setError(false)

        const url = await imageCache.getImage(itemName)

        if (mounted) {
          setImageUrl(url)
          setError(!url)
        }
      } catch (err) {
        console.error("Error loading cached image:", err)
        if (mounted) {
          setError(true)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadImage()

    return () => {
      mounted = false
    }
  }, [itemName])

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <div className="animate-pulse">
          <Package className="h-8 w-8 text-gray-300" />
        </div>
      </div>
    )
  }

  if (error || !imageUrl) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <Package className="h-8 w-8 text-gray-400" />
      </div>
    )
  }

  return (
    <Image
      src={imageUrl || "/placeholder.svg"}
      alt={alt}
      fill
      className={`object-cover ${className}`}
      sizes={sizes}
      priority={priority}
      onError={() => setError(true)}
    />
  )
}

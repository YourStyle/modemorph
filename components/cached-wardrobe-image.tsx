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
  const [debugInfo, setDebugInfo] = useState<any>(null)

  useEffect(() => {
    let isMounted = true

    const loadImage = async () => {
      try {
        console.log("🖼️ CachedWardrobeImage: Loading image for", itemName)
        setIsLoading(true)
        setError(false)

        const response = await fetch("/api/images/match", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ itemName }),
        })

        console.log("📡 API Response status:", response.status)

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        console.log("📦 API Response data:", data)

        if (isMounted) {
          setDebugInfo(data.debug)
          if (data.imageUrl) {
            console.log("✅ Image found:", data.imageUrl)
            setImageUrl(data.imageUrl)
          } else {
            console.log("❌ No image found for:", itemName)
            setError(true)
          }
          setIsLoading(false)
        }
      } catch (err) {
        console.error("❌ Error loading image for", itemName, err)
        if (isMounted) {
          setError(true)
          setIsLoading(false)
        }
      }
    }

    if (itemName) {
      loadImage()
    } else {
      console.log("⚠️ No itemName provided")
      setIsLoading(false)
      setError(true)
    }

    return () => {
      isMounted = false
    }
  }, [itemName])

  if (isLoading) {
    return (
      <div className={cn("flex flex-col items-center justify-center bg-gray-100 animate-pulse p-2", className)}>
        <Package className="h-8 w-8 text-gray-400 mb-1" />
        <div className="text-xs text-gray-500">Загрузка...</div>
      </div>
    )
  }

  if (error || !imageUrl) {
    return (
      <div className={cn("flex flex-col items-center justify-center bg-gray-100 p-2", className)}>
        <Package className="h-8 w-8 text-gray-400 mb-1" />
        <div className="text-xs text-gray-500 text-center">
          <div>Нет фото</div>
          <div className="text-[10px] mt-1">{itemName}</div>
          {debugInfo && (
            <div className="text-[8px] mt-1 text-red-500">
              Искали: {debugInfo.searchPattern}
              <br />
              Найдено файлов: {debugInfo.originalImageBlobs}
            </div>
          )}
        </div>
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
        onError={() => {
          console.log("❌ Image failed to load:", imageUrl)
          setError(true)
        }}
        onLoad={() => {
          console.log("✅ Image loaded successfully:", imageUrl)
        }}
      />
    </div>
  )
}

import React from 'react'
import { Package } from 'lucide-react'

interface PlaceholderImageProps {
  className?: string
  text?: string
}

export function PlaceholderImage({ 
  className = "w-full h-full", 
  text = "Нет изображения" 
}: PlaceholderImageProps) {
  return (
    <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
      <div className="text-center">
        <Package className="h-12 w-12 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500">{text}</p>
      </div>
    </div>
  )
}

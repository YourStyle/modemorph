'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, X } from 'lucide-react'
import Image from 'next/image'

interface OutfitPreviewUploadProps {
  currentPreview?: string
  onPreviewChange: (preview: string | null) => void
}

export default function OutfitPreviewUpload({ 
  currentPreview, 
  onPreviewChange 
}: OutfitPreviewUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(currentPreview || null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch('/api/upload-to-yandex', {
        method: 'POST',
        body: formData,
      })
      
      if (response.ok) {
        const { url } = await response.json()
        setPreview(url)
        onPreviewChange(url)
      }
    } catch (error) {
      console.error('Error uploading preview:', error)
    } finally {
      setIsUploading(false)
    }
  }

  const removePreview = () => {
    setPreview(null)
    onPreviewChange(null)
  }

  return (
    <div className="space-y-4">
      <Label htmlFor="preview-upload">Превью образа</Label>
      
      {preview ? (
        <div className="relative w-full max-w-sm">
          <Image
            src={preview || "/placeholder.svg"}
            alt="Превью образа"
            width={200}
            height={300}
            className="rounded-lg object-cover"
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2"
            onClick={removePreview}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <div className="mt-4">
            <Label htmlFor="preview-upload" className="cursor-pointer">
              <span className="mt-2 block text-sm font-medium text-gray-900">
                Загрузить превью образа
              </span>
            </Label>
            <Input
              id="preview-upload"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={isUploading}
              className="hidden"
            />
          </div>
        </div>
      )}
      
      {isUploading && (
        <p className="text-sm text-gray-500">Загрузка...</p>
      )}
    </div>
  )
}

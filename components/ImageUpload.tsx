'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, X, Loader2 } from 'lucide-react'
import Image from 'next/image'
import { useToast } from '@/hooks/use-toast'

interface ImageUploadProps {
  value?: string
  onChange: (url: string) => void
  onRemove: () => void
  disabled?: boolean
}

export default function ImageUpload({
  value,
  onChange,
  onRemove,
  disabled = false
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const { toast } = useToast()

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Проверяем тип файла
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Ошибка',
        description: 'Пожалуйста, выберите изображение',
        variant: 'destructive'
      })
      return
    }

    // Проверяем размер файла (максимум 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'Ошибка',
        description: 'Размер файла не должен превышать 10MB',
        variant: 'destructive'
      })
      return
    }

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'outfits')

      const response = await fetch('/api/upload-to-yandex', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to upload image')
      }

      const data = await response.json()
      
      if (data.url) {
        onChange(data.url)
        toast({
          title: 'Успешно',
          description: 'Изображение загружено'
        })
      } else {
        throw new Error('No URL returned from upload')
      }
    } catch (error) {
      console.error('Error uploading image:', error)
      toast({
        title: 'Ошибка загрузки',
        description: error instanceof Error ? error.message : 'Не удалось загрузить изображение',
        variant: 'destructive'
      })
    } finally {
      setUploading(false)
      // Сбрасываем значение input для возможности повторной загрузки того же файла
      event.target.value = ''
    }
  }, [onChange, toast])

  const handleRemove = useCallback(() => {
    onRemove()
  }, [onRemove])

  if (value) {
    return (
      <div className="relative">
        <div className="relative aspect-video w-full max-w-sm bg-gray-100 rounded-lg overflow-hidden">
          <Image
            src={value || "/placeholder.svg"}
            alt="Uploaded image"
            fill
            className="object-cover"
            sizes="(max-width: 400px) 100vw, 400px"
          />
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="absolute top-2 right-2"
          onClick={handleRemove}
          disabled={disabled || uploading}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          disabled={disabled || uploading}
          className="hidden"
          id="image-upload"
        />
        <label
          htmlFor="image-upload"
          className={`cursor-pointer ${disabled || uploading ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          <div className="flex flex-col items-center gap-2">
            {uploading ? (
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            ) : (
              <Upload className="w-8 h-8 text-gray-400" />
            )}
            <div className="text-sm text-gray-600">
              {uploading ? (
                'Загрузка...'
              ) : (
                <>
                  <span className="font-medium text-blue-600 hover:text-blue-500">
                    Нажмите для загрузки
                  </span>
                  {' или перетащите файл сюда'}
                </>
              )}
            </div>
            <div className="text-xs text-gray-500">
              PNG, JPG, GIF до 10MB
            </div>
          </div>
        </label>
      </div>
    </div>
  )
}

"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, Trash2, Check, ImageIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import Image from "next/image"

interface Avatar {
  id: string
  image_url: string
  is_active: boolean
  created_at: string
}

interface Fitting {
  id: string
  outfit_items: any[]
  result_image_url?: string
  status: "pending" | "processing" | "completed" | "failed"
  error_message?: string
  created_at: string
  user_avatars: {
    id: string
    image_url: string
  }
}

export default function AvatarPage() {
  const [avatars, setAvatars] = useState<Avatar[]>([])
  const [fittings, setFittings] = useState<Fitting[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      // Загружаем аватары
      const avatarsResponse = await fetch("/api/user-avatars")
      if (avatarsResponse.ok) {
        const { avatars: avatarsData } = await avatarsResponse.json()
        setAvatars(avatarsData || [])
      }

      // Загружаем примерки
      const fittingsResponse = await fetch("/api/user-fittings")
      if (fittingsResponse.ok) {
        const { fittings: fittingsData } = await fittingsResponse.json()
        setFittings(fittingsData || [])
      }
    } catch (error) {
      console.error("Error loading data:", error)
      toast.error("Ошибка загрузки данных")
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)

      // Загружаем файл в Blob storage
      const formData = new FormData()
      formData.append("file", file)
      formData.append("prefix", "avatars")

      const uploadResponse = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image")
      }

      const { url } = await uploadResponse.json()

      // Создаем аватар
      const createResponse = await fetch("/api/user-avatars", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: url,
          is_active: avatars.length === 0, // Первый аватар делаем активным
        }),
      })

      if (!createResponse.ok) {
        throw new Error("Failed to create avatar")
      }

      toast.success("Аватар успешно загружен")
      loadData()
    } catch (error) {
      console.error("Error uploading avatar:", error)
      toast.error("Ошибка загрузки аватара")
    } finally {
      setUploading(false)
    }
  }

  const setActiveAvatar = async (avatarId: string) => {
    try {
      const response = await fetch(`/api/user-avatars/${avatarId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_active: true }),
      })

      if (!response.ok) {
        throw new Error("Failed to set active avatar")
      }

      toast.success("Аватар установлен как активный")
      loadData()
    } catch (error) {
      console.error("Error setting active avatar:", error)
      toast.error("Ошибка установки аватара")
    }
  }

  const deleteAvatar = async (avatarId: string) => {
    try {
      const response = await fetch(`/api/user-avatars/${avatarId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete avatar")
      }

      toast.success("Аватар удален")
      loadData()
    } catch (error) {
      console.error("Error deleting avatar:", error)
      toast.error("Ошибка удаления аватара")
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Ожидание</Badge>
      case "processing":
        return <Badge variant="default">Обработка</Badge>
      case "completed":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            Готово
          </Badge>
        )
      case "failed":
        return <Badge variant="destructive">Ошибка</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-600">Загрузка...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Мой аватар</h1>
        <p className="text-gray-600">Загрузите свое фото для примерки одежды</p>
      </div>

      {/* Секция загрузки аватара */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Загрузить новое фото
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              id="avatar-upload"
            />
            <label htmlFor="avatar-upload">
              <Button asChild disabled={uploading}>
                <span className="cursor-pointer">
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Загрузка...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Выбрать фото
                    </>
                  )}
                </span>
              </Button>
            </label>
            <p className="text-sm text-gray-600">Рекомендуется фото в полный рост на однотонном фоне</p>
          </div>
        </CardContent>
      </Card>

      {/* Секция аватаров */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Мои фото ({avatars.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {avatars.length === 0 ? (
            <div className="text-center py-8">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">У вас пока нет загруженных фото</p>
              <p className="text-sm text-gray-500">Загрузите первое фото для примерки одежды</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {avatars.map((avatar) => (
                <div key={avatar.id} className="relative group">
                  <div className="aspect-[3/4] relative rounded-lg overflow-hidden bg-gray-100">
                    <Image src={avatar.image_url || "/placeholder.svg"} alt="Аватар" fill className="object-cover" />
                    {avatar.is_active && (
                      <div className="absolute top-2 left-2">
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          <Check className="w-3 h-3 mr-1" />
                          Активный
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {!avatar.is_active && (
                      <Button size="sm" variant="outline" onClick={() => setActiveAvatar(avatar.id)} className="flex-1">
                        Использовать
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteAvatar(avatar.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Секция примерок */}
      <Card>
        <CardHeader>
          <CardTitle>История примерок ({fittings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {fittings.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ImageIcon className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-600">У вас пока нет примерок</p>
              <p className="text-sm text-gray-500">Создайте образ и нажмите "Примерить"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {fittings.map((fitting) => (
                <div key={fitting.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-500">
                      {new Date(fitting.created_at).toLocaleDateString("ru-RU")}
                    </span>
                    {getStatusBadge(fitting.status)}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {/* Исходное фото */}
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Исходное фото</p>
                      <div className="aspect-[3/4] relative rounded bg-gray-100">
                        <Image
                          src={fitting.user_avatars.image_url || "/placeholder.svg"}
                          alt="Исходное фото"
                          fill
                          className="object-cover rounded"
                        />
                      </div>
                    </div>

                    {/* Результат */}
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Результат</p>
                      <div className="aspect-[3/4] relative rounded bg-gray-100">
                        {fitting.result_image_url ? (
                          <Image
                            src={fitting.result_image_url || "/placeholder.svg"}
                            alt="Результат примерки"
                            fill
                            className="object-cover rounded"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            {fitting.status === "processing" ? (
                              <div className="text-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400 mx-auto mb-2"></div>
                                <p className="text-xs text-gray-500">Обработка...</p>
                              </div>
                            ) : fitting.status === "failed" ? (
                              <p className="text-xs text-red-500 text-center">Ошибка</p>
                            ) : (
                              <p className="text-xs text-gray-500 text-center">Ожидание</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 mb-1">Вещей в образе: {fitting.outfit_items.length}</p>
                    {fitting.error_message && <p className="text-xs text-red-500 mt-1">{fitting.error_message}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

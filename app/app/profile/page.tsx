"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Trash2, Upload, Star, User, Camera } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface UserProfile {
  id: string
  email: string
  full_name?: string
  is_admin: boolean
}

interface UserAvatar {
  id: string
  url: string
  is_primary: boolean
  created_at: string
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [avatars, setAvatars] = useState<UserAvatar[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [fullName, setFullName] = useState("")

  useEffect(() => {
    fetchProfile()
    fetchAvatars()
  }, [])

  const fetchProfile = async () => {
    try {
      const response = await fetch("/api/user-profile")
      if (response.ok) {
        const { profile } = await response.json()
        setProfile(profile)
        setFullName(profile?.full_name || "")
      }
    } catch (error) {
      console.error("Error fetching profile:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить профиль",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchAvatars = async () => {
    try {
      const response = await fetch("/api/user-avatars")
      if (response.ok) {
        const { avatars } = await response.json()
        setAvatars(avatars)
      }
    } catch (error) {
      console.error("Error fetching avatars:", error)
    }
  }

  const updateProfile = async () => {
    try {
      const response = await fetch("/api/user-profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
        }),
      })

      if (response.ok) {
        toast({
          title: "Успешно",
          description: "Профиль обновлен",
        })
        fetchProfile()
      } else {
        throw new Error("Failed to update profile")
      }
    } catch (error) {
      console.error("Error updating profile:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось обновить профиль",
        variant: "destructive",
      })
    }
  }

  const uploadAvatar = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/user-avatars", {
        method: "POST",
        body: formData,
      })

      if (response.ok) {
        toast({
          title: "Успешно",
          description: "Аватар загружен",
        })
        fetchAvatars()
      } else {
        throw new Error("Failed to upload avatar")
      }
    } catch (error) {
      console.error("Error uploading avatar:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить аватар",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
    }
  }

  const setPrimaryAvatar = async (avatarId: string) => {
    try {
      const response = await fetch(`/api/user-avatars/${avatarId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_primary: true,
        }),
      })

      if (response.ok) {
        toast({
          title: "Успешно",
          description: "Основной аватар установлен",
        })
        fetchAvatars()
      } else {
        throw new Error("Failed to set primary avatar")
      }
    } catch (error) {
      console.error("Error setting primary avatar:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось установить основной аватар",
        variant: "destructive",
      })
    }
  }

  const deleteAvatar = async (avatarId: string) => {
    try {
      const response = await fetch(`/api/user-avatars/${avatarId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "Успешно",
          description: "Аватар удален",
        })
        fetchAvatars()
      } else {
        throw new Error("Failed to delete avatar")
      }
    } catch (error) {
      console.error("Error deleting avatar:", error)
      toast({
        title: "Ошибка",
        description: "Не удалось удалить аватар",
        variant: "destructive",
      })
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Ошибка",
          description: "Размер файла не должен превышать 5MB",
          variant: "destructive",
        })
        return
      }
      uploadAvatar(file)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="max-w-4xl mx-auto">
          <div className="h-8 w-48 bg-gray-200 animate-pulse rounded mb-8" />
          <div className="space-y-4">
            <div className="h-32 bg-gray-200 animate-pulse rounded" />
            <div className="h-32 bg-gray-200 animate-pulse rounded" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Настройки профиля</h1>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile">Профиль</TabsTrigger>
            <TabsTrigger value="avatars">Аватары</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Информация профиля</CardTitle>
                <CardDescription>Управляйте информацией вашего профиля</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={profile?.email || ""} disabled className="bg-gray-50" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fullName">Полное имя</Label>
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Введите ваше полное имя"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Роль</Label>
                  <div>
                    <Badge variant={profile?.is_admin ? "default" : "secondary"}>
                      {profile?.is_admin ? "Администратор" : "Пользователь"}
                    </Badge>
                  </div>
                </div>

                <Button onClick={updateProfile}>Сохранить изменения</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="avatars">
            <Card>
              <CardHeader>
                <CardTitle>Управление аватарами</CardTitle>
                <CardDescription>Загружайте и управляйте своими аватарами для виртуальной примерки</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Upload Section */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <Camera className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">Загрузите новый аватар</p>
                    <p className="text-xs text-gray-500">PNG, JPG до 5MB</p>
                  </div>
                  <div className="mt-4">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className="hidden"
                      id="avatar-upload"
                    />
                    <label htmlFor="avatar-upload">
                      <Button variant="outline" disabled={uploading} className="cursor-pointer bg-transparent" asChild>
                        <span>
                          <Upload className="h-4 w-4 mr-2" />
                          {uploading ? "Загрузка..." : "Выбрать файл"}
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>

                {/* Avatars Grid */}
                {avatars.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {avatars.map((avatar) => (
                      <div
                        key={avatar.id}
                        className="relative group border rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="aspect-square relative mb-3">
                          <Avatar className="w-full h-full">
                            <AvatarImage
                              src={avatar.url || "/placeholder.svg"}
                              alt="User avatar"
                              className="object-cover"
                            />
                            <AvatarFallback>
                              <User className="h-8 w-8" />
                            </AvatarFallback>
                          </Avatar>
                          {avatar.is_primary && (
                            <div className="absolute -top-2 -right-2">
                              <Badge className="bg-yellow-500 text-white">
                                <Star className="h-3 w-3 mr-1" />
                                Основной
                              </Badge>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          {!avatar.is_primary && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPrimaryAvatar(avatar.id)}
                              className="w-full"
                            >
                              <Star className="h-3 w-3 mr-1" />
                              Сделать основным
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteAvatar(avatar.id)}
                            className="w-full"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Удалить
                          </Button>
                        </div>

                        <p className="text-xs text-gray-500 mt-2">{new Date(avatar.created_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <User className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">У вас пока нет загруженных аватаров</p>
                    <p className="text-sm text-gray-400">Загрузите аватар для использования виртуальной примерки</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

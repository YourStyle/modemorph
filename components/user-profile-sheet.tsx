"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CommonSheet } from "./common-sheet"
import { Upload, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface UserProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
  gender: string | null
  telegram: string | null
  email: string
}

interface UserProfileSheetProps {
  isOpen: boolean
  onClose: () => void
  onSignOut: () => void
}

export function UserProfileSheet({ isOpen, onClose, onSignOut }: UserProfileSheetProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [previousAvatars, setPreviousAvatars] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    if (isOpen) {
      loadProfile()
    }
  }, [isOpen])

  const loadProfile = async () => {
    try {
      setLoading(true)
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        console.error("User not authenticated:", userError)
        return
      }

      // Получаем профиль пользователя
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      if (profileError) {
        console.error("Profile fetch error:", profileError)
        // Создаем профиль если его нет
        const newProfile = {
          id: user.id,
          full_name: user.user_metadata?.full_name || "",
          avatar_url: user.user_metadata?.avatar_url || "",
          gender: null,
          telegram: null,
          email: user.email || "",
        }
        setProfile(newProfile)
      } else {
        setProfile({
          ...profileData,
          email: user.email || "",
        })
      }

      // Загружаем предыдущие аватары (пока заглушка)
      setPreviousAvatars([])
    } catch (error) {
      console.error("Error loading profile:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeAvatar = () => {
    setAvatarFile(null)
    setAvatarPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleSave = async () => {
    if (!profile) return

    setSaving(true)
    try {
      let avatarUrl = profile.avatar_url

      // Загрузка нового аватара если есть
      if (avatarFile) {
        const imageFormData = new FormData()
        imageFormData.append("file", avatarFile)

        const uploadResponse = await fetch("/api/upload-image", {
          method: "POST",
          body: imageFormData,
        })

        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json()
          avatarUrl = uploadResult.url
        } else {
          throw new Error("Failed to upload avatar")
        }
      }

      // Обновляем профиль
      const { error } = await supabase.from("profiles").upsert({
        id: profile.id,
        full_name: profile.full_name,
        avatar_url: avatarUrl,
        gender: profile.gender,
        telegram: profile.telegram,
        updated_at: new Date().toISOString(),
      })

      if (error) {
        throw error
      }

      toast.success("Профиль успешно обновлен!")
      setProfile({ ...profile, avatar_url: avatarUrl })
      setAvatarFile(null)
      setAvatarPreview(null)
    } catch (error) {
      console.error("Error saving profile:", error)
      toast.error("Ошибка при сохранении профиля")
    } finally {
      setSaving(false)
    }
  }

  const updateProfile = (field: keyof UserProfile, value: string) => {
    if (profile) {
      setProfile({ ...profile, [field]: value })
    }
  }

  if (loading) {
    return (
      <CommonSheet isOpen={isOpen} onClose={onClose} title="Профиль" backgroundColor="dark">
        <div className="flex items-center justify-center py-8">
          <div className="animate-pulse text-gray-300">Загрузка...</div>
        </div>
      </CommonSheet>
    )
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Профиль" backgroundColor="dark">
      <Tabs defaultValue="about" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="about">Обо мне</TabsTrigger>
          <TabsTrigger value="avatars">Аватары</TabsTrigger>
        </TabsList>

        <TabsContent value="about" className="space-y-6 mt-6">
          {/* Email */}
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={profile?.email || ""} disabled className="bg-gray-800 border-gray-600 text-gray-300" />
          </div>

          {/* Имя */}
          <div className="space-y-2">
            <Label htmlFor="full_name">Имя</Label>
            <Input
              id="full_name"
              value={profile?.full_name || ""}
              onChange={(e) => updateProfile("full_name", e.target.value)}
              placeholder="Введите ваше имя"
              className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
            />
          </div>

          {/* Пол */}
          <div className="space-y-2">
            <Label>Пол</Label>
            <Select value={profile?.gender || ""} onValueChange={(value) => updateProfile("gender", value)}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                <SelectValue placeholder="Выберите пол" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Мужской</SelectItem>
                <SelectItem value="female">Женский</SelectItem>
                <SelectItem value="other">Другой</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Телеграм */}
          <div className="space-y-2">
            <Label htmlFor="telegram">Телеграм</Label>
            <Input
              id="telegram"
              value={profile?.telegram || ""}
              onChange={(e) => updateProfile("telegram", e.target.value)}
              placeholder="@username"
              className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
            />
          </div>

          {/* Кнопка сохранения */}
          <Button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? "Сохранение..." : "Сохранить изменения"}
          </Button>
        </TabsContent>

        <TabsContent value="avatars" className="space-y-6 mt-6">
          {/* Текущий аватар */}
          <div className="space-y-4">
            <Label className="text-gray-300">Текущий аватар</Label>
            <div className="flex items-center space-x-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarPreview || profile?.avatar_url || ""} />
                <AvatarFallback className="text-2xl text-gray-300">
                  {profile?.full_name ? profile.full_name[0].toUpperCase() : "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-2">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Загрузить новый
                </Button>
                {(avatarPreview || profile?.avatar_url) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={removeAvatar}
                    className="border-gray-600 text-gray-300 hover:bg-gray-700 bg-transparent"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Удалить
                  </Button>
                )}
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          </div>

          {/* Предыдущие аватары */}
          <div className="space-y-4">
            <Label className="text-gray-300">Предыдущие аватары</Label>
            {previousAvatars.length > 0 ? (
              <div className="grid grid-cols-4 gap-4">
                {previousAvatars.map((avatar, index) => (
                  <div key={index} className="relative">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={avatar || "/placeholder.svg"} />
                      <AvatarFallback>A</AvatarFallback>
                    </Avatar>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-300">
                <div className="text-sm">Пока нет предыдущих аватаров</div>
              </div>
            )}
          </div>

          {/* Кнопка сохранения */}
          <Button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? "Сохранение..." : "Сохранить изменения"}
          </Button>
        </TabsContent>
      </Tabs>

      {/* Кнопки внизу */}
      <div className="flex gap-4 pt-6 border-t mt-6">
        <Button
          variant="outline"
          onClick={onClose}
          className="flex-1 bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700"
        >
          Закрыть
        </Button>
        <Button
          variant="destructive"
          onClick={onSignOut}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
        >
          Выйти
        </Button>
      </div>
    </CommonSheet>
  )
}

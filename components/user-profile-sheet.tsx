"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Camera, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface UserProfile {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  height?: number
  weight?: number
  top_size?: string
  bottom_size?: string
  shoe_size?: number
  gender?: string
}

interface UserProfileSheetProps {
  isOpen: boolean
  onClose: () => void
}

const GENDER_OPTIONS = [
  { value: "female", label: "Женский", emoji: "👩" },
  { value: "male", label: "Мужской", emoji: "👨" },
  { value: "non-binary", label: "Небинарный", emoji: "🧑" },
  { value: "prefer-not-to-say", label: "Предпочитаю не указывать", emoji: "❓" },
]

const TOP_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58"]

const BOTTOM_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "40",
  "42",
  "44",
  "46",
  "48",
  "50",
  "52",
  "54",
  "56",
  "58",
]

export function UserProfileSheet({ isOpen, onClose }: UserProfileSheetProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (isOpen) {
      loadProfile()
    }
  }, [isOpen])

  const loadProfile = async () => {
    setLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error("Пользователь не найден")
        return
      }

      // Try to get profile from user_profiles table
      const { data: profileData, error: profileError } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      if (profileError && profileError.code !== "PGRST116") {
        console.error("Error loading profile:", profileError)
      }

      // Set profile data
      setProfile({
        id: user.id,
        email: user.email || "",
        full_name: profileData?.full_name || user.user_metadata?.full_name || "",
        avatar_url: profileData?.avatar_url || user.user_metadata?.avatar_url || "",
        height: profileData?.height || undefined,
        weight: profileData?.weight || undefined,
        top_size: profileData?.top_size || undefined,
        bottom_size: profileData?.bottom_size || undefined,
        shoe_size: profileData?.shoe_size || undefined,
        gender: profileData?.gender || undefined,
      })
    } catch (error) {
      console.error("Error loading profile:", error)
      toast.error("Ошибка загрузки профиля")
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof UserProfile, value: string | number) => {
    if (!profile) return

    // For numeric fields, filter out non-numeric characters
    if (field === "height" || field === "weight" || field === "shoe_size") {
      const numericValue = value.toString().replace(/[^0-9]/g, "")
      setProfile({ ...profile, [field]: numericValue ? Number(numericValue) : undefined })
    } else {
      setProfile({ ...profile, [field]: value })
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !profile) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Пожалуйста, выберите изображение")
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Размер файла не должен превышать 5MB")
      return
    }

    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("folder", "users-avatars")

      const response = await fetch("/api/upload-to-yandex", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Failed to upload avatar")
      }

      const result = await response.json()

      if (result.url) {
        setProfile({ ...profile, avatar_url: result.url })
        toast.success("Аватар загружен успешно")
      } else {
        throw new Error("No URL returned from upload")
      }
    } catch (error) {
      console.error("Error uploading avatar:", error)
      toast.error("Ошибка загрузки аватара")
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSave = async () => {
    if (!profile) return

    setSaving(true)
    try {
      const { error } = await supabase.from("user_profiles").upsert({
        id: profile.id,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        height: profile.height,
        weight: profile.weight,
        top_size: profile.top_size,
        bottom_size: profile.bottom_size,
        shoe_size: profile.shoe_size,
        gender: profile.gender,
        updated_at: new Date().toISOString(),
      })

      if (error) throw error

      toast.success("Профиль сохранен")
      onClose()
    } catch (error) {
      console.error("Error saving profile:", error)
      toast.error("Ошибка сохранения профиля")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Профиль пользователя</SheetTitle>
        </SheetHeader>

        <div className="py-6 space-y-6 pb-24 md:pb-6">
          {/* Avatar Section */}
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="w-24 h-24">
              <AvatarImage src={profile?.avatar_url || "/placeholder.svg"} alt="Avatar" />
              <AvatarFallback>
                {profile?.full_name
                  ? profile.full_name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                  : profile?.email?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={uploadingAvatar}
              />
              <Button variant="outline" size="sm" disabled={uploadingAvatar}>
                {uploadingAvatar ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Загружаем...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 mr-2" />
                    Изменить аватар
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={profile?.email || ""} disabled className="bg-gray-50" />
            </div>

            <div>
              <Label htmlFor="full_name">Полное имя</Label>
              <Input
                id="full_name"
                value={profile?.full_name || ""}
                onChange={(e) => handleInputChange("full_name", e.target.value)}
                placeholder="Введите ваше имя"
              />
            </div>
          </div>

          {/* Physical Characteristics */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Физические характеристики</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="height">Рост (см)</Label>
                <Input
                  id="height"
                  value={profile?.height || ""}
                  onChange={(e) => handleInputChange("height", e.target.value)}
                  placeholder="170"
                />
              </div>

              <div>
                <Label htmlFor="weight">Вес (кг)</Label>
                <Input
                  id="weight"
                  value={profile?.weight || ""}
                  onChange={(e) => handleInputChange("weight", e.target.value)}
                  placeholder="65"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="shoe_size">Размер обуви</Label>
              <Input
                id="shoe_size"
                value={profile?.shoe_size || ""}
                onChange={(e) => handleInputChange("shoe_size", e.target.value)}
                placeholder="38"
              />
            </div>
          </div>

          {/* Clothing Sizes */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Размеры одежды</h3>

            <div>
              <Label htmlFor="top_size">Размер верхней одежды</Label>
              <Select value={profile?.top_size || ""} onValueChange={(value) => handleInputChange("top_size", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите размер" />
                </SelectTrigger>
                <SelectContent>
                  {TOP_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="bottom_size">Размер нижней одежды</Label>
              <Select
                value={profile?.bottom_size || ""}
                onValueChange={(value) => handleInputChange("bottom_size", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите размер" />
                </SelectTrigger>
                <SelectContent>
                  {BOTTOM_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Gender */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Пол</h3>
            <div className="grid grid-cols-2 gap-3">
              {GENDER_OPTIONS.map((option) => (
                <div
                  key={option.value}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    profile?.gender === option.value
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => handleInputChange("gender", option.value)}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">{option.emoji}</div>
                    <div className="text-sm font-medium">{option.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Fixed bottom buttons on mobile */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t md:relative md:border-t-0 md:bg-transparent md:p-0">
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent">
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                "Сохранить"
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

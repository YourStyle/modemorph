"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CommonSheet } from "./common-sheet"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface UserProfile {
  id: string
  email: string
  full_name?: string
  gender?: string
  telegram?: string
  avatar_url?: string
  height?: string
  weight?: string
  top_size?: string
  bottom_size?: string
  shoe_size?: string
}

interface UserProfileSheetProps {
  isOpen: boolean
  onClose: () => void
}

export function UserProfileSheet({ isOpen, onClose }: UserProfileSheetProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [formData, setFormData] = useState({
    full_name: "",
    gender: "",
    telegram: "",
    height: "",
    weight: "",
    top_size: "",
    bottom_size: "",
    shoe_size: "",
  })

  useEffect(() => {
    if (isOpen) {
      loadProfile()
    }
  }, [isOpen])

  const loadProfile = async () => {
    setIsLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).single()

        const userProfile: UserProfile = {
          id: user.id,
          email: user.email || "",
          full_name: profileData?.full_name || "",
          gender: profileData?.gender || "",
          telegram: profileData?.telegram || "",
          avatar_url: profileData?.avatar_url || "",
          height: profileData?.height || "",
          weight: profileData?.weight || "",
          top_size: profileData?.top_size || "",
          bottom_size: profileData?.bottom_size || "",
          shoe_size: profileData?.shoe_size || "",
        }

        setProfile(userProfile)
        setFormData({
          full_name: userProfile.full_name || "",
          gender: userProfile.gender || "",
          telegram: userProfile.telegram || "",
          height: profileData?.height || "",
          weight: profileData?.weight || "",
          top_size: profileData?.top_size || "",
          bottom_size: profileData?.bottom_size || "",
          shoe_size: profileData?.shoe_size || "",
        })
      }
    } catch (error) {
      console.error("Error loading profile:", error)
      toast.error("Ошибка загрузки профиля")
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSave = async () => {
    if (!profile) return

    setIsSaving(true)
    try {
      const { error } = await supabase.from("profiles").upsert({
        id: profile.id,
        full_name: formData.full_name || null,
        gender: formData.gender || null,
        telegram: formData.telegram || null,
        height: formData.height || null,
        weight: formData.weight || null,
        top_size: formData.top_size || null,
        bottom_size: formData.bottom_size || null,
        shoe_size: formData.shoe_size || null,
        updated_at: new Date().toISOString(),
      })

      if (error) throw error

      toast.success("Профиль успешно обновлен")
      loadProfile() // Перезагружаем данные
    } catch (error) {
      console.error("Error saving profile:", error)
      toast.error("Ошибка сохранения профиля")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      router.push("/auth/login")
      onClose()
    } catch (error) {
      console.error("Error signing out:", error)
      toast.error("Ошибка при выходе")
    }
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Профиль" backgroundColor="dark">
      <div className="space-y-6">
        <Tabs defaultValue="about" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-white">
            <TabsTrigger value="about" className="text-gray-900">
              Обо мне
            </TabsTrigger>
            <TabsTrigger value="avatars" className="text-gray-600">
              Аватары
            </TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="space-y-6 mt-6">
            {isLoading ? (
              <div className="space-y-4">
                <div className="h-4 bg-gray-600 rounded animate-pulse"></div>
                <div className="h-10 bg-gray-600 rounded animate-pulse"></div>
                <div className="h-4 bg-gray-600 rounded animate-pulse"></div>
                <div className="h-10 bg-gray-600 rounded animate-pulse"></div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-white">Email</Label>
                  <Input value={profile?.email || ""} disabled className="bg-gray-700 border-gray-600 text-white" />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Имя</Label>
                  <Input
                    value={formData.full_name}
                    onChange={(e) => handleInputChange("full_name", e.target.value)}
                    placeholder="Введите ваше имя"
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Пол</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={formData.gender === "мужской" ? "default" : "outline"}
                      onClick={() => handleInputChange("gender", "мужской")}
                      className={`flex-1 ${
                        formData.gender === "мужской"
                          ? "bg-blue-600 hover:bg-blue-700 text-white"
                          : "bg-transparent border-gray-500 text-gray-300 hover:bg-gray-700 hover:text-white"
                      }`}
                    >
                      👨 Мужской
                    </Button>
                    <Button
                      type="button"
                      variant={formData.gender === "женский" ? "default" : "outline"}
                      onClick={() => handleInputChange("gender", "женский")}
                      className={`flex-1 ${
                        formData.gender === "женский"
                          ? "bg-pink-600 hover:bg-pink-700 text-white"
                          : "bg-transparent border-gray-500 text-gray-300 hover:bg-gray-700 hover:text-white"
                      }`}
                    >
                      👩 Женский
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Телеграм</Label>
                  <Input
                    value={formData.telegram}
                    onChange={(e) => handleInputChange("telegram", e.target.value)}
                    placeholder="@username"
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Рост (см)</Label>
                  <Input
                    type="number"
                    value={formData.height}
                    onChange={(e) => handleInputChange("height", e.target.value)}
                    placeholder="170"
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Вес (кг)</Label>
                  <Input
                    type="number"
                    value={formData.weight}
                    onChange={(e) => handleInputChange("weight", e.target.value)}
                    placeholder="70"
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Размер верхней одежды</Label>
                  <Input
                    value={formData.top_size}
                    onChange={(e) => handleInputChange("top_size", e.target.value)}
                    placeholder="M, L, 48, 50..."
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Размер нижней одежды</Label>
                  <Input
                    value={formData.bottom_size}
                    onChange={(e) => handleInputChange("bottom_size", e.target.value)}
                    placeholder="M, L, 48, 50..."
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Размер обуви</Label>
                  <Input
                    type="number"
                    value={formData.shoe_size}
                    onChange={(e) => handleInputChange("shoe_size", e.target.value)}
                    placeholder="40"
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>

                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white border-0"
                >
                  {isSaving ? "Сохранение..." : "Сохранить изменения"}
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="avatars" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div>
                <Label className="text-white mb-3 block">Текущий аватар</Label>
                <div className="flex items-center space-x-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={profile?.avatar_url || "/placeholder-user.jpg"} />
                    <AvatarFallback className="bg-gray-600 text-white">
                      {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <Button variant="outline" className="bg-white text-gray-900 border-gray-300 hover:bg-gray-100">
                    Изменить аватар
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-white mb-3 block">Прошлые аватары</Label>
                <div className="grid grid-cols-4 gap-3">
                  {/* Placeholder for previous avatars */}
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="aspect-square bg-gray-600 rounded-lg flex items-center justify-center">
                      <span className="text-gray-400 text-xs">Нет фото</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Bottom buttons */}
        <div className="flex gap-4 pt-4 border-t border-gray-600">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 bg-transparent border-gray-500 text-gray-300 hover:bg-gray-700 hover:text-white hover:border-gray-400"
          >
            Закрыть
          </Button>
          <Button onClick={handleSignOut} className="flex-1 bg-red-700 hover:bg-red-800 text-white border-0">
            Выйти
          </Button>
        </div>
      </div>
    </CommonSheet>
  )
}

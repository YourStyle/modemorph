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
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PaywallModal } from "./paywall-modal"

interface UserProfile {
  id: string
  user_id: string
  email: string
  full_name?: string
  gender?: string
  avatar_url?: string
  height?: number
  weight?: number
  top_size?: string
  bottom_size?: string
  shoe_size?: number
  is_admin?: boolean
}

interface UserProfileSheetProps {
  isOpen: boolean
  onClose: () => void
}

const CLOTHING_SIZES = [
  "XXS",
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
  "60",
]

export function UserProfileSheet({ isOpen, onClose }: UserProfileSheetProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()
  const [isPaywallOpen, setIsPaywallOpen] = useState(false)
  const [subscriptionData, setSubscriptionData] = useState<any>(null)

  const [formData, setFormData] = useState({
    full_name: "",
    gender: "",
    height: "",
    weight: "",
    top_size: "",
    bottom_size: "",
    shoe_size: "",
  })

  useEffect(() => {
    if (isOpen) {
      loadProfile()
      loadSubscriptionData()
    }
  }, [isOpen])

  const loadProfile = async () => {
    setIsLoading(true)
    try {
      console.log("Loading user profile...")

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        console.log("User found:", user.id)

        // Пытаемся получить профиль из user_profiles
        const { data: profileData, error: profileError } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single()

        console.log("Profile data:", profileData)
        console.log("Profile error:", profileError)

        let userProfile: UserProfile = {
          id: profileData?.id || "",
          user_id: user.id,
          email: user.email || "",
          full_name: "",
          gender: "",
          avatar_url: "",
          height: undefined,
          weight: undefined,
          top_size: "",
          bottom_size: "",
          shoe_size: undefined,
          is_admin: false,
        }

        if (profileData) {
          userProfile = {
            ...userProfile,
            id: profileData.id,
            full_name: profileData.full_name || "",
            gender: profileData.gender || "",
            avatar_url: profileData.avatar_url || "",
            height: profileData.height || undefined,
            weight: profileData.weight || undefined,
            top_size: profileData.top_size || "",
            bottom_size: profileData.bottom_size || "",
            shoe_size: profileData.shoe_size || undefined,
            is_admin: profileData.is_admin || false,
          }
        } else {
          // Если профиль не найден, попробуем получить данные из user_metadata
          const metadata = user.user_metadata || {}
          userProfile.full_name = metadata.full_name || ""
        }

        setProfile(userProfile)
        setFormData({
          full_name: userProfile.full_name || "",
          gender: userProfile.gender || "",
          height: userProfile.height?.toString() || "",
          weight: userProfile.weight?.toString() || "",
          top_size: userProfile.top_size || "",
          bottom_size: userProfile.bottom_size || "",
          shoe_size: userProfile.shoe_size?.toString() || "",
        })
      }
    } catch (error) {
      console.error("Error loading profile:", error)
      toast.error("Ошибка загрузки профиля")
    } finally {
      setIsLoading(false)
    }
  }

  const loadSubscriptionData = async () => {
    try {
      const response = await fetch("/api/user-subscription", {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()
        setSubscriptionData(data)
      }
    } catch (error) {
      console.error("Error loading subscription data:", error)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleNumberInput = (field: string, value: string) => {
    // Разрешаем только цифры
    const numericValue = value.replace(/[^0-9]/g, "")
    handleInputChange(field, numericValue)
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !profile) return

    // Проверяем тип файла
    if (!file.type.startsWith("image/")) {
      toast.error("Пожалуйста, выберите изображение")
      return
    }

    // Проверяем размер файла (максимум 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Размер файла не должен превышать 5MB")
      return
    }

    setIsUploadingAvatar(true)
    try {
      console.log("Starting avatar upload...")

      // Создаем FormData для отправки файла
      const formData = new FormData()
      formData.append("file", file)
      formData.append("folder", "avatars")

      // Отправляем файл на API
      const response = await fetch("/api/upload-to-yandex", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()
      console.log("Upload response:", result)

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`)
      }

      if (!result.success) {
        throw new Error(result.error || "Upload failed")
      }

      // Обновляем профиль с новым URL аватара
      if (profile.id) {
        // Если у нас есть ID профиля, обновляем существующую запись
        const { error: updateError } = await supabase
          .from("user_profiles")
          .update({
            avatar_url: result.url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", profile.id)

        if (updateError) {
          console.error("Profile update error:", updateError)
          throw updateError
        }
      } else {
        // Если ID нет, создаем новую запись
        const { error: insertError } = await supabase.from("user_profiles").insert({
          user_id: profile.user_id,
          avatar_url: result.url,
          is_admin: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        if (insertError) {
          console.error("Profile insert error:", insertError)
          throw insertError
        }
      }

      // Обновляем локальное состояние
      setProfile((prev) => (prev ? { ...prev, avatar_url: result.url } : null))
      toast.success("Аватар успешно обновлен")
    } catch (error) {
      console.error("Error uploading avatar:", error)
      toast.error(`Ошибка загрузки аватара: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`)
    } finally {
      setIsUploadingAvatar(false)
      // Очищаем input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleSave = async () => {
    if (!profile) return

    setIsSaving(true)
    try {
      console.log("Saving profile...", formData)

      const updateData = {
        full_name: formData.full_name || null,
        gender: formData.gender || null,
        height: formData.height ? Number.parseInt(formData.height) : null,
        weight: formData.weight ? Number.parseInt(formData.weight) : null,
        top_size: formData.top_size || null,
        bottom_size: formData.bottom_size || null,
        shoe_size: formData.shoe_size ? Number.parseInt(formData.shoe_size) : null,
        updated_at: new Date().toISOString(),
      }

      console.log("Update data:", updateData)

      if (profile.id) {
        // Если у нас есть ID профиля, обновляем существующую запись
        const { error } = await supabase.from("user_profiles").update(updateData).eq("id", profile.id)

        if (error) {
          console.error("Update error:", error)
          throw error
        }
      } else {
        // Если ID нет, создаем новую запись
        const { error } = await supabase.from("user_profiles").insert({
          user_id: profile.user_id,
          ...updateData,
          is_admin: false,
          created_at: new Date().toISOString(),
        })

        if (error) {
          console.error("Insert error:", error)
          throw error
        }
      }

      toast.success("Профиль успешно обновлен")
      loadProfile() // Перезагружаем данные
    } catch (error) {
      console.error("Error saving profile:", error)
      toast.error(`Ошибка сохранения профиля: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`)
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
      <div className="flex flex-col h-full">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
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
                    {profile && !profile.is_admin && (
                      <div className="space-y-3">
                        <h3 className="text-white font-medium text-sm">Ваш текущий план</h3>
                        <div className="flex items-center gap-3">
                          {/* Plan Info Block */}
                          <div
                            className={`flex-1 p-4 rounded-xl border ${
                              subscriptionData?.subscription?.status === "active"
                                ? "bg-gradient-to-r from-purple-600/20 to-pink-600/20 border-purple-400/30"
                                : "bg-white/5 border-gray-700/50"
                            } backdrop-blur-sm`}
                          >
                            <div className="text-white font-medium text-base mb-1">
                              {subscriptionData?.subscription?.status === "active" ? "Pro" : "Бесплатно"}
                            </div>
                            <div className="text-gray-400 text-sm">
                              {subscriptionData?.subscription?.status === "active"
                                ? "40 кредитов каждый месяц"
                                : "30 кредитов каждый месяц"}
                            </div>
                            <div className="text-white/70 text-xs mt-2">
                              {subscriptionData?.credits?.credits_balance || 0} кредитов доступно
                            </div>
                          </div>

                          {/* Subscribe Button Block */}
                          <div className="flex-shrink-0">
                            <Button
                              onClick={() => setIsPaywallOpen(true)}
                              className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white border-0 px-6 py-3 rounded-xl font-medium text-sm shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
                            >
                              {subscriptionData?.subscription?.status === "active" ? "Управление" : "Оформить подписку"}
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M5 12H19M19 12L12 5M19 12L12 19"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

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
                          variant={formData.gender === "male" ? "default" : "outline"}
                          onClick={() => handleInputChange("gender", "male")}
                          className={`flex-1 ${
                            formData.gender === "male"
                              ? "bg-blue-600 hover:bg-blue-700 text-white"
                              : "bg-transparent border-gray-500 text-gray-300 hover:bg-gray-700 hover:text-white"
                          }`}
                        >
                          👨 Мужской
                        </Button>
                        <Button
                          type="button"
                          variant={formData.gender === "female" ? "default" : "outline"}
                          onClick={() => handleInputChange("gender", "female")}
                          className={`flex-1 ${
                            formData.gender === "female"
                              ? "bg-pink-600 hover:bg-pink-700 text-white"
                              : "bg-transparent border-gray-500 text-gray-300 hover:bg-gray-700 hover:text-white"
                          }`}
                        >
                          👩 Женский
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white">Рост (см)</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formData.height}
                        onChange={(e) => handleNumberInput("height", e.target.value)}
                        placeholder="170"
                        className="bg-white border-gray-300 text-gray-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white">Вес (кг)</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formData.weight}
                        onChange={(e) => handleNumberInput("weight", e.target.value)}
                        placeholder="70"
                        className="bg-white border-gray-300 text-gray-900"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white">Размер верхней одежды</Label>
                      <Select value={formData.top_size} onValueChange={(value) => handleInputChange("top_size", value)}>
                        <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                          <SelectValue placeholder="Выберите размер" />
                        </SelectTrigger>
                        <SelectContent>
                          {CLOTHING_SIZES.map((size) => (
                            <SelectItem key={size} value={size}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white">Размер нижней одежды</Label>
                      <Select
                        value={formData.bottom_size}
                        onValueChange={(value) => handleInputChange("bottom_size", value)}
                      >
                        <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                          <SelectValue placeholder="Выберите размер" />
                        </SelectTrigger>
                        <SelectContent>
                          {CLOTHING_SIZES.map((size) => (
                            <SelectItem key={size} value={size}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-white">Размер обуви</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formData.shoe_size}
                        onChange={(e) => handleNumberInput("shoe_size", e.target.value)}
                        placeholder="40"
                        className="bg-white border-gray-300 text-gray-900"
                      />
                    </div>

                    {/* Desktop save button */}
                    <div className="hidden md:block">
                      <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full bg-gray-900 hover:bg-gray-800 text-white border-0"
                      >
                        {isSaving ? "Сохранение..." : "Сохранить изменения"}
                      </Button>
                    </div>
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
                      <div className="flex flex-col gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          className="bg-white text-gray-900 border-gray-300 hover:bg-gray-100"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingAvatar}
                        >
                          {isUploadingAvatar ? "Загрузка..." : "Изменить аватар"}
                        </Button>
                      </div>
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

            {/* Desktop bottom buttons */}
            <div className="hidden md:flex gap-4 pt-4 border-t border-gray-600">
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
        </div>

        {/* Fixed bottom buttons for mobile */}
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
      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        onSuccess={() => {
          loadSubscriptionData()
          toast.success("Данные обновлены!")
        }}
      />
    </CommonSheet>
  )
}

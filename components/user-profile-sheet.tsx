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
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { SubscriptionSheet } from "./subscription-sheet"
import { normalizeImageFile } from "@/lib/image-normalize"
import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { ArrowRight } from "lucide-react"

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
  const [isPaywallOpen, setIsPaywallOpen] = useState(false)
  const [subscriptionData, setSubscriptionData] = useState<any>(null)

  // Проверяем, запущено ли приложение в Telegram Mini App
  const isTMA = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData

  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [notificationsLoading, setNotificationsLoading] = useState(false)

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
      loadNotificationPreference()
    }
  }, [isOpen])

  const loadProfile = async () => {
    setIsLoading(true)
    try {
      const data = await api.get("/api/me/profile-session")

      if (!data.user || !data.profile) {
        toast.error("Не удалось загрузить профиль")
        return
      }

      const userProfile: UserProfile = {
        id: data.profile?.id || "",
        user_id: data.user.id,
        email: data.user.email || "",
        full_name: data.profile?.full_name || data.user.user_metadata?.full_name || "",
        gender: data.profile?.gender || "",
        avatar_url: data.profile?.avatar_url || "",
        height: data.profile?.height || undefined,
        weight: data.profile?.weight || undefined,
        top_size: data.profile?.top_size || "",
        bottom_size: data.profile?.bottom_size || "",
        shoe_size: data.profile?.shoe_size || undefined,
        is_admin: data.profile?.is_admin || false,
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
    } catch (e) {
      toast.error("Ошибка загрузки профиля")
    } finally {
      setIsLoading(false)
    }
  }

  const loadSubscriptionData = async () => {
    try {
      const data = await api.get("/api/user-subscription")
      setSubscriptionData(data)
    } catch {
      // ignore
    }
  }

  const loadNotificationPreference = async () => {
    try {
      const data = await api.get("/api/me/notifications")
      setNotificationsEnabled(data.notifications_enabled !== false)
    } catch {
      // ignore
    }
  }

  const handleToggleNotifications = async (enabled: boolean) => {
    setNotificationsLoading(true)
    try {
      await api.patch("/api/me/notifications", { notifications_enabled: enabled })
      setNotificationsEnabled(enabled)
      toast.success(enabled ? "Уведомления включены" : "Уведомления отключены")
    } catch {
      toast.error("Не удалось обновить настройку")
    } finally {
      setNotificationsLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string) => setFormData((p) => ({ ...p, [field]: value }))
  const handleNumberInput = (field: string, value: string) => handleInputChange(field, value.replace(/[^0-9]/g, ""))

  // ↓ обновлённый обработчик: конверсия HEIC/HEIF → JPEG и сжатие до лимита 5MB
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.files?.[0]
    if (!raw || !profile) return

    // Разрешаем HEIC/HEIF даже если mime может быть нестандартным
    const isImageLike = raw.type.startsWith("image/") || /\.(heic|heif|jpg|jpeg|png|webp)$/i.test(raw.name)
    if (!isImageLike) return toast.error("Пожалуйста, выберите изображение")

    setIsUploadingAvatar(true)
    try {
      // 1) Нормализация: HEIC/HEIF → JPEG, даунскейл (для аватара обычно хватает 1024px)
      let fileForUpload = await normalizeImageFile(raw, {
        maxWidth: 1024,
        output: "image/jpeg",
        quality: 0.9,
      })

      // 2) Контроль размера: если всё ещё >5MB — дополнительное сжатие
      if (fileForUpload.size > 5 * 1024 * 1024) {
        fileForUpload = await normalizeImageFile(fileForUpload, {
          maxWidth: 1024,
          output: "image/jpeg",
          quality: 0.8,
        })
        if (fileForUpload.size > 5 * 1024 * 1024) {
          toast.error("Файл слишком большой после сжатия (>5MB). Уменьшите качество/размер.")
          return
        }
      }

      // 3) Загрузка в хранилище
      const fd = new FormData()
      fd.append("file", fileForUpload, fileForUpload.name)
      fd.append("folder", "avatars")

      const result = await api.post("/api/upload-to-yandex", fd, {
        headers: {}
      })
      if (!result.success) throw new Error(result.error || 'Upload failed')

      // 4) Save old avatar to history before replacing
      if (profile.avatar_url) {
        await api.post("/api/me/avatars", { url: profile.avatar_url }).catch(() => {})
      }

      // 5) Обновление профиля через API
      await api.post("/api/me/profile-session", {
        avatar_url: result.url
      })

      setProfile((prev) => (prev ? { ...prev, avatar_url: result.url } : null))
      // Notify other components (top navigation pill) about avatar change
      window.dispatchEvent(new CustomEvent("profile:avatar-updated", { detail: { avatar_url: result.url } }))
      toast.success("Аватар успешно обновлён")
    } catch (e: any) {
      toast.error(`Ошибка загрузки аватара: ${e?.message || "Неизвестная ошибка"}`)
    } finally {
      setIsUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleSave = async () => {
    if (!profile) return
    setIsSaving(true)
    try {
      await api.post("/api/me/profile-session", {
        full_name: formData.full_name || null,
        gender: formData.gender || null,
        height: formData.height || null,
        weight: formData.weight || null,
        top_size: formData.top_size || null,
        bottom_size: formData.bottom_size || null,
        shoe_size: formData.shoe_size || null,
      })

      toast.success("Профиль успешно обновлен")
      loadProfile()
    } catch (e: any) {
      toast.error(`Ошибка сохранения профиля: ${e?.message || "Неизвестная ошибка"}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await api.post("/api/auth/signout")
      router.push("/auth/login")
      onClose()
    } catch (error) {
      toast.error("Ошибка при выходе")
    }
  }

  return (
    <CommonSheet isOpen={isOpen} onClose={onClose} title="Профиль" backgroundColor="dark">
      {/* min-h-0 критично, чтобы не «съедался» низ и sticky-футер работал корректно */}
      <div className="flex flex-col h-full min-h-0">
        {/* Скроллируемая зона: скролл скрыт, но прокрутка есть; дополнительный нижний паддинг под фикс-футер */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none pb-40 safe-bottom-padding">
          <div className="space-y-6">
            <Tabs defaultValue="about" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-canvas-sunk rounded-full p-1">
                <TabsTrigger value="about" className="text-ink rounded-full">
                  Обо мне
                </TabsTrigger>
                <TabsTrigger value="avatars" className="text-ink-2 rounded-full">
                  Аватары
                </TabsTrigger>
                <TabsTrigger value="notifications" className="text-ink-2 rounded-full">
                  Уведомления
                </TabsTrigger>
              </TabsList>

              <TabsContent value="about" className="space-y-6 mt-6">
                {isLoading ? (
                  <div className="space-y-4">
                    <div className="h-4 skeleton rounded" />
                    <div className="h-10 skeleton rounded" />
                    <div className="h-4 skeleton rounded" />
                    <div className="h-10 skeleton rounded" />
                  </div>
                ) : (
                  <>
                    {profile && !profile.is_admin && (
                      <div className="space-y-3">
                        <h3 className="text-caption font-medium text-ink-2">Ваш текущий план</h3>

                        {/* Единственный акцент экрана — сигнальная кайма плана. Больше --signal
                            в этом шите нигде нет. */}
                        <div className="p-4 rounded-2xl border-2 border-signal bg-canvas-sunk">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                              <div className="text-body font-semibold text-ink mb-1">
                                {subscriptionData?.subscription?.status === "active" ? "Pro" : "Бесплатно"}
                              </div>
                              <div className="text-caption text-ink-2">
                                {subscriptionData?.subscription?.status === "active"
                                  ? "40 кредитов каждый месяц"
                                  : "30 кредитов каждый месяц"}
                              </div>
                              <div className="text-micro text-ink-3 mt-2">
                                {subscriptionData?.credits?.credits_balance || 0} кредитов доступно
                              </div>
                            </div>

                            <Button
                              onClick={() => setIsPaywallOpen(true)}
                              className="w-full md:w-auto bg-ink text-signal-ink border-0 px-6 py-3 rounded-full font-medium text-caption flex items-center justify-center gap-2 hover:bg-ink/90"
                            >
                              {subscriptionData?.subscription?.status === "active" ? "Управление" : "Оформить подписку"}
                              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-ink">Email</Label>
                      <Input value={profile?.email || ""} disabled className="bg-canvas-sunk border-line text-ink-2 rounded-xl" />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-ink">Имя</Label>
                      <Input
                        value={formData.full_name}
                        onChange={(e) => handleInputChange("full_name", e.target.value)}
                        placeholder="Введите ваше имя"
                        className="bg-canvas-sunk border-line text-ink rounded-xl"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-ink">Пол</Label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleInputChange("gender", "male")}
                          className={cn(
                            "flex-1 h-10 rounded-full text-body font-medium transition-colors duration-press",
                            formData.gender === "male"
                              ? "bg-ink text-signal-ink"
                              : "bg-canvas-sunk text-ink-2 hover:text-ink"
                          )}
                        >
                          Мужской
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInputChange("gender", "female")}
                          className={cn(
                            "flex-1 h-10 rounded-full text-body font-medium transition-colors duration-press",
                            formData.gender === "female"
                              ? "bg-ink text-signal-ink"
                              : "bg-canvas-sunk text-ink-2 hover:text-ink"
                          )}
                        >
                          Женский
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-ink">Рост (см)</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formData.height}
                        onChange={(e) => handleNumberInput("height", e.target.value)}
                        placeholder="170"
                        className="bg-canvas-sunk border-line text-ink rounded-xl"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-ink">Вес (кг)</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formData.weight}
                        onChange={(e) => handleNumberInput("weight", e.target.value)}
                        placeholder="70"
                        className="bg-canvas-sunk border-line text-ink rounded-xl"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-ink">Размер верхней одежды</Label>
                      <Select value={formData.top_size} onValueChange={(v) => handleInputChange("top_size", v)}>
                        <SelectTrigger className="bg-canvas-sunk border-line text-ink rounded-xl">
                          <SelectValue placeholder="Выберите размер" />
                        </SelectTrigger>
                        <SelectContent>
                          {CLOTHING_SIZES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-ink">Размер нижней одежды</Label>
                      <Select value={formData.bottom_size} onValueChange={(v) => handleInputChange("bottom_size", v)}>
                        <SelectTrigger className="bg-canvas-sunk border-line text-ink rounded-xl">
                          <SelectValue placeholder="Выберите размер" />
                        </SelectTrigger>
                        <SelectContent>
                          {CLOTHING_SIZES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-ink">Размер обуви</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formData.shoe_size}
                        onChange={(e) => handleNumberInput("shoe_size", e.target.value)}
                        placeholder="40"
                        className="bg-canvas-sunk border-line text-ink rounded-xl"
                      />
                    </div>

                    {/* Кнопка сохранения - скрываем в TMA, т.к. есть фиксированная кнопка внизу */}
                    {!isTMA && (
                      <div>
                        <Button
                          onClick={handleSave}
                          disabled={isSaving}
                          className="w-full bg-ink hover:bg-ink/90 text-signal-ink border-0 rounded-full"
                        >
                          {isSaving ? "Сохранение..." : "Сохранить изменения"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="avatars" className="space-y-6 mt-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-ink mb-3 block">Текущий аватар</Label>
                    <div className="flex items-center space-x-4">
                      <Avatar className="h-16 w-16">
                        <AvatarImage src={profile?.avatar_url || "/placeholder-user.jpg"} />
                        <AvatarFallback className="bg-canvas-sunk text-ink">
                          {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/heic,image/heif,image/heic-sequence,image/jpeg,image/jpg,image/webp,image/png,image/*"
                          onChange={handleAvatarUpload}
                          className="hidden"
                        />
                        <Button
                          variant="outline"
                          className="bg-canvas-sunk text-ink border-line hover:bg-line rounded-full"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingAvatar}
                        >
                          {isUploadingAvatar ? "Загрузка..." : "Изменить аватар"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-ink mb-3 block">Прошлые аватары</Label>
                    <div className="grid grid-cols-4 gap-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="aspect-square bg-canvas-sunk border border-line rounded-2xl flex items-center justify-center">
                          <span className="text-ink-3 text-micro">Нет фото</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="notifications" className="space-y-6 mt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="text-ink text-body">Получать уведомления</Label>
                      <p className="text-caption text-ink-2">
                        Напоминания и рассылки через Telegram
                      </p>
                    </div>
                    <Switch
                      checked={notificationsEnabled}
                      onCheckedChange={handleToggleNotifications}
                      disabled={notificationsLoading}
                    />
                  </div>
                  <p className="text-micro text-ink-3">
                    Вы также можете отключить уведомления командой /mute в боте
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sticky-футер ВНУТРИ скролла: всегда виден и не обрезается */}
          <div className="sticky bottom-0 z-20 border-t border-line bg-canvas px-4 py-3 footer-safe">
            {isTMA ? (
              // В TMA показываем только кнопку "Сохранить"
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full bg-ink hover:bg-ink/90 text-signal-ink border-0 rounded-full"
              >
                {isSaving ? "Сохранение..." : "Сохранить изменения"}
              </Button>
            ) : (
              // В обычном режиме показываем все кнопки
              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 bg-transparent border-line text-ink-2 hover:bg-canvas-sunk hover:text-ink rounded-full"
                >
                  Закрыть
                </Button>
                <Button onClick={handleSignOut} className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0 rounded-full">
                  Выйти
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <SubscriptionSheet
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        onSuccess={() => {
          loadSubscriptionData()
          toast.success("Данные обновлены!")
        }}
        variant="explore"
      />

      {/* Ютилити: скрываем скроллбар; учитываем safe-area снизу, чтобы футер не перекрывался iOS-панелью */}
      <style jsx global>{`
      .scrollbar-none::-webkit-scrollbar {
        display: none;
      }

      /* Firefox */
      .scrollbar-none {
        scrollbar-width: none; /* скрыть полосу прокрутки */
        -ms-overflow-style: none; /* IE/Edge */
      }
        .footer-safe {
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
        }
        .safe-bottom-padding {
          padding-bottom: calc(3rem); /* запас под sticky-футер */
        }
      `}</style>
    </CommonSheet>
  )
}

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { tmaHandshake } from "@/lib/tma/handshake"
import { createClient } from "@/lib/supabase/client"
import { User, Weight, Ruler, Shirt, Users, Share2, Megaphone, Heart } from "lucide-react"

interface FormData {
  gender: string
  height: string
  weight: string
  top_size: string
  bottom_size: string
  shoe_size: string
  referral: string
}

export default function MiniRegistrationPage() {
  const router = useRouter()
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<FormData>({
    gender: "",
    height: "",
    weight: "",
    top_size: "",
    bottom_size: "",
    shoe_size: "",
    referral: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const user = await tmaHandshake()
        setUserId(user?.id ?? null)

        // Если handshake не удался, пробуем еще раз через короткую задержку
        if (!user?.id) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          const retryUser = await tmaHandshake()
          setUserId(retryUser?.id ?? null)
        }
      } catch (error) {
        console.error("TMA Handshake failed:", error)
      } finally {
        setReady(true)
      }
    })()
  }, [])

  const updateFormData = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const nextStep = () => {
    if (currentStep < 3) setCurrentStep(currentStep + 1)
  }

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  const handleSubmit = async () => {
    if (!userId || isSubmitting) return
    setIsSubmitting(true)
    const { error } = await fetch("/api/profile/miniapp-upsert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(formData),
    }).then(async (r) => (r.ok ? {} : { error: await r.json().catch(() => ({})) }))

    if (error) {
      alert(error.error || "Не удалось сохранить профиль")
      setIsSubmitting(false)
      return
    }

    // Добавляем небольшую задержку чтобы дать базе данных время обновиться
    // и избежать race condition с MiniAppRegistrationGate
    await new Promise(resolve => setTimeout(resolve, 500))
    router.replace("/")
  }

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.gender && formData.height && formData.weight
      case 2:
        return formData.top_size && formData.bottom_size && formData.shoe_size
      case 3:
        return formData.referral
      default:
        return false
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600">Инициализация...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-md px-6 py-8">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step <= currentStep ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
                }`}
              >
                {step}
              </div>
            ))}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <User className="w-12 h-12 text-blue-600 mx-auto mb-3" />
              <h1 className="text-2xl font-bold text-gray-900">Основная информация</h1>
              <p className="text-gray-600 mt-2">Расскажите немного о себе</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Пол</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "male", label: "Мужской" },
                    { value: "female", label: "Женский" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => updateFormData("gender", option.value)}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        formData.gender === option.value
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Ruler className="w-4 h-4 inline mr-1" />
                  Рост (см)
                </label>
                <input
                  type="number"
                  value={formData.height}
                  onChange={(e) => updateFormData("height", e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="175"
                  min="140"
                  max="220"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Weight className="w-4 h-4 inline mr-1" />
                  Вес (кг)
                </label>
                <input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => updateFormData("weight", e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="70"
                  min="40"
                  max="200"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Sizes */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Shirt className="w-12 h-12 text-blue-600 mx-auto mb-3" />
              <h1 className="text-2xl font-bold text-gray-900">Размеры одежды</h1>
              <p className="text-gray-600 mt-2">Укажите ваши размеры</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Размер верха</label>
                <select
                  value={formData.top_size}
                  onChange={(e) => updateFormData("top_size", e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Выберите размер</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Размер низа</label>
                <select
                  value={formData.bottom_size}
                  onChange={(e) => updateFormData("bottom_size", e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Выберите размер</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Размер обуви</label>
                <select
                  value={formData.shoe_size}
                  onChange={(e) => updateFormData("shoe_size", e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Выберите размер</option>
                  {Array.from({ length: 20 }, (_, i) => i + 35).map((size) => (
                    <option key={size} value={size.toString()}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Referral */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Share2 className="w-12 h-12 text-blue-600 mx-auto mb-3" />
              <h1 className="text-2xl font-bold text-gray-900">Откуда узнали о нас?</h1>
              <p className="text-gray-600 mt-2">Помогите нам стать лучше</p>
            </div>

            <div className="space-y-3">
              {[
                { value: "friends", label: "От друзей", icon: Users },
                { value: "social", label: "Социальные сети", icon: Share2 },
                { value: "blogger", label: "Реклама у блогера", icon: Megaphone },
                { value: "search", label: "Поиск в интернете", icon: Heart },
                { value: "recommendation", label: "Рекомендация", icon: Heart },
                { value: "other", label: "Другое", icon: Heart },
              ].map((option) => {
                const IconComponent = option.icon
                return (
                  <button
                    key={option.value}
                    onClick={() => updateFormData("referral", option.value)}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all flex items-center ${
                      formData.referral === option.value
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <IconComponent className="w-5 h-5 mr-3" />
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
          {currentStep > 1 && (
            <button onClick={prevStep} className="px-6 py-3 text-gray-600 hover:text-gray-800 font-medium">
              Назад
            </button>
          )}

          <div className="ml-auto">
            {currentStep < 3 ? (
              <button
                onClick={nextStep}
                disabled={!isStepValid()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Далее
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!isStepValid() || isSubmitting || !userId}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Сохранение..." : "Завершить"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

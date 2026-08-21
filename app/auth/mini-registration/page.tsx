"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { User, Weight, Ruler, Shirt, Users, Share2, Megaphone, Heart, Loader2 } from "lucide-react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface FormData {
  gender: string
  height: string
  weight: string
  top_size: string
  bottom_size: string
  shoe_size: string
  referral: string
}

const selectClassName =
  "flex h-12 w-full rounded-full border border-transparent bg-canvas-sunk px-4 text-[15px] text-ink transition-colors duration-enter ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/15"

export default function MiniRegistrationPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [showForm, setShowForm] = useState(false)
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
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    checkOnboardingStatus()
  }, [])

  const checkOnboardingStatus = async () => {
    try {
      const data = await api.get("/api/me/profile-session")
      // Show onboarding if: no profile at all, or profile exists with onboarding_complete === false
      if (!data?.profile || data.profile.onboarding_complete === false) {
        setShowForm(true)
        return
      }
      // Profile exists and onboarding is complete — go to app
      router.replace("/app")
    } catch {
      // No auth / error — redirect to app (auth guard will handle it)
      router.replace("/app")
    } finally {
      setReady(true)
    }
  }

  // ── registration_step instrumentation ──
  // The profile row is only written by the LAST of these three steps, so until
  // now every person who abandoned the form left no trace anywhere: 160 of 457
  // accounts on prod, 25–62% every month since launch, on both the Telegram and
  // the web channel, with zero rows in every downstream table. The funnel could
  // show that they were lost but never where. These events give the form an
  // interior. Fire-and-forget — instrumentation must never block registration,
  // which is the one flow where a tracking hiccup would be most expensive.
  const logStep = (step: number, action: string) => {
    void api
      .post("/api/usage/log", {
        feature: "registration_step",
        action,
        meta: { step, pagePath: "/auth/mini-registration" },
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (showForm) logStep(currentStep, "view")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, currentStep])

  const updateFormData = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const nextStep = () => {
    if (currentStep < 3) {
      logStep(currentStep, "complete")
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      logStep(currentStep, "back")
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    logStep(3, "submit")

    try {
      await api.post("/api/me/profile-session", {
        gender: formData.gender || null,
        height: formData.height || null,
        weight: formData.weight || null,
        top_size: formData.top_size || null,
        bottom_size: formData.bottom_size || null,
        shoe_size: formData.shoe_size || null,
        referral: formData.referral || null,
        onboarding_complete: true,
      })

      router.replace("/app")
    } catch (e) {
      console.error("[onboarding] profile save failed", e)
      // A failed submit is the difference between "changed their mind" and "we
      // broke it" — prod served a 500 here on 2026-08-19 for a height typed as
      // "163.5", which blocked registration outright and was invisible in every
      // metric. Record it so the two causes stop looking identical.
      logStep(3, "submit_failed")
      const detail = e instanceof Error ? e.message : ""
      setSubmitError(
        detail
          ? `Не удалось сохранить профиль: ${detail}. Попробуйте ещё раз.`
          : "Не удалось сохранить профиль. Попробуйте ещё раз.",
      )
      setIsSubmitting(false)
    }
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

  if (!ready || !showForm) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ink" />
          <p className="text-body text-ink-2">Загрузка...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas">
      <main className="mx-auto max-w-md px-4 py-8">
        {/* Progress indicator */}
        <div className="mb-8">
          <p className="mb-2 text-micro text-ink-3">Шаг {currentStep} из 3</p>
          <div className="flex gap-2">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-press ease-out ${
                  step <= currentStep ? "bg-signal" : "bg-canvas-sunk"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <div key={1} className="animate-fade-up space-y-6">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-canvas-sunk text-ink">
                <User className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <h1 className="text-h1 text-ink">Основная информация</h1>
              <p className="mt-2 text-body text-ink-2">Расскажите немного о себе</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-caption text-ink-2">Пол</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "male", label: "Мужской" },
                    { value: "female", label: "Женский" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateFormData("gender", option.value)}
                      className={`rounded-lg border p-3 text-[15px] font-medium transition-colors duration-press ease-out ${
                        formData.gender === option.value
                          ? "border-ink bg-ink text-signal-ink"
                          : "border-line text-ink-2 hover:border-ink/30"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-caption text-ink-2">
                  <Ruler className="h-3.5 w-3.5" />
                  Рост (см)
                </label>
                <Input
                  type="number"
                  value={formData.height}
                  onChange={(e) => updateFormData("height", e.target.value)}
                  placeholder="175"
                  min="140"
                  max="220"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-caption text-ink-2">
                  <Weight className="h-3.5 w-3.5" />
                  Вес (кг)
                </label>
                <Input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => updateFormData("weight", e.target.value)}
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
          <div key={2} className="animate-fade-up space-y-6">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-canvas-sunk text-ink">
                <Shirt className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <h1 className="text-h1 text-ink">Размеры одежды</h1>
              <p className="mt-2 text-body text-ink-2">Укажите ваши размеры</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-caption text-ink-2">Размер верха</label>
                <select
                  value={formData.top_size}
                  onChange={(e) => updateFormData("top_size", e.target.value)}
                  className={selectClassName}
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

              <div className="space-y-1.5">
                <label className="block text-caption text-ink-2">Размер низа</label>
                <select
                  value={formData.bottom_size}
                  onChange={(e) => updateFormData("bottom_size", e.target.value)}
                  className={selectClassName}
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

              <div className="space-y-1.5">
                <label className="block text-caption text-ink-2">Размер обуви</label>
                <select
                  value={formData.shoe_size}
                  onChange={(e) => updateFormData("shoe_size", e.target.value)}
                  className={selectClassName}
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
          <div key={3} className="animate-fade-up space-y-6">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-canvas-sunk text-ink">
                <Share2 className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <h1 className="text-h1 text-ink">Откуда узнали о нас?</h1>
              <p className="mt-2 text-body text-ink-2">Помогите нам стать лучше</p>
            </div>

            <div className="space-y-2">
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
                    type="button"
                    onClick={() => updateFormData("referral", option.value)}
                    className={`flex w-full items-center rounded-lg border p-4 text-left text-[15px] font-medium transition-colors duration-press ease-out ${
                      formData.referral === option.value
                        ? "border-ink bg-ink text-signal-ink"
                        : "border-line text-ink-2 hover:border-ink/30"
                    }`}
                  >
                    <IconComponent className="mr-3 h-5 w-5 shrink-0" strokeWidth={1.75} />
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Reserved space for submit error — не ломает вёрстку */}
        <div className="mt-4 min-h-[18px]" aria-live="polite">
          {submitError && <p className="animate-fade-up text-center text-caption text-destructive">{submitError}</p>}
        </div>

        {/* Navigation buttons */}
        <div className="mt-4 flex items-center justify-between border-t border-line pt-6">
          {currentStep > 1 ? (
            <Button type="button" variant="ghost" onClick={prevStep}>
              Назад
            </Button>
          ) : (
            <span />
          )}

          {currentStep < 3 ? (
            <Button type="button" onClick={nextStep} disabled={!isStepValid()}>
              Далее
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={!isStepValid() || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Сохраняем
                </>
              ) : (
                "Завершить"
              )}
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}

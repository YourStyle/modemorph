"use client"

import { Camera, Sparkles, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"

interface HomeHeroSectionProps {
  userItemsCount: number
  onAddItems: () => void
  onExploreFeatures?: () => void
}

export function HomeHeroSection({
  userItemsCount,
  onAddItems,
  onExploreFeatures,
}: HomeHeroSectionProps) {
  const isZero = userItemsCount === 0
  const progress = Math.min(userItemsCount / 6, 1)

  return (
    <div className="mb-6 bg-white rounded-2xl shadow-lg">
      {/* Gradient top bar */}
      <div
        className="h-1 rounded-t-2xl"
        style={{
          background: "linear-gradient(to right, #EC9DE2, #89AEFF)",
        }}
      />

      <div className="p-6">
        {/* Heading */}
        <h2 className="text-2xl font-bold mb-2" style={{ color: "#101010" }}>
          {isZero
            ? "Твой AI-стилист в кармане"
            : "Ещё немного — и AI подберёт образы"}
        </h2>

        <p className="text-sm text-gray-500 mb-6">
          {isZero
            ? "Добавь вещи — и получи персональные образы от нейросети"
            : `Добавь ещё ${6 - userItemsCount} ${pluralItems(6 - userItemsCount)}, чтобы AI подобрал образы`}
        </p>

        {/* Try-on photo showcase */}
        <div className="relative flex justify-center items-center h-52 mb-6">
          {/* Clothes flatlay — behind, tilted right */}
          <div
            className="absolute right-4 bottom-2 w-36 h-44 rounded-2xl overflow-hidden shadow-md"
            style={{ transform: "rotate(5deg)", zIndex: 1 }}
          >
            <Image
              src="/img_1.png"
              alt="Вещи образа"
              fill
              className="object-cover"
              sizes="144px"
            />
          </div>
          {/* Girl photo — front, tilted left */}
          <div
            className="absolute left-4 bottom-0 w-40 h-52 rounded-2xl overflow-hidden shadow-lg"
            style={{ transform: "rotate(-4deg)", zIndex: 2 }}
          >
            <Image
              src="/img.png"
              alt="Виртуальная примерка"
              fill
              className="object-cover"
              sizes="160px"
            />
          </div>
        </div>

        {/* Feature bullets */}
        <div className="space-y-3 mb-6">
          <FeatureBullet
            icon={<Camera className="w-5 h-5" />}
            title="Анализ вещей по фото"
            description="AI распознает одежду с камеры за секунды"
          />
          <FeatureBullet
            icon={<Sparkles className="w-5 h-5" />}
            title="Персональные образы"
            description="Подбор стильных сочетаний из твоего гардероба"
          />
          <FeatureBullet
            icon={<Eye className="w-5 h-5" />}
            title="Виртуальная примерка"
            description="Примерь образ на себе до покупки"
          />
        </div>

        {/* Progress bar for 1-5 items */}
        {!isZero && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Прогресс гардероба
              </span>
              <span className="text-sm font-semibold" style={{ color: "#89AEFF" }}>
                {userItemsCount}/6
              </span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress * 100}%`,
                  background: "linear-gradient(to right, #EC9DE2, #89AEFF)",
                }}
              />
            </div>
          </div>
        )}

        {/* CTA Button */}
        <Button
          onClick={onAddItems}
          className="w-full h-14 rounded-2xl text-white text-base font-semibold border-0"
          style={{
            background: "linear-gradient(to right, #EC9DE2, #89AEFF)",
          }}
        >
          <Camera className="w-5 h-5 mr-2" />
          {isZero ? "Добавить первую вещь" : "Добавить вещи"}
        </Button>

        {/* Secondary link */}
        {onExploreFeatures && (
          <button
            onClick={onExploreFeatures}
            className="w-full mt-3 text-sm font-medium text-center"
            style={{ color: "#89AEFF" }}
          >
            Узнать о Premium
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────

function FeatureBullet({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: "#F5F4FF", color: "#89AEFF" }}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: "#101010" }}>
          {title}
        </p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────

function pluralItems(n: number): string {
  if (n === 1) return "вещь"
  if (n >= 2 && n <= 4) return "вещи"
  return "вещей"
}

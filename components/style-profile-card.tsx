"use client"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { STYLE_LABELS } from "@/lib/labels"
import { CommonSheet } from "./common-sheet"
import { ChevronRight } from "lucide-react"

interface StyleData {
  style: string
  count: number
  percentage: number
}

interface StyleProfileCardProps {
  dominantStyle: string | null
  styleTags: string[]
  userItemsCount: number
}

// Gradient colors for pie chart segments
const STYLE_COLORS: Record<string, string> = {
  casual: "#6366f1",
  classic: "#8b5cf6",
  minimalist: "#a78bfa",
  streetwear: "#c084fc",
  formal: "#818cf8",
  sport: "#60a5fa",
  romantic: "#f472b6",
  bohemian: "#fb923c",
  vintage: "#fbbf24",
  preppy: "#34d399",
  grunge: "#6b7280",
  business: "#3b82f6",
}

// Style advice data — researched recommendations
const STYLE_ADVICE: Record<string, { title: string; advice: string; colors: string[]; colorNames: string[] }> = {
  casual: {
    title: "Повседневный стиль",
    advice: "Основа — комфорт и универсальность. Исследования Nielsen Norman Group показывают, что 73% людей чувствуют себя увереннее в одежде, которая не стесняет движений.\n\nСтройте гардероб вокруг базовых вещей: хорошие джинсы, качественные футболки, кроссовки. Добавляйте акценты через аксессуары — шарф, часы, сумку.\n\nПравило «третьей вещи»: к футболке + джинсам добавьте куртку, кардиган или рубашку нараспашку — образ сразу становится завершённым.",
    colors: ["#1e293b", "#f5f5f4", "#3b82f6", "#a3a3a3"],
    colorNames: ["тёмно-синий", "белый", "голубой", "серый"],
  },
  classic: {
    title: "Классический стиль",
    advice: "Вне времени и всегда уместен. По данным исследований Journal of Fashion Marketing, классический стиль воспринимается как наиболее профессиональный и надёжный.\n\nИнвестируйте в качество: хороший блейзер, прямые брюки, рубашки из натуральных тканей. Палитра — нейтральная с акцентами.\n\nПравило пропорций: сочетайте приталенный верх со свободным низом или наоборот — никогда не всё одновременно оверсайз.",
    colors: ["#1e293b", "#f5f5f4", "#92400e", "#374151"],
    colorNames: ["тёмно-синий", "белый", "коричневый", "графитовый"],
  },
  minimalist: {
    title: "Минимализм",
    advice: "Меньше — значит лучше. Исследование Cornell University показало, что люди в минималистичной одежде воспринимаются как более компетентные.\n\nКапсульный гардероб из 30-40 вещей покрывает все ситуации. Ключ — безупречный крой и монохромные сочетания.\n\nТри правила: максимум 3 цвета в образе, чистые линии без декора, качественные ткани с хорошей драпировкой.",
    colors: ["#000000", "#f5f5f4", "#a3a3a3", "#e5e5e5"],
    colorNames: ["чёрный", "белый", "серый", "светло-серый"],
  },
  streetwear: {
    title: "Уличный стиль",
    advice: "Самовыражение через одежду. Согласно Highsnobiety, уличная мода — самый быстрорастущий сегмент fashion-индустрии.\n\nМиксуйте бренды и ценовые категории. Оверсайз-силуэты, яркие кроссовки, statement-аксессуары — ваши инструменты.\n\nПравило контраста: сочетайте спортивные вещи с более «взрослыми» — худи + пальто, кроссовки + классические брюки.",
    colors: ["#000000", "#f5f5f4", "#ef4444", "#fbbf24"],
    colorNames: ["чёрный", "белый", "красный", "жёлтый"],
  },
  formal: {
    title: "Формальный стиль",
    advice: "Элегантность в деталях. Harvard Business Review отмечает, что формальная одежда повышает абстрактное мышление и уверенность на переговорах.\n\nФокус на посадке: одежда должна сидеть идеально. Плечевой шов — на плече, рукава — до косточки запястья.\n\nПравило «одного акцента»: в строгом образе допустим один яркий элемент — галстук, брошь или часы.",
    colors: ["#1e293b", "#f5f5f4", "#991b1b", "#78716c"],
    colorNames: ["тёмно-синий", "белый", "бордовый", "бежевый"],
  },
  sport: {
    title: "Спортивный стиль",
    advice: "Функциональность + эстетика. По данным McKinsey, athleisure составляет 25% всего fashion-рынка — это больше не «только для зала».\n\nВыбирайте технологичные ткани: влагоотводящие, эластичные, дышащие. Монохромные спортивные образы выглядят дороже.\n\nПравило «спорт + город»: комбинируйте спортивные вещи с casual — лосины + оверсайз свитер, кроссовки + тренч.",
    colors: ["#000000", "#f5f5f4", "#16a34a", "#3b82f6"],
    colorNames: ["чёрный", "белый", "зелёный", "синий"],
  },
}

function PieChart({ data, size = 120 }: { data: StyleData[]; size?: number }) {
  const r = size / 2
  const cx = r
  const cy = r

  let currentAngle = -90 // Start from top

  const segments = data.map((item, i) => {
    const angle = (item.percentage / 100) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angle
    currentAngle = endAngle

    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180

    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)

    const largeArc = angle > 180 ? 1 : 0
    const color = STYLE_COLORS[item.style] || "#9ca3af"

    // Single item = full circle
    if (data.length === 1) {
      return <circle key={i} cx={cx} cy={cy} r={r - 2} fill={color} />
    }

    return (
      <path
        key={i}
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${r - 2} ${r - 2} 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={color}
      />
    )
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <filter id="pie-shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
        </filter>
      </defs>
      <g filter="url(#pie-shadow)">
        {segments}
        {/* Inner white circle for donut effect */}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="white" />
      </g>
    </svg>
  )
}

export function StyleProfileCard({ dominantStyle, styleTags, userItemsCount }: StyleProfileCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [styleSheet, setStyleSheet] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
  const [styleDistribution, setStyleDistribution] = useState<StyleData[]>([])
  const cardRef = useRef<HTMLDivElement>(null)

  // Compute style distribution from styleTags
  useEffect(() => {
    if (!styleTags.length || !userItemsCount) return
    // We have top styles from tags, approximate percentages
    const totalWeight = styleTags.reduce((sum, _, i) => sum + (styleTags.length - i), 0)
    const dist = styleTags.map((tag, i) => {
      const weight = styleTags.length - i
      return {
        style: tag,
        count: Math.round((weight / totalWeight) * userItemsCount),
        percentage: Math.round((weight / totalWeight) * 100),
      }
    })
    setStyleDistribution(dist)
  }, [styleTags, userItemsCount])

  // Collapse on scroll
  useEffect(() => {
    const handleScroll = () => {
      setIsCollapsed(window.scrollY > 200)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const openStyleAdvice = (style: string) => {
    setSelectedStyle(style)
    setStyleSheet(true)
  }

  const advice = selectedStyle ? STYLE_ADVICE[selectedStyle] || STYLE_ADVICE.casual : null

  if (!dominantStyle) {
    return (
      <Card className="p-6 mb-8 bg-white border-0 shadow-sm">
        <h3 className="text-lg font-serif font-semibold text-gray-900 mb-1">Ваш гардероб</h3>
        <p className="text-sm text-gray-500">
          {userItemsCount > 0 ? `${userItemsCount} вещей — анализируем стиль...` : "Добавьте вещи, чтобы узнать ваш стиль"}
        </p>
      </Card>
    )
  }

  return (
    <>
      <Card
        ref={cardRef}
        className={`mb-8 bg-white border-0 shadow-sm overflow-hidden transition-all duration-300 ${
          isCollapsed ? "sticky top-16 z-30" : ""
        }`}
      >
        {isCollapsed ? (
          /* Collapsed: small pie + dominant style */
          <div className="flex items-center gap-3 px-4 py-3">
            <PieChart data={styleDistribution} size={40} />
            <div className="flex-1">
              <span className="text-sm font-semibold text-gray-900">
                {STYLE_LABELS[dominantStyle] || dominantStyle}
              </span>
              <span className="text-xs text-gray-500 ml-2">{userItemsCount} вещей</span>
            </div>
            <button
              onClick={() => openStyleAdvice(dominantStyle)}
              className="text-xs text-blue-600 font-medium"
            >
              Советы
            </button>
          </div>
        ) : (
          /* Expanded: full pie chart + tags */
          <div className="px-6 pt-6 pb-5">
            <div className="flex items-start gap-5">
              {/* Pie chart */}
              <div className="flex-shrink-0">
                <PieChart data={styleDistribution} size={120} />
              </div>

              {/* Style info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 mb-1">Ваш стиль</p>
                <h3 className="text-xl font-serif font-bold text-gray-900 mb-3">
                  {STYLE_LABELS[dominantStyle] || dominantStyle}
                </h3>

                {/* Style tags with percentages */}
                <div className="space-y-2">
                  {styleDistribution.map((item) => (
                    <button
                      key={item.style}
                      onClick={() => openStyleAdvice(item.style)}
                      className="flex items-center gap-2 w-full text-left group"
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: STYLE_COLORS[item.style] || "#9ca3af" }}
                      />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                        {STYLE_LABELS[item.style] || item.style}
                      </span>
                      <span className="text-xs text-gray-400 ml-auto">{item.percentage}%</span>
                      <ChevronRight className="w-3 h-3 text-gray-400 group-hover:text-blue-500 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Style advice sheet */}
      <CommonSheet
        isOpen={styleSheet}
        onClose={() => setStyleSheet(false)}
        title={advice?.title || "Советы по стилю"}
        backgroundColor="white"
        swipeAction="close"
      >
        {advice && (
          <div className="space-y-6 pb-6">
            {/* Color palette */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Рекомендуемая палитра</p>
              <div className="flex gap-3">
                {advice.colors.map((color, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div
                      className="w-12 h-12 rounded-full border-2 border-white shadow-md"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs text-gray-500">{advice.colorNames[i]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Advice text with inline color circles */}
            <div className="space-y-3">
              {advice.advice.split("\n\n").map((paragraph, i) => (
                <p key={i} className="text-sm text-gray-700 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        )}
      </CommonSheet>
    </>
  )
}

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

// Clean, light pastel palette — Apple-like soft tones
const STYLE_COLORS: Record<string, string> = {
  casual: "#7EB8FF",
  classic: "#A8B4FF",
  minimalist: "#B8CFFF",
  streetwear: "#FFB088",
  formal: "#8BC6E8",
  sport: "#7FD4A8",
  romantic: "#F5A0D0",
  bohemian: "#E8B87A",
  vintage: "#C8A8E8",
  preppy: "#88C8FF",
  grunge: "#B0B0C8",
  business: "#80B8E8",
}

// Style advice — palettes based on real user wardrobe data + complementary accents
const STYLE_ADVICE: Record<string, { title: string; advice: string; colors: string[]; colorNames: string[] }> = {
  casual: {
    title: "Повседневный стиль",
    advice: "Основа — комфорт и универсальность. Стройте гардероб вокруг базовых вещей: хорошие джинсы, качественные футболки, кроссовки. Добавляйте акценты через аксессуары — шарф, часы, сумку.\n\nПравило «третьей вещи»: к футболке + джинсам добавьте куртку, кардиган или рубашку нараспашку — образ сразу становится завершённым.\n\nВаша база — нейтральные тона. Разбавляйте их одним акцентом: голубая рубашка, бордовый шарф или оливковая куртка.",
    colors: ["#1C1C1E", "#F5F0EB", "#6B8CAE", "#C8A882"],
    colorNames: ["Чёрный", "Слоновая кость", "Приглушённый голубой", "Кэмел"],
  },
  classic: {
    title: "Классический стиль",
    advice: "Вне времени и всегда уместен. Инвестируйте в качество: хороший блейзер, прямые брюки, рубашки из натуральных тканей.\n\nПравило пропорций: сочетайте приталенный верх со свободным низом или наоборот — никогда не всё одновременно оверсайз.\n\nВаш гардероб строится на тёмной базе. Добавляйте глубину через нейви и тёплые нейтралы — шоколадный, верблюжий.",
    colors: ["#1C1C1E", "#2C3E5A", "#F5F0EB", "#8B6F4E"],
    colorNames: ["Чёрный", "Тёмно-синий", "Молочный", "Шоколадный"],
  },
  minimalist: {
    title: "Минимализм",
    advice: "Меньше — значит лучше. Капсульный гардероб из 30-40 вещей покрывает все ситуации. Ключ — безупречный крой и монохромные сочетания.\n\nТри правила: максимум 3 цвета в образе, чистые линии без декора, качественные ткани с хорошей драпировкой.\n\nВаша палитра — самая строгая. Играйте оттенками серого и добавляйте один тихий тон: оливковый или пыльно-розовый.",
    colors: ["#1C1C1E", "#F5F5F5", "#9B9B9B", "#7A8B6F"],
    colorNames: ["Чёрный", "Белый", "Серый", "Приглушённый оливковый"],
  },
  streetwear: {
    title: "Уличный стиль",
    advice: "Самовыражение через одежду. Миксуйте бренды и ценовые категории. Оверсайз-силуэты, яркие кроссовки, statement-аксессуары — ваши инструменты.\n\nПравило контраста: сочетайте спортивные вещи с более «взрослыми» — худи + пальто, кроссовки + классические брюки.\n\nВаша база — нейтральная. Акценты делают образ: бирюзовый, терракотовый или электрик.",
    colors: ["#1C1C1E", "#F5F0EB", "#C75B3F", "#3A8A8C"],
    colorNames: ["Чёрный", "Слоновая кость", "Терракотовый", "Тёмный бирюзовый"],
  },
  formal: {
    title: "Формальный стиль",
    advice: "Элегантность в деталях. Фокус на посадке: одежда должна сидеть идеально. Плечевой шов — на плече, рукава — до косточки запястья.\n\nПравило «одного акцента»: в строгом образе допустим один яркий элемент — галстук, брошь или часы.\n\nОснова — тёмные тона и молочный. Благородные акценты: бордо, тёмное золото, глубокий синий.",
    colors: ["#2C2C2E", "#F5F0EB", "#722F37", "#2C3E5A"],
    colorNames: ["Графит", "Молочный", "Бордо", "Тёмно-синий"],
  },
  sport: {
    title: "Спортивный стиль",
    advice: "Функциональность + эстетика. Athleisure составляет 25% fashion-рынка — это больше не «только для зала».\n\nВыбирайте технологичные ткани: влагоотводящие, эластичные, дышащие. Монохромные спортивные образы выглядят дороже.\n\nПравило «спорт + город»: комбинируйте спортивные вещи с casual — лосины + оверсайз свитер, кроссовки + тренч.",
    colors: ["#1C1C1E", "#F5F5F5", "#3D7ABF", "#C8A882"],
    colorNames: ["Чёрный", "Белый", "Синий электрик", "Бежевый"],
  },
}

function PieChart({ data, size = 120 }: { data: StyleData[]; size?: number }) {
  const pad = 2
  const r = (size - pad * 2) / 2
  const cx = size / 2
  const cy = size / 2

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
      return <circle key={i} cx={cx} cy={cy} r={r} fill={color} />
    }

    return (
      <path
        key={i}
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={color}
      />
    )
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block flex-shrink-0">
      <g>
        {segments}
        {/* Inner circle for donut effect */}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="white" />
      </g>
    </svg>
  )
}

export function StyleProfileCard({ dominantStyle, styleTags, userItemsCount }: StyleProfileCardProps) {
  const [showStickyBar, setShowStickyBar] = useState(false)
  const [styleSheet, setStyleSheet] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
  const [styleDistribution, setStyleDistribution] = useState<StyleData[]>([])
  const cardRef = useRef<HTMLDivElement>(null)

  // Compute style distribution from styleTags
  useEffect(() => {
    if (!styleTags.length || !userItemsCount) return
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

  // Show sticky bar when the main card leaves viewport
  useEffect(() => {
    const card = cardRef.current
    if (!card) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowStickyBar(!entry.isIntersecting)
      },
      { threshold: 0, rootMargin: "-100px 0px 0px 0px" }
    )

    observer.observe(card)
    return () => observer.disconnect()
  }, [dominantStyle])

  const scrollPosRef = useRef(0)

  const openStyleAdvice = (style: string) => {
    scrollPosRef.current = window.scrollY
    setSelectedStyle(style)
    setStyleSheet(true)
    requestAnimationFrame(() => window.scrollTo(0, scrollPosRef.current))
  }

  const advice = selectedStyle ? STYLE_ADVICE[selectedStyle] || STYLE_ADVICE.casual : null

  if (!dominantStyle) {
    return (
      <Card className="p-6 mb-8 bg-card border-0 shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]">
        <h3 className="text-lg font-semibold text-foreground tracking-tight mb-1">Ваш гардероб</h3>
        <p className="text-sm text-muted-foreground">
          {userItemsCount > 0 ? `${userItemsCount} вещей — анализируем стиль...` : "Добавьте вещи, чтобы узнать ваш стиль"}
        </p>
      </Card>
    )
  }

  return (
    <>
      {/* Main card — always expanded, never changes height */}
      <Card
        ref={cardRef}
        className="mb-8 bg-card border-0 overflow-visible shadow-[0_2px_8px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06)]"
      >
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center gap-5">
            <div className="flex-shrink-0">
              <PieChart data={styleDistribution} size={96} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-1">Ваш стиль</p>
              <h3 className="text-xl font-bold text-foreground tracking-tight mb-3">
                {STYLE_LABELS[dominantStyle] || dominantStyle}
              </h3>
              <div className="space-y-2.5">
                {styleDistribution.map((item) => (
                  <button
                    key={item.style}
                    onClick={() => openStyleAdvice(item.style)}
                    className="flex items-center gap-2.5 w-full text-left group"
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: STYLE_COLORS[item.style] || "#B0B0C8" }}
                    />
                    <span className="text-sm text-foreground/70 group-hover:text-foreground transition-colors">
                      {STYLE_LABELS[item.style] || item.style}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">{item.percentage}%</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Sticky compact bar — fixed, separate from document flow */}
      <div
        className={`fixed top-[100px] left-0 right-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/30 transition-all duration-300 ${
          showStickyBar
            ? "translate-y-0 opacity-100"
            : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-xl mx-auto">
          <PieChart data={styleDistribution} size={36} />
          <div className="flex-1">
            <span className="text-sm font-semibold text-foreground">
              {STYLE_LABELS[dominantStyle] || dominantStyle}
            </span>
            <span className="text-xs text-muted-foreground ml-2">{userItemsCount} вещей</span>
          </div>
          <button
            onClick={() => openStyleAdvice(dominantStyle)}
            className="text-xs font-medium px-3 py-1.5 rounded-full bg-secondary text-foreground/70 hover:text-foreground transition-colors"
          >
            Советы
          </button>
        </div>
      </div>

      {/* Style advice sheet */}
      <CommonSheet
        isOpen={styleSheet}
        onClose={() => {
          setStyleSheet(false)
          requestAnimationFrame(() => window.scrollTo(0, scrollPosRef.current))
        }}
        title={advice?.title || "Советы по стилю"}
        backgroundColor="white"
        swipeAction="close"
      >
        {advice && (
          <div className="space-y-6 pb-6">
            <div>
              <div className="mb-3">
                <p className="text-sm font-medium text-foreground">Рекомендуемая палитра</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">На основе вашего гардероба</p>
              </div>
              <div className="flex gap-3">
                {advice.colors.map((color, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <div
                      className="w-full aspect-square rounded-2xl shadow-sm border border-black/5"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">{advice.colorNames[i]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {advice.advice.split("\n\n").map((paragraph, i) => (
                <p key={i} className="text-sm text-foreground/70 leading-relaxed">
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

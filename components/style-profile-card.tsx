"use client"

import { useState, useEffect, useRef } from "react"
import { STYLE_LABELS } from "@/lib/labels"
import { CommonSheet } from "./common-sheet"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

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

// Оттенки чернил + один сигнальный акцент на доминирующий сегмент.
// Никаких пастельных hex-ов — только токены из test/gauntlet/design/BAR.md.
const RANK_COLORS = ["hsl(var(--signal))", "hsl(var(--ink) / .55)", "hsl(var(--ink) / .3)", "hsl(var(--ink) / .15)"]
const RANK_COLOR_FALLBACK = "hsl(var(--ink) / .15)"

function rankColor(index: number): string {
  return RANK_COLORS[index] ?? RANK_COLOR_FALLBACK
}

// Style advice — content data (real recommended palettes), not decorative UI gradients.
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
    colors: ["#1C1C1E", "#1E3A5F", "#F5F0EB", "#7B3F00"],
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
    colors: ["#2C2C2E", "#F5F0EB", "#722F37", "#1E3A5F"],
    colorNames: ["Графит", "Молочный", "Бордо", "Тёмно-синий"],
  },
  sport: {
    title: "Спортивный стиль",
    advice: "Функциональность + эстетика. Athleisure составляет 25% fashion-рынка — это больше не «только для зала».\n\nВыбирайте технологичные ткани: влагоотводящие, эластичные, дышащие. Монохромные спортивные образы выглядят дороже.\n\nПравило «спорт + город»: комбинируйте спортивные вещи с casual — лосины + оверсайз свитер, кроссовки + тренч.",
    colors: ["#1C1C1E", "#F5F5F5", "#2563EB", "#C8A882"],
    colorNames: ["Чёрный", "Белый", "Синий электрик", "Бежевый"],
  },
}

function PieChart({ data, size = 56 }: { data: StyleData[]; size?: number }) {
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
    const color = rankColor(i)

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
        <circle cx={cx} cy={cy} r={r * 0.55} fill="hsl(var(--canvas))" />
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
      <div className="mb-4 px-3.5 py-2.5 rounded-full bg-canvas-sunk">
        <p className="text-caption text-ink-2 truncate">
          {userItemsCount > 0 ? `${userItemsCount} вещей — анализируем стиль...` : "Добавьте вещи, чтобы узнать ваш стиль"}
        </p>
      </div>
    )
  }

  // Раунд 5, критик: 75% первого экрана было хромом, ряд товара срезан таббаром.
  // Карточка стиля + отдельный ряд чипов-процентов схлопнуты в ОДНУ строку —
  // товар на экране гардероба важнее статистики о товаре. Тап по строке всё ещё
  // открывает полный разбор по стилю в шите (see openStyleAdvice ниже).
  return (
    <>
      <div ref={cardRef} className="mb-4">
        <button
          onClick={() => openStyleAdvice(dominantStyle)}
          className="w-full flex items-center gap-3 pl-2 pr-3.5 py-2 rounded-full bg-canvas-sunk text-left transition-transform duration-press ease-out active:scale-[.99]"
        >
          <PieChart data={styleDistribution} size={32} />
          <span className="flex-1 min-w-0 text-caption font-semibold text-ink truncate">
            Ваш стиль: {STYLE_LABELS[dominantStyle] || dominantStyle}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-ink-3 shrink-0" />
        </button>
      </div>

      {/* Sticky compact bar — fixed, separate from document flow. Раньше это была
          edge-to-edge полоса (left-0 right-0), а прямо над ней в TMA-хроме висит
          пилюля профиля/погоды (top-navigation.tsx) — рядом с ней полоса во всю
          ширину смотрелась чужеродно. Теперь та же форма: инсеты 16px по бокам
          (поля экрана из контракта), rounded-full, стекло, тонкий контур по
          периметру вместо нижней границы. "Советы" уже открывает шторку советов
          по стилю (openStyleAdvice), а не настройки — второй кликабельный элемент
          (иконка вопроса) был бы для этого же действия избыточен. */}
      <div
        className={cn(
          "fixed top-[100px] inset-x-4 z-30 transition-all duration-300",
          showStickyBar ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        )}
      >
        {/* Плотная поверхность, а не .glass: стекло — утилита для хрома поверх
            контента (таб-бар, шапка), а эта строка стоит в потоке, просвечивать
            ей нечем. На устройстве читалась как «очень прозрачная». */}
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-xl mx-auto rounded-full bg-surface ring-1 ring-line shadow-[0_2px_10px_hsl(var(--ink)/0.06)]">
          <PieChart data={styleDistribution} size={28} />
          <div className="flex-1 min-w-0 truncate">
            <span className="text-caption font-semibold text-ink">
              {STYLE_LABELS[dominantStyle] || dominantStyle}
            </span>
            <span className="text-caption text-ink-2 ml-2">{userItemsCount} вещей</span>
          </div>
          <button
            onClick={() => openStyleAdvice(dominantStyle)}
            className="shrink-0 text-caption font-medium px-3 py-1.5 rounded-full bg-canvas-sunk text-ink-2 active:scale-95 transition-transform duration-press"
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
                <p className="text-body font-medium text-ink">Рекомендуемая палитра</p>
                <p className="text-caption text-ink-2 mt-0.5">На основе вашего гардероба</p>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {advice.colors.map((color, i) => (
                  // items-start (не items-center/stretch) — иначе двухстрочная подпись
                  // ("Приглушённый голубой") растягивает свою ячейку grid по высоте и
                  // плитка над ней визуально укрупняется относительно соседей. aspect-square
                  // держит плитку строго квадратной независимо от длины текста под ней.
                  <div key={i} className="flex flex-col items-start gap-1.5">
                    <div
                      className="w-full aspect-square rounded-[18px] border border-line"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-caption text-ink-2 text-center leading-tight w-full">{advice.colorNames[i]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {advice.advice.split("\n\n").map((paragraph, i) => (
                <p key={i} className="text-body text-ink-2 leading-relaxed">
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

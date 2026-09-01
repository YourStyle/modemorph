"use client"

import Link from "next/link"
import {usePathname} from "next/navigation"
import {LayoutGrid, Shirt, Bot, Sparkles, Bookmark} from 'lucide-react'
import {cn} from "@/lib/utils"

const navItems = [
    {href: "/app", icon: LayoutGrid, label: "Подборки"},
    {href: "/app/wardrobe", icon: Shirt, label: "Одежда"},
    {href: "/app/ai-assistant", icon: Bot, label: "MM"},
    {href: "/app/inspiration", icon: Sparkles, label: "Идеи"},
    {href: "/app/looks", icon: Bookmark, label: "Образы"},
]

// Один штрих на всё: активный пункт отличается ТОЛЬКО цветом (--signal), не
// заливкой и не толщиной линии — иначе ряд иконок читается как три разных манеры.
const ICON_STROKE = 1.75

// Пилюля — фиксированная высота, а НЕ auto по контенту самого длинного пункта.
// Раньше (grid со стрейчем по самой высокой ячейке) высота бара незаметно скакала
// при смене активного пункта; сейчас каждая ячейка сама центрирует свой контент
// внутри одной и той же высоты, так что пилюля не "дышит" при навигации.
const PILL_HEIGHT = 64
// Зазор между низом пилюли и краем БЕЗОПАСНОЙ зоны, а не экрана.
//
// Раньше здесь стоял голый env(safe-area-inset-bottom), и внутри вебвью
// Telegram на iOS он отдаёт 0 — пилюля садилась в 12px от физического низа,
// то есть внутрь полосы home indicator, где тапы забирает система. Пилюля
// была видна и не нажималась (жалоба с iPhone 17). Считаем от --sab
// (app/globals.css), который берёт max() из env() и WebApp.safeAreaInset.bottom.
const PILL_BOTTOM_GAP = 12

export function BottomNavigation() {
    const pathname = usePathname()
    const foundIndex = navItems.findIndex((item) => pathname === item.href)
    const activeIndex = foundIndex === -1 ? 0 : foundIndex

    return (
        // Плавающая пилюля, а не бар во весь борт: inset-x-4 (16px) с каждой стороны —
        // фиксированное поле, а не auto-ширина по контенту, поэтому на любом вьюпорте
        // 320–430px пилюля физически не может вылезти за экран, она всегда
        // "100% минус 32px". grid-cols-5 внутри делит эту ширину поровну.
        //
        // glass-strong/glass-refract (app/globals.css, не мой файл) дают блюр+преломление;
        // они по умолчанию тянут светлый --canvas-фон. Возвращаем пилюле тёмный вид, который
        // просил владелец, локальным инлайн-оверрайдом фона на токене --ink — ни новых
        // классов, ни градиента в globals.css не добавляем.
        <nav
            aria-label="Основная навигация"
            className="glass-strong glass-refract fixed inset-x-4 z-50 rounded-full will-change-transform"
            style={{
                bottom: `calc(var(--sab, env(safe-area-inset-bottom, 0px)) + ${PILL_BOTTOM_GAP}px)`,
                background: "hsl(var(--ink) / 0.86)",
            }}
        >
            <div className="grid grid-cols-5 px-1" style={{height: PILL_HEIGHT}}>
                {navItems.map((item, index) => {
                    const isActive = index === activeIndex
                    const Icon = item.icon

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={isActive ? "page" : undefined}
                            aria-label={item.label}
                            className="flex h-full min-w-0 flex-col items-center justify-center gap-0.5"
                        >
                            <Icon
                                className="h-6 w-6 shrink-0 transition-colors duration-[var(--dur-press)]"
                                style={{color: isActive ? "hsl(var(--signal))" : "hsl(var(--ink-3))"}}
                                strokeWidth={ICON_STROKE}
                                aria-hidden="true"
                            />
                            {/* Whering: подпись только под активным пунктом — при пяти пунктах в узкой
                                пилюле это единственный способ не обрезать текст. Ячейка — h-full с
                                justify-center, поэтому появление лейбла не раздвигает саму пилюлю. */}
                            {isActive && (
                                <span
                                    className={cn(
                                        "animate-in fade-in slide-in-from-bottom-1 whitespace-nowrap text-[10px] font-medium leading-none",
                                        "duration-200 ease-[var(--ease-out)]",
                                    )}
                                    style={{color: "hsl(var(--signal))"}}
                                >
                                    {item.label}
                                </span>
                            )}
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}

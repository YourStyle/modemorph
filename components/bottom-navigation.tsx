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

export function BottomNavigation() {
    const pathname = usePathname()
    const foundIndex = navItems.findIndex((item) => pathname === item.href)
    const activeIndex = foundIndex === -1 ? 0 : foundIndex

    return (
        // Уровень 1 liquid glass (test/gauntlet/design/LIQUID_GLASS.md) — прижатая к низу
        // стеклянная панель на весь борт, без плавающей пилюли. glass-refract добавляет
        // преломление уровня 2 только там, где backdrop-filter: url() поддержан (Chromium).
        // Единственный акцент бара — цвет активной иконки/подписи, больше нигде --signal нет.
        <nav
            aria-label="Основная навигация"
            // glass-strong, а не glass: бар стоит над сеткой фотографий, и на .62 сквозь
            // него просвечивала вещь — мутное пятно садилось прямо под подпись вкладки
            className="glass-strong glass-refract fixed inset-x-0 bottom-0 z-50 will-change-transform"
            style={{paddingBottom: "env(safe-area-inset-bottom, 0px)"}}
        >
            <div className="grid grid-cols-5">
                {navItems.map((item, index) => {
                    const isActive = index === activeIndex
                    const Icon = item.icon

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={isActive ? "page" : undefined}
                            className="flex min-w-0 flex-col items-center justify-center gap-0.5 pt-2 pb-1.5"
                        >
                            <Icon
                                className="h-6 w-6 transition-colors duration-[var(--dur-press)]"
                                style={{color: isActive ? "hsl(var(--signal))" : "hsl(var(--ink-3))"}}
                                strokeWidth={ICON_STROKE}
                                aria-hidden="true"
                            />
                            {/* Whering: подпись только под активным пунктом — заодно чинит обрезание текста.
                                Живёт внутри линии иконок, не упирается в safe-area: bar-контейнер уже
                                добавляет env(safe-area-inset-bottom) отдельным paddingBottom снаружи. */}
                            {isActive && (
                                <span
                                    key={item.href}
                                    className={cn(
                                        "animate-in fade-in slide-in-from-bottom-1 text-[10px] font-medium leading-none",
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

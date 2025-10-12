"use client"

import Link from "next/link"
import {usePathname} from "next/navigation"
import {Home, Shirt, Sparkles, Bookmark, Bot} from 'lucide-react'
import {cn} from "@/lib/utils"
import {AIAssistantLoader} from "./ai-assistant-loader"


const navItems = [
    {href: "/app", icon: Home, label: "Главная"},
    {href: "/app/inspiration", icon: Sparkles, label: "Идеи"},
    {href: "/app/ai-assistant", icon: Bot, label: "ИИ", isAI: true},
    {href: "/app/wardrobe", icon: Shirt, label: "Гардероб"},
    {href: "/app/looks", icon: Bookmark, label: "Образы"},
]

export function BottomNavigation() {
    const pathname = usePathname()

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50">
            <div className="max-w-md mx-auto">
                <nav className="flex items-center justify-center px-4 py-2">
                    <div
                        className="bg-gray-900 rounded-full px-6 py-3 md:px-8 md:py-4 flex items-center justify-between shadow-lg">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href
                            const Icon = item.icon


                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        "flex flex-col items-center gap-1 transition-colors relative group min-w-[60px] md:min-w-[80px]",
                                        isActive ? "text-white" : "text-gray-400 hover:text-gray-300",
                                    )}
                                >
                                    {item.isAI ? (
                                        <AIAssistantLoader
                                            size={isActive ? 36 : 32}
                                            className={cn("transition-all duration-200", isActive && "scale-110")}
                                        />
                                    ) : (
                                        <Icon
                                            className={cn(
                                                "transition-all duration-200",
                                                "w-6 h-6 md:w-7 md:h-7",
                                            )}
                                        />
                                    )}
                                    <span
                                        className={cn(
                                            "text-xs font-medium transition-all duration-20 md:block text-center",
                                        )}
                                    >
                    {item.label}
                  </span>
                                    {isActive && !item.isAI && (
                                        <div
                                            className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full"/>
                                    )}
                                </Link>
                            )
                        })}
                    </div>
                </nav>
            </div>
        </div>
    )
}
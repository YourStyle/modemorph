"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Shirt, Sparkles, BookOpen, Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import { AIAssistantLoader } from "./ai-assistant-loader"

const navItems = [
  { href: "/app", icon: Home, label: "Главная" },
  { href: "/app/wardrobe", icon: Shirt, label: "Гардероб" },
  { href: "/app/ai-assistant", icon: Bot, label: "ИИ", isAI: true },
  { href: "/app/inspiration", icon: Sparkles, label: "Идеи" },
  { href: "/app/lookbook", icon: BookOpen, label: "Образы" }
]

export function BottomNavigation() {
  const pathname = usePathname()

  return (
    <div className="fixed bottom-0 left-0 right-0 z-5">
      <div className="max-w-md mx-auto">
        <nav className="flex items-center justify-center px-4 py-2">
          <div className="bg-gray-900 rounded-full px-6 py-3 md:px-8 md:py-4 flex items-center gap-6 md:gap-8 shadow-lg">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 transition-colors relative group",
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
                        isActive ? "w-7 h-7 md:w-8 md:h-8" : "w-6 h-6 md:w-7 md:h-7",
                        isActive && "scale-110",
                      )}
                    />
                  )}
                  <span
                    className={cn("text-xs font-medium transition-all duration-200 md:hidden", isActive && "scale-105")}
                  >
                    {item.label}
                  </span>
                  {(isActive && !item.isAI) &&  (
                    <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
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

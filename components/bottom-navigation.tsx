"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Shirt, Sparkles, Bookmark, Bot } from 'lucide-react'
import { cn } from "@/lib/utils"
import { AIAssistantLoader } from "./ai-assistant-loader"
import LiquidGlass from 'liquid-glass-react'

const navItems = [
  { href: "/app", icon: Home, label: "Главная" },
  { href: "/app/inspiration", icon: Sparkles, label: "Идеи" },
  { href: "/app/ai-assistant", icon: Bot, label: "ИИ", isAI: true },
  { href: "/app/wardrobe", icon: Shirt, label: "Гардероб" },
  { href: "/app/looks", icon: Bookmark, label: "Образы" },
]

export function BottomNavigation() {
  const pathname = usePathname()

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-4">
      <div className="max-w-md mx-auto px-4">
        <nav className="flex items-center justify-center">
          <div className="[&_.glass]:!p-0 [&_.glass]:!gap-0 [&_.glass]:shadow-none [&_.glass]:!transform-none">
            <LiquidGlass
              displacementScale={64}
              blurAmount={0.1}
              saturation={130}
              aberrationIntensity={2}
              elasticity={0.35}
              cornerRadius={100}
            >
              <div className="bg-gray-900/80 backdrop-blur-md rounded-full px-6 py-3 md:px-8 md:py-4 flex items-center justify-between shadow-xl border border-white/10">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-0.5 transition-colors relative group min-w-[55px] md:min-w-[70px]",
                      isActive ? "text-white" : "text-gray-400 hover:text-gray-300",
                    )}
                  >
                    {item.isAI ? (
                      <AIAssistantLoader
                        size={isActive ? 24 : 22}
                        className={cn("transition-all duration-200", isActive && "scale-110")}
                      />
                    ) : (
                      <Icon
                        className={cn(
                          "transition-all duration-200",
                          isActive ? "w-6 h-6" : "w-5 h-5",
                        )}
                      />
                    )}
                    <span
                      className={cn(
                        "text-[10px] font-medium transition-all duration-200 text-center mt-0.5",
                      )}
                    >
                      {item.label}
                    </span>
                    {isActive && !item.isAI && (
                      <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
                    )}
                  </Link>
                )
              })}
              </div>
            </LiquidGlass>
          </div>
        </nav>
      </div>
    </div>
  )
}

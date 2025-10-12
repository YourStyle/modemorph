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
          <LiquidGlass
            displacementScale={64}
            blurAmount={0.1}
            saturation={130}
            aberrationIntensity={2}
            elasticity={0.35}
            cornerRadius={100}
            style={{
              background: 'rgba(17, 24, 39, 0.8)',
              backdropFilter: 'blur(12px) saturate(130%)',
              borderRadius: '9999px',
              padding: '12px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
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
          </LiquidGlass>
        </nav>
      </div>
    </div>
  )
}

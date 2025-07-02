"use client"

import { Home, Lightbulb, Shirt, BookOpen } from "lucide-react"
import { AIAssistantLoader } from "./ai-assistant-loader"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function BottomNavigation() {
  const pathname = usePathname()
  const router = useRouter()

  const navItems = [
    { icon: Home, label: "Главная", path: "/app", key: "home" },
    { icon: Lightbulb, label: "Вдохновение", path: "/app/inspiration", key: "inspiration" },
    { icon: null, label: "ИИ", path: "/app/ai-assistant", key: "ai" },
    { icon: Shirt, label: "Гардероб", path: "/app/wardrobe", key: "wardrobe" },
    { icon: BookOpen, label: "Lookbook", path: "/app/lookbook", key: "lookbook" },
  ]

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-gray-800/95 backdrop-blur-lg rounded-full px-4 py-2 shadow-2xl border border-gray-700/30">
        <div className="flex items-center justify-center gap-6">
          {navItems.map((item) => {
            const isActive = pathname === item.path

            if (item.key === "ai") {
              return (
                <Button
                  key={item.key}
                  variant="ghost"
                  className="flex flex-col items-center gap-1 p-2 h-auto text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-full transition-all duration-200"
                  onClick={() => router.push(item.path)}
                >
                  <div className="relative">
                    <AIAssistantLoader size={36} />
                  </div>
                  <span className="text-xs font-medium mt-1">{item.label}</span>
                </Button>
              )
            }

            const Icon = item.icon!
            return (
              <Button
                key={item.key}
                variant="ghost"
                className={`flex flex-col items-center gap-1 p-2 h-auto rounded-full transition-all duration-200 ${
                  isActive ? "text-white bg-gray-700/50" : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/30"
                }`}
                onClick={() => router.push(item.path)}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

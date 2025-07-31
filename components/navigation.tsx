"use client"

import { usePathname, useRouter } from "next/navigation"
import { Home, Shirt, Eye, Sparkles, Book } from "lucide-react"
import { Button } from "@/components/ui/button"

const navigationItems = [
  {
    name: "Главная",
    href: "/app",
    icon: Home,
  },
  {
    name: "Гардероб",
    href: "/app/wardrobe",
    icon: Shirt,
  },
  {
    name: "ИИ",
    href: "/app/ai-assistant",
    icon: Eye,
  },
  {
    name: "Идеи",
    href: "/app/inspiration",
    icon: Sparkles,
  },
  {
    name: "Образы",
    href: "/app/looks",
    icon: Book,
  },
]

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-50">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Button
              key={item.name}
              variant="ghost"
              size="sm"
              onClick={() => router.push(item.href)}
              className={`flex flex-col items-center space-y-1 h-auto py-2 px-3 ${
                isActive ? "text-blue-600 bg-blue-50" : "text-gray-600"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "text-blue-600" : "text-gray-600"}`} />
              <span className={`text-xs ${isActive ? "text-blue-600 font-medium" : "text-gray-600"}`}>{item.name}</span>
            </Button>
          )
        })}
      </div>
    </nav>
  )
}

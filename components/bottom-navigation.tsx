"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Shirt, Sparkles, Bot } from 'lucide-react'
import { cn } from "@/lib/utils"
import { AIAssistantLoader } from "./ai-assistant-loader"

const navItems = [
  { href: "/app", icon: Home, label: "Главная" },
  { href: "/app/wardrobe", icon: Shirt, label: "Гардероб" },
  { href: "/app/ai-assistant", icon: Bot, label: "ИИ", isAI: true },
  { href: "/app/inspiration", icon: Sparkles, label: "Идеи" },
  { href: "/app/looks", icon: null, label: "Образы", isCustomIcon: true },
]

export function BottomNavigation() {
  const pathname = usePathname()

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="max-w-md mx-auto">
        <nav className="flex items-center justify-center px-4 py-2">
          <div className="bg-gray-900 rounded-full px-6 py-3 md:px-8 md:py-4 flex items-center justify-between shadow-lg">
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
                  ) : item.isCustomIcon ? (
                    <div className={cn("transition-all duration-200", isActive && "scale-110")}>
                      <svg
                        width={isActive ? 32 : 28}
                        height={isActive ? 24 : 20}
                        viewBox="0 0 22 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="transition-all duration-200"
                      >
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M10.66 1.75C9.82399 1.75 9.28599 2.342 9.28599 2.91C9.28599 3.10891 9.20698 3.29968 9.06632 3.44033C8.92567 3.58098 8.73491 3.66 8.53599 3.66C8.33708 3.66 8.14632 3.58098 8.00566 3.44033C7.86501 3.29968 7.78599 3.10891 7.78599 2.91C7.78599 1.367 9.14999 0.25 10.66 0.25C12.17 0.25 13.534 1.367 13.534 2.91C13.534 3.59 13.286 4.224 12.844 4.704C12.704 4.857 12.55 5.009 12.409 5.149L12.335 5.221C12.1819 5.36972 12.0347 5.52451 11.894 5.685C11.8192 5.77134 11.7507 5.86291 11.689 5.959C12.2664 6.06646 12.8157 6.29108 13.303 6.619L20.736 11.629C21.686 12.269 21.943 13.326 21.613 14.217C21.288 15.093 20.422 15.75 19.297 15.75H2.70199C1.58999 15.75 0.727994 15.105 0.395994 14.24C0.0579944 13.36 0.295994 12.309 1.22399 11.657L8.31899 6.665C8.84853 6.29402 9.4549 6.04724 10.093 5.943C10.198 5.436 10.486 5.025 10.751 4.713C10.923 4.511 11.111 4.322 11.28 4.155L11.36 4.075C11.503 3.935 11.627 3.812 11.74 3.689C11.922 3.491 12.034 3.221 12.034 2.909C12.034 2.342 11.496 1.75 10.66 1.75ZM12.465 7.862C11.9749 7.5373 11.3978 7.36921 10.81 7.38C10.2283 7.38351 9.66102 7.56191 9.18199 7.892L2.08699 12.883C1.74099 13.126 1.69599 13.441 1.79699 13.702C1.90199 13.977 2.19999 14.25 2.70199 14.25H19.297C19.806 14.25 20.103 13.973 20.207 13.695C20.304 13.431 20.254 13.113 19.897 12.873L12.465 7.862Z"
                          fill="currentColor"
                        />
                      </svg>
                    </div>
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
                    className={cn(
                      "text-xs font-medium transition-all duration-200 hidden md:block text-center",
                      isActive && "scale-105",
                    )}
                  >
                    {item.label}
                  </span>
                  {isActive && !item.isAI && (
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

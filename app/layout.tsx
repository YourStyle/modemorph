import type React from "react"
import { useEffect } from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"
import "./globals.css"
import "./tma.css" // см. блок CSS ниже
import { Toaster } from "@/components/ui/toaster"
import { SelectedItemsProvider } from "@/contexts/selected-items-context"
import { AuthProvider } from "@/contexts/auth-context"
import MiniAppRegistrationGate from "@/components/MiniAppRegistrationGate"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Mode Morph - Умный гардероб",
  description: "Создавайте стильные образы с помощью ИИ",
  generator: "v0.dev",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const tg = (typeof window !== "undefined" ? (window as any).Telegram?.WebApp : undefined)

    const hasInit = !!tg?.initData && String(tg.initData).trim().length > 0
    const hasUser = !!tg?.initDataUnsafe?.user?.id || !!tg?.initDataUnsafe?.query_id
    const platformOk = !!tg?.platform && tg.platform !== "unknown"

    const inTma = Boolean(tg) && hasInit && hasUser && platformOk

    if (inTma) document.body.classList.add("tma-root")
    else document.body.classList.remove("tma-root")

    return () => {
      document.body.classList.remove("tma-root")
    }
  }, [])


  return (
    <html lang="ru">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        {/* Telegram WebApp API должен грузиться ДО интерактива */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      {/* высота берётся из переменных, которые проставляет официальный скрипт */}
      <body className={`${inter.className}`}>
        <AuthProvider>
          <SelectedItemsProvider>
            <MiniAppRegistrationGate>{children}</MiniAppRegistrationGate>
            <Toaster />
          </SelectedItemsProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

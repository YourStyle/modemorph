import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"
import "./globals.css"
import "./tma.css" // см. блок CSS ниже
import { Toaster } from "@/components/ui/toaster"
import { SelectedItemsProvider } from "@/contexts/selected-items-context"
import { AuthProvider } from "@/contexts/auth-context"
import MiniAppRegistrationGate from "@/components/MiniAppRegistrationGate"
import TmaBodyClass from "@/components/TmaBodyClass"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Mode Morph - Умный гардероб",
  description: "Создавайте стильные образы с помощью ИИ",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {


  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        {/* Telegram WebApp API должен грузиться ДО интерактива */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      {/* высота берётся из переменных, которые проставляет официальный скрипт */}
      <body className={`${inter.className} bg-gray-50`} suppressHydrationWarning>
        <TmaBodyClass/>
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

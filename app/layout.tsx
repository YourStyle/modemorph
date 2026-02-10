import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"
import "./globals.css"
import "./tma.css"
import { Toaster } from "@/components/ui/toaster"
import { SelectedItemsProvider } from "@/contexts/selected-items-context"
import { AuthProvider } from "@/contexts/auth-context"
import MiniAppRegistrationGate from "@/components/MiniAppRegistrationGate"
import TmaBodyClass from "@/components/TmaBodyClass"
import VpnWarning from "@/components/vpn-warning"
import ErudaDebug from "@/components/ErudaDebug"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Mode Morph - Умный гардероб",
  description: "Создавайте стильные образы с помощью ИИ",
  generator: "v0.app"
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className={`${inter.className} bg-gray-50`} suppressHydrationWarning>
        <ErudaDebug />
        <TmaBodyClass/>
        <MiniAppRegistrationGate>
          <AuthProvider>
            <SelectedItemsProvider>
              {children}
              <Toaster />
              <VpnWarning />
            </SelectedItemsProvider>
          </AuthProvider>
        </MiniAppRegistrationGate>
      </body>
    </html>
  )
}

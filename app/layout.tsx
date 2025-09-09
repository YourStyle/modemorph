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
  generator: "v0.dev",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {


  return (
    <html lang="ru">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        {/* Telegram WebApp API должен грузиться ДО интерактива */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_TG_MOCK_INIT_DATA ? (
          <Script
            id="mock-telegram-user"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function(){
                  const initData = ${JSON.stringify(process.env.NEXT_PUBLIC_TG_MOCK_INIT_DATA)};
                  const params = new URLSearchParams(initData);
                  const unsafe = {};
                  for (const [k,v] of params.entries()) {
                    unsafe[k] = k === "user" ? JSON.parse(v) : v;
                  }
                  window.Telegram = { WebApp: { initData: initData, initDataUnsafe: unsafe } };
                })();
              `,
            }}
          />
        ) : null}
      </head>
      {/* высота берётся из переменных, которые проставляет официальный скрипт */}
      <body className={`${inter.className}`}>
        <TmaBodyClass />
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

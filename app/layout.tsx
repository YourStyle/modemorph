import type React from "react"
import type { Metadata } from "next"
import { Manrope } from "next/font/google"
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
import {
  LIQUID_GLASS_DISPLACEMENT_MAP,
  LIQUID_GLASS_MAP_HEIGHT,
  LIQUID_GLASS_MAP_WIDTH,
} from "@/lib/liquid-glass-displacement-map"

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
})

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
        <meta name="verify-admitad" content="e99bcd7fbc" />
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className={`${manrope.className} bg-background`} suppressHydrationWarning>
        {/* Общий SVG-фильтр для .glass-refract (test/gauntlet/design/LIQUID_GLASS.md, уровень 2).
            Работает только там, где движок поддерживает url() в backdrop-filter (Chromium);
            iOS WKWebView игнорирует его и остаётся на плоском уровне 1 — это ожидаемо.
            Карта смещения (R=X, G=Y, 128=ноль) генерируется lib/liquid-glass-displacement-map.ts
            под фиксированный размер хрома — таб-бара и шапки, единственных элементов,
            к которым применяется .glass-refract. */}
        <svg
          aria-hidden="true"
          colorInterpolationFilters="sRGB"
          style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
        >
          <filter id="mm-glass">
            <feImage
              href={LIQUID_GLASS_DISPLACEMENT_MAP}
              x={0}
              y={0}
              width={LIQUID_GLASS_MAP_WIDTH}
              height={LIQUID_GLASS_MAP_HEIGHT}
              result="map"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={16}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
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

import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/toaster"
import { SelectedItemsProvider } from "@/contexts/selected-items-context"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Mode Morph - Умный гардероб",
  description: "Создавайте стильные образы с помощью ИИ",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body className={inter.className}>
        <SelectedItemsProvider>
          {children}
          <Toaster />
        </SelectedItemsProvider>
      </body>
    </html>
  )
}

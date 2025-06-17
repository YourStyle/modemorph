import type React from "react"
import type { Metadata } from "next"
import { SelectedItemsProvider } from "@/contexts/selected-items-context"

export const metadata: Metadata = {
  title: "Мой гардероб | Supabase Community Starter",
  description: "Коллекция одежды с фотографиями и подробной информацией",
}

export default function WardrobeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <SelectedItemsProvider>{children}</SelectedItemsProvider>
}

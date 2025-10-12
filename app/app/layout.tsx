import type React from "react"
import AppClientLayout from "./layout-client"
import { BackgroundTasksProvider } from "@/contexts/background-tasks-context"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server Component layout. Client behavior is inside AppClientLayout.
  return (
    <BackgroundTasksProvider>
      <AppClientLayout>{children}</AppClientLayout>
    </BackgroundTasksProvider>
  )
}

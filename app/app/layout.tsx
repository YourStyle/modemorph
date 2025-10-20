import type React from "react"
import AppClientLayout from "./layout-client"
import { BackgroundTasksProvider } from "@/contexts/background-tasks-context"
import { AIAnalysisProvider } from "@/contexts/ai-analysis-context"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server Component layout. Client behavior is inside AppClientLayout.
  return (
    <BackgroundTasksProvider>
      <AIAnalysisProvider>
        <AppClientLayout>{children}</AppClientLayout>
      </AIAnalysisProvider>
    </BackgroundTasksProvider>
  )
}

import type React from "react"
import AppClientLayout from "./layout-client"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server Component layout. Client behavior is inside AppClientLayout.
  return <AppClientLayout>{children}</AppClientLayout>
}

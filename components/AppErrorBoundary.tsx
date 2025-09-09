// components/AppErrorBoundary.tsx
"use client"
import React from "react"

export default class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("React error:", error)
    console.error("Component stack:", info.componentStack) // <- покажет виновный компонент
  }
  render() { return this.state.error ? null : this.props.children }
}

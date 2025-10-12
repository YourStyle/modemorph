"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react"

export interface BackgroundTask {
  id: string
  type: "photo_analysis"
  status: "processing" | "completed" | "error"
  progress: number
  data?: any
  error?: string
  startedAt: Date
  completedAt?: Date
}

interface BackgroundTasksContextType {
  tasks: BackgroundTask[]
  addTask: (task: Omit<BackgroundTask, "id" | "startedAt">) => string
  updateTask: (id: string, updates: Partial<BackgroundTask>) => void
  removeTask: (id: string) => void
  getTask: (id: string) => BackgroundTask | undefined
}

const BackgroundTasksContext = createContext<BackgroundTasksContextType | undefined>(undefined)

export function BackgroundTasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([])

  const addTask = useCallback((task: Omit<BackgroundTask, "id" | "startedAt">) => {
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newTask: BackgroundTask = {
      ...task,
      id,
      startedAt: new Date(),
    }
    setTasks((prev) => [...prev, newTask])
    return id
  }, [])

  const updateTask = useCallback((id: string, updates: Partial<BackgroundTask>) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              ...updates,
              completedAt: updates.status === "completed" || updates.status === "error" ? new Date() : task.completedAt,
            }
          : task
      )
    )
  }, [])

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id))
  }, [])

  const getTask = useCallback(
    (id: string) => {
      return tasks.find((task) => task.id === id)
    },
    [tasks]
  )

  return (
    <BackgroundTasksContext.Provider value={{ tasks, addTask, updateTask, removeTask, getTask }}>
      {children}
    </BackgroundTasksContext.Provider>
  )
}

export function useBackgroundTasks() {
  const context = useContext(BackgroundTasksContext)
  if (!context) {
    throw new Error("useBackgroundTasks must be used within BackgroundTasksProvider")
  }
  return context
}

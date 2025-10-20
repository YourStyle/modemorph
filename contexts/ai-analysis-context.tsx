"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react"

export interface AnalyzedItem {
  index: number
  basic_item_id: number | null
  need_gen: boolean
  clothing_item: string
  description: string
  item_name: string
  material: string
  style: string
  has_print: string
  color: string
  shade: string
  has_details: string
  img_url?: string
  image_url?: string
  finalImageUrl?: string
  isAdding?: boolean
  isAdded?: boolean
}

export interface PhotoAnalysisResult {
  success: boolean
  items: AnalyzedItem[]
  error?: string
  rejectionReason?: string
  fileName: string
}

export interface AIAnalysisSession {
  id: string
  batchId: string
  status: "idle" | "analyzing" | "completed" | "error"
  progress: number
  progressText: string
  items: AnalyzedItem[]
  analysisResults: PhotoAnalysisResult[]
  error?: string
  photos: Array<{ file: File; preview: string; id: string }>
  startedAt: Date
  completedAt?: Date
}

interface AIAnalysisContextType {
  currentSession: AIAnalysisSession | null
  sessions: Map<string, AIAnalysisSession>

  // Создать новую сессию анализа
  createSession: (batchId: string, photos: Array<{ file: File; preview: string; id: string }>) => string

  // Обновить сессию
  updateSession: (sessionId: string, updates: Partial<AIAnalysisSession>) => void

  // Получить сессию по ID
  getSession: (sessionId: string) => AIAnalysisSession | undefined

  // Получить сессию по batchId
  getSessionByBatchId: (batchId: string) => AIAnalysisSession | undefined

  // Получить активную (analyzing) сессию
  getActiveSession: () => AIAnalysisSession | undefined

  // Установить текущую сессию
  setCurrentSession: (sessionId: string | null) => void

  // Удалить сессию
  removeSession: (sessionId: string) => void

  // Очистить все сессии
  clearSessions: () => void
}

const AIAnalysisContext = createContext<AIAnalysisContextType | undefined>(undefined)

export function AIAnalysisProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Map<string, AIAnalysisSession>>(new Map())
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

  const createSession = useCallback((batchId: string, photos: Array<{ file: File; preview: string; id: string }>) => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newSession: AIAnalysisSession = {
      id: sessionId,
      batchId,
      status: "idle",
      progress: 0,
      progressText: "",
      items: [],
      analysisResults: [],
      photos,
      startedAt: new Date(),
    }

    setSessions((prev) => {
      const updated = new Map(prev)
      updated.set(sessionId, newSession)
      return updated
    })

    return sessionId
  }, [])

  const updateSession = useCallback((sessionId: string, updates: Partial<AIAnalysisSession>) => {
    setSessions((prev) => {
      const updated = new Map(prev)
      const session = updated.get(sessionId)
      if (session) {
        updated.set(sessionId, {
          ...session,
          ...updates,
          completedAt: updates.status === "completed" || updates.status === "error" ? new Date() : session.completedAt,
        })
      }
      return updated
    })
  }, [])

  const getSession = useCallback(
    (sessionId: string) => {
      return sessions.get(sessionId)
    },
    [sessions]
  )

  const getSessionByBatchId = useCallback(
    (batchId: string) => {
      return Array.from(sessions.values()).find((session) => session.batchId === batchId)
    },
    [sessions]
  )

  const getActiveSession = useCallback(() => {
    return Array.from(sessions.values()).find((session) => session.status === "analyzing")
  }, [sessions])

  const setCurrentSession = useCallback((sessionId: string | null) => {
    setCurrentSessionId(sessionId)
  }, [])

  const removeSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const updated = new Map(prev)
      updated.delete(sessionId)
      return updated
    })
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null)
    }
  }, [currentSessionId])

  const clearSessions = useCallback(() => {
    setSessions(new Map())
    setCurrentSessionId(null)
  }, [])

  const currentSession = currentSessionId ? sessions.get(currentSessionId) : null

  return (
    <AIAnalysisContext.Provider
      value={{
        currentSession,
        sessions,
        createSession,
        updateSession,
        getSession,
        getSessionByBatchId,
        getActiveSession,
        setCurrentSession,
        removeSession,
        clearSessions,
      }}
    >
      {children}
    </AIAnalysisContext.Provider>
  )
}

export function useAIAnalysis() {
  const context = useContext(AIAnalysisContext)
  if (!context) {
    throw new Error("useAIAnalysis must be used within AIAnalysisProvider")
  }
  return context
}

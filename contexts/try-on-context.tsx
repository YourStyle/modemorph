"use client"

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react"
import { api } from "@/lib/api-client"
import { useBackgroundTasks } from "@/contexts/background-tasks-context"

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface OutfitItem {
  id: string
  name: string
  image_url: string
  color?: string
  shade?: string
  style?: string
  material?: string
  has_print?: string
  has_details?: string
  notes?: string
  user_id?: string
}

export interface OutfitSuggestion {
  id: string
  title: string
  items: OutfitItem[]
  suggested_items_count: number
}

export type VtonStatus = "confirming" | "loading" | "completed" | "error"

export interface VtonSession {
  id: string
  taskId: string | null
  status: VtonStatus
  progress: number
  suggestion: OutfitSuggestion | null
  items: OutfitItem[]
  resultUrl: string | null
  error: string | null
  saved: boolean
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface ConfirmTryOnResult {
  paywall?: true
  error?: string
  ok?: true
}

interface TryOnContextType {
  session: VtonSession | null
  sheetOpen: boolean
  setSheetOpen: (open: boolean) => void
  /**
   * Creates a fresh session and opens the sheet.
   * @param suggestion  The outfit suggestion to try on
   * @param items       Wardrobe items included in the outfit
   * @param onTryOnClick    Optional callback fired when the actual API call starts
   * @param onTryOnSuccess  Optional callback fired when the result image is ready
   */
  startTryOn: (
    suggestion: OutfitSuggestion,
    items: OutfitItem[],
    onTryOnClick?: () => void,
    onTryOnSuccess?: (imageUrl: string) => void,
  ) => void
  /**
   * Checks limits, registers a background task, fires the VTON API call, and
   * drives a fake ease-out progress animation (0 → 95 % over ~90 s).
   */
  confirmTryOn: () => Promise<ConfirmTryOnResult>
  /** Hides the sheet without destroying the session (shows background widget). */
  minimizeSession: () => void
  /** Saves the completed try-on result as a user look. */
  saveTryOn: () => Promise<void>
  /** Destroys the active session entirely. */
  clearSession: () => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TryOnContext = createContext<TryOnContextType | undefined>(undefined)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

function generateId(): string {
  return `vton_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function extractImageUrl(response: unknown): string | null {
  if (!response || typeof response !== "object") return null
  const r = response as Record<string, unknown>

  // Format: { result: { image_url: "..." } }
  if (r.result && typeof r.result === "object") {
    const result = r.result as Record<string, unknown>
    if (typeof result.image_url === "string") return result.image_url
    if (typeof result.url === "string") return result.url
    if (typeof result.imageUrl === "string") return result.imageUrl
  }

  // Format: { image_url: "..." }
  if (typeof r.image_url === "string") return r.image_url
  if (typeof r.url === "string") return r.url
  if (typeof r.imageUrl === "string") return r.imageUrl

  // Format: { data: { image_url: "..." } }
  if (r.data && typeof r.data === "object") {
    const data = r.data as Record<string, unknown>
    if (typeof data.image_url === "string") return data.image_url
    if (typeof data.url === "string") return data.url
    if (typeof data.imageUrl === "string") return data.imageUrl
  }

  return null
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TryOnProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<VtonSession | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Optional page-level callbacks stored at startTryOn time
  const onTryOnClickRef = useRef<(() => void) | undefined>(undefined)
  const onTryOnSuccessRef = useRef<((imageUrl: string) => void) | undefined>(undefined)

  // Fake progress timer ref
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Guard against double confirmTryOn calls
  const confirmingRef = useRef(false)

  const { addTask, updateTask } = useBackgroundTasks()

  // Stable updateTask ref so async closures do not capture stale versions
  const updateTaskRef = useRef(updateTask)
  updateTaskRef.current = updateTask

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  const stopProgressTimer = useCallback(() => {
    if (progressTimerRef.current !== null) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
  }, [])

  const updateSession = useCallback((updates: Partial<VtonSession>) => {
    setSession((prev) => (prev ? { ...prev, ...updates } : prev))
  }, [])

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const setSheetOpenStable = useCallback((open: boolean) => {
    setSheetOpen(open)
  }, [])

  const startTryOn = useCallback(
    (
      suggestion: OutfitSuggestion,
      items: OutfitItem[],
      onTryOnClick?: () => void,
      onTryOnSuccess?: (imageUrl: string) => void,
    ) => {
      // Store page-level callbacks
      onTryOnClickRef.current = onTryOnClick
      onTryOnSuccessRef.current = onTryOnSuccess

      // Create a fresh idle session
      const newSession: VtonSession = {
        id: generateId(),
        taskId: null,
        status: "confirming",
        progress: 0,
        suggestion,
        items,
        resultUrl: null,
        error: null,
        saved: false,
      }
      setSession(newSession)
      setSheetOpen(true)
    },
    [],
  )

  // Keep a stable ref to session for the async closure
  const sessionRef = useRef(session)
  sessionRef.current = session

  const confirmTryOn = useCallback(async (): Promise<ConfirmTryOnResult> => {
    if (!sessionRef.current) return { error: "No active session" }
    if (confirmingRef.current) return { error: "Already confirming" }
    confirmingRef.current = true

    const requestId = generateId()
    const { items, suggestion } = sessionRef.current

    // 1. Check limits (check-only, does NOT consume yet)
    let limitsData: { canUse?: boolean } = {}
    try {
      limitsData = await api.post("/api/check-limits", {
        type: "vton_used",
        count: 1,
        meta: { requestId },
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      confirmingRef.current = false
      if (message.includes("402") || message.includes("payment_required")) {
        return { paywall: true }
      }
      return { error: message }
    }

    if (limitsData.canUse === false) {
      confirmingRef.current = false
      return { paywall: true }
    }

    // 2. Notify the page the actual call is starting
    onTryOnClickRef.current?.()

    // 3. Register background task
    const taskId = addTask({
      type: "virtual_tryon",
      status: "processing",
      progress: 0,
    })

    // 4. Transition session to loading
    updateSession({ status: "loading", progress: 0, taskId, error: null })

    // 5. Fake ease-out progress timer: 0 → 95 % over ~90 s
    const DURATION_MS = 90_000
    const TICK_MS = 500
    const startTime = Date.now()

    stopProgressTimer()
    progressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / DURATION_MS, 1)
      const progress = Math.round(easeOutCubic(t) * 95)

      setSession((prev) => (prev ? { ...prev, progress } : prev))
      updateTaskRef.current(taskId, { progress })
    }, TICK_MS)

    // 6. Fire the actual API call (closure captures stable refs)
    // Credits are consumed ONLY on success — if the call fails, nothing is charged.
    ;(async () => {
      const setError = (errMsg: string) => {
        stopProgressTimer()
        confirmingRef.current = false
        setSession((prev) =>
          prev ? { ...prev, status: "error", progress: 0, error: errMsg } : prev,
        )
        updateTaskRef.current(taskId, { status: "error", progress: 0, error: errMsg })
      }

      try {
        const vtonItems = items.map((item) => ({
          name: item.name,
          description: `${item.style || ""} ${item.has_print || ""} ${item.has_details || ""}`.trim(),
          color: item.color,
          material: item.material,
          image_url: item.image_url,
        }))
        const response = await api.post("/api/vton", { items: vtonItems, requestId })

        stopProgressTimer()
        confirmingRef.current = false

        // Check for error in response body (n8n may return 200 with error)
        if (response?.error) {
          setError(typeof response.error === "string"
            ? response.error
            : "Сервис примерки вернул ошибку. Ваши кредиты не списаны.")
          return
        }

        const imageUrl = extractImageUrl(response)
        if (!imageUrl) {
          setError("Не удалось получить результат примерки. Ваши кредиты не списаны.")
          return
        }

        // Success — NOW consume the credit
        try {
          await api.post("/api/check-limits", {
            featureType: "vton_used",
            count: 1,
            meta: { requestId },
          })
        } catch {
          // Credit consumption failed but try-on succeeded — don't block user
          console.error("[TryOn] Failed to consume credit after success")
        }

        setSession((prev) =>
          prev
            ? { ...prev, status: "completed", progress: 100, resultUrl: imageUrl, error: null }
            : prev,
        )
        updateTaskRef.current(taskId, { status: "completed", progress: 100 })

        onTryOnSuccessRef.current?.(imageUrl)
      } catch (err: unknown) {
        // API call failed — no credit consumed
        let errMsg = "Произошла ошибка при создании примерки. Ваши кредиты не списаны — попробуйте ещё раз."
        if (err instanceof Error) {
          const msg = err.message
          if (msg.includes("503") || msg.includes("502")) {
            errMsg = "Сервис примерки временно недоступен. Ваши кредиты не списаны — попробуйте позже."
          } else if (msg.includes("400")) {
            errMsg = "Загрузите аватар в профиле для виртуальной примерки. Кредиты не списаны."
          } else if (msg.includes("timeout") || msg.includes("Timeout")) {
            errMsg = "Сервис не ответил вовремя. Ваши кредиты не списаны — попробуйте позже."
          }
        }
        setError(errMsg)
      }
    })()

    return { ok: true }
  }, [addTask, updateSession, stopProgressTimer])

  const minimizeSession = useCallback(() => {
    setSheetOpen(false)
  }, [])

  const saveTryOn = useCallback(async () => {
    if (!session?.resultUrl || !session.suggestion) return

    const { suggestion, items, resultUrl } = session

    const transformedItems = items.map((item) => ({
      type: item.user_id ? "user" : "basic",
      id: Number(item.id),
    }))

    await api.post("/api/user-looks", {
      name: suggestion.title,
      description: "Виртуальная примерка",
      items: transformedItems,
      image_url: resultUrl,
    })

    updateSession({ saved: true })
  }, [session, updateSession])

  const clearSession = useCallback(() => {
    stopProgressTimer()
    confirmingRef.current = false
    onTryOnClickRef.current = undefined
    onTryOnSuccessRef.current = undefined
    setSession(null)
    setSheetOpen(false)
  }, [stopProgressTimer])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <TryOnContext.Provider
      value={{
        session,
        sheetOpen,
        setSheetOpen: setSheetOpenStable,
        startTryOn,
        confirmTryOn,
        minimizeSession,
        saveTryOn,
        clearSession,
      }}
    >
      {children}
    </TryOnContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTryOn(): TryOnContextType {
  const context = useContext(TryOnContext)
  if (!context) {
    throw new Error("useTryOn must be used within TryOnProvider")
  }
  return context
}

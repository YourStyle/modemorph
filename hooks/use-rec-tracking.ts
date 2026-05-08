"use client"

import { useCallback, useEffect, useRef } from "react"
import { api } from "@/lib/api-client"

// Event vocabulary mirrors backend/app/api/rec_events.py. Item events apply to
// individual items inside an outfit; outfit events apply to the suggestion
// (full outfit card) as a whole.
export type RecItemEvent =
  | "impression"
  | "click"
  | "affiliate_click"
  | "save"
  | "try_on"
  | "like_item"
  | "dislike_item"

export type RecOutfitEvent = "like_outfit" | "dislike_outfit"

export type RecEvent = RecItemEvent | RecOutfitEvent

interface SendEventArgs {
  rec_session_id: string
  event: RecEvent
  item_id?: number | string | null
  item_source?: "catalog" | "user"
  suggestion_id?: string
  position?: number
  score?: number
}

const IMPRESSION_DEDUP_KEY = "rec_impression_seen"

function loadImpressionDedup(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = sessionStorage.getItem(IMPRESSION_DEDUP_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed) : new Set()
  } catch {
    return new Set()
  }
}

function persistImpressionDedup(seen: Set<string>) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(IMPRESSION_DEDUP_KEY, JSON.stringify(Array.from(seen)))
  } catch {
    /* sessionStorage may be unavailable in private mode — backend ON CONFLICT
       still dedupes, so this is just a network optimisation. */
  }
}

/**
 * Single client entrypoint for /api/rec-event. Fire-and-forget; never throws
 * to the caller because tracking failures must not break UX. Impressions are
 * deduped client-side via sessionStorage so the same card re-entering the
 * viewport during a scroll session doesn't generate redundant requests
 * (server has its own ON CONFLICT guard for cross-tab races).
 */
export function useRecTracking() {
  const dedupRef = useRef<Set<string>>(loadImpressionDedup())

  const sendEvent = useCallback(async (args: SendEventArgs) => {
    if (!args.rec_session_id) return
    const { event, rec_session_id, item_id, suggestion_id } = args

    if (event === "impression" && item_id != null) {
      const key = `${rec_session_id}:${item_id}`
      if (dedupRef.current.has(key)) return
      dedupRef.current.add(key)
      persistImpressionDedup(dedupRef.current)
    }

    const payload: Record<string, unknown> = {
      rec_session_id,
      event,
    }
    if (item_id != null) {
      const numId = typeof item_id === "string" ? Number.parseInt(item_id, 10) : item_id
      if (Number.isFinite(numId as number)) payload.item_id = numId
    }
    if (args.item_source) payload.item_source = args.item_source
    if (suggestion_id) payload.suggestion_id = suggestion_id
    if (args.position != null) payload.position = args.position
    if (args.score != null) payload.score = args.score

    try {
      await api.post("/api/rec-event", payload)
    } catch (err) {
      // Swallow — tracking must be invisible to the user. Logged for triage.
      console.warn("[useRecTracking] send failed", { event, err })
    }
  }, [])

  return { sendEvent }
}

interface UseImpressionTrackerArgs {
  /** rec_session_id this card belongs to. If absent, observer is a no-op
   *  (e.g. user_only sections without partner CLIP retrieval). */
  rec_session_id?: string | null
  /** Catalog items inside the card. user_items are excluded — they don't
   *  exist in recommendation_logs. */
  catalogItems: Array<{ id: number | string; position?: number; score?: number }>
}

/**
 * Hook that returns a ref to attach to a recommendation card. Once the card
 * intersects ≥50% with the viewport for ≥600ms, fires impression events for
 * every catalog item inside it. The dwell threshold protects against the
 * "user fast-scrolls past a horizontal carousel" CTR-inflation attack: a
 * card that flashes on screen for 100ms is not a real impression.
 */
export function useImpressionTracker(args: UseImpressionTrackerArgs) {
  const { rec_session_id, catalogItems } = args
  const elementRef = useRef<HTMLDivElement | null>(null)
  const { sendEvent } = useRecTracking()
  const firedRef = useRef(false)

  useEffect(() => {
    const el = elementRef.current
    if (!el) return
    if (!rec_session_id) return
    if (catalogItems.length === 0) return
    if (firedRef.current) return
    if (typeof IntersectionObserver === "undefined") return

    let dwellTimer: number | null = null

    const fireImpressions = () => {
      if (firedRef.current) return
      firedRef.current = true
      for (const item of catalogItems) {
        sendEvent({
          rec_session_id,
          event: "impression",
          item_id: item.id,
          item_source: "catalog",
          position: item.position,
          score: item.score,
        })
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (dwellTimer == null) {
              dwellTimer = window.setTimeout(fireImpressions, 600)
            }
          } else if (dwellTimer != null) {
            window.clearTimeout(dwellTimer)
            dwellTimer = null
          }
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    )

    observer.observe(el)
    return () => {
      observer.disconnect()
      if (dwellTimer != null) window.clearTimeout(dwellTimer)
    }
  }, [rec_session_id, catalogItems, sendEvent])

  return elementRef
}

"use client"

import { useRef, useCallback } from "react"
import { api } from "@/lib/api-client"

export type EventType =
  // Onboarding
  | "onboarding_started"
  | "first_item_added"
  | "onboarding_complete"
  | "profile_photo_uploaded"
  | "wardrobe_30_percent"
  | "wardrobe_50_percent"
  | "wardrobe_100_percent"
  // Outfit & Value
  | "first_outfit_generated"
  | "outfit_saved"
  | "outfit_shared"
  | "first_tryon_opened"
  | "recommendation_clicked"
  // Engagement
  | "session_started"
  | "session_task_completed"
  | "ai_assistant_used"
  | "wardrobe_viewed"
  | "inspiration_viewed"
  // Monetization
  | "paywall_shown"
  | "conversion_to_premium"
  | "premium_feature_used"
  // Retention
  | "daily_return"
  | "weekly_return"
  | "repeat_task"

interface EventData {
  [key: string]: any
}

interface AnalyticsHook {
  trackEvent: (eventType: EventType, eventData?: EventData) => Promise<void>
  trackOnce: (eventType: EventType, eventData?: EventData) => Promise<void>
}

export function useAnalytics(): AnalyticsHook {
  const trackedOnceEvents = useRef<Set<string>>(new Set())

  const trackEvent = useCallback(async (eventType: EventType, eventData?: EventData) => {
    try {
      await api.post("/api/usage/log", {
        feature: eventType,
        action: "track",
        meta: { event_type: eventType, ...(eventData || {}) },
      })
    } catch (error) {
      console.error("[useAnalytics] Error tracking event:", error)
    }
  }, [])

  const trackOnce = useCallback(async (eventType: EventType, eventData?: EventData) => {
    try {
      if (trackedOnceEvents.current.has(eventType)) return
      trackedOnceEvents.current.add(eventType)
      await trackEvent(eventType, eventData)
    } catch (error) {
      console.error("[useAnalytics] Error tracking once event:", error)
    }
  }, [trackEvent])

  return { trackEvent, trackOnce }
}

export async function trackWardrobeProgress(itemsCount: number, targetCount: number = 50) {
  const percentage = Math.floor((itemsCount / targetCount) * 100)

  if (percentage >= 100) {
    return { event: "wardrobe_100_percent" as EventType, data: { percentage: 100, items_count: itemsCount, target_count: targetCount } }
  } else if (percentage >= 50) {
    return { event: "wardrobe_50_percent" as EventType, data: { percentage: 50, items_count: itemsCount, target_count: targetCount } }
  } else if (percentage >= 30) {
    return { event: "wardrobe_30_percent" as EventType, data: { percentage: 30, items_count: itemsCount, target_count: targetCount } }
  }

  return null
}

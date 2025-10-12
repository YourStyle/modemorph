"use client"

import { useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

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

/**
 * Хук для трекинга пользовательских событий
 *
 * @example
 * const { trackEvent, trackOnce } = useAnalytics()
 *
 * // Трекать каждое событие
 * await trackEvent('outfit_saved', { outfit_id: 123 })
 *
 * // Трекать только первое событие (например, first_item_added)
 * await trackOnce('first_item_added', { item_id: 456 })
 */
export function useAnalytics(): AnalyticsHook {
  const supabase = createClient()
  const trackedOnceEvents = useRef<Set<string>>(new Set())
  const userProfileId = useRef<number | null>(null)

  // Получаем user_profile_id при монтировании
  useEffect(() => {
    const fetchUserProfileId = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("user_id", user.id)
          .single()

        if (profile) {
          userProfileId.current = profile.id
        }
      } catch (error) {
        console.error("[useAnalytics] Failed to fetch user profile ID:", error)
      }
    }

    fetchUserProfileId()
  }, [supabase])

  /**
   * Отправить событие в базу данных
   */
  const trackEvent = useCallback(async (eventType: EventType, eventData?: EventData) => {
    try {
      if (!userProfileId.current) {
        console.warn("[useAnalytics] User profile ID not available, skipping event:", eventType)
        return
      }

      const { error } = await supabase
        .from("user_events")
        .insert({
          user_profile_id: userProfileId.current,
          event_type: eventType,
          event_data: eventData || null,
        })

      if (error) {
        console.error("[useAnalytics] Failed to track event:", eventType, error)
      } else {
        console.log("[useAnalytics] Event tracked:", eventType, eventData)
      }
    } catch (error) {
      console.error("[useAnalytics] Error tracking event:", error)
    }
  }, [supabase])

  /**
   * Отправить событие только один раз (проверяет по user_profile_id + event_type)
   * Полезно для milestone событий типа first_item_added, first_outfit_generated
   */
  const trackOnce = useCallback(async (eventType: EventType, eventData?: EventData) => {
    try {
      if (!userProfileId.current) {
        console.warn("[useAnalytics] User profile ID not available, skipping once event:", eventType)
        return
      }

      const eventKey = `${userProfileId.current}_${eventType}`

      // Проверяем локальный кэш
      if (trackedOnceEvents.current.has(eventKey)) {
        console.log("[useAnalytics] Event already tracked once:", eventType)
        return
      }

      // Проверяем в базе
      const { data: existingEvent } = await supabase
        .from("user_events")
        .select("id")
        .eq("user_profile_id", userProfileId.current)
        .eq("event_type", eventType)
        .limit(1)
        .single()

      if (existingEvent) {
        trackedOnceEvents.current.add(eventKey)
        console.log("[useAnalytics] Event already exists in DB:", eventType)
        return
      }

      // Трекаем событие
      await trackEvent(eventType, eventData)
      trackedOnceEvents.current.add(eventKey)
    } catch (error) {
      console.error("[useAnalytics] Error tracking once event:", error)
    }
  }, [supabase, trackEvent])

  return {
    trackEvent,
    trackOnce,
  }
}

/**
 * Хелпер для трекинга прогресса заполнения гардероба
 */
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

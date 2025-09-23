"use client";

import { useCallback } from "react";
import { api } from "@/lib/api-client";

type Feature =
  | "wardrobe_items_anlyzed"
  | "ai_requests"
  | "ideas_viewed"
  | "outfits_saved"
  | "vton_used";

export function useFeature() {
  const log = useCallback(
    async (
      feature: Feature,
      action: "click" | "attempt" | "purchase_sub" | "purchase_credits",
      meta?: Record<string, any>
    ) => {
      try {
        await api.post("/api/usage/log", {
          feature,
          action,
          count: 1,
          meta: meta ?? {},
        });
      } catch {
        /* no-op */
      }
    },
    []
  );

  const consume = useCallback(
    async (feature: Feature, meta?: Record<string, any>,count: number = 1) => {
      try {
        const response = await api.post("/api/check-limits", {
          featureType: feature,
          count,
          meta: meta ?? {}
        });
        return { ok: true as const, remaining: Number(response?.remaining ?? 0) };
      } catch (error: any) {
        if (error.message?.includes('402')) {
          return { ok: false as const, code: "payment_required" as const };
        }
        return { ok: false as const, code: "error" as const };
      }
    },
    []
  );

  return { log, consume };
}

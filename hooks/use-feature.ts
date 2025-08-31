"use client";

import { useCallback } from "react";

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
        await fetch("/api/usage/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feature,
            action,
            count: 1,
            meta: meta ?? {},
          }),
        });
      } catch {
        /* no-op */
      }
    },
    []
  );

  const consume = useCallback(
    async (feature: Feature, meta?: Record<string, any>,count: number = 1) => {
      const r = await fetch("/api/check-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureType: feature, count, meta: meta ?? {} }),
      });

      if (r.status === 402) return { ok: false as const, code: "payment_required" as const };
      if (!r.ok) return { ok: false as const, code: "error" as const };

      const data = await r.json();
      return { ok: true as const, remaining: Number(data?.remaining ?? 0) };
    },
    []
  );

  return { log, consume };
}

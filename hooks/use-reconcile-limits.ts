"use client";
import { useEffect } from "react";
import { api } from "@/lib/api-client";

export function useReconcileLimits(enable: boolean = true) {
  useEffect(() => {
    if (!enable) return;
    (async () => {
      try {
        await api.post("/api/limits/reconcile");
      } catch {}
    })();
  }, [enable]);
}

"use client";
import { useEffect } from "react";

export function useReconcileLimits(enable: boolean = true) {
  useEffect(() => {
    if (!enable) return;
    (async () => {
      try {
        await fetch("/api/limits/reconcile", { method: "POST" });
      } catch {}
    })();
  }, [enable]);
}

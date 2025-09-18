"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function useReconcileLimits(enable: boolean = true) {
  useEffect(() => {
    const supabase = createClient()
    async function getAccessToken() {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token ?? "";
    }
    async function apiFetch(url: string, init: RequestInit = {}) {
      const token = await getAccessToken();
      return fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(init.headers || {}),
        },
      });
    }

    if (!enable) return;
    (async () => {
      try {
        await apiFetch("/api/limits/reconcile", {method: "POST"});
      } catch {}
    })();
  }, [enable]);
}

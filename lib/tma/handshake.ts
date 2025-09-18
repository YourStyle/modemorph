// lib/tma/handshake.ts
// Унифицированный обмен initData → Supabase-сессия. Возвращает актуального user или null.

import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string
        initDataUnsafe?: Record<string, any>
      }
    }
  }
}

export async function tmaHandshake(): Promise<User | null> {
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
  const initData = tg?.initData || ""
  if (!initData) return null

  const res = await fetch("/api/auth/telegram/miniapp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  
  const json = await res.json().catch(() => null);
  if (json?.session) {
    const supabase = createClient();
    await supabase.auth.setSession(json.session);
  }

  const { data, error } = await createClient().auth.getUser();
  return error ? null : data.user; 
}

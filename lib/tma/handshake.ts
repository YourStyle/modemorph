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

async function pollMe(attempts = 6): Promise<User | null> {
  for (let i = 0; i < attempts; i++) {
    const me = await fetch(`/api/auth/me?i=${i}&t=${Date.now()}`, {
      cache: "no-store",
    }).then(r => r.ok ? r.json() : null);

    const user = me?.user ?? null;
    if (user) return user;
    await new Promise(r => setTimeout(r, 150 * (i + 1))); // 150ms, 300ms, ...
  }
  return null;
}

export async function tmaHandshake(): Promise<User | null> {
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
  const initData = tg?.initData || ""
  if (!initData) return null

  // 1) Хэндшейк — только сервер ставит куки
  const res = await fetch("/api/auth/telegram/miniapp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData }),
    cache: "no-store",
  });
  if (!res.ok) return null;

  // 2) Дождаться, пока вебвью реально начнет слать куки
  return await pollMe();
}

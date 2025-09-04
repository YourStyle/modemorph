// lib/tma/handshake.ts
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string
        initDataUnsafe?: { user?: { id?: number } } & Record<string, any>
      }
    }
  }
}

function clearSbLocalStorage() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const ref = url?.split("//")[1]?.split(".")[0];
    if (ref) localStorage.removeItem(`sb-${ref}-auth-token`);
  } catch {}
}

export async function tmaHandshake() {
  const supabase = createClient();
  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  const initData = tg?.initData || "";
  if (!initData) return (await supabase.auth.getUser()).data.user ?? null;

  // Одноразовый чистый старт этой вкладки (см. флаг)
  const BOOT = "tma:booted";
  if (sessionStorage.getItem(BOOT) !== "1") {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    clearSbLocalStorage(); // ← ВАЖНО
    sessionStorage.setItem(BOOT, "1");
  }

  // Обмен initData → сессия
  const res = await fetch("/api/auth/telegram/miniapp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData }),
    credentials: "include",
  });
  if (!res.ok) return null;

  // Считываем пользователя (это подтянет актуальную сессию в supabase-js)
  const { data, error } = await supabase.auth.getUser();
  if (!error) return data.user ?? null;

  // Фолбэк на случай «битой» локалки
  const msg = (error.message || "").toLowerCase();
  if (msg.includes("refresh_token_not_found") || msg.includes("invalid refresh token")) {
    // полный сброс и одна повторная попытка
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    clearSbLocalStorage();
    const res2 = await fetch("/api/auth/telegram/miniapp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ initData }),
      credentials: "include",
    });
    if (!res2.ok) return null;
    return (await supabase.auth.getUser()).data.user ?? null;
  }

  return null;
}

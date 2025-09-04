// contexts/auth-context.tsx
// Поведение: редирект на /auth/login ТОЛЬКО после двух подряд 401 в окне времени.
// Убрано авто-перенаправление при отсутствии user — остаёмся на странице,
// пока не будет двух подряд 401 или «битого» токена.

"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  trackUnauthorizedError: () => void; // вызывать при перехвате 401
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function onAuthPage() {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return p === "/auth/login" || p.startsWith("/auth/");
}

// Порог и окно для подряд идущих 401
const UNAUTH_REDIRECT_THRESHOLD = 2;       // после двух подряд 401
const UNAUTH_WINDOW_MS = 60_000;           // окно (мс), в течение которого учитываются подряд идущие 401

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useRef(createClient()).current;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Флаг «идём на редирект», чтобы не зациклиться
  const redirectingRef = useRef(false);

  // Счётчик подряд идущих 401 в окне времени
  const unauthorizedCountRef = useRef(0);
  const unauthorizedTimerRef = useRef<number | null>(null);

  // Сброс счётчика подряд 401
  const resetUnauthorizedSeries = () => {
    unauthorizedCountRef.current = 0;
    if (unauthorizedTimerRef.current) {
      window.clearTimeout(unauthorizedTimerRef.current);
      unauthorizedTimerRef.current = null;
    }
  };

  // Жёсткий выход + редирект на /auth/login?next=...
  const hardLogout = async () => {
    if (redirectingRef.current) return
      redirectingRef.current = true
      try { await fetch("/api/auth/signout", { method: "POST", credentials: "include" }) } catch {}
      setUser(null)

    if (!onAuthPage() && typeof window !== "undefined") {
      const next = window.location.pathname + window.location.search;
      window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
    } else {
      redirectingRef.current = false;
    }
  };

  // Вызывать в местах, где перехватываются 401 (например, в fetch-обёртке)
  const trackUnauthorizedError = () => {
    if (onAuthPage()) return;

    // Если окна ещё нет — создаём
    if (!unauthorizedTimerRef.current) {
      unauthorizedTimerRef.current = window.setTimeout(() => {
        resetUnauthorizedSeries();
      }, UNAUTH_WINDOW_MS);
    }

    // Увеличиваем счётчик подряд идущих 401
    unauthorizedCountRef.current += 1;

    // Если достигли порога — сбрасываем счётчик и уходим в hardLogout
    if (unauthorizedCountRef.current >= UNAUTH_REDIRECT_THRESHOLD) {
      resetUnauthorizedSeries();
      void hardLogout();
    }
  };

    useEffect(() => {
      const init = async () => {
        try {
          const res = await fetch("/api/auth/me", { credentials: "include" })
          const json = await res.json().catch(() => null)
          setUser(json?.user ?? null)        // это уже user из куки-сессии
          resetUnauthorizedSeries()
        } catch {
          setUser(null)
        } finally {
          setLoading(false)
        }
      }
      init()
    }, [])

  // ВНИМАНИЕ: Предыдущий «фолбэк-редирект при !user» УДАЛЁН.
  // Теперь вход на /auth/login происходит ТОЛЬКО через hardLogout, который вызывается
  // после двух подряд 401 (trackUnauthorizedError) или при «битом» токене.

  const signOut = async () => {
    await hardLogout();
  };

  const refreshUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) setUser(null);
      else setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      // успешное обновление профиля также можно трактовать как «сброс серии 401»
      resetUnauthorizedSeries();
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signOut, refreshUser, trackUnauthorizedError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

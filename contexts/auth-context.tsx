"use client";

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  trackUnauthorizedError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isOnAuthPage() {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return p === "/auth/login" || p.startsWith("/auth/");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const redirectingRef = useRef(false);
  const supabase = useRef(createClient()).current;

  // единый «жёсткий» выход + (условный) редирект
  const forceLogoutAndMaybeRedirect = async () => {
    // уже уходим — не повторяем
    if (redirectingRef.current) return;
    redirectingRef.current = true;

    try {
      await supabase.auth.signOut();
    } catch { /* ignore */ }

    // подчистим локальные токены supabase-js
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const projectRef = url?.split("//")[1]?.split(".")[0];
      if (projectRef) localStorage.removeItem(`sb-${projectRef}-auth-token`);
    } catch { /* ignore */ }

    setUser(null);

    // На auth-страницах НЕ редиректим (оставляем пользователя заполнять форму)
    if (isOnAuthPage()) {
      redirectingRef.current = false;
      return;
    }

    // Жёсткий редирект на логин
    const next =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";
    window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
  };

  const trackUnauthorizedError = () => {
    // На страницах логина 401 ожидаемы — не дёргаем редирект.
    if (isOnAuthPage()) return;
    void forceLogoutAndMaybeRedirect();
  };

  // начальная инициализация пользователя
  useEffect(() => {
    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();

        // если просто нет сессии — user=null и без редиректа
        if (!error) {
          setUser(data.user ?? null);
        } else {
          // реальный случай битого refresh-token — уйдём на логин
          const msg = (error?.message || "").toLowerCase();
          const isTokenBroken =
            msg.includes("refresh_token_not_found") ||
            msg.includes("invalid refresh token") ||
            msg.includes("jwt") || // «битые» подписи и т.п.
            msg.includes("jws");
          if (isTokenBroken) {
            await forceLogoutAndMaybeRedirect();
            return;
          }
          setUser(null);
        }
      } catch {
        // на любой неожиданный сбой — чистим и остаёмся на месте, если уже /auth/*
        await forceLogoutAndMaybeRedirect();
        return;
      } finally {
        setLoading(false);
      }
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
      // если юзер появился — снимаем «флаг редиректа» (на случай возврата назад)
      redirectingRef.current = false;
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const signOut = async () => {
    await forceLogoutAndMaybeRedirect();
  };

  const refreshUser = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) setUser(null);
      else setUser(data.user ?? null);
    } catch {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refreshUser, trackUnauthorizedError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

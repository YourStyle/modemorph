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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const redirectingRef = useRef(false);

  const supabase = useRef(createClient()).current;

  // Единая функция "жёсткого" выхода и редиректа
  const forceLogoutAndRedirect = async () => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;

    try {
      await supabase.auth.signOut();
    } catch {/* ignore */}

    // Чистим локальные токены (supabase-js хранит тут)
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const projectRef = url?.split("//")[1]?.split(".")[0];
      if (projectRef) localStorage.removeItem(`sb-${projectRef}-auth-token`);
    } catch {/* ignore */}

    setUser(null);

    // Жёсткий редирект, чтобы точно сбросить все сторы приложения
    const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
  };

  // Вызывается при любом 401 от наших API
  const trackUnauthorizedError = () => {
    void forceLogoutAndRedirect();
  };

  // Инициализация пользователя
  useEffect(() => {
    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          // Если токен «битый» — сразу чистим и редиректим
          await forceLogoutAndRedirect();
          return;
        }
        setUser(data.user ?? null);
      } catch {
        await forceLogoutAndRedirect();
        return;
      } finally {
        setLoading(false);
      }
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  const signOut = async () => {
    await forceLogoutAndRedirect();
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

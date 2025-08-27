"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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

function onAuthPage() {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return p === "/auth/login" || p.startsWith("/auth/");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useRef(createClient()).current;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const redirectingRef = useRef(false);

  const hardLogout = async () => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;

    try {
      await supabase.auth.signOut();
    } catch {}

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const ref = url?.split("//")[1]?.split(".")[0];
      if (ref) localStorage.removeItem(`sb-${ref}-auth-token`);
    } catch {}

    setUser(null);

    if (!onAuthPage() && typeof window !== "undefined") {
      const next = window.location.pathname + window.location.search;
      window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
    } else {
      redirectingRef.current = false;
    }
  };

  const trackUnauthorizedError = () => {
    if (onAuthPage()) return;
    void hardLogout();
  };

  // первичная загрузка пользователя
  useEffect(() => {
    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error) {
          setUser(data.user ?? null);
        } else {
          const msg = (error.message || "").toLowerCase();
          const tokenBroken =
            msg.includes("refresh_token_not_found") ||
            msg.includes("invalid refresh token") ||
            msg.includes("jwt") ||
            msg.includes("jws");
          if (tokenBroken) {
            await hardLogout();
            return;
          }
          setUser(null);
        }
      } catch {
        await hardLogout();
        return;
      } finally {
        setLoading(false);
      }
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
      redirectingRef.current = false;
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  // Фолбэк: если не авторизован и это не /auth/* — редиректим
  useEffect(() => {
    if (!loading && !user && !onAuthPage() && typeof window !== "undefined") {
      const next = window.location.pathname + window.location.search;
      window.location.replace(`/auth/login?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user]);

  const signOut = async () => { await hardLogout(); };

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

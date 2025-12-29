// contexts/auth-context.tsx
// TMA-aware authentication context

"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { sessionAuth } from "@/lib/tma/session-auth";

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

// Check if we're in Telegram Mini App
function isInTMA() {
  if (typeof window === "undefined") return false;
  const tg = window.Telegram?.WebApp;
  return !!(tg?.initData && tg.initData.trim().length > 0);
}

const UNAUTH_REDIRECT_THRESHOLD = 2;
const UNAUTH_WINDOW_MS = 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useRef(createClient()).current;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const redirectingRef = useRef(false);
  const unauthorizedCountRef = useRef(0);
  const unauthorizedTimerRef = useRef<number | null>(null);

  const resetUnauthorizedSeries = () => {
    unauthorizedCountRef.current = 0;
    if (unauthorizedTimerRef.current) {
      window.clearTimeout(unauthorizedTimerRef.current);
      unauthorizedTimerRef.current = null;
    }
  };

  const hardLogout = async () => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    
    try { 
      await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    } catch {}
    
    sessionAuth.clearSession();
    setUser(null);

    // In TMA, don't redirect to login page
    if (isInTMA()) {
      redirectingRef.current = false;
      return;
    }

    if (!onAuthPage() && typeof window !== "undefined") {
      const next = window.location.pathname + window.location.search;
      window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
    } else {
      redirectingRef.current = false;
    }
  };

  const trackUnauthorizedError = () => {
    // In TMA mode, don't track 401s - MiniAppRegistrationGate handles auth
    if (isInTMA()) return;
    if (onAuthPage()) return;

    if (!unauthorizedTimerRef.current) {
      unauthorizedTimerRef.current = window.setTimeout(() => {
        resetUnauthorizedSeries();
      }, UNAUTH_WINDOW_MS);
    }

    unauthorizedCountRef.current += 1;

    if (unauthorizedCountRef.current >= UNAUTH_REDIRECT_THRESHOLD) {
      resetUnauthorizedSeries();
      void hardLogout();
    }
  };

  useEffect(() => {
    const init = async () => {
      // In TMA mode, wait for MiniAppRegistrationGate to set up session
      if (isInTMA()) {
        console.log("[AuthProvider] In TMA mode, waiting for session...");
        
        // Wait up to 5 seconds for TMA session to be established
        let attempts = 0;
        while (attempts < 50) {
          const token = sessionAuth.getAccessToken();
          if (token) {
            console.log("[AuthProvider] TMA session found");
            break;
          }
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }

        // Try to get user from session
        const token = sessionAuth.getAccessToken();
        if (token) {
          try {
            const res = await fetchWithRetry(
              "/api/me/profile-session",
              { 
                headers: { "Authorization": "Bearer " + token },
                cache: "no-store" 
              },
              { timeout: 8000, retries: 1, retryDelay: 500 }
            );
            const json = await res.json().catch(() => null);
            setUser(json?.user ?? null);
            resetUnauthorizedSeries();
          } catch (error) {
            console.log("[AuthProvider] TMA auth check failed:", error);
            setUser(null);
          }
        } else {
          console.log("[AuthProvider] No TMA session after waiting");
          setUser(null);
        }
        
        setLoading(false);
        return;
      }

      // Regular cookie-based auth
      try {
        const res = await fetchWithRetry(
          "/api/auth/me",
          { credentials: "include" },
          { timeout: 8000, retries: 1, retryDelay: 500 }
        );
        const json = await res.json().catch(() => null);
        setUser(json?.user ?? null);
        resetUnauthorizedSeries();
      } catch (error) {
        console.log("[AuthProvider] Failed to check auth:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    
    init();
  }, []);

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

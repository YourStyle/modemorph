// contexts/auth-context.tsx
// TMA-aware authentication context with built-in handshake

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

// Get initData from URL hash (Telegram passes it there)
function getInitDataFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash) return null;
  const match = hash.match(/tgWebAppData=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return null;
}

// Get initData from SDK or hash
function getInitData(): string | null {
  if (typeof window === "undefined") return null;
  
  // Try SDK first
  const tg = window.Telegram?.WebApp;
  if (tg?.initData && tg.initData.trim().length > 0) {
    return tg.initData;
  }
  
  // Fallback to hash
  return getInitDataFromHash();
}

function isInTMA(): boolean {
  return !!getInitData();
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
  const initDoneRef = useRef(false);

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
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    const init = async () => {
      const initData = getInitData();
      
      console.log("[AuthProvider] Init, hasInitData:", !!initData);

      if (initData) {
        // TMA mode - do handshake
        console.log("[AuthProvider] TMA mode - doing handshake...");
        
        try {
          const response = await fetchWithRetry(
            "/api/auth/telegram/miniapp-session",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ initData }),
              cache: "no-store",
            },
            { timeout: 15000, retries: 2, retryDelay: 1000, backoff: true }
          );

          console.log("[AuthProvider] Handshake response:", response.status);

          if (response.ok) {
            const data = await response.json();
            
            if (data.session && data.user) {
              // Parse expiration
              let expiresAt: number;
              const exp = data.session.expires_at;
              if (typeof exp === "number") {
                expiresAt = exp < 2000000000 ? exp * 1000 : exp;
              } else if (typeof exp === "string") {
                expiresAt = new Date(exp).getTime();
              } else {
                expiresAt = Date.now() + 3600000;
              }

              // Save session
              sessionAuth.saveSession({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                user_id: data.user.id,
                expires_at: expiresAt
              });

              console.log("[AuthProvider] Session saved for user:", data.user.id);
              setUser(data.user);
              resetUnauthorizedSeries();
            } else {
              console.log("[AuthProvider] No session in response");
              setUser(null);
            }
          } else {
            console.log("[AuthProvider] Handshake failed:", response.status);
            setUser(null);
          }
        } catch (error) {
          console.error("[AuthProvider] Handshake error:", error);
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

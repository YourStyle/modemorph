"use client";

import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tmaHandshake } from "@/lib/tma/handshake";

export default function MiniAppRegistrationGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const onMiniReg = (pathname || "").startsWith("/auth/mini-registration");
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);

  const initCalledRef = useRef(false);
  const redirectedRef = useRef(false);
  const fsTried = useRef(false);

  const safeRedirect = (to: string) => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(to);
  };

  const askFullscreen = (tg: any) => {
    if (fsTried.current) return;
    fsTried.current = true;
    if (!tg) return;
    try { tg.requestFullscreen?.(); } catch {}
    try { tg.expand?.(); } catch {}
  };

  useEffect(() => {
    if (initCalledRef.current) return;
    initCalledRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const tg = (typeof window !== "undefined") ? window.Telegram?.WebApp : undefined;
        const hasInit = !!tg?.initData?.trim();
        const hasUser = !!tg?.initDataUnsafe?.user?.id || !!tg?.initDataUnsafe?.query_id;
        const platformOk = !!tg?.platform && tg.platform !== "unknown";
        const inTMA = tg && hasInit && hasUser && platformOk;

        // не в Telegram – просто показываем children
        if (!inTMA || !tg) {
          return;
        }

        // инициализация TMA
        try {
          tg.ready();
          tg.setHeaderColor?.("#FFFFFF");
          tg.setBackgroundColor?.("#0e0e10");
          document.body.style.backgroundColor = "#FFFFFF";
        } catch {}

        askFullscreen(tg);
        window.addEventListener("touchstart", () => askFullscreen(tg), { once: true, passive: true });
        window.addEventListener("click", () => askFullscreen(tg), { once: true });

        try { tg.disableVerticalSwipes?.(); } catch {}
        try { tg.enableClosingConfirmation?.(); } catch {}

        // хэндшейк
        const user = await tmaHandshake();
        if (!user) {
          if (!onMiniReg) safeRedirect("/auth/mini-registration?from=tma");
          return;
        }

        // проверка обязательных полей профиля
        const prof = await fetch("/api/me/profile", { credentials: "include" }).then(r => r.ok ? r.json() : null);
        const p = prof?.profile;
        const required = ["gender","height","weight","top_size","bottom_size","shoe_size"];
        const missing = !p ? required : required.filter(k => p[k] == null || p[k] === "");
        if (missing.length > 0 && !onMiniReg) {
          safeRedirect("/auth/mini-registration?from=tma");
          return;
        }

        // если всё ок и мы на / или /auth/mini-registration → отправляем в основное приложение
        if (!onMiniReg && (pathname === "/" || pathname.startsWith("/auth/mini-registration"))) {
          safeRedirect("/app");
        }
      } finally {
        if (!cancelled && !redirectedRef.current) {
          setReady(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [pathname, router, supabase, onMiniReg]);

  if (!ready) {
    // здесь можно вернуть спиннер/скелетон
    return null;
  }

  return <>{children}</>;
}

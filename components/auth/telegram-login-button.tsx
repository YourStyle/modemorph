"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** 
 * Telegram login button.
 *
 * При монтировании компонента регистрирует глобальный callback onTelegramAuth
 * и добавляет в контейнер скрипт виджета Telegram. При размонтировании 
 * удаляет скрипт, очищает контейнер и удаляет callback, чтобы кнопка 
 * не оставалась на других страницах. 
 */
declare global {
  interface Window {
    onTelegramAuth?: (user: any) => void;
  }
}

export function TelegramLoginButton({
  botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "modemorph_ai_bot",
}: { botUsername?: string } = {}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    // регистрируем callback до загрузки скрипта
    window.onTelegramAuth = async (user: any) => {
      try {
        const res = await fetch("/api/auth/telegram/login-widget", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ user }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error || "Telegram auth failed");
        }

        if (!json?.session) {
          throw new Error("No session returned by server");
        }

        const { error } = await supabase.auth.setSession(json.session);
        if (error) {
          throw new Error(error.message);
        }

        router.replace("/");
        router.refresh();
      } catch (error: any) {
        alert(error?.message || "Telegram auth failed");
      }
    };

    // создаём скрипт виджета
    const script = document.createElement("script");
    script.id = "tg-login-script";
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");

    // находим контейнер и вставляем скрипт
    const container = document.getElementById("tg-login-container");
    if (container) {
      container.innerHTML = "";
      container.appendChild(script);
    }

    // функция очистки: удаляем скрипт и callback при размонтировании
    return () => {
      delete window.onTelegramAuth;
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [botUsername, router]);

  return <div id="tg-login-container" />;
}

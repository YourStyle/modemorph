"use client";

import { useEffect } from "react";
import { sessionAuth } from "@/lib/tma/session-auth";
import { parseSupabaseExpiry } from "@/lib/auth-utils";

/**
 * Telegram login button with session storage support.
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
  useEffect(() => {
    // регистрируем callback до загрузки скрипта
    const showTgError = (msg: string) => { const el = document.getElementById("tg-login-error"); if (el) { el.textContent = msg; el.removeAttribute("hidden"); } };
    window.onTelegramAuth = async (user: any) => {
      try {
        // Используем session-based endpoint
        const res = await fetch("/api/auth/telegram/login-widget-session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ user }),
        });

        if (res.ok) {
          const data = await res.json();

          if (data.session && data.user) {
            sessionAuth.saveSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              user_id: data.user.id,
              expires_at: parseSupabaseExpiry(data.session.expires_at)
            });

            console.log("[Telegram Login] Session saved, redirecting to home");
            location.href = "/";
          } else {
            showTgError("Ошибка авторизации: некорректный ответ сервера");
          }
        } else {
          const errorText = await res.text().catch(() => "Unknown error");
          console.error("[Telegram Login] Auth failed:", errorText);
          showTgError("Ошибка авторизации Telegram");
        }
      } catch (error) {
        console.error("[Telegram Login] Error:", error);
        showTgError("Ошибка при авторизации");
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
  }, [botUsername]);

  return (
    <div>
      <div id="tg-login-container" />
      <p id="tg-login-error" hidden className="mt-2 text-sm text-red-600 text-center" />
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { sessionAuth } from "@/lib/tma/session-auth";

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
            // Правильно парсим дату истечения
            let expiresAt: number;
            if (typeof data.session.expires_at === 'number') {
              const timestamp = data.session.expires_at;
              expiresAt = timestamp < 2000000000 ? timestamp * 1000 : timestamp;
            } else if (typeof data.session.expires_at === 'string') {
              expiresAt = new Date(data.session.expires_at).getTime();
            } else {
              expiresAt = Date.now() + (60 * 60 * 1000); // 1 час
            }

            // Сохраняем сессию в sessionStorage
            sessionAuth.saveSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              user_id: data.user.id,
              expires_at: expiresAt
            });

            console.log("[Telegram Login] Session saved, redirecting to home");
            location.href = "/";
          } else {
            alert("Ошибка авторизации: некорректный ответ сервера");
          }
        } else {
          const errorText = await res.text().catch(() => "Unknown error");
          console.error("[Telegram Login] Auth failed:", errorText);
          alert("Ошибка авторизации Telegram");
        }
      } catch (error) {
        console.error("[Telegram Login] Error:", error);
        alert("Ошибка при авторизации");
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

  return <div id="tg-login-container" />;
}

"use client";

import { useEffect } from "react";
import { sessionAuth } from "@/lib/tma/session-auth";
import { parseSupabaseExpiry } from "@/lib/auth-utils";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Telegram login button with session storage support.
 *
 * При монтировании компонента регистрирует глобальный callback onTelegramAuth
 * и добавляет в контейнер скрипт виджета Telegram. При размонтировании
 * удаляет скрипт, очищает контейнер и удаляет callback, чтобы кнопка
 * не оставалась на других страницах.
 *
 * Визуально виджет Telegram — сторонний iframe: его нельзя стилизовать
 * изнутри, он приходит с чёрным фоном и фиксированной шириной, которая не
 * совпадает с соседней кнопкой Яндекса. Поэтому под настоящим iframe рисуется
 * наша pill-кнопка (см. .tg-login-frame в app/globals.css — растягивает
 * iframe на всю область и делает его прозрачным), а клик по-прежнему уходит
 * в настоящий виджет: авторизация, data-атрибуты и callback не меняются.
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
      container.replaceChildren();
      container.appendChild(script);
    }

    // a11y: у iframe, который вставляет сам виджет, нет title — подписываем
    // его для скринридеров, как только Telegram его создаст. Это не влияет
    // на поведение/параметры виджета, только на доступное имя элемента.
    let observer: MutationObserver | undefined;
    if (container) {
      observer = new MutationObserver(() => {
        const iframe = container.querySelector("iframe");
        if (iframe && !iframe.title) {
          iframe.title = "Войти через Telegram";
        }
      });
      observer.observe(container, { childList: true });
    }

    // функция очистки: удаляем скрипт и callback при размонтировании
    return () => {
      delete window.onTelegramAuth;
      observer?.disconnect();
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (container) {
        container.replaceChildren();
      }
    };
  }, [botUsername]);

  return (
    <div>
      <div className="relative h-12 w-full overflow-hidden rounded-full">
        {/* Видимая pill-кнопка — то, что реально видит пользователь. */}
        <div
          aria-hidden="true"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "pointer-events-none absolute inset-0 h-full w-full gap-2"
          )}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="12" fill="#229ED9" />
            <path
              d="M17.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.14-.259.259-.529.259l.188-2.667 4.994-4.512c.221-.196-.049-.304-.311-.108l-6.174 3.884-2.66-.833c-.579-.181-.591-.577.121-.854l10.395-4.008c.481-.184.898.117.744.847z"
              fill="white"
            />
          </svg>
          <span>Войти через Telegram</span>
        </div>
        {/* Настоящий виджет: невидимый (opacity:0 через .tg-login-frame),
            растянут на всю pill-кнопку, лежит сверху и принимает клик —
            авторизация идёт штатным путём виджета. */}
        <div id="tg-login-container" className="tg-login-frame absolute inset-0" />
      </div>
      <p id="tg-login-error" hidden className="mt-2 text-caption text-destructive text-center" />
    </div>
  );
}

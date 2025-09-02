"use client"

import { useEffect, useRef } from "react"
import Script from "next/script"

declare global {
  interface Window {
    onTelegramAuth?: (user: any) => void
  }
}

export function TelegramLoginButton({
  botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "modemorph_ai_bot", // без @, например: "modemorph_ai_bot"
}: { botUsername?: string } = {}) {
  const inited = useRef(false)

  useEffect(() => {
    if (inited.current) return
    inited.current = true

    // Глобальный callback должен существовать ДО загрузки скрипта виджета
    window.onTelegramAuth = async (user: any) => {
      // user содержит id, first_name, last_name, username, photo_url, auth_date, hash
      const res = await fetch("/api/auth/telegram/login-widget", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user }),
      })
      if (res.ok) location.href = "/"
      else alert("Telegram auth failed")
    }
  }, [])

  return (
    <>
      <div id="tg-login-container" />
      <Script
        id="tg-login-script"
        src="https://telegram.org/js/telegram-widget.js?22"
        strategy="afterInteractive"
        async
        data-telegram-login={botUsername}
        data-size="large"
        data-onauth="onTelegramAuth(user)" // имя глобальной функции
        data-request-access="write"
      />
    </>
  )
}

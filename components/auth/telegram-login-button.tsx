// components/auth/TelegramLoginButton.tsx
"use client"

import { useState } from "react"

// Кнопка для Web, использующая Telegram Login Widget (в браузере вне Mini App)
export function TelegramLoginButton() {
  const [loading, setLoading] = useState(false)

  // Встраиваем Telegram Login Widget и перехватываем данные
  const onClick = () => {
    // Открываем попап Telegram OAuth-like (на деле — виджет с подписью)
    // Схема: после удачного входа Telegram вызовет callback с user объектом.
    // Мы далее формируем initData вручную и отправляем на наш сервер для верификации.
    setLoading(true)
    // @ts-ignore
    window.TelegramLoginWidget = {
      dataOnauth: async function (user: any) {
        // Telegram на фронте не даёт hash/dataCheckString; берём из window.tgAuthData, поэтому ниже создаём виджет через script
        const initData = (window as any).__tg_initData as string
        const res = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData }),
        })
        setLoading(false)
        if (res.ok) location.href = "/"
        else alert("Telegram auth failed")
      },
    }

    // Подключаем скрипт виджета (заполняет __tg_initData)
    const s = document.createElement("script")
    s.src = `https://telegram.org/js/telegram-widget.js?22`
    s.async = true
    s.setAttribute("data-telegram-login", process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME!)
    s.setAttribute("data-size", "large")
    s.setAttribute("data-request-access", "write")
    s.setAttribute("data-userpic", "true")
    s.setAttribute("data-onauth", "TelegramLoginWidget.dataOnauth(user)")
    s.onload = () => {
      // В некоторых окружениях полезно сохранить initData
      ;(window as any).__tg_initData = (window as any).Telegram?.Login?.initParams || ""
    }
    document.body.appendChild(s)
  }

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md border px-4 py-2"
      disabled={loading}
    >
      {loading ? "..." : "Войти через Telegram"}
    </button>
  )
}

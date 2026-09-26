import type { MetadataRoute } from "next"

// PWA: "Установить приложение" на Android и "На экран Домой" на iOS открывают
// веб-версию без Telegram, в своём окне. Кнопки — lib/pwa.ts + вкладка
// «Уведомления» в профиле.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ModeMorph — умный гардероб",
    short_name: "ModeMorph",
    description: "Создавайте стильные образы с помощью ИИ",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#2B2B2B",
    theme_color: "#2B2B2B",
    lang: "ru",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}

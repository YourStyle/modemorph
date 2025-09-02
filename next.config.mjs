/** @type {import('next').NextConfig} */
// Добавляем CSP/headers для Telegram Login Widget + сохраняем текущие опции.
const isProd = process.env.NODE_ENV === "production"

const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://telegram.org https://oauth.telegram.org",
  "style-src 'self' 'unsafe-inline' https://telegram.org",
  "font-src 'self' data: https://telegram.org",
  "script-src 'self' 'unsafe-inline' https://telegram.org",
  "connect-src 'self' https://telegram.org https://oauth.telegram.org",
  "frame-src 'self' https://telegram.org https://oauth.telegram.org",
].join("; ")

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // В проде отдаем заголовки, чтобы не блокировался iframe/скрипт Telegram
  async headers() {
    if (!isProd) return []
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ]
  },
}

export default nextConfig

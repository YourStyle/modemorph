/** @type {import('next').NextConfig} */
// CSP с учётом dev-режима: в development добавляем 'unsafe-eval' (и 'wasm-unsafe-eval'),
// иначе Next/React dev overlay и sourcemaps ломаются под жёстким CSP.

const isProd = process.env.NODE_ENV === "production"
const isDev = !isProd

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "https://telegram.org",
  // Разрешаем eval ТОЛЬКО в dev-режиме (для next dev overlay / sourcemaps)
  isDev ? "'unsafe-eval' 'wasm-unsafe-eval'" : "",
].filter(Boolean).join(" ")

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline' https://telegram.org",
  "img-src 'self' data: blob: https://telegram.org https://oauth.telegram.org",
  "font-src 'self' data: https://telegram.org",
  "connect-src 'self' https://telegram.org https://oauth.telegram.org",
  "frame-src 'self' https://telegram.org https://oauth.telegram.org",
  "worker-src 'self' blob:",
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
  async headers() {
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

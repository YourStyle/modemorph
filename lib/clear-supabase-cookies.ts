import { NextResponse } from "next/server"

function getProjectRefFromUrl(url: string | undefined) {
  if (!url) return null
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i)
  return m?.[1] || null
}

/**
 * Возвращает корневой домен вида ".modemorph.ru" по hostname.
 * Для localhost/IPv4/IPv6 возвращает undefined (нельзя ставить domain).
 */
export function guessCookieDomain(hostname?: string): string | undefined {
  if (!hostname) return undefined
  const host = hostname.split(":")[0].toLowerCase()
  if (host === "localhost" || /^[\d.:]+$/.test(host)) return undefined
  const parts = host.split(".")
  if (parts.length < 2) return undefined
  return `.${parts.slice(-2).join(".")}`
}

type ClearOpts = { domain?: string }

/**
 * Добавляет в ответ Set-Cookie для жёсткого удаления всех supabase-кук.
 * Чистим разные комбинации SameSite/Domain, чтобы гарантированно перекрыть оригиналы.
 */
export function attachSupabaseCookieClears(res: NextResponse, opts?: ClearOpts) {
  const projectRef = getProjectRefFromUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  )

  const names = new Set<string>([
    // legacy/на всякий
    "supabase-auth-token",
    "sb-access-token",
    "sb-refresh-token",
  ])

  if (projectRef) {
    names.add(`sb-${projectRef}-auth-token`)
    names.add(`sb-${projectRef}-auth-token.0`)
    names.add(`sb-${projectRef}-auth-token.1`)
  }

  const domains = [undefined, opts?.domain].filter(Boolean) as string[]
  const sameSites: Array<"lax" | "none"> = ["lax", "none"]

  for (const name of names) {
    // host-only варианты
    for (const ss of sameSites) {
      res.cookies.set({
        name,
        value: "",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: ss,
        expires: new Date(0),
        maxAge: 0,
      })
    }
    // domain-варианты (если есть)
    for (const domain of domains) {
      for (const ss of sameSites) {
        res.cookies.set({
          name,
          value: "",
          path: "/",
          httpOnly: true,
          secure: true,
          sameSite: ss,
          domain,
          expires: new Date(0),
          maxAge: 0,
        })
      }
    }
  }
  return res
}

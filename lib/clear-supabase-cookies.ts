// app/lib/clear-supabase-cookies.ts
import { NextResponse } from "next/server"

function getProjectRefFromUrl(url: string | undefined) {
  if (!url) return null
  // пример: https://cipjxxtdmfhoqixtiruy.supabase.co
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i)
  return m?.[1] || null
}

export function attachSupabaseCookieClears(res: NextResponse) {
  const projectRef = getProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
  // базовые имена + расщеплённые
  const names = new Set<string>([
    "supabase-auth-token",            // старое имя (на всякий случай)
    "sb-access-token",                // иногда встречается
    "sb-refresh-token",               // иногда встречается
  ])

  if (projectRef) {
    names.add(`sb-${projectRef}-auth-token`)
    names.add(`sb-${projectRef}-auth-token.0`)
    names.add(`sb-${projectRef}-auth-token.1`)
  }

  // Жёстко гасим (истёкшая дата)
  for (const name of names) {
    res.cookies.set({
      name,
      value: "",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      expires: new Date(0),
      // domain устанавливать не обязательно; если используешь поддомены — поставь ".modemorph.ru"
      // domain: ".modemorph.ru",
    })
  }

  return res
}

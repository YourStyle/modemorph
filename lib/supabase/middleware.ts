// middleware.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const FORCE: CookieOptions = {
  sameSite: "none",
  secure: true,
  domain: ".modemorph.ru",
  path: "/",
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Удаляем host-only/«левые» варианты и ставим куки с одинаковыми атрибутами
          cookiesToSet.forEach(({ name, value, options }) => {
            // снести возможный host-only дубликат
            response.cookies.set(name, "", { path: "/", maxAge: 0 })
            // поставить правильную версию
            response.cookies.set(name, value, { ...options, ...FORCE })
          })
        },
      },
    }
  )

  await supabase.auth.getSession()
  return response
}

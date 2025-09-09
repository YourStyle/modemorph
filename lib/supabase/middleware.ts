// middleware.ts
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { CookieOptions } from "@supabase/ssr"

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const force: CookieOptions = {
    sameSite: "none",
    secure: true,
    domain: ".modemorph.ru",
    path: "/",
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Сначала удалим возможные «host-only» дубликаты,
          // затем поставим правильные куки с нужными атрибутами.
          cookiesToSet.forEach(({ name, value, options }) => {
            // удалить host-only вариант
            response.cookies.set(name, "", { path: "/", maxAge: 0 })
            // поставить нормализованную куку
            response.cookies.set(name, value, { ...options, ...force })
          })
        },
      },
    },
  )

  await supabase.auth.getSession()
  return response
}

// lib/auth-server.ts
// Универсальный server-side auth helper для session-based авторизации

import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

export interface AuthUser {
  id: string
  email?: string
  user_metadata?: Record<string, any>
}

export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  try {
    // Получаем токен из Authorization header
    const authHeader = req.headers.get("authorization")
    const token = authHeader?.replace("Bearer ", "")

    if (!token) {
      console.log("[Auth Server] No Authorization token provided")
      return null
    }

    console.log("[Auth Server] Using token from Authorization header")
    return await getUserFromToken(token)

  } catch (error) {
    console.error("[Auth Server] Auth error:", error)
    return null
  }
}

async function getUserFromToken(token: string): Promise<AuthUser | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const supabase = createClient(supabaseUrl, anonKey)
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      console.log("[Auth Server] Invalid token:", error?.message)
      return null
    }

    console.log("[Auth Server] User authenticated via token:", user.id)
    return {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata
    }
  } catch (error) {
    console.error("[Auth Server] Token auth error:", error)
    return null
  }
}


// Middleware для проверки авторизации
export function requireAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return async (req: NextRequest): Promise<Response> => {
    const user = await getAuthUser(req)

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      })
    }

    return handler(req, user)
  }
}
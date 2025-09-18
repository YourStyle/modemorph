// lib/supabase/server.ts
import { cookies, headers } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";

type Role = "anon" | "service";

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function isSupabaseConfigured(): boolean {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return !!(url && anonKey && url.trim() && anonKey.trim());
  } catch {
    return false;
  }
}

export async function createClient(opts?: { role?: Role; token?: string }) {
  const url = must("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = must("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  // Сервисный клиент без сессии
  if (opts?.role === "service") {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new Error("Missing env: SUPABASE_SERVICE_ROLE or SUPABASE_SERVICE_ROLE_KEY");
    }
    return createAdminClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // Для обычного клиента
  const cookieStore = await cookies();
  const hdrs = await headers();
  const token = opts?.token;

  // Собираем глобальные заголовки
  const globalHeaders: Record<string, string> = {};
  if (token) {
    globalHeaders["Authorization"] = `Bearer ${token}`;
  }
  const xff = hdrs.get("x-forwarded-for");
  const ua = hdrs.get("user-agent");
  if (xff) globalHeaders["x-forwarded-for"] = xff;
  if (ua) globalHeaders["user-agent"] = ua;

  return createServerClient(url, anonKey, {
    // глобальные заголовки будут автоматически прикрепляться к каждому запросу Supabase
    global: { headers: globalHeaders },
    // Управление куками: читаем старые, но не записываем новые (чтобы не ставить кросс-доменные куки)
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        // no-op — не устанавливаем куки
      },
      remove(name: string, options: CookieOptions) {
        // no-op — не удаляем куки
      },
    },
  });
}

// app/api/auth/telegram/miniapp/route.ts
// Верификация Telegram Mini App initData по raw-строке, создание/вход в Supabase.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";

// --- helpers ---

function requireEnv(...keys: string[]) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
}
function requireEnvAtLeastOne(...keys: string[]) {
  if (!keys.some((k) => !!process.env[k])) {
    throw new Error(`Missing env: one of [${keys.join(", ")}]`);
  }
}
function isFreshUnix(authDate: number, maxAgeSec = 24 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000);
  return authDate > 0 && now - authDate <= maxAgeSec;
}
function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex");
}

/**
 * Корректная проверка WebApp initData по raw-строке:
 * 1) Берём initData как есть (raw).
 * 2) Удаляем `hash` (и возможный `signature`).
 * 3) Сортируем пары по ключу.
 * 4) Собираем data_check_string как "k=v" с '\n' между.
 * 5) secret_key = HMAC_SHA256(key="WebAppData", data=BOT_TOKEN)
 * 6) check_hash = HMAC_SHA256(key=secret_key, data=data_check_string)
 */
function verifyMiniAppInitDataRaw(rawInitData: string, botToken: string): { ok: boolean; reason?: string } {
  try {
    // Разбиваем на пары в сыром виде, без декодинга.
    const parts = rawInitData.split("&").filter(Boolean);

    // Извлекаем и удаляем hash
    const hashIdx = parts.findIndex((p) => p.startsWith("hash="));
    if (hashIdx < 0) return { ok: false, reason: "hash missing" };
    const receivedHash = parts[hashIdx].slice("hash=".length);
    parts.splice(hashIdx, 1);

    // Игнорируем возможный 'signature=' из некоторых клиентов
    const sigIdx = parts.findIndex((p) => p.startsWith("signature="));
    if (sigIdx >= 0) parts.splice(sigIdx, 1);

    // TTL проверим отдельно из распарсенной версии
    const sp = new URLSearchParams(rawInitData);
    const authDate = Number(sp.get("auth_date") || 0);
    if (!isFreshUnix(authDate)) return { ok: false, reason: "expired" };

    // Сортировка по ключу
    parts.sort((a, b) => {
      const [ka] = a.split("=", 1);
      const [kb] = b.split("=", 1);
      return ka.localeCompare(kb);
    });

    // data_check_string: join по '\n' БЕЗ декодинга
    const dataCheckString = parts.join("\n");

    // secret_key = HMAC_SHA256(key="WebAppData", data=BOT_TOKEN)
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();

    // check_hash = HMAC_SHA256(key=secret_key, data=data_check_string)
    const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    // Сравнение безопасно
    const ok =
      receivedHash.length === computed.length &&
      crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(receivedHash, "hex"));

    return ok ? { ok: true } : { ok: false, reason: "hmac mismatch" };
  } catch {
    return { ok: false, reason: "exception" };
  }
}

// Точный поиск пользователя по email через REST Admin без пагинации
async function getUserIdByEmailREST(supabaseUrl: string, serviceRole: string, email: string): Promise<string | null> {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
  });
  if (!resp.ok) {
    if (resp.status === 404) return null;
    const txt = await resp.text().catch(() => "");
    throw new Error(`Admin REST get by email failed: ${resp.status} ${txt}`);
  }
  const json = await resp.json().catch(() => null);
  const user = Array.isArray(json) ? json[0] : json;
  return user?.id ?? null;
}

// --- handler ---

export async function POST(req: NextRequest) {
  try {
    requireEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_PEPPER", "SUPABASE_URL", "SUPABASE_ANON_KEY");
    requireEnvAtLeastOne("SUPABASE_SERVICE_ROLE", "SUPABASE_SERVICE_ROLE_KEY");

    const botToken = process.env.TELEGRAM_BOT_TOKEN!;
    const pepper = process.env.TELEGRAM_PEPPER!;
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const { initData, initDataUnsafe } = await req.json();

    if (typeof initData !== "string" || !initData) {
      return NextResponse.json({ error: "Bad payload: initData required" }, { status: 400 });
    }

    // КРИТИЧЕСКОЕ место: валидация по RAW initData
    const v = verifyMiniAppInitDataRaw(initData, botToken);
    if (!v.ok) {
      return NextResponse.json({ error: "Invalid initData", reason: v.reason ?? "unknown" }, { status: 401 });
    }

    // Достаём user (из unsafe объекта либо парсим из raw)
    let tUser:
      | { id: number | string; first_name?: string; last_name?: string; username?: string; photo_url?: string }
      | null = null;

    if (initDataUnsafe?.user) {
      tUser = initDataUnsafe.user;
    } else {
      const sp = new URLSearchParams(initData);
      const userJson = sp.get("user");
      if (userJson) {
        try {
          tUser = JSON.parse(userJson);
        } catch {}
      }
    }

    if (!tUser?.id) {
      return NextResponse.json({ error: "User not found in initData" }, { status: 400 });
    }

    const email = `${String(tUser.id)}@telegram.local`;
    const password = derivedPassword(String(tUser.id), pepper);

    const supabase = createClient();           // anon
    const admin = createClient({ role: "service" }); // service

    // Пробуем sign-in
    {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (data?.session && !error) return NextResponse.json({ success: true });
    }

    // Создание
    const fullName =
      [tUser.first_name, tUser.last_name].filter(Boolean).join(" ").trim() || tUser.username || "";
    const avatarUrl = tUser.photo_url || null;

    const { data: created, error: createErr } = await (admin as any).auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        provider: "telegram",
        telegram_id: String(tUser.id),
        telegram_username: tUser.username ?? null,
        telegram_first_name: tUser.first_name ?? null,
        telegram_last_name: tUser.last_name ?? null,
        telegram_photo_url: avatarUrl,
        full_name: fullName || null,
        avatar_url: avatarUrl,
      },
    });

    if (!createErr && created?.user?.id) {
      const uid = created.user.id as string;
      await (admin as any).from("user_profiles").update({ full_name: fullName || null, avatar_url: avatarUrl }).eq("user_id", uid);
      const retry = await supabase.auth.signInWithPassword({ email, password });
      if (retry.error || !retry.data?.session) {
        return NextResponse.json({ error: retry.error?.message || "Auth failed" }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    // Конфликт — найдём по email и обновим пароль
    const userId = await getUserIdByEmailREST(supabaseUrl, serviceRole, email);
    if (!userId) {
      return NextResponse.json(
        { error: `Could not locate existing user by email; createUser error: ${createErr?.message || "unknown"}` },
        { status: 500 },
      );
    }

    const upd = await (admin as any).auth.admin.updateUserById(userId, { password });
    if (upd?.error) {
      return NextResponse.json({ error: upd.error?.message || "Password update failed" }, { status: 500 });
    }

    await (admin as any).from("user_profiles").update({ full_name: fullName || null, avatar_url: avatarUrl }).eq("user_id", userId);

    const retry2 = await supabase.auth.signInWithPassword({ email, password });
    if (retry2.error || !retry2.data?.session) {
      return NextResponse.json({ error: retry2.error?.message || "Auth failed" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server misconfigured" }, { status: 500 });
  }
}

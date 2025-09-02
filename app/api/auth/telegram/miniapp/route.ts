// app/api/auth/telegram/miniapp/route.ts
// Верификация Telegram Mini App initData с «двойным» построением data_check_string:
// 1) decoded-вариант (RFC3986, с заменой + → пробел) — это каноничный путь,
// 2) raw-вариант (без декодинга) — на случай несовпадений из-за экзотичных клиентов.
// Для помощи в дебаге в non-production режиме возвращаем вычисленные HMAC’ы (без секретов).
// После успешной верификации — создание/вход в Supabase и апдейт профиля.
//
// ВНИМАНИЕ: в production не логируйте и не возвращайте отладочные поля.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";

// ====================== helpers ======================

// Требуем обязательные переменные окружения
function requireEnv(...keys: string[]) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
}
function requireEnvAtLeastOne(...keys: string[]) {
  if (!keys.some((k) => !!process.env[k])) {
    throw new Error(`Missing env: one of [${keys.join(", ")}]`);
  }
}

// TTL для auth_date
function isFreshUnix(authDate: number, maxAgeSec = 24 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000);
  return authDate > 0 && now - authDate <= maxAgeSec;
}

// Детерминированный пароль из telegram_id + PEPPER
function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex");
}

// HMAC(secret, data) → hex
function hmacHex(secret: Buffer, data: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

// Секрет для MiniApp: secret_key = HMAC_SHA256(key="WebAppData", data=BOT_TOKEN)
function miniAppSecret(botToken: string) {
  return crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
}

// Секрет Login Widget (для сравнения/диагностики): secret = SHA256(bot_token)
function widgetSecret(botToken: string) {
  return crypto.createHash("sha256").update(botToken).digest();
}

// Построение data_check_string (decoded-вариант): RFC3986 decode + замена '+' → ' '
function buildDataCheckStringDecoded(raw: string) {
  const pairs = raw.split("&").filter(Boolean);
  const items: Array<[string, string]> = [];

  for (const p of pairs) {
    const eq = p.indexOf("=");
    const kRaw = eq >= 0 ? p.slice(0, eq) : p;
    const vRaw = eq >= 0 ? p.slice(eq + 1) : "";

    const k = decodeURIComponent(kRaw.replace(/\+/g, "%20"));
    const v = decodeURIComponent(vRaw.replace(/\+/g, "%20"));
    if (k === "hash" || k === "signature") continue;

    items.push([k, v]);
  }

  items.sort(([a], [b]) => a.localeCompare(b));
  return items.map(([k, v]) => `${k}=${v}`).join("\n");
}

// Построение data_check_string (raw-вариант): без декодинга, как есть
function buildDataCheckStringRaw(raw: string) {
  const parts = raw.split("&").filter(Boolean);
  // Удаляем hash/signature
  const filtered = parts.filter((p) => !p.startsWith("hash=") && !p.startsWith("signature="));
  // Сортируем по имени ключа (до первого '=')
  filtered.sort((a, b) => {
    const ka = a.split("=", 1)[0];
    const kb = b.split("=", 1)[0];
    return ka.localeCompare(kb);
  });
  return filtered.join("\n");
}

// Универсальная проверка initData c диагностикой
function verifyInitDataWithDiagnostics(rawInitData: string, botToken: string) {
  const url = new URLSearchParams(rawInitData);
  const receivedHash = url.get("hash") || "";

  const authDate = Number(url.get("auth_date") || 0);
  if (!isFreshUnix(authDate)) return { ok: false, reason: "expired" as const };

  const secretMini = miniAppSecret(botToken);
  const secretWidget = widgetSecret(botToken);

  // decoded-путь (каноничный)
  const dcsDecoded = buildDataCheckStringDecoded(rawInitData);
  const hDecodedMini = hmacHex(secretMini, dcsDecoded);
  const hDecodedWidget = hmacHex(secretWidget, dcsDecoded);

  // raw-путь (на случай нестандартной передачи)
  const dcsRaw = buildDataCheckStringRaw(rawInitData);
  const hRawMini = hmacHex(secretMini, dcsRaw);
  const hRawWidget = hmacHex(secretWidget, dcsRaw);

  // Сравнение по MiniApp-секрету (допускаем decoded и raw)
  const okMiniDecoded =
    receivedHash.length === hDecodedMini.length &&
    crypto.timingSafeEqual(Buffer.from(hDecodedMini, "hex"), Buffer.from(receivedHash, "hex"));
  const okMiniRaw =
    receivedHash.length === hRawMini.length &&
    crypto.timingSafeEqual(Buffer.from(hRawMini, "hex"), Buffer.from(receivedHash, "hex"));

  // Возвращаем результат + диагностические вычисления (для dev)
  const ok = okMiniDecoded || okMiniRaw;
  const reason = ok ? undefined : ("hmac mismatch" as const);

  return {
    ok,
    reason,
    diag: {
      receivedHash,
      // Ниже поля только для локального дебага. В проде не возвращайте!
      hDecodedMini,
      hRawMini,
      hDecodedWidget,
      hRawWidget,
      dcsDecodedPreview: dcsDecoded.slice(0, 280),
      dcsRawPreview: dcsRaw.slice(0, 280),
      used: okMiniDecoded ? "decoded+Mini" : okMiniRaw ? "raw+Mini" : "none",
    },
  };
}

// Поиск пользователя по email через REST Admin (точный фильтр)
async function getUserIdByEmailREST(supabaseUrl: string, serviceRole: string, email: string): Promise<string | null> {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Admin REST failed: ${resp.status} ${t}`);
  }
  const js = await resp.json().catch(() => null);
  const user = Array.isArray(js) ? js[0] : js;
  return user?.id ?? null;
}

// ====================== handler ======================

export async function POST(req: NextRequest) {
  try {
    requireEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_PEPPER", "SUPABASE_URL", "SUPABASE_ANON_KEY");
    requireEnvAtLeastOne("SUPABASE_SERVICE_ROLE", "SUPABASE_SERVICE_ROLE_KEY");

    const botToken = process.env.TELEGRAM_BOT_TOKEN!;
    const pepper = process.env.TELEGRAM_PEPPER!;
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const isDev = process.env.NODE_ENV !== "production";

    // Ждём: initData (raw-строка), initDataUnsafe (необязательно — для удобства извлечения user)
    const { initData, initDataUnsafe } = await req.json();

    if (typeof initData !== "string" || !initData) {
      return NextResponse.json({ error: "Bad payload: initData required" }, { status: 400 });
    }

    // Верификация с диагностикой
    const v = verifyInitDataWithDiagnostics(initData, botToken);
    if (!v.ok) {
      // В режиме разработки возвращаем вычисленные HMAC’ы, чтобы сравнить глазами.
      return NextResponse.json(
        isDev
          ? { error: "Invalid initData", reason: v.reason, diag: v.diag }
          : { error: "Invalid initData", reason: v.reason },
        { status: 401 },
      );
    }

    // Извлекаем user (предпочтительно из unsafe)
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
        } catch {
          tUser = null;
        }
      }
    }
    if (!tUser?.id) {
      return NextResponse.json({ error: "User not found in initData" }, { status: 400 });
    }

    const email = `${String(tUser.id)}@telegram.local`;
    const password = derivedPassword(String(tUser.id), pepper);

    const supabase = createClient(); // anon
    const admin = createClient({ role: "service" }); // service

    // 1) Пробуем вход
    {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (data?.session && !error) return NextResponse.json({ success: true });
    }

    // 2) Создаём пользователя
    const fullName =
      [tUser.first_name, tUser.last_name].filter(Boolean).join(" ").trim() || tUser.username || `tg_${tUser.id}`;
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
      await (admin as any)
        .from("user_profiles")
        .update({ full_name: fullName || null, avatar_url: avatarUrl })
        .eq("user_id", uid);

      const retry = await supabase.auth.signInWithPassword({ email, password });
      if (retry.error || !retry.data?.session) {
        return NextResponse.json({ error: retry.error?.message || "Auth failed" }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    // 3) Конфликт: ищем по email и обновляем пароль
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

    await (admin as any)
      .from("user_profiles")
      .update({ full_name: fullName || null, avatar_url: avatarUrl })
      .eq("user_id", userId);

    const retry2 = await supabase.auth.signInWithPassword({ email, password });
    if (retry2.error || !retry2.data?.session) {
      return NextResponse.json({ error: retry2.error?.message || "Auth failed" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server misconfigured" }, { status: 500 });
  }
}

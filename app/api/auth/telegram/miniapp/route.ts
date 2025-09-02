// app/api/auth/telegram/miniapp/route.ts
// Верификация Telegram Mini App initData (алгоритм WebAppData), создание/вход в Supabase,
// корректная обработка коллизий и заполнение профиля (full_name, avatar_url).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";

// ---------- utils ----------

// Требуем обязательные переменные окружения
function requireEnv(...keys: string[]) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
}

// Требуем хотя бы одну из переменных окружения
function requireEnvAtLeastOne(...keys: string[]) {
  if (!keys.some((k) => !!process.env[k])) {
    throw new Error(`Missing env: one of [${keys.join(", ")}]`);
  }
}

// Безопасное ограничение «свежести» initData (по auth_date)
function isFreshUnix(authDate: number, maxAgeSec = 24 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000);
  return authDate > 0 && now - authDate <= maxAgeSec;
}

// Детерминированный пароль на основе Telegram ID + PEPPER
function derivedPassword(telegramId: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(telegramId).digest("hex");
}

// ----- ВЕРИФИКАЦИЯ initData ДЛЯ MINI APP (НЕ LOGIN WIDGET) -----
// Алгоритм по спецификации WebAppData:
// secret_key = HMAC_SHA256(key="WebAppData", message=BOT_TOKEN)
// check_hash  = HMAC_SHA256(key=secret_key, message=data_check_string)
// где data_check_string — это отсортированные по ключу пары "k=v", склеенные \n.
// Из набора удаляем служебные "hash" и (на практике) "signature", если он присутствует.
function verifyMiniAppInitData(rawInitData: string, botToken: string): { ok: boolean; reason?: string } {
  try {
    // Парсим строку поиска без каких-либо трансформаций ключей.
    const params = new URLSearchParams(rawInitData);

    // Достаём hash, удаляем его из набора.
    const receivedHash = params.get("hash") || "";
    params.delete("hash");

    // В ряде клиентов встречается параметр "signature" — его игнорируем.
    if (params.has("signature")) params.delete("signature");

    // Дополнительно убедимся, что присутствует auth_date (для TTL-проверки).
    const authDateStr = params.get("auth_date");
    const authDate = authDateStr ? Number(authDateStr) : 0;
    if (!isFreshUnix(authDate)) return { ok: false, reason: "expired" };

    // Строго сортируем по ключу (Node >=18 поддерживает URLSearchParams.sort()).
    params.sort();

    // Сборка data_check_string вида "k=v\nk=v..."
    const dataCheckString = Array.from(params.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    // Вычисляем secret_key и итоговый HMAC в hex.
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const checkHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    // Сравниваем строго, без toLowerCase — Telegram присылает hex в нижнем регистре.
    const ok = crypto.timingSafeEqual(Buffer.from(checkHash, "hex"), Buffer.from(receivedHash, "hex"));
    return ok ? { ok: true } : { ok: false, reason: "hmac mismatch" };
  } catch (e) {
    return { ok: false, reason: "exception" };
  }
}

// Админ REST: точечный поиск пользователя по email (без пагинации)
async function getUserIdByEmailREST(supabaseUrl: string, serviceRole: string, email: string): Promise<string | null> {
  const url = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
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

export async function POST(req: NextRequest) {
  try {
    // Обязательные env
    requireEnv("TELEGRAM_BOT_TOKEN", "TELEGRAM_PEPPER", "SUPABASE_URL", "SUPABASE_ANON_KEY");
    requireEnvAtLeastOne("SUPABASE_SERVICE_ROLE", "SUPABASE_SERVICE_ROLE_KEY");

    const serviceRole = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseUrl = process.env.SUPABASE_URL!;
    const botToken = process.env.TELEGRAM_BOT_TOKEN!;
    const pepper = process.env.TELEGRAM_PEPPER!;

    // Ожидаем «сырой» initData (строка, как в window.Telegram.WebApp.initData).
    // initDataUnsafe можно прислать дополнительно для удобного доступа к user, но подписывать нужно именно raw initData.
    const { initData, initDataUnsafe } = await req.json();

    if (typeof initData !== "string" || !initData.length) {
      return NextResponse.json({ error: "Bad payload: initData required" }, { status: 400 });
    }

    // Верификация по алгоритму WebAppData
    const validation = verifyMiniAppInitData(initData, botToken);
    if (!validation.ok) {
      return NextResponse.json(
        { error: "Invalid initData", reason: validation.reason ?? "unknown" },
        { status: 401 },
      );
    }

    // Извлекаем пользователя. Предпочитаем initDataUnsafe.user (объект),
    // иначе парсим "user" из строки initData (это JSON).
    let tUser:
      | {
          id: number | string;
          first_name?: string;
          last_name?: string;
          username?: string;
          photo_url?: string;
        }
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

    // Формируем учётку и пароль
    const telegramId = String(tUser.id);
    const email = `${telegramId}@telegram.local`;
    const password = derivedPassword(telegramId, pepper);

    // Клиенты Supabase
    const supabase = createClient(); // anon — для signIn
    const admin = createClient({ role: "service" }); // service — для админ-операций

    // Попытка входа, если пользователь уже существует
    {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (data?.session && !error) {
        return NextResponse.json({ success: true });
      }
    }

    // Создание пользователя
    const fullName = [tUser.first_name, tUser.last_name].filter(Boolean).join(" ").trim() || tUser.username || "";
    const avatarUrl = tUser.photo_url || null;

    const { data: created, error: createErr } = await (admin as any).auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // Заполняем metadata — пригодится на стороне БД/триггеров
      user_metadata: {
        provider: "telegram",
        telegram_id: telegramId,
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

      // Обновим профиль (если триггер уже создал строку) значениями full_name и avatar_url
      // Выполняем через сервисный ключ, чтобы обойти RLS.
      await (admin as any)
        .from("user_profiles")
        .update({ full_name: fullName || null, avatar_url: avatarUrl })
        .eq("user_id", uid);

      // Вход после создания
      const retry = await supabase.auth.signInWithPassword({ email, password });
      if (retry.error || !retry.data?.session) {
        return NextResponse.json({ error: retry.error?.message || "Auth failed" }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    // Если создать не удалось (например, конфликт) — найдём по email и обновим пароль
    const userId = await getUserIdByEmailREST(supabaseUrl, serviceRole, email);
    if (!userId) {
      return NextResponse.json(
        { error: `Could not locate existing user by email; createUser error: ${createErr?.message || "unknown"}` },
        { status: 500 },
      );
    }

    // Обновляем пароль существующему пользователю
    const upd = await (admin as any).auth.admin.updateUserById(userId, { password });
    if (upd?.error) {
      return NextResponse.json({ error: upd.error?.message || "Password update failed" }, { status: 500 });
    }

    // На всякий случай обновим профиль (full_name, avatar_url)
    await (admin as any)
      .from("user_profiles")
      .update({ full_name: fullName || null, avatar_url: avatarUrl })
      .eq("user_id", userId);

    // Пробуем войти снова
    const retry2 = await supabase.auth.signInWithPassword({ email, password });
    if (retry2.error || !retry2.data?.session) {
      return NextResponse.json({ error: retry2.error?.message || "Auth failed" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server misconfigured" }, { status: 500 });
  }
}

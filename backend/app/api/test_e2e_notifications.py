# -*- coding: utf-8 -*-
"""E2E исходящих сообщений: ежедневный авто-пуш (cron auto-push), ежечасная
сводка ошибок админам (cron error-digest) и рассылка из админки
(/api/admin/broadcast).

Telegram Bot API и Web Push стоят на заглушках (world.tg — тела sendMessage,
world.push — POST на endpoint подписки). Проверяется: кому ушло, что именно
ушло (текст, parse_mode, кнопка с deep link), что записано в базу и что
повторный запуск не шлёт то же самое второй раз.

База общая для всех модулей, поэтому кроны видят и чужих пользователей —
все проверки фильтруют сообщения по chat_id своих людей.
"""

import os
import sys
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path = [p for p in sys.path if os.path.abspath(p or ".") != HERE]
sys.path.insert(0, os.path.join(HERE, "..", ".."))

import pytest  # noqa: E402

if "DATABASE_URL" not in os.environ:
    pytest.skip("нужен живой Postgres — см. scripts/e2e-local.sh", allow_module_level=True)

from app.api.e2e_harness import *  # noqa: E402,F401,F403
from app.api.e2e_harness import (  # noqa: E402
    add_item, cron, give_plan, jmeta, make_user, push_keys, q, q1, set_telegram_id, sql_run,
)

APP_LINK = "https://t.me/modemorph_ai_bot?startapp="


def _to(world, chat_ids) -> dict[str, list[dict]]:
    """sendMessage по нашим chat_id: {chat_id: [payload, ...]}."""
    ids = {str(c) for c in chat_ids}
    out: dict[str, list[dict]] = {c: [] for c in ids}
    for m in world.tg:
        if str(m.get("chat_id")) in ids:
            out[str(m["chat_id"])].append(m)
    return out


def _age(user, days: int, *, active_days_ago: int | None = None):
    """Профиль «зарегистрирован N дней назад», последняя активность — M дней назад
    (или никогда). Любой запрос с токеном трогает daily_user_activity, поэтому
    историю активности пишем после всех действий пользователя."""
    sql_run("UPDATE user_profiles SET created_at = NOW() - make_interval(days => $2) WHERE id = $1",
            user.pid, days)
    sql_run("DELETE FROM daily_user_activity WHERE user_profile_id = $1", user.pid)
    if active_days_ago is not None:
        sql_run("INSERT INTO daily_user_activity (user_profile_id, activity_date, first_seen_at, last_seen_at) "
                "VALUES ($1, (NOW() - make_interval(days => $2))::date, NOW() - make_interval(days => $2), "
                "NOW() - make_interval(days => $2))", user.pid, active_days_ago)


def _subscribe_push(user, endpoint: str):
    p256dh, auth = push_keys()
    sql_run("INSERT INTO push_subscriptions (user_profile_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)",
            user.pid, endpoint, p256dh, auth)


def _log(user):
    return q("SELECT * FROM auto_push_log WHERE user_profile_id = $1 ORDER BY id", user.pid)


# ─────────────────────────────── авто-пуш ───────────────────────────────

def test_auto_push_picks_right_people_and_templates_and_never_repeats(client, world):
    from app.api.cron import AUTO_PUSH_TEMPLATES as T

    empty = make_user()                 # 3 дня, гардероб пуст → empty_wardrobe
    no_outfit = make_user()             # вещи есть, образов нет, 5 дней без активности
    expiring = make_user()              # подписка кончается через 2 дня → sub_expiring
    fresh = make_user()                 # только что пришёл — рано
    tester = make_user()                # is_test — никогда
    muted = make_user()                 # выключил уведомления — никогда
    blocked = make_user()               # заблокировал бота — лог ok=false
    web = make_user()                   # без Telegram, только web push
    add_item(client, no_outfit, "Белая рубашка", "shirt")
    give_plan(expiring.pid, "monthly", days=2)

    tg = {u.id: set_telegram_id(u) for u in (empty, no_outfit, expiring, fresh, tester, muted, blocked)}
    for u in (empty, expiring, tester, muted, blocked):
        _age(u, 3)
    _age(no_outfit, 10, active_days_ago=5)
    _age(fresh, 0, active_days_ago=0)
    _age(web, 3)
    sql_run("UPDATE user_profiles SET is_test = true WHERE id = $1", tester.pid)
    sql_run("UPDATE user_profiles SET notifications_enabled = false WHERE id = $1", muted.pid)
    world.tg_fail[tg[blocked.id]] = "Forbidden: bot was blocked by the user"
    endpoint = f"https://fcm.googleapis.com/fcm/send/e2e-{uuid.uuid4().hex}"
    _subscribe_push(web, endpoint)

    # dry_run: план без единой отправки и без записей в журнал.
    dry = cron(client, "auto-push", {"dry_run": True, "cap": 100000})
    assert dry.status_code == 200 and dry.json()["dry_run"] is True
    assert world.tg == [] and world.push == []
    assert not any(_log(u) for u in (empty, no_outfit, expiring, web))

    r = cron(client, "auto-push", {"cap": 100000})
    assert r.status_code == 200, r.text

    expect = [(empty, "empty_wardrobe"), (no_outfit, "no_outfit"), (expiring, "sub_expiring"),
              (blocked, "empty_wardrobe")]
    got = _to(world, tg.values())
    for u, template in expect:
        [log] = _log(u)
        assert log["template"] == template, (u.id, log["template"])
        [msg] = got[tg[u.id]]
        assert msg["text"] == T[template]["text"] and msg["parse_mode"] == "HTML"
        assert msg["reply_markup"] == {"inline_keyboard": [[
            {"text": T[template]["button"], "url": f"{APP_LINK}ap{log['id']}"}]]}
        assert log["ok"] is (u is not blocked)
    for u in (fresh, tester, muted):
        assert got[tg[u.id]] == [] and _log(u) == [], "пуш ушёл тому, кому не положено"

    # Web push: один POST на endpoint подписки, журнал ok=true.
    [wlog] = _log(web)
    assert (wlog["template"], wlog["ok"]) == ("empty_wardrobe", True)
    [push] = [p for p in world.push if p["endpoint"] == endpoint]
    h = {k.lower(): v for k, v in push["headers"].items()}
    assert h["ttl"] == str(24 * 3600) and h["content-encoding"] == "aes128gcm"
    assert h["authorization"].startswith("vapid ") and push["size"] > 0

    # Второй запуск в тот же день: никому из них ничего не уходит повторно.
    world.tg.clear()
    world.push.clear()
    cron(client, "auto-push", {"cap": 100000})
    again = _to(world, [tg[u.id] for u in (empty, no_outfit, expiring)])
    assert all(v == [] for v in again.values()), f"повторная отправка: {again}"
    assert not [p for p in world.push if p["endpoint"] == endpoint]
    assert len(_log(empty)) == 1 and len(_log(web)) == 1


def test_auto_push_dead_web_subscription_is_removed(client, world):
    web = make_user()
    _age(web, 3)
    endpoint = f"https://updates.push.services.mozilla.com/wpush/v2/e2e-{uuid.uuid4().hex}"
    _subscribe_push(web, endpoint)
    world.push_status[endpoint] = 410          # браузер отписался

    cron(client, "auto-push", {"cap": 100000})
    [log] = _log(web)
    assert log["ok"] is False
    assert q1("SELECT count(*) AS n FROM push_subscriptions WHERE user_profile_id = $1", web.pid)["n"] == 0


def test_cron_endpoints_require_secret(client, world):
    for path in ("auto-push", "error-digest", "sync-feeds", "import-feeds", "process-feeds"):
        assert client.post(f"/api/cron/{path}", json={}).status_code == 401, path
        assert client.post(f"/api/cron/{path}", json={},
                           headers={"X-Cron-Secret": "wrong"}).status_code == 401, path
    assert world.tg == [] and not world.calls


# ──────────────────────────── сводка ошибок ────────────────────────────

def _admin_with_tg():
    admin = make_user(role="admin")
    return admin, set_telegram_id(admin)


def test_error_digest_groups_sends_to_admins_marks_rows_once(client, world):
    sql_run("UPDATE error_events SET digested = true WHERE NOT digested")  # чужие хвосты
    admin, admin_tg = _admin_with_tg()
    plain = make_user()
    plain_tg = set_telegram_id(plain)
    victim = make_user()

    for look in (123, 456):
        assert client.post("/api/client-errors", headers=victim.h, json={
            "location": f"/app/looks/{look}?tab=1", "message": "Сессия потеряна <script>",
            "status": 401}).json() == {"ok": True}
    client.post("/api/client-errors", json=[{"location": "/app/wardrobe", "message": "Failed to fetch"},
                                            {"location": "/x"}])       # без message — не пишется
    rows = q("SELECT * FROM error_events WHERE NOT digested ORDER BY id")
    assert len(rows) == 3 and str(rows[0]["user_id"]) == victim.id and rows[0]["source"] == "client"

    world.digest_tips = [{"i": 0, "tip": "Access-токен истёк, а refresh не сработал"}]
    r = cron(client, "error-digest")
    assert r.status_code == 200, r.text
    res = r.json()
    assert (res["errors"], res["groups"]) == (3, 2) and res["sent"] >= 1
    assert world.kinds().count("error_digest") == 1

    got = _to(world, [admin_tg, plain_tg])
    assert got[plain_tg] == [], "сводка ушла не-админу"
    [msg] = got[admin_tg]
    assert msg["parse_mode"] == "HTML"
    text = msg["text"]
    assert "3 шт., пользователей: 1" in text
    assert "📍 /app/looks/:id (браузер) — 2×, 1 польз." in text
    assert "Сессия потеряна &lt;script&gt;" in text and "<script>" not in text
    assert "💡 Access-токен истёк, а refresh не сработал" in text
    assert "📍 /app/wardrobe (браузер) — 1×" in text
    assert q1("SELECT count(*) AS n FROM error_events WHERE NOT digested")["n"] == 0

    # Тихий час: ни сообщения, ни запроса к Gemini.
    world.tg.clear()
    assert cron(client, "error-digest").json() == {"errors": 0, "sent": 0}
    assert world.tg == [] and world.kinds().count("error_digest") == 1


def test_error_digest_keeps_rows_when_telegram_is_down(client, world):
    sql_run("UPDATE error_events SET digested = true WHERE NOT digested")
    _, admin_tg = _admin_with_tg()
    client.post("/api/client-errors", json={"location": "/app", "message": "ChunkLoadError"})

    world.tg_down = True
    assert cron(client, "error-digest").json()["sent"] == 0
    assert q1("SELECT count(*) AS n FROM error_events WHERE NOT digested")["n"] == 1, \
        "строки помечены, хотя сводку никто не получил"

    world.tg_down = False
    world.tg.clear()
    world.digest_tips = "не JSON"            # Gemini ответил мусором — сводка уходит без советов
    res = cron(client, "error-digest").json()
    assert res["errors"] == 1 and res["sent"] >= 1
    [msg] = _to(world, [admin_tg])[admin_tg]
    assert "ChunkLoadError" in msg["text"] and "💡" not in msg["text"]
    assert q1("SELECT count(*) AS n FROM error_events WHERE NOT digested")["n"] == 0


# ──────────────────────────────── рассылка ────────────────────────────────

def test_broadcast_segments_telegram_and_web_push(client, world):
    admin = make_user(role="admin")
    sub, free, tester, muted, blocked, web = (make_user() for _ in range(6))
    give_plan(sub.pid)
    tg = {u.id: set_telegram_id(u) for u in (sub, free, tester, muted, blocked)}
    sql_run("UPDATE user_profiles SET is_test = true WHERE id = $1", tester.pid)
    sql_run("UPDATE user_profiles SET notifications_enabled = false WHERE id = $1", muted.pid)
    world.tg_fail[tg[blocked.id]] = "Forbidden: bot was blocked by the user"
    endpoint = f"https://fcm.googleapis.com/fcm/send/e2e-bc-{uuid.uuid4().hex}"
    _subscribe_push(web, endpoint)
    ours = list(tg.values())
    message = "<b>Осенняя капсула</b>\n\nСобрали 5 образов из ваших вещей"

    # Подписчики, кнопка на Mini App: к ссылке дописан startapp=bc<id>.
    r = client.post("/api/admin/broadcast", headers=admin.h, json={
        "message": message, "filter": {"type": "subscribers"},
        "button_text": "Смотреть", "button_url": "https://t.me/modemorph_ai_bot/app"})
    assert r.status_code == 200, r.text
    out = r.json()
    bid = out["id"]
    got = _to(world, ours)
    assert [m["text"] for m in got[tg[sub.id]]] == [message]
    assert all(got[tg[u.id]] == [] for u in (free, tester, muted, blocked))
    assert got[tg[sub.id]][0]["reply_markup"] == {"inline_keyboard": [[
        {"text": "Смотреть", "url": f"https://t.me/modemorph_ai_bot/app?startapp=bc{bid}"}]]}
    row = q1("SELECT * FROM broadcast_messages WHERE id = $1", bid)
    assert str(row["admin_user_id"]) == admin.id and row["message_text"] == message
    assert jmeta(row["recipient_filter"])["type"] == "subscribers"
    assert (row["total_sent"], row["total_failed"]) == (out["sent"], out["failed"])
    assert not [p for p in world.push if p["endpoint"] == endpoint]

    # Бесплатные: free, заблокировавший бота (провал) и web-only (push); тест и
    # «без уведомлений» — нет.
    world.tg.clear()
    r = client.post("/api/admin/broadcast", headers=admin.h, json={"message": "Скидка 30% до пятницы",
                                                                   "filter": {"type": "free"}})
    out = r.json()
    got = _to(world, ours)
    assert len(got[tg[free.id]]) == 1 and len(got[tg[blocked.id]]) == 1
    assert all(got[tg[u.id]] == [] for u in (sub, tester, muted))
    assert "reply_markup" not in got[tg[free.id]][0]
    assert len([p for p in world.push if p["endpoint"] == endpoint]) == 1
    assert out["failed"] >= 1 and out["web_push"] >= 1
    assert out["sent"] + out["failed"] == out["recipients"]
    row = q1("SELECT total_sent, total_failed FROM broadcast_messages WHERE id = $1", out["id"])
    assert (row["total_sent"], row["total_failed"]) == (out["sent"], out["failed"])

    # «Отправить мне»: конкретному человеку уходит, даже если он тестовый.
    world.tg.clear()
    r = client.post("/api/admin/broadcast", headers=admin.h, json={
        "message": "Проверка", "filter": {"type": "user", "user_id": tester.id}})
    assert r.json()["recipients"] == 1 and r.json()["sent"] == 1
    assert [m["chat_id"] for m in world.tg] == [tg[tester.id]]

    listed = {b["id"]: b for b in client.get("/api/admin/broadcast", headers=admin.h).json()["broadcasts"]}
    assert bid in listed and listed[bid]["clicks"] == 0


def test_broadcast_validation_and_access(client, world):
    admin = make_user(role="admin")
    user = make_user()
    before = q1("SELECT count(*) AS n FROM broadcast_messages")["n"]
    assert client.post("/api/admin/broadcast", headers=user.h, json={"message": "hi"}).status_code == 403
    assert client.post("/api/admin/broadcast", headers=admin.h, json={"message": "  "}).status_code == 400
    assert client.post("/api/admin/broadcast", headers=admin.h,
                       json={"message": "x", "filter": {"type": "vip"}}).status_code == 400
    assert client.post("/api/admin/broadcast", headers=admin.h,
                       json={"message": "x", "filter": {"type": "user"}}).status_code == 400
    assert q1("SELECT count(*) AS n FROM broadcast_messages")["n"] == before
    assert world.tg == []

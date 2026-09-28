# -*- coding: utf-8 -*-
"""E2E партнёрского кабинета, публичного VTON API и встраиваемого виджета.

Против живой базы (см. e2e_harness.py и scripts/e2e-local.sh). Проверяется то,
что остаётся после запроса: строки partner_profiles / partner_api_tokens /
partner_api_usage / partner_widget_keys / widget_events, что ушло в CLIP и
Gemini, что увидел покупатель. Отдельно — изоляция: партнёр B не видит, не
меняет и не отзывает ничего у партнёра A.
"""

import hashlib
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path = [p for p in sys.path if os.path.abspath(p or ".") != HERE]
sys.path.insert(0, os.path.join(HERE, "..", ".."))

import pytest  # noqa: E402

if "DATABASE_URL" not in os.environ:
    pytest.skip("нужен живой Postgres — см. scripts/e2e-local.sh", allow_module_level=True)

from app.api.e2e_harness import *  # noqa: E402,F401,F403
from app.api.e2e_harness import (  # noqa: E402
    add_catalog_item, make_partner, make_user, png, q, q1,
)

SHOP = "https://shop.e2e"
EVIL = "https://evil.e2e"
MIGRATIONS = os.path.join(HERE, "..", "..", "migrations")


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


# ───────────────────────────── схема ─────────────────────────────

def test_migrations_create_partner_cabinet_tables():
    """Кабинет пишет в partner_api_tokens, partner_api_usage, partner_feeds и
    wardrobe_items.feed_id — а создаёт их только sql/partner_cabinet.sql вне
    backend/migrations. База, собранная миграциями с нуля (CI, новый сервер),
    отдаёт 500 на создании токена, загрузке фида, /usage и /api/v1/vton."""
    sql = ""
    for name in sorted(os.listdir(MIGRATIONS)):
        if name.endswith(".sql"):
            with open(os.path.join(MIGRATIONS, name), encoding="utf-8") as f:
                sql += f.read().lower() + "\n"
    missing = [t for t in ("partner_api_tokens", "partner_api_usage", "partner_feeds")
               if not re.search(rf"create table (if not exists )?{t}\b", sql)]
    for col in ("feed_id", "price"):
        if not re.search(rf"add column (if not exists )?{col}\b", sql):
            missing.append(f"wardrobe_items.{col}")
    assert not missing, "миграции не создают: " + ", ".join(missing)


# ─────────────────────── регистрация и одобрение ───────────────────────

def test_registration_waits_for_admin_approval(client):
    u = make_user()
    assert client.get("/api/partner/me", headers=u.h).status_code == 404

    r = client.post("/api/partner/register", headers=u.h, json={
        "company_name": "  Лавка платьев ", "contact_name": "Анна", "website": ""})
    assert r.status_code == 200, r.text
    pid = r.json()["partner"]["id"]
    row = q1("SELECT * FROM partner_profiles WHERE id = $1", pid)
    assert str(row["user_id"]) == u.id
    assert row["company_name"] == "Лавка платьев" and row["status"] == "pending"
    assert row["website"] is None  # пустая строка не сохраняется как ""

    again = client.post("/api/partner/register", headers=u.h,
                        json={"company_name": "Ещё раз", "contact_name": "Анна"})
    assert again.status_code == 409
    assert q1("SELECT count(*) AS n FROM partner_profiles WHERE user_id = $1::uuid", u.id)["n"] == 1

    # Пока не одобрен — ни токенов, ни фидов, ни виджета.
    for path in ("/api/partner/tokens", "/api/partner/feeds", "/api/partner/widget-keys", "/api/partner/usage"):
        assert client.get(path, headers=u.h).status_code == 403, path
    assert client.post("/api/partner/tokens", headers=u.h, json={"name": "x"}).status_code == 403

    # Одобрить может только админ; сам себя партнёр не одобрит.
    assert client.patch(f"/api/admin/partners/{pid}", headers=u.h, json={"status": "approved"}).status_code == 403
    admin = make_user(role="admin")
    pending = client.get("/api/admin/partners?status=pending", headers=admin.h).json()["partners"]
    assert pid in [p["id"] for p in pending]
    r = client.patch(f"/api/admin/partners/{pid}", headers=admin.h, json={"status": "approved"})
    assert r.status_code == 200, r.text
    row = q1("SELECT * FROM partner_profiles WHERE id = $1", pid)
    assert row["status"] == "approved" and row["approved_at"] is not None
    assert str(row["approved_by"]) == admin.id
    assert client.get("/api/partner/tokens", headers=u.h).json() == {"tokens": []}

    bad = client.patch(f"/api/admin/partners/{pid}", headers=admin.h, json={"status": "deleted"})
    assert bad.status_code == 400


# ─────────────────────────── API-токены ───────────────────────────

def test_api_token_is_stored_as_hash_and_isolated_between_partners(client):
    a, a_pid = make_partner(client)
    b, _ = make_partner(client)

    r = client.post("/api/partner/tokens", headers=a.h, json={"name": "Прод"})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    key = tok["key"]
    assert key.startswith("mm_pk_") and tok["token_prefix"] == key[:14]
    row = q1("SELECT * FROM partner_api_tokens WHERE id = $1", tok["id"])
    assert row["partner_id"] == a_pid and row["token_hash"] == _sha(key)
    assert key not in str(dict(row)), "ключ в открытом виде лёг в базу"

    listed = client.get("/api/partner/tokens", headers=a.h).json()["tokens"]
    assert [t["id"] for t in listed] == [tok["id"]] and "key" not in listed[0]
    assert client.get("/api/partner/tokens", headers=b.h).json()["tokens"] == []

    # B не может ни отозвать, ни перенастроить чужой токен.
    assert client.delete(f"/api/partner/tokens/{tok['id']}", headers=b.h).status_code == 404
    assert client.patch(f"/api/partner/tokens/{tok['id']}/rate-limit", headers=b.h,
                        json={"rate_limit_per_minute": 999}).status_code == 404
    row = q1("SELECT is_active, rate_limit_per_minute FROM partner_api_tokens WHERE id = $1", tok["id"])
    assert row["is_active"] and row["rate_limit_per_minute"] == 10

    assert client.delete(f"/api/partner/tokens/{tok['id']}", headers=a.h).status_code == 200
    row = q1("SELECT is_active, revoked_at FROM partner_api_tokens WHERE id = $1", tok["id"])
    assert row["is_active"] is False and row["revoked_at"] is not None


# ───────────────────────── публичный VTON API ─────────────────────────

def _vton(client, key, person=True, clothing=True):
    files = {}
    if person:
        files["person_photo"] = ("me.png", png("avatar"), "image/png")
    if clothing:
        files["clothing_photo"] = ("dress.png", png("item"), "image/png")
    return client.post("/api/v1/vton", files=files, headers={"X-API-Key": key} if key else {})


def _token(client, user):
    r = client.post("/api/partner/tokens", headers=user.h, json={"name": "API"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_public_vton_generates_uploads_and_logs_usage(client, world):
    a, a_pid = make_partner(client)
    b, _ = make_partner(client)
    tok = _token(client, a)

    r = _vton(client, tok["key"])
    assert r.status_code == 200, r.text
    url = r.json()["result"]["image_url"]
    assert re.search(r"/partner-vton/\d+-[0-9a-f]{8}\.png$", url), url
    up = [o for o in world.s3 if o.get("Key", "").startswith("partner-vton/")]
    assert len(up) == 1 and up[0]["ExtraArgs"]["ContentType"] == "image/png"
    # Обе проверки фото и генерация — ровно по разу.
    assert sorted(world.kinds()) == ["image:vton", "vton_check_clothing", "vton_check_person"]

    usage = q("SELECT * FROM partner_api_usage WHERE token_id = $1", tok["id"])
    assert [(u["status_code"], u["error_code"], u["partner_id"]) for u in usage] == [(200, None, a_pid)]
    assert q1("SELECT last_used_at FROM partner_api_tokens WHERE id = $1", tok["id"])["last_used_at"]

    s = client.get("/api/partner/usage?summary=true", headers=a.h).json()
    assert s["api_calls_total"] == 1 and s["api_calls_today"] == 1 and s["success_rate"] == 100
    assert s["tokens_count"] == 1
    # Чужая статистика не течёт.
    sb = client.get("/api/partner/usage?summary=true", headers=b.h).json()
    assert sb["api_calls_total"] == 0 and sb["tokens_count"] == 0


def test_public_vton_rejections_are_logged_with_codes(client, world):
    a, a_pid = make_partner(client)
    tok = _token(client, a)

    assert _vton(client, None).status_code == 401
    assert _vton(client, "mm_pk_" + "0" * 64).status_code == 401

    world.image_check = lambda kind: ({"valid": False, "reason": "На фото нет человека"}
                                      if kind == "vton_check_person" else {"valid": True})
    r = _vton(client, tok["key"])
    assert r.status_code == 422
    assert r.json()["detail"]["error"] == {"code": "INVALID_PERSON_PHOTO", "message": "На фото нет человека"}
    assert "image:vton" not in world.kinds(), "генерация запущена по негодному фото"

    world.image_check = {"valid": True}
    r = _vton(client, tok["key"], clothing=False)
    assert r.status_code == 400 and r.json()["detail"]["error"]["code"] == "MISSING_CLOTHING_PHOTO"

    # Лимит частоты: 2 в минуту, третий вызов — 429 и тоже в журнале.
    assert client.patch(f"/api/partner/tokens/{tok['id']}/rate-limit", headers=a.h,
                        json={"rate_limit_per_minute": 2}).status_code == 200
    assert _vton(client, tok["key"]).status_code == 200
    r = _vton(client, tok["key"])
    assert r.status_code == 429 and r.json()["detail"]["error"]["code"] == "RATE_LIMIT_EXCEEDED"
    codes = [(u["status_code"], u["error_code"]) for u in
             q("SELECT * FROM partner_api_usage WHERE token_id = $1 ORDER BY id", tok["id"])]
    assert codes == [(422, "INVALID_PERSON_PHOTO"), (200, None), (429, "RATE_LIMIT_EXCEEDED")]
    full = client.get("/api/partner/usage", headers=a.h).json()
    assert full["error_breakdown"] == {"INVALID_PERSON_PHOTO": 1, "RATE_LIMIT_EXCEEDED": 1}

    # Отозванный токен и приостановленный партнёр — отказ до всякой генерации.
    admin = make_user(role="admin")
    tok2 = _token(client, a)
    client.patch(f"/api/admin/partners/{a_pid}", headers=admin.h, json={"status": "suspended"})
    r = _vton(client, tok2["key"])
    assert r.status_code == 403 and r.json()["detail"]["error"]["code"] == "PARTNER_NOT_APPROVED"
    client.patch(f"/api/admin/partners/{a_pid}", headers=admin.h, json={"status": "approved"})
    client.delete(f"/api/partner/tokens/{tok2['id']}", headers=a.h)
    assert _vton(client, tok2["key"]).status_code == 401


# ───────────────────────────── виджет ─────────────────────────────

def _widget_key(client, user, origins=(SHOP,), **extra):
    r = client.post("/api/partner/widget-keys", headers=user.h,
                    json={"name": "Витрина", "allowed_origins": list(origins), **extra})
    assert r.status_code == 200, r.text
    return r.json()["key"]


def test_widget_key_creation_validates_origins_and_hashes_key(client):
    a, a_pid = make_partner(client)
    b, _ = make_partner(client)

    assert client.post("/api/partner/widget-keys", headers=a.h, json={
        "name": "x", "allowed_origins": ["shop.e2e"]}).status_code == 400
    assert client.post("/api/partner/widget-keys", headers=a.h, json={
        "name": "x", "allowed_origins": ["https://shop.e2e/cart"]}).status_code == 400

    k = _widget_key(client, a, origins=[SHOP + "/"], theme={"accent": "#111"})
    assert k["key"].startswith("mm_wk_")
    row = q1("SELECT * FROM partner_widget_keys WHERE id = $1", k["id"])
    assert row["partner_id"] == a_pid and row["key_hash"] == _sha(k["key"])
    assert list(row["allowed_origins"]) == [SHOP], "хвостовой / не срезан — точное сравнение Origin не пройдёт"

    # Чужой ключ нельзя ни поправить, ни отозвать.
    assert client.patch(f"/api/partner/widget-keys/{k['id']}", headers=b.h,
                        json={"allowed_origins": [EVIL]}).status_code == 404
    assert client.delete(f"/api/partner/widget-keys/{k['id']}", headers=b.h).status_code == 404
    row = q1("SELECT allowed_origins, is_active FROM partner_widget_keys WHERE id = $1", k["id"])
    assert list(row["allowed_origins"]) == [SHOP] and row["is_active"]
    assert client.get("/api/partner/widget-keys", headers=b.h).json() == {"keys": []}


def test_widget_config_and_cors_are_locked_to_origin(client):
    a, _ = make_partner(client, company="Лавка Е2Е")
    k = _widget_key(client, a, theme={"accent": "#111"})
    url = f"/api/v1/widget/config?key={k['key']}"

    r = client.get(url, headers={"Origin": SHOP})
    assert r.status_code == 200, r.text
    assert r.json() == {"partner": {"name": "Лавка Е2Е"}, "theme": {"accent": "#111"}}
    assert r.headers["access-control-allow-origin"] == SHOP

    evil = client.get(url, headers={"Origin": EVIL})
    assert evil.status_code == 403
    assert evil.headers.get("access-control-allow-origin") != EVIL
    assert client.get("/api/v1/widget/config", headers={"Origin": SHOP}).status_code == 401

    pre = client.options(url, headers={"Origin": SHOP, "Access-Control-Request-Method": "POST"})
    assert pre.status_code == 204 and pre.headers["access-control-allow-origin"] == SHOP
    pre_evil = client.options(url, headers={"Origin": EVIL, "Access-Control-Request-Method": "POST"})
    assert pre_evil.status_code == 403 and "access-control-allow-origin" not in pre_evil.headers

    client.delete(f"/api/partner/widget-keys/{k['id']}", headers=a.h)
    assert client.get(url, headers={"Origin": SHOP}).status_code == 401


def test_widget_recommend_matches_cart_to_own_catalog_and_logs_funnel(client, world):
    a, a_pid = make_partner(client, company="Лавка А")
    b, b_pid = make_partner(client, company="Лавка Б")
    sku = f"A-{os.urandom(3).hex()}"
    dress = add_catalog_item("Платье миди", "dress", partner_id=a_pid, source_sku=sku,
                             url="https://shop.e2e/p/dress", price=5990)
    coat = add_catalog_item("Пальто оверсайз", "coat", partner_id=a_pid, source_sku=sku + "-c",
                            url="https://shop.e2e/p/coat")
    boots = add_catalog_item("Ботильоны", "boots", partner_id=a_pid, source_sku=sku + "-b")
    b_sku = f"B-{os.urandom(3).hex()}"
    add_catalog_item("Чужое платье", "dress", partner_id=b_pid, source_sku=b_sku)
    ka, kb = _widget_key(client, a), _widget_key(client, b)

    world.complement = {"outfits": [{"score": 0.91, "items": [
        {"id": dress, "is_anchor": True}, {"id": coat}, {"id": boots}, {"id": 2_000_000_000}]}]}
    world.polish = [{"i": 0, "title": "Городская осень", "keep_ids": [dress, coat]}]

    def rec(key, skus, origin=SHOP):
        return client.post(f"/api/v1/widget/recommend?key={key}", headers={"Origin": origin},
                           json={"cart": [{"sku": s} for s in skus]})

    r = rec(ka["key"], [sku, ""])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["partner"] == {"name": "Лавка А"} and "cached" not in body
    [outfit] = body["outfits"]
    assert outfit["title"] == "Городская осень"
    assert [(i["id"], i["is_anchor"], i["buy_url"]) for i in outfit["items"]] == [
        (dress, True, "https://shop.e2e/p/dress"), (coat, False, "https://shop.e2e/p/coat")]
    comp = [b for p, b in world.clip_json if p == "/clip/complement"]
    assert comp == [{"partner_id": a_pid, "anchor_item_ids": [dress], "n_outfits": 3,
                     "gender": None, "temp": None}]

    ev = q("SELECT * FROM widget_events WHERE widget_key_id = $1", ka["id"])
    assert [(e["event_type"], e["partner_id"], e["origin"], list(e["anchor_skus"])) for e in ev] == [
        ("impression", a_pid, SHOP, [sku])]
    assert q1("SELECT count(*) AS n FROM widget_reco_cache WHERE partner_id = $1", a_pid)["n"] == 1

    # Та же корзина — из кэша, без второго похода в CLIP, но показ всё равно считается.
    again = rec(ka["key"], [sku])
    assert again.status_code == 200 and again.json()["cached"] is True
    assert again.json()["outfits"] == body["outfits"]
    assert len([p for p, _ in world.clip_json if p == "/clip/complement"]) == 1

    # Ключ A и SKU партнёра B: чужой каталог не матчится.
    cross = rec(ka["key"], [b_sku])
    assert cross.json() == {"session_id": cross.json()["session_id"], "outfits": [], "reason": "no_cart_match"}
    assert len([p for p, _ in world.clip_json if p == "/clip/complement"]) == 1

    # Воронка: клик и корзина — в статистике A, а B свои события в неё не подмешает.
    sid = body["session_id"]
    for et in ("outfit_view", "item_click", "add_to_cart"):
        assert client.post(f"/api/v1/widget/event?key={ka['key']}", headers={"Origin": SHOP},
                           json={"session_id": sid, "event_type": et, "item_id": coat}).status_code == 200
    assert client.post(f"/api/v1/widget/event?key={ka['key']}", headers={"Origin": SHOP},
                       json={"event_type": "purchase"}).status_code == 400
    client.post(f"/api/v1/widget/event?key={kb['key']}", headers={"Origin": SHOP},
                json={"event_type": "add_to_cart", "item_id": dress})

    st = client.get("/api/partner/widget-stats", headers=a.h).json()
    assert st["totals"] == {"impressions": 3, "outfit_views": 1, "clicks": 1, "add_to_cart": 1}
    assert st["ctr"] == 33.3 and st["conversion"] == 33.3
    stb = client.get("/api/partner/widget-stats", headers=b.h).json()
    assert stb["totals"]["add_to_cart"] == 1 and stb["totals"]["impressions"] == 0

    admin = make_user(role="admin")
    keys = {k["id"]: k for k in client.get("/api/admin/widget-keys", headers=admin.h).json()["keys"]}
    assert keys[ka["id"]]["impressions"] == 3 and keys[ka["id"]]["conversions"] == 1


def test_widget_hidden_items_and_rate_limit(client, world):
    a, a_pid = make_partner(client)
    sku = f"H-{os.urandom(3).hex()}"
    add_catalog_item("Скрытая юбка", "skirt", partner_id=a_pid, source_sku=sku, is_hidden=True)
    k = _widget_key(client, a)
    assert client.patch(f"/api/partner/widget-keys/{k['id']}", headers=a.h,
                        json={"rate_limit_per_minute": 2}).status_code == 200

    def rec():
        return client.post(f"/api/v1/widget/recommend?key={k['key']}", headers={"Origin": SHOP},
                           json={"cart": [{"sku": sku}]})

    first = rec()
    assert first.status_code == 200 and first.json()["reason"] == "no_cart_match"
    assert not [p for p, _ in world.clip_json if p == "/clip/complement"], "скрытая вещь ушла якорем в CLIP"
    assert rec().status_code == 200
    assert rec().status_code == 429
    n = q1("SELECT count(*) AS n FROM widget_events WHERE widget_key_id = $1", k["id"])["n"]
    assert n == 2, "отказ по лимиту записан как показ"

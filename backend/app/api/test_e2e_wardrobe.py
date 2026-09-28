# -*- coding: utf-8 -*-
"""E2E: гардероб, оцифровка фото, лимиты, примерка, «Стоит ли покупать?»,
ИИ-ассистент. Gemini и CLIP на заглушках, всё остальное — настоящее."""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path = [p for p in sys.path if os.path.abspath(p or ".") != HERE]
sys.path.insert(0, os.path.join(HERE, "..", ".."))

import pytest  # noqa: E402

if "DATABASE_URL" not in os.environ:
    pytest.skip("нужен живой Postgres — см. scripts/e2e-local.sh", allow_module_level=True)

from app.api.e2e_harness import *  # noqa: E402,F401,F403
from app.api.e2e_harness import (  # noqa: E402
    IMG, add_item, events, give_plan, jmeta, make_user, png, q, q1,
)


# ───────────────────────────── гардероб ─────────────────────────────

def test_wardrobe_crud_and_isolation(client):
    a, b = make_user(), make_user()
    iid = add_item(client, a, "Белая футболка", "t-shirt")
    add_item(client, a, "Синие джинсы", "jeans")

    lst = client.get("/api/wardrobe-user-items", headers=a.h).json()
    assert {i["item_name"] for i in lst} == {"Белая футболка", "Синие джинсы"}
    assert client.get("/api/wardrobe-user-items", headers=b.h).json() == []
    assert client.get(f"/api/wardrobe-user-items/{iid}", headers=b.h).status_code == 404

    # скрыть: PATCH с is_hidden, строка остаётся
    r = client.patch(f"/api/wardrobe-user-items/{iid}", headers=a.h, json={"is_hidden": True})
    assert r.status_code == 200 and r.json()["data"]["is_hidden"] is True
    assert q1("SELECT is_hidden FROM wardrobe_user_items WHERE id = $1", iid)["is_hidden"] is True

    # чужой не удалит
    assert client.delete(f"/api/wardrobe-user-items/{iid}", headers=b.h).status_code == 404
    assert q1("SELECT 1 FROM wardrobe_user_items WHERE id = $1", iid)

    r = client.delete(f"/api/wardrobe-user-items/{iid}", headers=a.h)
    assert r.status_code == 200
    assert q1("SELECT 1 FROM wardrobe_user_items WHERE id = $1", iid) is None
    ev = events("wardrobe_item", pid=a.pid, action="delete")
    assert len(ev) == 1
    meta = jmeta(ev[0]["metadata"])
    assert meta["item_id"] == iid and meta["clothing_type"] == "t-shirt"
    assert isinstance(meta["age_seconds"], int)


# ───────────────────────────── оцифровка ─────────────────────────────

def test_detect_clothing_returns_items_with_images_and_logs_detection(client, world):
    u = make_user()
    r = client.post("/api/detect-clothing", headers=u.h,
                    files={"image": ("look.png", png(), "image/png")})
    assert r.status_code == 200, r.text
    items = r.json()
    names = [i["item_name"] for i in items]
    assert names == ["Белая футболка", "Синие джинсы"], "перчатки должны отсеяться"
    assert [i["clothing_type"] for i in items] == ["t-shirt", "jeans"]
    assert all(i["image_url"].startswith("data:image/png;base64,") for i in items), \
        "картинка вещи не нарезалась из сетки 2×2"
    # одна генерация на 2 вещи, а не по вызову на вещь
    assert world.kinds().count("image:grid") == 1

    ev = events("photo_detection", pid=u.pid, action="detected")
    assert len(ev) == 1
    meta = jmeta(ev[0]["metadata"])
    assert meta["detected"] == 3 and meta["kept"] == 2 and meta["dropped_accessories"] == 1


def test_detect_clothing_nothing_found(client, world):
    u = make_user()
    world.detect_items = []
    r = client.post("/api/detect-clothing", headers=u.h, files={"image": ("x.png", png(), "image/png")})
    assert r.status_code == 200
    assert r.json()[0]["acceptable"] is False
    assert "image:grid" not in world.kinds(), "генерация не должна запускаться без вещей"


# ───────────────────────────── лимиты ─────────────────────────────

def _consume(client, u, feature, count=1):
    return client.post("/api/check-limits", headers=u.h, json={"featureType": feature, "count": count})


def test_free_plan_caps_photo_analysis_and_issues_winback_once(client):
    u = make_user(offer_group=True)
    cap = q1("SELECT cap FROM plan_limits WHERE plan_type='free' AND feature='wardrobe_items_anlyzed'")["cap"]

    # проверка без списания ничего не пишет
    chk = client.post("/api/check-limits", headers=u.h, json={"feature": "wardrobe_items_anlyzed", "count": 1})
    assert chk.json() == {"success": True, "canUse": True, "remaining": cap}
    assert q("SELECT 1 FROM subscription_usage WHERE user_profile_id = $1", u.pid) == []

    for i in range(cap):
        r = _consume(client, u, "wardrobe_items_anlyzed")
        assert r.status_code == 200, r.text
        assert r.json()["remaining"] == cap - i - 1
    over = _consume(client, u, "wardrobe_items_anlyzed")
    assert over.status_code == 402 and over.json()["detail"] == "payment_required"
    used = q1("SELECT used, plan_type FROM subscription_usage WHERE user_profile_id=$1 AND feature='wardrobe_items_anlyzed'", u.pid)
    assert used["used"] == cap and used["plan_type"] == "free"

    # упёрся в лимит → разовое предложение, ровно одно
    offers = q("SELECT code, kind, max_uses FROM discounts WHERE owner_profile_id=$1 AND kind='winback'", u.pid)
    assert len(offers) == 1 and offers[0]["max_uses"] == 1
    assert _consume(client, u, "wardrobe_items_anlyzed").status_code == 402
    assert len(q("SELECT 1 FROM discounts WHERE owner_profile_id=$1 AND kind='winback'", u.pid)) == 1

    mine = client.get("/api/discounts/mine", headers=u.h).json()
    assert mine["offer"]["code"] == offers[0]["code"]
    chk = client.post("/api/discounts/check", headers=u.h, json={"code": offers[0]["code"], "planType": "weekly"})
    assert chk.status_code == 200, chk.text
    weekly = q1("SELECT offer_price_rub FROM subscription_pricing WHERE plan_type='weekly'")
    assert chk.json()["discounted_rub"] == weekly["offer_price_rub"]


def test_control_group_gets_no_winback(client):
    u = make_user(offer_group=False)
    cap = q1("SELECT cap FROM plan_limits WHERE plan_type='free' AND feature='ai_requests'")["cap"]
    assert _consume(client, u, "ai_requests", cap).status_code == 200
    assert _consume(client, u, "ai_requests").status_code == 402
    assert q("SELECT 1 FROM discounts WHERE owner_profile_id=$1", u.pid) == []
    assert client.get("/api/discounts/mine", headers=u.h).json()["offer"] is None


def test_paid_plan_lifts_cap_and_resets_free_counter(client):
    u = make_user()
    free_cap = q1("SELECT cap FROM plan_limits WHERE plan_type='free' AND feature='wardrobe_items_anlyzed'")["cap"]
    assert _consume(client, u, "wardrobe_items_anlyzed", free_cap).status_code == 200
    assert _consume(client, u, "wardrobe_items_anlyzed").status_code == 402

    give_plan(u.pid, "monthly")
    cap = q1("SELECT cap FROM plan_limits WHERE plan_type='monthly' AND feature='wardrobe_items_anlyzed'")["cap"]
    r = _consume(client, u, "wardrobe_items_anlyzed")
    assert r.status_code == 200 and r.json()["remaining"] == cap - 1, "потраченное на free съело платный план"
    sub = client.get("/api/payments/subscription", headers=u.h).json()
    assert sub["plan"] == "monthly"
    assert sub["limits"]["wardrobe_items_anlyzed"]["remaining"] == cap - 1


def test_limits_reject_unknown_feature_and_missing_profile(client):
    u = make_user()
    assert _consume(client, u, "free_money").status_code == 400
    assert client.post("/api/limits/consume", headers=u.h, json={"feature": "free_money"}).status_code == 400
    nop = make_user(profile=False)
    assert _consume(client, nop, "ai_requests").status_code == 404


def test_inspiration_open_check_does_not_consume(client):
    u = make_user()
    r = client.post("/api/check-limits", headers=u.h, json={"limitType": "daily", "usageType": "ideas_viewed"})
    assert r.status_code == 200
    assert q("SELECT 1 FROM subscription_usage WHERE user_profile_id=$1 AND used > 0", u.pid) == []


def test_usage_log_persists_client_event(client):
    u = make_user()
    r = client.post("/api/usage/log", headers=u.h, json={
        "feature": "paywall", "action": "view",
        "meta": {"pagePath": "/app/wardrobe", "reason": "limit"}})
    assert r.status_code == 200
    ev = events("paywall", pid=u.pid, action="view")
    assert len(ev) == 1
    assert ev[0]["page_path"] == "/app/wardrobe" and jmeta(ev[0]["metadata"])["reason"] == "limit"


# ───────────────────────────── примерка ─────────────────────────────

def test_vton_success_then_402_when_free_tryon_spent(client, world):
    u = make_user()
    body = {"avatar_url": f"{IMG}/avatar.png",
            "items": [{"image_url": f"{IMG}/top.png", "name": "Футболка", "color": "белый"}]}
    r = client.post("/api/vton", headers=u.h, json=body)
    assert r.status_code == 200, r.text
    url = r.json()["result"]["image_url"]
    assert url.startswith("https://") and "/vton/" in url, "результат примерки не ушёл в S3"
    assert world.s3 and world.s3[-1]["Key"].startswith("vton/")
    assert world.kinds().count("image:vton") == 2  # генерация + доводка лица

    # списание — на сервере вместе с картинкой (с 28.09.2026); клиент больше не списывает
    assert len(events("vton_used", pid=u.pid, action="consume_success")) == 1, "успешная примерка не записана"
    world.calls.clear()
    again = client.post("/api/vton", headers=u.h, json=body)
    assert again.status_code == 402
    assert "image:vton" not in world.kinds(), "402 обязан прийти ДО платной генерации"


def test_vton_requires_avatar(client):
    u = make_user()
    r = client.post("/api/vton", headers=u.h, json={"items": [{"image_url": f"{IMG}/top.png"}]})
    assert r.status_code == 400


# ───────────────────────── «Стоит ли покупать?» ─────────────────────────

def test_style_check_trusts_only_real_wardrobe_and_clip_duplicates(client, world):
    u, other = make_user(), make_user()
    tee = add_item(client, u, "Белая футболка", "t-shirt")
    sneakers = add_item(client, u, "Белые кеды", "sneakers")
    jeans_twin = add_item(client, u, "Синие джинсы прямые", "jeans")
    jeans_far = add_item(client, u, "Серые джинсы", "jeans")
    hidden = add_item(client, u, "Старая рубашка", "shirt", is_hidden=True)
    foreign = add_item(client, other, "Чужая рубашка", "shirt")

    world.style = {"is_clothing": True, "name": "Синие джинсы", "type": "jeans", "outfits": [
        {"title": "Просто", "item_ids": [tee, sneakers]},                   # годится
        {"title": "Чужое", "item_ids": [foreign, 999999999, sneakers]},     # чужие/выдуманные id
        {"title": "Скрытое", "item_ids": [hidden, sneakers]},               # скрытая вещь
        {"title": "Джинсы к джинсам", "item_ids": [jeans_far, sneakers]},   # тот же слот
    ]}
    world.nearest = [
        {"id": jeans_twin, "similarity": 0.95},   # дубль: тот же слот, ≥ 0.90
        {"id": tee, "similarity": 0.97},          # близко, но другой слот — не дубль
        {"id": jeans_far, "similarity": 0.85},    # тот же слот, но ниже порога
    ]
    r = client.post("/api/style-check", headers=u.h, files={"image": ("buy.png", png(), "image/png")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["item"]["clothing_type"] == "jeans"
    assert [o["title"] for o in body["outfits"]] == ["Просто"]
    assert {i["id"] for i in body["outfits"][0]["items"]} == {tee, sneakers}
    assert [d["id"] for d in body["duplicates"]] == [jeans_twin]
    assert body["wardrobe_size"] == 4, "скрытая вещь попала в гардероб для проверки"
    assert world.wardrobe_fit_form and u.id.encode() in world.wardrobe_fit_form

    ev = events("style_check", pid=u.pid, action="check")
    assert len(ev) == 1 and jmeta(ev[0]["metadata"]) == {"outfits": 1, "duplicates": 1}


def test_style_check_empty_wardrobe_skips_model(client, world):
    u = make_user()
    r = client.post("/api/style-check", headers=u.h, files={"image": ("buy.png", png(), "image/png")})
    assert r.status_code == 200 and r.json()["wardrobe_size"] == 0
    assert "style_check" not in world.kinds()


# ───────────────────────────── ассистент ─────────────────────────────

def test_ai_assistant_hydrates_cards_from_db_and_drops_invented_ids(client, world):
    u = make_user()
    tee = add_item(client, u, "Белая футболка оверсайз", "t-shirt")
    world.assistant = [{"content": "Надень **белую футболку** (ID: %d) с джинсами." % tee,
                        "items": [{"id": 424242424}]}]
    r = client.post("/api/ai-assistant", headers=u.h, json={"prompt": "что надеть?", "weather": {}})
    assert r.status_code == 200, r.text
    ans = r.json()
    assert "ID" not in ans[0]["content"], "служебный id протёк в текст"
    assert [i["id"] for i in ans[0]["items"]] == [tee]
    assert ans[0]["items"][0]["image_url"].startswith(IMG)


def test_ai_assistant_plain_prose_is_wrapped_not_lost(client, world):
    u = make_user()
    world.assistant = "Просто совет текстом, без JSON."
    r = client.post("/api/ai-assistant", headers=u.h, json={"prompt": "совет"})
    assert r.status_code == 200 and r.json()[0]["content"].startswith("Просто совет")


# ───────────── лимиты на сервере (с 28.09.2026 списывает сервер, не клиент) ─────────────

def _remaining(client, u, feature):
    return client.post("/api/limits/check", headers=u.h, json={"feature": feature}).json()["remaining"]


def test_server_charges_ai_features_only_after_success(client, world):
    u = make_user()
    before = _remaining(client, u, "ai_requests")
    world.assistant = [{"content": "Надень джинсы и белую футболку.", "items": []}]
    assert client.post("/api/ai-assistant", headers=u.h, json={"prompt": "что надеть?", "weather": {}}).status_code == 200
    assert _remaining(client, u, "ai_requests") == before - 1, "ассистент не списал запрос на сервере"
    assert len(events("ai_requests", pid=u.pid, action="consume_success")) == 1, \
        "дашборд считает ИИ-запросы по consume_success — событие не записано"

    photos = _remaining(client, u, "wardrobe_items_anlyzed")
    assert client.post("/api/detect-clothing", headers=u.h,
                       files={"image": ("a.png", png(), "image/png")}).status_code == 200
    assert _remaining(client, u, "wardrobe_items_anlyzed") == photos - 1

    world.detect_items = []
    assert client.post("/api/detect-clothing", headers=u.h,
                       files={"image": ("b.png", png(), "image/png")}).status_code == 200
    assert _remaining(client, u, "wardrobe_items_anlyzed") == photos - 1, "фото без вещей не должно тратить лимит"
    assert len(events("wardrobe_items_anlyzed", pid=u.pid, action="consume_success")) == 1


def test_server_refuses_before_calling_model_when_limit_spent(client, world):
    u = make_user()
    for feature in ("ai_requests", "wardrobe_items_anlyzed"):
        cap = q1("SELECT cap FROM plan_limits WHERE plan_type='free' AND feature=$1", feature)["cap"]
        assert _consume(client, u, feature, cap).status_code == 200

    world.calls.clear()
    assert client.post("/api/ai-assistant", headers=u.h, json={"prompt": "что надеть?", "weather": {}}).status_code == 402
    assert client.post("/api/detect-clothing", headers=u.h,
                       files={"image": ("c.png", png(), "image/png")}).status_code == 402
    assert client.post("/api/style-check", headers=u.h,
                       files={"image": ("d.png", png(), "image/png")}).status_code == 402
    assert world.kinds() == [], "402 обязан прийти ДО вызова модели"

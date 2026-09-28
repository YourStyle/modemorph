# -*- coding: utf-8 -*-
"""E2E: главная (рекомендации), ночной крон, образы, лайки, лента идей,
дизлайки и события рекомендаций."""

import asyncio
import json
import os
import re
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
    CRON_SECRET, IMG, add_catalog_item, add_item, events, give_plan, jmeta, make_user, q, q1, sql_run,
)


def _wardrobe(client, u):
    # Вещи межсезонные: их окна температур (выводятся из типа и названия)
    # пересекаются, и repair_outfit на выдаче их не разбирает. Футболку с
    # ботинками или курткой он разбирает — это отдельный тест ниже.
    ids = {
        "T1": add_item(client, u, "Белая рубашка", "shirt"),
        "T2": add_item(client, u, "Серый лонгслив", "longsleeve"),
        "W": add_item(client, u, "Футболка слабая", "t-shirt"),     # судья ставит 2
        "B1": add_item(client, u, "Синие джинсы", "jeans"),
        "B2": add_item(client, u, "Чёрные брюки", "pants"),
        "S1": add_item(client, u, "Белые кеды", "sneakers"),
        "S2": add_item(client, u, "Чёрные туфли", "shoes"),
        "C": add_item(client, u, "Кардиган", "cardigan"),
    }
    return ids


def _sections(ids):
    """8 годных секций + 3 брака: слабая по судье, без верха, без низа."""
    good = [[t, b, s] for t in ("T1", "T2") for b in ("B1", "B2") for s in ("S1", "S2")]
    bad = {"Слабый": ["W", "B1", "S1"], "Без верха": ["C", "B1", "S1"], "Без низа": ["T1", "C", "S1"]}
    out = [{"title": f"Раздел {n + 1}", "section_type": "user_only",
            "suggestions": [{"title": f"Образ {n + 1}", "item_ids": [ids[k] for k in combo]}]}
           for n, combo in enumerate(good)]
    for title, combo in bad.items():
        out.insert(1, {"title": title, "section_type": "user_only",
                       "suggestions": [{"title": title, "item_ids": [ids[k] for k in combo]}]})
    return out


def _real(sections):
    return [s for s in sections if s.get("source") != "wardrobe_gap"]


# ───────────────────────────── главная ─────────────────────────────

def test_generate_recs_filters_judges_and_locks_for_free(client, world):
    u = make_user()
    ids = _wardrobe(client, u)
    world.recs = _sections(ids)

    r = client.post("/api/recommendations", headers=u.h)
    assert r.status_code == 200, r.text
    secs = _real(r.json())
    titles = [s["title"] for s in secs]
    assert not {"Слабый", "Без верха", "Без низа"} & set(titles), f"брак дошёл до пользователя: {titles}"
    assert len(secs) == 8
    assert "judge" in world.kinds(), "судья образов не вызывался"

    opened = [s for s in secs if not s.get("locked")]
    locked = [s for s in secs if s.get("locked")]
    assert len(opened) == 6 and len(locked) == 2, "бесплатному открыто не 6 секций"
    for s in opened:
        for sug in s["suggestions"]:
            assert all(i.get("name") and i.get("id") for i in sug["items"])
    for s in locked:
        for sug in s["suggestions"]:
            assert set(sug) <= {"id", "title", "items"}
            assert all(set(i) == {"image_url"} for i in sug["items"]), "в закрытой секции утекли вещи"

    row = q1("SELECT look_sections, source FROM main_recommendations "
             "WHERE user_id = $1::uuid AND run_date = CURRENT_DATE", u.id)
    assert row and row["source"] == "openrouter"
    stored = [s["title"] for s in jmeta(row["look_sections"])]
    assert "Слабый" not in stored, "судья не отсеял слабый образ до записи"

    # GET отдаёт тот же кеш через те же фильтры и тот же замок
    g = client.get("/api/recommendations", headers=u.h).json()
    assert g["stale"] is False
    gs = _real(g["sections"])
    assert [s["title"] for s in gs] == titles
    assert sum(1 for s in gs if s.get("locked")) == 2

    # оплатил — те же образы открылись без перегенерации
    give_plan(u.pid, "monthly")
    world.calls.clear()
    paid = _real(client.get("/api/recommendations", headers=u.h).json()["sections"])
    assert len(paid) == 8 and not any(s.get("locked") for s in paid)
    assert "recs_post" not in world.kinds()


def test_every_served_outfit_covers_the_body(client, world):
    """Независимая проверка ответа: у каждого образа есть верх и низ (или платье)."""
    from app.services.outfit_compat import covers_body

    u = make_user()
    world.recs = _sections(_wardrobe(client, u))
    give_plan(u.pid, "monthly")
    for sec in _real(client.post("/api/recommendations", headers=u.h).json()):
        for sug in sec["suggestions"]:
            assert covers_body(sug["items"]), f"образ не одевает целиком: {sug}"


def test_serving_respects_real_item_temperature_windows(client, world):
    u = make_user()
    give_plan(u.pid, "monthly")
    tee = add_item(client, u, "Белая футболка", "t-shirt", temp_min=5, temp_max=30)
    jeans = add_item(client, u, "Синие джинсы", "jeans", temp_min=-5, temp_max=30)
    boots = add_item(client, u, "Чёрные ботинки", "boots", temp_min=-5, temp_max=25)
    world.recs = [{"title": "Межсезонье", "section_type": "user_only",
                   "suggestions": [{"title": "Джинсы и ботинки", "item_ids": [tee, jeans, boots]}]}]
    secs = _real(client.post("/api/recommendations", headers=u.h).json())
    assert secs and len(secs[0]["suggestions"][0]["items"]) == 3


def test_judge_failure_keeps_outfits(world):
    from app.api.recommendations import _judge_outfits

    world.judge_fail = True
    secs = [{"title": "A", "source": "user_only",
             "suggestions": [{"id": "x", "items": [{"name": "Футболка слабая"}]}]}]
    out = asyncio.run(_judge_outfits("k", secs))
    assert out and out[0]["suggestions"][0]["id"] == "x", "падение судьи уничтожило образы"


def test_empty_wardrobe_generates_nothing(client, world):
    u = make_user()
    r = client.post("/api/recommendations", headers=u.h)
    assert r.status_code == 200 and r.json() == []
    assert "recs_post" not in world.kinds()
    assert client.get("/api/recommendations", headers=u.h).json() == {"sections": [], "stale": True}


# ───────────────────────────── ночной крон ─────────────────────────────

def _cron_recs(prompt: str):
    """Заглушка крона: образ из первых трёх [USER]-вещей каждого пользователя."""
    ids = [int(x) for x in re.findall(r"\[USER id=(\d+)\]", prompt)][:3]
    return [{"title": "На каждый день", "section_type": "user_only",
             "suggestions": [{"title": "База", "item_ids": ids}]}]


def test_cron_generate_recommendations_writes_main_recommendations(client, world):
    u = make_user()
    ids = [add_item(client, u, "Белая футболка", "t-shirt"),
           add_item(client, u, "Синие джинсы", "jeans"),
           add_item(client, u, "Белые кеды", "sneakers")]
    world.recs = _cron_recs

    assert client.post("/api/cron/generate-recommendations").status_code == 401
    assert client.post("/api/cron/generate-recommendations",
                       headers={"X-Cron-Secret": "wrong"}).status_code == 401

    r = client.post("/api/cron/generate-recommendations", headers={"X-Cron-Secret": CRON_SECRET})
    assert r.status_code == 200, r.text
    assert r.json()["success"] >= 1
    assert "recs_cron" in world.kinds() and "judge" in world.kinds()

    row = q1("SELECT look_sections, source FROM main_recommendations "
             "WHERE user_id = $1::uuid AND run_date = CURRENT_DATE", u.id)
    assert row, "крон не записал main_recommendations"
    assert row["source"] in ("gemini", "clip+gemini")
    sug = jmeta(row["look_sections"])[0]["suggestions"][0]
    assert sorted(i["id"] for i in sug["items"]) == sorted(ids)

    got = client.get("/api/recommendations", headers=u.h).json()
    assert got["stale"] is False and got["sections"][0]["suggestions"][0]["items"]


# ───────────────────────────── образы ─────────────────────────────

def test_save_look_writes_outfit_created_and_expands_items(client):
    u = make_user()
    tee = add_item(client, u, "Белая футболка", "t-shirt")
    jeans = add_item(client, u, "Синие джинсы", "jeans")
    r = client.post("/api/user-looks", headers=u.h, json={
        "name": "Мой образ", "items": [{"id": tee, "type": "user"}, {"id": jeans, "type": "user"}],
        "source": "recommendations"})
    assert r.status_code == 200, r.text
    look_id = r.json()["id"]
    assert q1("SELECT name FROM user_looks WHERE id = $1", look_id)["name"] == "Мой образ"

    ev = events("outfit_created", pid=u.pid, action="create")
    assert len(ev) == 1
    assert jmeta(ev[0]["metadata"]) == {"lookId": look_id, "itemsCount": 2, "source": "recommendations"}

    looks = client.get("/api/user-looks", headers=u.h).json()
    assert [i["id"] for i in looks[0]["expandedItems"]] == [tee, jeans]

    other = make_user()
    assert client.delete(f"/api/user-looks/{look_id}", headers=other.h).status_code == 404
    assert client.delete(f"/api/user-looks/{look_id}", headers=u.h).status_code == 200
    assert q1("SELECT 1 FROM user_looks WHERE id = $1", look_id) is None
    assert len(events("user_look", pid=u.pid, action="delete")) == 1


# ───────────────────────────── лента идей ─────────────────────────────

def _seed_feed_outfit():
    items = [add_catalog_item("Блузка шёлковая", "blouse"),
             add_catalog_item("Юбка миди", "skirt"),
             add_catalog_item("Лодочки", "shoes")]
    oid = q1("INSERT INTO outfits (name, user_id, gender, preview_image_url) "
             "VALUES ($1, $2, 'female', $3) RETURNING id",
             f"Идея {uuid.uuid4().hex[:4]}", uuid.uuid4(), f"{IMG}/lookbook/x.jpg")["id"]
    for iid in items:
        q("INSERT INTO outfit_items (outfit_id, wardrobe_item_id) VALUES ($1, $2) RETURNING 1", oid, iid)
    return oid, items


def test_inspiration_feed_like_and_save(client):
    u = make_user()
    oid, items = _seed_feed_outfit()
    feed = client.get("/api/outfits/inspiration?gender=female&limit=50", headers=u.h).json()["outfits"]
    assert str(oid) in {o["id"] for o in feed}, "посеянный образ не попал в ленту"
    male = client.get("/api/outfits/inspiration?gender=male&limit=50", headers=u.h).json()["outfits"]
    assert str(oid) not in {o["id"] for o in male}, "женский образ в мужской ленте"

    like = client.post("/api/outfits/like", headers=u.h, json={"outfitId": oid, "action": "like"}).json()
    assert like == {"likes": 1, "isLiked": True}
    assert str(oid) in client.get("/api/user-likes", headers=u.h).json()["liked"]
    client.post("/api/outfits/like", headers=u.h, json={"outfitId": oid, "action": "unlike"})
    assert q("SELECT 1 FROM user_likes WHERE outfit_id=$1 AND user_id=$2::uuid", oid, u.id) == []

    r = client.post("/api/outfits/save-to-looks", headers=u.h, json={"outfitId": oid})
    assert r.status_code == 200
    looks = client.get("/api/user-looks", headers=u.h).json()
    assert sorted(i["id"] for i in looks[0]["expandedItems"]) == sorted(items)

    client.post("/api/outfits/track-view", headers=u.h, json={"outfitId": oid})
    client.post("/api/outfits/track-save", headers=u.h, json={"outfitId": oid})
    row = q1("SELECT views_count, favorites_count FROM outfits WHERE id=$1", oid)
    assert (row["views_count"], row["favorites_count"]) == (1, 1)


def test_saving_idea_from_feed_logs_outfit_created(client):
    u = make_user()
    oid, _ = _seed_feed_outfit()
    assert client.post("/api/outfits/save-to-looks", headers=u.h, json={"outfitId": oid}).status_code == 200
    assert events("outfit_created", pid=u.pid), "сохранение идеи из ленты не попало в события"


# ───────────────────────── дизлайки и события рекомендаций ─────────────────────────

def test_item_dislike_roundtrip(client):
    u = make_user()
    cat = add_catalog_item("Кардиган в полоску", "cardigan")
    body = {"item_id": cat, "item_source": "wardrobe_items"}
    assert client.post("/api/items/dislike", headers=u.h, json=body).status_code == 200
    assert client.post("/api/items/dislike", headers=u.h, json=body).status_code == 200  # идемпотентно
    got = client.get("/api/items/dislikes", headers=u.h).json()
    assert [(d["item_id"], d["item_name"]) for d in got] == [(cat, "Кардиган в полоску")]
    assert client.request("DELETE", "/api/items/dislike", headers=u.h, json=body).status_code == 200
    assert client.get("/api/items/dislikes", headers=u.h).json() == []


def test_rec_events_persist(client):
    u = make_user()
    cat = add_catalog_item("Сумка", "bag")
    rs = f"rs-{uuid.uuid4().hex[:8]}"
    for _ in range(2):
        assert client.post("/api/rec-event", headers=u.h, json={
            "rec_session_id": rs, "event": "impression", "item_id": cat, "item_source": "catalog",
            "position": 1}).status_code == 200
    for ev in ("click", "affiliate_click", "dislike_item"):
        assert client.post("/api/rec-event", headers=u.h, json={
            "rec_session_id": rs, "event": ev, "item_id": cat, "item_source": "catalog"}).status_code == 200
    actions = sorted(r["action"] for r in q(
        "SELECT action FROM recommendation_logs WHERE rec_session_id = $1 AND user_id = $2::uuid", rs, u.id))
    assert actions == ["affiliate_click", "click", "dislike", "impression"], "показы не схлопнулись или клик потерян"
    assert q("SELECT 1 FROM user_item_dislikes WHERE user_id=$1::uuid AND item_id=$2", u.id, cat)

    assert client.post("/api/rec-event", headers=u.h, json={
        "rec_session_id": rs, "event": "like_outfit", "suggestion_id": "user_only_abc"}).status_code == 200
    assert q("SELECT 1 FROM user_likes WHERE user_id=$1::uuid AND suggestion_id='user_only_abc'", u.id)
    assert client.post("/api/rec-event", headers=u.h, json={
        "rec_session_id": rs, "event": "click"}).status_code == 400


def test_manual_regeneration_within_cooldown_serves_saved_without_model(client, world):
    u = make_user()
    ids = _wardrobe(client, u)
    world.recs = _sections(ids)
    first = client.post("/api/recommendations", headers=u.h)
    assert first.status_code == 200 and "recs_post" in world.kinds()

    world.calls.clear()
    again = client.post("/api/recommendations", headers=u.h)
    assert again.status_code == 200
    assert world.kinds() == [], "повтор в пределах 5 минут не должен звать модель"
    assert [s["title"] for s in _real(again.json())] == [s["title"] for s in _real(first.json())]


def test_likes_steer_generation_and_disliked_outfit_disappears(client, world):
    from app.api import recommendations as rec
    u = make_user()
    ids = _wardrobe(client, u)
    world.recs = _sections(ids)
    secs = [s for s in _real(client.post("/api/recommendations", headers=u.h).json()) if not s.get("locked")]
    liked_sec, disliked_sec = secs[0], secs[1]
    liked, disliked = liked_sec["suggestions"][0], disliked_sec["suggestions"][0]
    for ev, sug, sec in (("like_outfit", liked, liked_sec), ("dislike_outfit", disliked, disliked_sec)):
        assert client.post("/api/rec-event", headers=u.h, json={
            "event": ev, "suggestion_id": sug["id"], "rec_session_id": sec.get("rec_session_id")}).status_code == 200

    served = [s["id"] for sec in _real(client.get("/api/recommendations", headers=u.h).json()["sections"])
              for s in sec["suggestions"]]
    assert disliked["id"] not in served, "дизлайкнутый образ снова в выдаче"
    assert liked["id"] in served

    prompts = []
    world.recs = lambda text: (prompts.append(text), _sections(ids))[1]
    rec._last_manual_generation.clear()
    assert client.post("/api/recommendations", headers=u.h).status_code == 200
    assert prompts, "генератор не вызывался"
    assert "ПОНРАВИЛИСЬ" in prompts[-1] and "НЕ ПОНРАВИЛИСЬ" in prompts[-1], "реакции не дошли до генератора"
    assert liked["items"][0]["name"] in prompts[-1]


def test_cron_generation_takes_likes_and_dislikes_into_account(client, world):
    """Ночной крон — отдельный генератор (cron.py → _gemini_organize): вкус должен доходить и туда."""
    u = make_user()
    tag = uuid.uuid4().hex[:6]
    tee = add_item(client, u, f"Изумрудная блузка {tag}", "blouse")
    jeans = add_item(client, u, "Синие джинсы", "jeans")
    boots = add_item(client, u, "Чёрные ботинки", "boots")
    skirt = add_item(client, u, f"Леопардовая юбка {tag}", "skirt")

    # Вчерашняя подборка крона: id позиционные, различает их только rec_session_id.
    rs = f"rs-{tag}"
    item = lambda i, n: {"id": i, "item_source": "user", "name": n, "user_id": u.id, "rec_session_id": rs}
    sections = [{"title": "Вчера", "source": "user_only", "rec_session_id": rs, "suggestions": [
        {"id": f"user_only_{u.id[:8]}_0_0", "title": "Понравился",
         "items": [item(tee, f"Изумрудная блузка {tag}"), item(jeans, "Синие джинсы"), item(boots, "Чёрные ботинки")]},
        {"id": f"user_only_{u.id[:8]}_0_1", "title": "Не понравился",
         "items": [item(tee, f"Изумрудная блузка {tag}"), item(skirt, f"Леопардовая юбка {tag}"), item(boots, "Чёрные ботинки")]},
    ]}]
    sql_run("INSERT INTO main_recommendations (user_id, run_date, look_sections, source) "
            "VALUES ($1::uuid, CURRENT_DATE - 1, $2::jsonb, 'gemini')", u.id, json.dumps(sections))
    for ev, sid in (("like_outfit", "_0_0"), ("dislike_outfit", "_0_1")):
        assert client.post("/api/rec-event", headers=u.h, json={
            "event": ev, "suggestion_id": f"user_only_{u.id[:8]}{sid}", "rec_session_id": rs}).status_code == 200

    prompts = []
    world.recs = lambda text: (prompts.append(text), _cron_recs(text))[1]
    r = client.post("/api/cron/generate-recommendations", headers={"X-Cron-Secret": CRON_SECRET})
    assert r.status_code == 200, r.text

    mine = [p for p in prompts if f"Изумрудная блузка {tag}" in p]
    assert mine, "крон не сгенерировал подборку этому пользователю"
    prompt = mine[-1]
    liked = prompt.split("ПОНРАВИЛИСЬ")[1].split("НЕ ПОНРАВИЛИСЬ")[0] if "ПОНРАВИЛИСЬ" in prompt else ""
    assert "Чёрные ботинки" in liked and "Синие джинсы" in liked, "лайк не дошёл до промпта крона"
    assert "НЕ ПОНРАВИЛИСЬ" in prompt and f"Леопардовая юбка {tag}" in prompt.split("НЕ ПОНРАВИЛИСЬ")[1], \
        "дизлайк не дошёл до промпта крона"

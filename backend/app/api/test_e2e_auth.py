# -*- coding: utf-8 -*-
"""E2E: вход через Telegram Mini App, источники переходов, профиль, токены.

Против живой базы (см. e2e_harness.py и scripts/e2e-local.sh). Проверяется не
код ответа, а то, что осталось в базе: строка users, первый источник в
метаданных, событие source_open, профиль.
"""

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
    RUN, events, jmeta, make_user, q, q1, tg_init_data, tg_user,
)


def _login(client, tg, start_param=None, **kw):
    return client.post("/api/auth/telegram/miniapp-session",
                       json={"initData": tg_init_data(tg, start_param, **kw)})


def _user_row(tg):
    return q1("SELECT id, raw_user_meta_data FROM users WHERE email = $1", f"{tg['id']}@telegram.local")


# ───────────────────────────── подпись ─────────────────────────────

def test_miniapp_login_rejects_forged_and_stale_init_data(client):
    tg = tg_user()
    forged = _login(client, tg, bot_token="999:not-our-bot")
    assert forged.status_code == 401
    stale = _login(client, tg, auth_date=1_600_000_000)
    assert stale.status_code == 401
    assert _user_row(tg) is None, "по поддельному initData завёлся пользователь"


# ───────────────────────── источник перехода ─────────────────────────

def test_new_user_from_seeding_link_is_attributed(client):
    """t.me/<bot>?startapp=src_<канал>: новичок получает first_start_param
    навсегда и событие source_open с {start_param, new_user, user_id}."""
    tg, src = tg_user(), f"src_e2e{RUN}"
    r = _login(client, tg, src)
    assert r.status_code == 200, r.text
    body = r.json()
    # Фронт читает строго data.session.access_token (см. память проекта).
    assert body["session"]["access_token"] and body["session"]["refresh_token"]

    row = _user_row(tg)
    assert row, "пользователь не создан"
    meta = jmeta(row["raw_user_meta_data"])
    assert meta["first_start_param"] == src
    assert meta["provider"] == "telegram-miniapp"

    uid = str(row["id"])
    ev = events("source_open", anon=uid)
    assert len(ev) == 1, "source_open не записан (или записан дважды)"
    em = jmeta(ev[0]["metadata"])
    assert em == {"start_param": src, "new_user": True, "user_id": uid}
    assert ev[0]["user_profile_id"] is None  # профиля у новичка ещё нет


def test_relogin_keeps_first_touch_and_logs_repeat_open(client):
    tg = tg_user()
    first, second = f"src_first{RUN}", f"src_second{RUN}"
    assert _login(client, tg, first).status_code == 200
    assert _login(client, tg, second).status_code == 200
    assert _login(client, tg).status_code == 200          # обычный вход без ссылки

    row = _user_row(tg)
    meta = jmeta(row["raw_user_meta_data"])
    assert meta["first_start_param"] == first, "повторный вход стёр первое касание"

    uid = str(row["id"])
    ev = [jmeta(e["metadata"]) for e in events("source_open", anon=uid)]
    assert [e["start_param"] for e in ev] == [first, second], "вход без ссылки не должен писать source_open"
    assert [e["new_user"] for e in ev] == [True, False]


@pytest.mark.parametrize("param", ["bc12", "ap7", "src_", "src_плохой", "ref_a b", "x" * 70])
def test_non_attribution_start_params_are_ignored(client, param):
    """bc<id>/ap<id> — рассылки и автопуши, их логирует фронт; мусор не пишем."""
    tg = tg_user()
    assert _login(client, tg, param).status_code == 200
    row = _user_row(tg)
    assert "first_start_param" not in jmeta(row["raw_user_meta_data"])
    assert events("source_open", anon=str(row["id"])) == []


def test_source_open_follows_user_into_profile_funnel(client):
    """После регистрации события пишутся уже на профиль; /admin/sources считает
    по user_id из метаданных, поэтому новичок с вещами виден в with_items."""
    tg, src = tg_user(), f"src_funnel{RUN}"
    token = _login(client, tg, src).json()["session"]["access_token"]
    h = {"Authorization": f"Bearer {token}"}

    r = client.post("/api/me/profile-session", headers=h, json={
        "full_name": "Е2Е", "gender": "female", "height": "163,5", "weight": "55.2",
        "top_size": "S", "bottom_size": "S", "onboarding_complete": True})
    assert r.status_code == 200, r.text
    prof = client.get("/api/me/profile", headers=h).json()["profile"]
    assert prof["height"] == 164 and float(prof["weight"]) == 55.2
    assert prof["onboarding_complete"] is True

    r = client.post("/api/wardrobe-user-items", headers=h,
                    json={"item_name": "Футболка", "clothing_type": "t-shirt"})
    assert r.status_code == 200

    admin = make_user(role="admin")
    src_rows = {s["source"]: s for s in client.get("/api/admin/sources", headers=admin.h).json()["sources"]}
    assert src in src_rows, "источник не виден в /api/admin/sources"
    assert src_rows[src]["users"] == 1 and src_rows[src]["new_users"] == 1
    assert src_rows[src]["with_items"] == 1


# ───────────────────────────── токены ─────────────────────────────

def test_refresh_token_rotates_session(client):
    tg = tg_user()
    s = _login(client, tg).json()["session"]
    r = client.post("/api/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r.status_code == 200, r.text
    new_access = r.json()["session"]["access_token"]
    me = client.get("/api/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200 and me.json()["user"]["email"] == f"{tg['id']}@telegram.local"

    # access-токен в роли refresh не годится, и наоборот
    assert client.post("/api/auth/refresh", json={"refresh_token": s["access_token"]}).status_code == 401
    assert client.get("/api/me", headers={"Authorization": f"Bearer {s['refresh_token']}"}).status_code == 401
    assert client.get("/api/me").status_code == 401


def test_every_authenticated_request_marks_daily_activity(client):
    """DAU/MAU считаются из daily_user_activity — её пишет любая авторизованная
    ручка (deps._touch_activity), а не только метрируемые функции."""
    u = make_user()
    assert client.get("/api/me", headers=u.h).status_code == 200
    assert q("SELECT 1 FROM daily_user_activity WHERE user_profile_id = $1", u.pid), \
        "заход в приложение не отметил активность"


# ─────────────────────────── профиль / онбординг ───────────────────────────

def test_profile_registration_validation_and_partial_update(client):
    u = make_user(profile=False)
    assert client.get("/api/me/profile", headers=u.h).json() == {"profile": None}
    bad = client.post("/api/me/profile-session", headers=u.h, json={"height": "метр шестьдесят"})
    assert bad.status_code == 400, "мусор в росте должен давать 400, а не 500"

    ok = client.post("/api/me/profile-session", headers=u.h,
                     json={"full_name": "Аня", "gender": "female", "onboarding_complete": False})
    assert ok.status_code == 200
    client.post("/api/me/profile-session", headers=u.h, json={"onboarding_complete": True, "shoe_size": "38"})
    row = q1("SELECT full_name, gender, onboarding_complete, shoe_size FROM user_profiles WHERE user_id = $1::uuid", u.id)
    assert dict(row) == {"full_name": "Аня", "gender": "female", "onboarding_complete": True, "shoe_size": "38"}

    sess = client.get("/api/me/profile-session", headers=u.h).json()
    assert sess["profile"]["full_name"] == "Аня" and sess["user"]["id"] == u.id


def test_pre_profile_client_events_are_kept(client):
    """Регистрационные шаги пишутся ДО профиля: ключ — auth user_id."""
    u = make_user(profile=False)
    r = client.post("/api/usage/log", headers=u.h, json={
        "feature": "registration_step", "action": "view",
        "meta": {"step": 1, "pagePath": "/auth/mini-registration"}})
    assert r.status_code == 200
    ev = events("registration_step", anon=u.id)
    assert len(ev) == 1 and ev[0]["user_profile_id"] is None
    assert ev[0]["page_path"] == "/auth/mini-registration"

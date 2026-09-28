# -*- coding: utf-8 -*-
"""E2E входа через Telegram Login Widget (сайт) и Яндекс ID.

Против живой базы (см. e2e_harness.py). Яндекс ходит в oauth.yandex.ru и
login.yandex.ru — оба адреса на заглушке world.routes, и заглушка проверяет,
что бэкенд отдал ей правильные секрет, redirect_uri и токен. Результат
проверяется по строке users (e-mail-ключ, метаданные), а не по коду ответа.
"""

import hashlib
import hmac
import os
import sys
import time
import urllib.parse
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path = [p for p in sys.path if os.path.abspath(p or ".") != HERE]
sys.path.insert(0, os.path.join(HERE, "..", ".."))

import httpx  # noqa: E402
import pytest  # noqa: E402

if "DATABASE_URL" not in os.environ:
    pytest.skip("нужен живой Postgres — см. scripts/e2e-local.sh", allow_module_level=True)

from app.api.e2e_harness import *  # noqa: E402,F401,F403
from app.api.e2e_harness import BOT_TOKEN, RUN, jmeta, q1, tg_init_data, tg_user  # noqa: E402
from app.core.security import decode_token  # noqa: E402


def _user(email):
    return q1("SELECT id, raw_user_meta_data FROM users WHERE email = $1", email)


# ─────────────────────── Telegram Login Widget ───────────────────────

def widget_payload(tg_id: int, *, bot_token: str = BOT_TOKEN, auth_date: int | None = None, **fields) -> dict:
    """Данные, которые виджет Telegram отдаёт сайту: подпись HMAC-SHA256 с ключом
    SHA256(bot_token) — не так, как у Mini App (там HMAC("WebAppData"))."""
    data = {"id": tg_id, "first_name": "Вера", "username": f"vera_{RUN}",
            "auth_date": auth_date or int(time.time()), **fields}
    dcs = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    data["hash"] = hmac.new(hashlib.sha256(bot_token.encode()).digest(), dcs.encode(), hashlib.sha256).hexdigest()
    return data


def _widget_login(client, data):
    return client.post("/api/auth/telegram/login-widget-session", json={"user": data})


def test_login_widget_valid_signature_creates_and_reuses_account(client):
    tg_id = uuid.uuid4().int % 10**10 + 10**9
    r = _widget_login(client, widget_payload(tg_id, photo_url="https://t.me/i/userpic/1.jpg"))
    assert r.status_code == 200, r.text
    body = r.json()
    row = _user(f"{tg_id}@telegram.local")
    assert row, "аккаунт не создан"
    assert body["user"]["id"] == str(row["id"])
    claims = decode_token(body["session"]["access_token"])
    assert claims["sub"] == str(row["id"]) and claims["type"] == "access"
    meta = jmeta(row["raw_user_meta_data"])
    assert meta["telegram_id"] == str(tg_id) and meta["telegram_photo_url"].endswith("/1.jpg")

    # Повторный вход виджетом и вход из Mini App — тот же аккаунт, не второй.
    again = _widget_login(client, widget_payload(tg_id, username="vera_new"))
    assert again.json()["user"]["id"] == str(row["id"])
    mini = client.post("/api/auth/telegram/miniapp-session",
                       json={"initData": tg_init_data({**tg_user(tg_id), "id": tg_id})})
    assert mini.status_code == 200 and mini.json()["user"]["id"] == str(row["id"])
    assert q1("SELECT count(*) AS n FROM users WHERE email = $1", f"{tg_id}@telegram.local")["n"] == 1


@pytest.mark.parametrize("case", ["foreign_bot", "tampered", "stale", "no_hash", "mini_app_scheme", "garbage_date"])
def test_login_widget_rejects_bad_signature(client, case):
    tg_id = uuid.uuid4().int % 10**10 + 10**9
    if case == "foreign_bot":
        data = widget_payload(tg_id, bot_token="999:other-bot")
    elif case == "tampered":
        data = widget_payload(tg_id)
        data["id"] = tg_id + 1                      # подпись от одного id, вход под другим
        tg_id += 1
    elif case == "stale":
        data = widget_payload(tg_id, auth_date=int(time.time()) - 2 * 3600)
    elif case == "no_hash":
        data = widget_payload(tg_id)
        data.pop("hash")
    elif case == "mini_app_scheme":
        # Подпись по схеме Mini App (HMAC "WebAppData") виджетом не принимается.
        data = {"id": tg_id, "first_name": "Вера", "auth_date": int(time.time())}
        dcs = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
        secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        data["hash"] = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
    else:
        data = widget_payload(tg_id)
        data["auth_date"] = "вчера"
    r = _widget_login(client, data)
    assert r.status_code == 401, (case, r.status_code, r.text)
    assert _user(f"{tg_id}@telegram.local") is None, f"{case}: по негодным данным завёлся аккаунт"


def test_miniapp_garbage_auth_date_is_401_not_500(client):
    tg = tg_user()
    raw = tg_init_data(tg).replace("auth_date=", "auth_date=x")
    r = client.post("/api/auth/telegram/miniapp-session", json={"initData": raw})
    assert r.status_code == 401


# ──────────────────────────────── Яндекс ID ────────────────────────────────

FRONT = "https://modemorph.e2e"


@pytest.fixture
def yandex(world, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "YANDEX_OAUTH_CLIENT_ID", "e2e-ya-client")
    monkeypatch.setattr(settings, "YANDEX_OAUTH_CLIENT_SECRET", "e2e-ya-secret")
    monkeypatch.setattr(settings, "FRONTEND_URL", FRONT + "/")
    state = {"codes": {}, "forms": [], "info_status": 200}

    def token(request: httpx.Request) -> httpx.Response:
        form = dict(urllib.parse.parse_qsl(request.content.decode()))
        state["forms"].append(form)
        ok = (form.get("client_id") == "e2e-ya-client" and form.get("client_secret") == "e2e-ya-secret"
              and form.get("grant_type") == "authorization_code"
              and form.get("redirect_uri") == f"{FRONT}/auth/yandex/callback")
        user = state["codes"].get(form.get("code"))
        if not ok or not user:
            return httpx.Response(400, json={"error": "invalid_grant", "error_description": "Code has expired"})
        return httpx.Response(200, json={"access_token": f"ya-{form['code']}", "token_type": "bearer"})

    def info(request: httpx.Request) -> httpx.Response:
        if state["info_status"] != 200:
            return httpx.Response(state["info_status"], json={"error": "unavailable"})
        auth = request.headers.get("authorization", "")
        code = auth.removeprefix("OAuth ya-")
        if not auth.startswith("OAuth ya-") or code not in state["codes"]:
            return httpx.Response(401, text="invalid token")
        assert request.url.params.get("format") == "json"
        return httpx.Response(200, json=state["codes"][code])

    world.routes["https://oauth.yandex.ru/token"] = token
    world.routes["https://login.yandex.ru/info"] = info
    return state


def _ya_user(yid, **kw):
    return {"id": yid, "login": f"vera.{RUN}", "first_name": "Вера", "last_name": "Петрова",
            "default_email": f"vera.{RUN}@yandex.ru", "default_phone": {"id": 1, "number": "+79990000000"}, **kw}


def test_yandex_start_redirects_to_consent_screen(client, yandex):
    r = client.get("/api/auth/yandex/start", follow_redirects=False)
    assert r.status_code == 302
    loc = urllib.parse.urlsplit(r.headers["location"])
    assert (loc.scheme, loc.netloc, loc.path) == ("https", "oauth.yandex.ru", "/authorize")
    qs = dict(urllib.parse.parse_qsl(loc.query))
    assert qs["client_id"] == "e2e-ya-client" and qs["response_type"] == "code"
    assert qs["redirect_uri"] == f"{FRONT}/auth/yandex/callback"
    assert "e2e-ya-secret" not in r.headers["location"]


def test_yandex_code_exchange_creates_account_then_relogin_reuses_it(client, yandex):
    yid = str(uuid.uuid4().int % 10**12)
    yandex["codes"]["c1"] = _ya_user(yid)
    r = client.post("/api/auth/yandex/session", json={"code": " c1 "})
    assert r.status_code == 200, r.text
    row = _user(f"{yid}@yandex.local")
    assert row and r.json()["user"]["id"] == str(row["id"])
    meta = jmeta(row["raw_user_meta_data"])
    assert meta["provider"] == "yandex" and meta["yandex_id"] == yid
    assert meta["yandex_email"] == f"vera.{RUN}@yandex.ru" and meta["yandex_default_phone"] == "+79990000000"
    assert meta["full_name"] == "Вера Петрова"
    assert decode_token(r.json()["session"]["access_token"])["sub"] == str(row["id"])
    assert yandex["forms"][-1]["code"] == "c1"   # пробелы вокруг кода срезаны

    # Второй вход (новый код, сменился логин) — тот же аккаунт, метаданные свежие.
    yandex["codes"]["c2"] = _ya_user(yid, login="vera.new", default_phone=None)
    r2 = client.post("/api/auth/yandex/session", json={"code": "c2"})
    assert r2.status_code == 200 and r2.json()["user"]["id"] == str(row["id"])
    meta2 = jmeta(_user(f"{yid}@yandex.local")["raw_user_meta_data"])
    assert meta2["yandex_login"] == "vera.new" and meta2["yandex_default_phone"] is None
    assert q1("SELECT count(*) AS n FROM users WHERE email = $1", f"{yid}@yandex.local")["n"] == 1


def test_yandex_bad_code_or_userinfo_failure_creates_nothing(client, yandex):
    yid = str(uuid.uuid4().int % 10**12)
    r = client.post("/api/auth/yandex/session", json={"code": "expired"})
    assert r.status_code == 401
    assert client.post("/api/auth/yandex/session", json={"code": "   "}).status_code == 400

    yandex["codes"]["c3"] = _ya_user(yid)
    yandex["info_status"] = 503
    r = client.post("/api/auth/yandex/session", json={"code": "c3"})
    assert r.status_code == 401
    assert _user(f"{yid}@yandex.local") is None


def test_yandex_not_configured_is_501(client, world, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "YANDEX_OAUTH_CLIENT_ID", "")
    assert client.get("/api/auth/yandex/start", follow_redirects=False).status_code == 501
    assert client.post("/api/auth/yandex/session", json={"code": "x"}).status_code == 501
    assert not world.calls, "без настройки всё равно пошли в Яндекс"

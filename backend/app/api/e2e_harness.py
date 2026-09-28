# -*- coding: utf-8 -*-
"""Общая обвязка e2e-набора: живой Postgres + FastAPI TestClient + внешний мир
на заглушках.

Что настоящее: приложение целиком (роуты, зависимости, SQL, фильтры, лимиты) и
база с миграциями, накатанными с нуля. Что подменено: только то, что уходит за
пределы машины, — OpenRouter (Gemini), CLIP-сервис, картинки по URL, S3. Подмена
стоит на границе HTTP (httpx.AsyncClient получает MockTransport), поэтому вся
логика между запросом пользователя и вызовом модели исполняется по-настоящему.

Любой исходящий запрос, которого нет в маршрутах заглушки, записывается в
`world.unmocked`, и тест падает: иначе e2e тихо ходил бы в интернет (или в
Telegram от имени бота), а мы бы об этом не знали.

Файл не начинается с test_, поэтому pytest его не собирает: он подключается из
test_e2e_*.py через `from app.api.e2e_harness import *`.
"""

import asyncio
import base64
import hashlib
import hmac
import io
import json
import os
import re
import time
import urllib.parse
import uuid
from dataclasses import dataclass

import asyncpg
import httpx
import pytest
from PIL import Image

os.environ.setdefault("JWT_SECRET", "test-secret-" + "x" * 32)
os.environ.setdefault("TELEGRAM_PEPPER", "test-pepper")

from app.core.config import settings  # noqa: E402
from app.core.security import create_access_token  # noqa: E402

BOT_TOKEN = "123456:E2E-test-bot-token"
CRON_SECRET = "e2e-cron-secret"
AI_URL = "http://ai.e2e"
IMG = "http://img.e2e"
RK_LOGIN, RK_PASS1, RK_PASS2 = "e2e-shop", "e2e-pass1", "e2e-pass2"

# Метка прогона: попадает в имена источников и e-mail'ы, чтобы повторный прогон
# на той же базе не путал свои строки с чужими.
RUN = uuid.uuid4().hex[:6]


# ──────────────────────────────── база ────────────────────────────────

def _dsn() -> str:
    return settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


async def _afetch(sql, *args):
    conn = await asyncpg.connect(_dsn())
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _arun(sql, *args):
    conn = await asyncpg.connect(_dsn())
    try:
        return await conn.execute(sql, *args)
    finally:
        await conn.close()


def q(sql, *args):
    """SELECT голым asyncpg — мимо пула приложения, чтобы не делить с ним цикл."""
    return asyncio.run(_afetch(sql, *args))


def q1(sql, *args):
    rows = q(sql, *args)
    return rows[0] if rows else None


def sql_run(sql, *args):
    return asyncio.run(_arun(sql, *args))


def jmeta(value):
    """asyncpg отдаёт jsonb строкой."""
    if value is None or isinstance(value, (dict, list)):
        return value
    return json.loads(value)


def events(feature: str, *, anon: str | None = None, pid: int | None = None, action: str | None = None):
    """Строки usage_events по фиче для одного человека (по профилю или по anon)."""
    sql = "SELECT * FROM usage_events WHERE feature = $1"
    args = [feature]
    if pid is not None:
        args.append(pid)
        sql += f" AND user_profile_id = ${len(args)}"
    if anon is not None:
        args.append(anon)
        sql += f" AND user_anon_id = ${len(args)}"
    if action is not None:
        args.append(action)
        sql += f" AND action = ${len(args)}"
    return q(sql + " ORDER BY id", *args)


# ─────────────────────────────── люди ────────────────────────────────

@dataclass
class U:
    id: str
    email: str
    token: str
    pid: int | None

    @property
    def h(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"}


def make_user(*, profile: bool = True, role: str = "user", gender: str = "female",
              offer_group: bool | None = None) -> U:
    """Пользователь напрямую в базе. offer_group=True/False — подобрать id так,
    чтобы человек попал (или не попал) в группу разового предложения."""
    from app.services.discounts import in_offer_group

    while True:
        uid = str(uuid.uuid4())
        if offer_group is None or in_offer_group(uid) == offer_group:
            break
    email = f"e2e-{RUN}-{uid[:8]}@test.local"
    sql_run("INSERT INTO users (id, email, encrypted_password, raw_user_meta_data) "
            "VALUES ($1, $2, 'x', '{}'::jsonb)", uuid.UUID(uid), email)
    # Миграция 004 вешает на user_item_dislikes внешний ключ к auth.users
    # (заглушке Supabase). На проде его сняли при переезде, в накате с нуля он
    # есть — без строки-двойника любой дизлайк в тесте падал бы на FK.
    sql_run("INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING", uuid.UUID(uid))
    pid = None
    if profile:
        pid = q1("INSERT INTO user_profiles (user_id, gender, full_name, role, onboarding_complete) "
                 "VALUES ($1, $2, 'E2E', $3, true) RETURNING id",
                 uuid.UUID(uid), gender, role)["id"]
    return U(uid, email, create_access_token(uid, email), pid)


def give_plan(pid: int, plan: str = "monthly", days: int = 30):
    sql_run("""
        INSERT INTO user_subscriptions (user_profile_id, subscription_type, status, start_date, expires_at)
        VALUES ($1, $2, 'active', NOW(), NOW() + make_interval(days => $3))
        ON CONFLICT (user_profile_id) DO UPDATE
        SET subscription_type = EXCLUDED.subscription_type, status = 'active',
            expires_at = EXCLUDED.expires_at
    """, pid, plan, days)


def add_item(client, user: U, name: str, ctype: str, **extra) -> int:
    """Вещь в гардероб через ручку, а не INSERT: путь сохранения тоже под тестом."""
    body = {"item_name": name, "clothing_type": ctype, "color": "Чёрный",
            "image_url": f"{IMG}/{uuid.uuid4().hex[:6]}.png", "temp_min": -10, "temp_max": 35}
    body.update(extra)
    r = client.post("/api/wardrobe-user-items", json=body, headers=user.h)
    assert r.status_code == 200, r.text
    return r.json()["data"]["id"]


def add_catalog_item(name: str, ctype: str, gender: str = "female", **extra) -> int:
    cols = {"item_name": name, "clothing_type": ctype, "gender": gender,
            "image_url": f"{IMG}/cat-{uuid.uuid4().hex[:6]}.png", "color": "Белый",
            "url": "https://shop.example/item", "notes": f"E2E:{uuid.uuid4().hex[:6]}"}
    cols.update(extra)
    keys = list(cols)
    sql = (f"INSERT INTO wardrobe_items ({', '.join(keys)}) VALUES "
           f"({', '.join(f'${i + 1}' for i in range(len(keys)))}) RETURNING id")
    return q1(sql, *cols.values())["id"]


# ────────────────────────────── Telegram ──────────────────────────────

def tg_init_data(tg_user: dict, start_param: str | None = None, *, bot_token: str = BOT_TOKEN,
                 auth_date: int | None = None) -> str:
    """initData, подписанный так же, как его подписывает Telegram (WebAppData HMAC)."""
    params = {
        "auth_date": str(auth_date or int(time.time())),
        "query_id": "AAE2E",
        "user": json.dumps(tg_user, separators=(",", ":"), ensure_ascii=False),
    }
    if start_param is not None:
        params["start_param"] = start_param
    dcs = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    params["hash"] = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
    return urllib.parse.urlencode(params)


def tg_user(tg_id: int | None = None) -> dict:
    return {"id": tg_id or (uuid.uuid4().int % 10**10 + 10**9),
            "first_name": "Е2Е", "username": f"e2e_{RUN}"}


# ────────────────────────────── картинки ──────────────────────────────

def png(kind: str = "item", size: int = 64) -> bytes:
    """Детерминированные картинки. avatar и vton различаются градиентом в разные
    стороны — dHash между ними 64 бита, так что фильтр «модель вернула аватар»
    их не спутает."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for x in range(size):
        for y in range(size):
            v = int(255 * x / (size - 1))
            if kind == "avatar":
                px[x, y] = (v, v, v)
            elif kind == "vton":
                px[x, y] = (255 - v, 255 - v, 255 - v)
            else:
                px[x, y] = ((x * 7) % 256, (y * 5) % 256, 128)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def data_uri(raw: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(raw).decode()


# ───────────────────────────── внешний мир ─────────────────────────────

def _chat(content) -> dict:
    return {"choices": [{"message": {"content": content if isinstance(content, str)
                                     else json.dumps(content, ensure_ascii=False)}}],
            "usage": {"total_tokens": 1}}


def _prompt_text(payload: dict) -> str:
    out = []
    for m in payload.get("messages", []):
        c = m.get("content")
        if isinstance(c, str):
            out.append(c)
        elif isinstance(c, list):
            out.extend(p.get("text", "") for p in c if isinstance(p, dict))
    return "\n".join(out)


class World:
    """Состояние заглушек на один тест. Тест меняет поля — заглушки отвечают."""

    def __init__(self):
        self.calls: list[tuple[str, str, str]] = []   # (сервис, путь, вид)
        self.unmocked: list[str] = []
        self.s3: list[dict] = []
        self.detect_items = [
            {"clothing_item": "t-shirt", "part": "upper", "item_name": "Белая футболка",
             "description": "Футболка", "description_en": "white cotton t-shirt", "color": "Белый"},
            {"clothing_item": "jeans", "part": "lower", "item_name": "Синие джинсы",
             "description": "Джинсы", "description_en": "blue denim jeans", "color": "Синий"},
            {"clothing_item": "gloves", "part": "accessories", "item_name": "Перчатки",
             "description": "Перчатки", "description_en": "gloves", "color": "Чёрный"},
        ]
        self.recs = None            # list | callable(prompt) -> list
        self.judge_fail = False
        self.judge_weak_marker = "слабая"
        self.style = None           # dict ответа style-check
        self.nearest: list = []     # ответ /clip/wardrobe-fit
        self.wardrobe_fit_form = None
        self.assistant = [{"content": "Совет"}]
        self.clip_recommend = {"results": [], "rec_session_id": "rs-e2e"}

    # ── OpenRouter ──
    def openrouter(self, payload: dict) -> httpx.Response:
        text = _prompt_text(payload)
        if "Ты строгий стилист" in text:
            self.calls.append(("openrouter", "chat", "judge"))
            if self.judge_fail:
                return httpx.Response(500, json={"error": "judge down"})
            listing = text.split("\n\n", 1)[1] if "\n\n" in text else text
            scores = []
            for line in listing.splitlines():
                m = re.match(r"\s*(\d+)\.\s*(.*)", line)
                if m:
                    weak = self.judge_weak_marker in m.group(2).lower()
                    scores.append({"i": int(m.group(1)), "score": 2 if weak else 8})
            return httpx.Response(200, json=_chat(scores))
        if "Analyze this photo and detect" in text:
            self.calls.append(("openrouter", "chat", "detect"))
            return httpx.Response(200, json=_chat(self.detect_items))
        if payload.get("modalities"):
            kind = "grid" if "2x2 grid" in text else "vton"
            self.calls.append(("openrouter", "chat", f"image:{kind}"))
            raw = png("item", 128) if kind == "grid" else png("vton")
            return httpx.Response(200, json={"choices": [{"message": {
                "content": "", "images": [{"image_url": {"url": data_uri(raw)}}]}}]})
        if "думает купить" in text:
            self.calls.append(("openrouter", "chat", "style_check"))
            return httpx.Response(200, json=_chat(self.style or {"is_clothing": True, "outfits": []}))
        if "fashion stylist AI assistant" in text:
            self.calls.append(("openrouter", "chat", "assistant"))
            return httpx.Response(200, json=_chat(self.assistant))
        if "топ-стилист" in text or "themed sections" in text:
            kind = "recs_cron" if "топ-стилист" in text else "recs_post"
            self.calls.append(("openrouter", "chat", kind))
            recs = self.recs(text) if callable(self.recs) else (self.recs or [])
            return httpx.Response(200, json=_chat(recs))
        self.calls.append(("openrouter", "chat", "UNKNOWN"))
        self.unmocked.append("openrouter: неизвестный промпт " + text[:80])
        return httpx.Response(500, json={"error": "unknown prompt in e2e mock"})

    def kinds(self, service: str = "openrouter") -> list[str]:
        return [k for s, _, k in self.calls if s == service]

    # ── маршрутизатор ──
    def handle(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        path = request.url.path
        if request.url.host == "openrouter.ai":
            return self.openrouter(json.loads(request.content or b"{}"))
        if url.startswith(AI_URL):
            self.calls.append(("clip", path, request.method))
            if path == "/clip/remove-bg":
                return httpx.Response(503, text="no bg removal in e2e")
            if path == "/clip/recommend":
                return httpx.Response(200, json=self.clip_recommend)
            if path == "/clip/wardrobe-fit":
                self.wardrobe_fit_form = request.content
                return httpx.Response(200, json={"nearest": self.nearest})
            if path in ("/clip/search/text", "/clip/search"):
                return httpx.Response(200, json={"results": []})
            return httpx.Response(200, json={"ok": True})
        if url.startswith(IMG):
            self.calls.append(("img", path, request.method))
            kind = "avatar" if "avatar" in path else "item"
            return httpx.Response(200, content=png(kind), headers={"content-type": "image/png"})
        self.unmocked.append(f"{request.method} {url}")
        return httpx.Response(599, text="e2e: outbound call is not mocked")


class _FakeS3:
    def __init__(self, world: World):
        self.world = world

    def put_object(self, **kw):
        self.world.s3.append({k: v for k, v in kw.items() if k != "Body"})
        return {}


@pytest.fixture(autouse=True)
def world(monkeypatch):
    """Подменяет внешний мир на время теста и проверяет, что наружу никто не ушёл."""
    w = World()
    real = httpx.AsyncClient

    class MockedAsyncClient(real):
        def __init__(self, *a, **kw):
            kw["transport"] = httpx.MockTransport(w.handle)
            super().__init__(*a, **kw)

    monkeypatch.setattr(httpx, "AsyncClient", MockedAsyncClient)
    import boto3
    monkeypatch.setattr(boto3, "client", lambda *a, **kw: _FakeS3(w))

    for name, value in {
        "TELEGRAM_BOT_TOKEN": BOT_TOKEN, "CRON_SECRET": CRON_SECRET, "BOT_SECRET": "",
        "OPENROUTER_API_KEY": "e2e-openrouter-key", "AI_SERVICE_URL": AI_URL,
        "OPENWEATHER_API_KEY": "", "ROBOKASSA_LOGIN": RK_LOGIN,
        "ROBOKASSA_PASS1": RK_PASS1, "ROBOKASSA_PASS2": RK_PASS2,
    }.items():
        monkeypatch.setattr(settings, name, value)

    yield w
    assert not w.unmocked, f"исходящие запросы мимо заглушек: {w.unmocked}"


@pytest.fixture(scope="module")
def client():
    """Один TestClient на модуль, внутри `with`: так у приложения один цикл событий
    на весь модуль, и пул SQLAlchemy не переезжает между циклами. На выходе пул
    закрывается в том же цикле — иначе следующий модуль (test_e2e_money ходит в
    async_session через asyncio.run) получил бы соединения мёртвого цикла."""
    from fastapi.testclient import TestClient

    import app.api as api_pkg
    from app.core.database import engine
    from app.main import app

    # Лимиты частоты (slowapi) в e2e мешают: все запросы идут с одного адреса.
    app.state.limiter.enabled = False
    for mod_name in dir(api_pkg):
        lim = getattr(getattr(api_pkg, mod_name), "limiter", None)
        if lim is not None and hasattr(lim, "enabled"):
            lim.enabled = False

    with TestClient(app) as c:
        yield c
        c.portal.call(engine.dispose)


def robokassa_result(client, invoice_id: int, out_sum, *, pass2: str = RK_PASS2):
    """Вебхук Робокассы с правильной подписью (как её считает Робокасса)."""
    out = str(out_sum)
    sig = hashlib.md5(f"{out}:{invoice_id}:{pass2}".encode()).hexdigest().upper()
    return client.post("/api/payments/robokassa/result",
                       data={"OutSum": out, "InvId": str(invoice_id), "SignatureValue": sig})


__all__ = [n for n in dir() if not n.startswith("__")]

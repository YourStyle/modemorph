# -*- coding: utf-8 -*-
"""E2E импорта товарных фидов: партнёрский фид из кабинета (cron process-feeds),
фиды Admitad (cron import-feeds и sync-feeds) и ручной импортёр
ai-service/scripts/import_catalog.py.

Правило проекта (CLAUDE.md): КАЖДЫЙ оффер — в том числе с одной картинкой —
проходит /clip/pick-flatlay, has_person=true → is_hidden=true. Здесь это
проверяется по тому, что реально ушло в CLIP, и по строкам wardrobe_items.

Наружу ничего не ходит: фиды Admitad отдаёт world.routes, файл партнёра
«лежит» в заглушке S3 (кабинет кладёт — крон читает по тому же адресу).
"""

import importlib.util
import os
import sys
import types
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path = [p for p in sys.path if os.path.abspath(p or ".") != HERE]
sys.path.insert(0, os.path.join(HERE, "..", ".."))

import httpx  # noqa: E402
import pytest  # noqa: E402

if "DATABASE_URL" not in os.environ:
    pytest.skip("нужен живой Postgres — см. scripts/e2e-local.sh", allow_module_level=True)

from app.api.e2e_harness import *  # noqa: E402,F401,F403
from app.api.e2e_harness import (  # noqa: E402
    RUN, add_catalog_item, cron, ensure_partner_cabinet_schema, make_partner, q, q1,
)

FEED_IMG = "http://img.e2e/feed"

# Шесть офферов, по одному на каждый путь парсера:
#   1 платье, две картинки: первая на модели (avatar-*), вторая предметная;
#   2 футболка, ОДНА предметная картинка (и её — в pick-flatlay);
#   3 джинсы, ОДНА картинка, на ней человек → has_person → is_hidden;
#   4 детская футболка → отбрасывается; 5 без картинок → отбрасывается;
#   6 ремень (категория вне каталога) → отбрасывается.
OFFERS = {
    "1": ("Платье миди из вискозы", "10", ["avatar-1.jpg", "flat-1.jpg"], "5990"),
    "2": ("Футболка базовая белая", "13", ["flat-2.jpg"], "1290"),
    "3": ("Джинсы прямые синие", "11", ["avatar-3.jpg"], "3990"),
    "4": ("Футболка детская с принтом", "21", ["flat-4.jpg"], "790"),
    "5": ("Платье без фото", "10", [], "4990"),
    "6": ("Ремень кожаный", "30", ["flat-6.jpg"], "1990"),
}
IMPORTABLE = ["1", "2", "3"]


def feed_xml(shop: str, prefix: str, ids=None, extra: dict | None = None) -> bytes:
    offers = {**OFFERS, **(extra or {})}
    keep = offers if ids is None else {k: offers[k] for k in ids}
    parts = []
    for oid, (name, cat, pics, price) in keep.items():
        pictures = "".join(f"<picture>{FEED_IMG}/{prefix}/{p}</picture>" for p in pics)
        parts.append(
            f'<offer id="{prefix}-{oid}" available="true"><name>{name}</name>'
            f"<url>https://shop.e2e/p/{prefix}-{oid}</url><price>{price}</price>"
            f"<currencyId>RUB</currencyId><categoryId>{cat}</categoryId>{pictures}"
            '<param name="Материал">Хлопок</param></offer>')
    return (
        '<?xml version="1.0" encoding="UTF-8"?><yml_catalog date="2026-09-28 10:00"><shop>'
        f"<name>{shop}</name><categories>"
        '<category id="1">Женское</category>'
        '<category id="10" parentId="1">Платья</category>'
        '<category id="11" parentId="1">Джинсы</category>'
        '<category id="12" parentId="1">Футболки</category>'
        # «Футболки и лонгсливы», а не «Футболки»: у import_catalog.py своя старая
        # таблица категорий, и простых «Футболок» в ней нет — оффер он бы выбросил.
        '<category id="13" parentId="1">Футболки и лонгсливы</category>'
        '<category id="20">Детское</category>'
        '<category id="21" parentId="20">Футболки</category>'
        '<category id="30" parentId="1">Ремни</category>'
        f"</categories><offers>{''.join(parts)}</offers></shop></yml_catalog>"
    ).encode("utf-8")


def flatlay(urls: list[str]) -> dict:
    """Как /clip/pick-flatlay: лучшая картинка без человека; has_person — если
    предметной нет вовсе."""
    flat = [u for u in urls if "avatar" not in u]
    return {"url": (flat or urls or [None])[0], "has_person": not flat and bool(urls)}


def flatlay_calls(world) -> list[list[str]]:
    return [b["urls"] for p, b in world.clip_json if p == "/clip/pick-flatlay"]


@pytest.fixture(scope="module", autouse=True)
def _schema():
    ensure_partner_cabinet_schema()  # partner_feeds / feed_id / price — см. test_e2e_partner


@pytest.fixture(autouse=True)
def _flatlay(world):
    world.flatlay = flatlay


# ─────────────────────── партнёрский фид из кабинета ───────────────────────

def _upload(client, user, xml: bytes, name="catalog.yml"):
    return client.post("/api/partner/feeds", headers=user.h,
                       files={"feed_file": (name, xml, "application/xml")})


def _drain_pending(client):
    """Крон берёт по одному (самому старому) фиду за вызов. Хвост очереди от
    упавшего прошлого прогона снимаем, чтобы следующий вызов взял именно наш."""
    from app.api.e2e_harness import sql_run

    sql_run("UPDATE partner_feeds SET status = 'failed', error_log = 'e2e: stale' WHERE status = 'pending'")


def test_partner_feed_upload_process_and_reimport(client, world):
    a, a_pid = make_partner(client)
    b, _ = make_partner(client)
    prefix = f"p{RUN}{uuid.uuid4().hex[:4]}"
    xml = feed_xml(f"Лавка {prefix}", prefix)

    assert _upload(client, a, b"sku;name\n1;x", name="catalog.csv").status_code == 400
    _drain_pending(client)
    r = _upload(client, a, xml)
    assert r.status_code == 200, r.text
    feed = r.json()["feed"]
    row = q1("SELECT * FROM partner_feeds WHERE id = $1", feed["id"])
    assert row["partner_id"] == a_pid and row["status"] == "pending"
    assert f"/feeds/{a_pid}/" in row["file_url"] and row["file_url"].endswith("_catalog.yml")
    assert client.get(f"/api/partner/feeds/{feed['id']}", headers=b.h).status_code == 404

    world.clip_json.clear()
    res = cron(client, "process-feeds").json()
    assert res == {"success": True, "feed_id": feed["id"], "imported": 3, "skipped": 0}, res

    # Каждый импортируемый оффер — через pick-flatlay, включая одно-картиночные.
    calls = flatlay_calls(world)
    assert sorted(calls) == sorted([[f"{FEED_IMG}/{prefix}/{p}" for p in OFFERS[o][2]] for o in IMPORTABLE])

    items = {r["source_sku"]: r for r in q(
        "SELECT * FROM wardrobe_items WHERE feed_id = $1 ORDER BY source_sku", feed["id"])}
    assert sorted(items) == [f"{prefix}-{o}" for o in IMPORTABLE]
    dress, tee, jeans = (items[f"{prefix}-{o}"] for o in IMPORTABLE)
    assert dress["image_url"] == f"{FEED_IMG}/{prefix}/flat-1.jpg", "не взята предметная картинка"
    assert (dress["is_hidden"], tee["is_hidden"], jeans["is_hidden"]) == (False, False, True)
    for it in items.values():
        assert it["partner_id"] == a_pid and it["notes"] == f"Лавка {prefix}:{it['source_sku']}"
        assert it["gender"] == "female" and it["material"]
    assert (dress["clothing_type"], float(dress["price"]), dress["url"]) == (
        "dress", 5990.0, f"https://shop.e2e/p/{prefix}-1")

    got = client.get(f"/api/partner/feeds/{feed['id']}", headers=a.h).json()
    assert got["feed"]["status"] == "completed" and got["items_in_db"] == 3
    assert (got["feed"]["items_total"], got["feed"]["items_imported"]) == (3, 3)
    assert cron(client, "process-feeds").json() == {"message": "No pending feeds"}

    # Тот же фид ещё раз: ничего не задваивается.
    r2 = _upload(client, a, xml)
    res2 = cron(client, "process-feeds").json()
    assert (res2["imported"], res2["skipped"]) == (0, 3)
    assert q1("SELECT count(*) AS n FROM wardrobe_items WHERE partner_id = $1", a_pid)["n"] == 3
    assert q1("SELECT status FROM partner_feeds WHERE id = $1", r2.json()["feed"]["id"])["status"] == "completed"


def test_broken_partner_feed_is_marked_failed_without_rows(client):
    a, a_pid = make_partner(client)
    _drain_pending(client)
    fid = _upload(client, a, b"<yml_catalog><nope/></yml_catalog>", name="broken.xml").json()["feed"]["id"]
    res = cron(client, "process-feeds").json()
    assert "error" in res
    row = q1("SELECT status, error_log FROM partner_feeds WHERE id = $1", fid)
    assert row["status"] == "failed" and "shop" in row["error_log"]
    assert q1("SELECT count(*) AS n FROM wardrobe_items WHERE partner_id = $1", a_pid)["n"] == 0


@pytest.mark.xfail(strict=True, reason=(
    "БАГ: process-feeds дедуплицирует по notes = '<shop><name>:<offer id>' без partner_id — "
    "у второго партнёра с тем же названием магазина (или партнёра, чей <name> совпал с "
    "источником Admitad, напр. SELA) весь фид уходит в skipped, его каталог пуст и "
    "виджет отвечает no_cart_match (cron.py, process-feeds: SELECT id FROM wardrobe_items WHERE notes = :notes)"))
def test_two_partners_with_same_shop_name_both_get_their_catalog(client):
    prefix = f"s{RUN}{uuid.uuid4().hex[:4]}"
    xml = feed_xml("Мой магазин", prefix, ids=["2"])
    a, a_pid = make_partner(client)
    b, b_pid = make_partner(client)
    _drain_pending(client)
    _upload(client, a, xml)
    cron(client, "process-feeds")
    _upload(client, b, xml)
    cron(client, "process-feeds")
    n_b = q1("SELECT count(*) AS n FROM wardrobe_items WHERE partner_id = $1", b_pid)["n"]
    assert n_b == 1, "каталог второго партнёра пуст: его офферы приняты за чужие дубли"


# ───────────────────────────── фиды Admitad ─────────────────────────────

ADMITAD = "https://export.admitad.com/ru/webmaster/websites/e2e/products/export_adv_products/"


@pytest.fixture
def admitad(world, monkeypatch):
    """Два источника под меткой прогона: один импортируется, второй (как Эконика)
    только синхронизируется. Содержимое фида тест меняет в feeds[...]."""
    from app.api import cron as cron_mod

    src, off = f"E2E{RUN}{uuid.uuid4().hex[:3]}", f"E2Eoff{RUN}"
    feeds = {src: feed_xml("Что угодно", src.lower()), off: feed_xml("x", off.lower())}
    hits: list[str] = []

    def serve(request: httpx.Request) -> httpx.Response:
        name = request.url.params["feed"]
        hits.append(name)
        body = feeds[name]
        if isinstance(body, int):
            return httpx.Response(body, text="admitad down")
        return httpx.Response(200, content=body, headers={"content-type": "application/xml"})

    world.routes[ADMITAD] = serve
    monkeypatch.setattr(cron_mod, "ADMITAD_FEEDS", {
        src: {"url": f"{ADMITAD}?feed={src}&format=xml", "limit": 50},
        off: {"url": f"{ADMITAD}?feed={off}&format=xml", "limit": 50, "import": False},
    })
    return types.SimpleNamespace(src=src, off=off, feeds=feeds, hits=hits, prefix=src.lower())


def _rows(src):
    return {r["source_sku"]: r for r in q("SELECT * FROM wardrobe_items WHERE notes LIKE $1", f"{src}:%")}


def test_admitad_import_every_offer_through_flatlay_and_idempotent(client, world, admitad):
    res = cron(client, "import-feeds").json()
    rep = res["feeds"][admitad.src]
    assert res["imported"] == 3 and rep["imported"] == 3 and rep["flagged_person"] == 1, rep
    assert res["feeds"][admitad.off] == {"skipped": "import disabled"}
    assert admitad.hits == [admitad.src], "фид с import=False всё равно скачан"

    p = admitad.prefix
    assert sorted(flatlay_calls(world)) == sorted(
        [[f"{FEED_IMG}/{p}/{x}" for x in OFFERS[o][2]] for o in IMPORTABLE])
    rows = _rows(admitad.src)
    assert sorted(rows) == [f"{p}-{o}" for o in IMPORTABLE]
    assert {k: v["is_hidden"] for k, v in rows.items()} == {f"{p}-1": False, f"{p}-2": False, f"{p}-3": True}
    assert rows[f"{p}-1"]["image_url"].endswith("/flat-1.jpg")
    assert all(r["notes"] == f"{admitad.src}:{k}" and r["partner_id"] is None for k, r in rows.items())
    # Новые вещи отправлены на порционную индексацию, а не на пересборку всего индекса.
    assert [c for c in world.calls if c[0] == "clip" and c[1] in ("/clip/index-pending", "/clip/build-index")] == [
        ("clip", "/clip/index-pending", "POST")]

    # Повтор: ни новых строк, ни лишних походов в CLIP, ни индексации впустую.
    world.clip_json.clear()
    world.calls.clear()
    again = cron(client, "import-feeds").json()
    assert again["imported"] == 0 and again["feeds"][admitad.src]["new"] == 0
    assert flatlay_calls(world) == [] and not [c for c in world.calls if c[1] == "/clip/index-pending"]
    assert len(_rows(admitad.src)) == 3

    # В фиде появился оффер — импортируется только он.
    admitad.feeds[admitad.src] = feed_xml("Что угодно", p, extra={
        "7": ("Кардиган оверсайз", "12", ["flat-7.jpg"], "4590")})
    third = cron(client, "import-feeds").json()
    assert third["imported"] == 1
    assert flatlay_calls(world) == [[f"{FEED_IMG}/{p}/flat-7.jpg"]]


@pytest.mark.xfail(strict=True, reason=(
    "БАГ: при недоступном CLIP (/clip/pick-flatlay 503 или таймаут) import-feeds всё равно "
    "вставляет офферы видимыми (is_hidden=false) — фото на моделях уходят в каталог без "
    "проверки, ровно та утечка, от которой правило CLAUDE.md. Так же устроен process-feeds "
    "(cron.py: except → logger.debug и дальше INSERT)"))
def test_admitad_import_with_clip_down_does_not_publish_unchecked_offers(client, world, admitad):
    world.flatlay = lambda urls: httpx.Response(503, text="CLIP is restarting")
    cron(client, "import-feeds")
    assert flatlay_calls(world), "pick-flatlay даже не вызывался"
    visible = [k for k, r in _rows(admitad.src).items() if not r["is_hidden"]]
    assert visible == [], f"непроверенные офферы опубликованы: {visible}"


def test_admitad_import_failure_of_one_feed_does_not_break_others(client, world, admitad, monkeypatch):
    from app.api import cron as cron_mod

    bad = f"E2Ebad{RUN}"
    admitad.feeds[bad] = 500
    monkeypatch.setitem(cron_mod.ADMITAD_FEEDS, bad, {"url": f"{ADMITAD}?feed={bad}", "limit": 50})
    res = cron(client, "import-feeds").json()
    assert "error" in res["feeds"][bad]
    assert res["feeds"][admitad.src]["imported"] == 3


def test_sync_hides_offers_gone_from_feed(client, world, admitad):
    cron(client, "import-feeds")
    p = admitad.prefix
    # Оффер 2 пропал из фида: 1 из 2 видимых = 50% ≥ порога → прячется.
    admitad.feeds[admitad.src] = feed_xml("Что угодно", p, ids=["1", "3", "4", "5", "6"])
    res = cron(client, "sync-feeds").json()
    rep = res["feeds"][admitad.src]
    assert (rep["db_items"], rep["stale"], rep["hidden"]) == (2, 1, 1), rep
    rows = _rows(admitad.src)
    assert rows[f"{p}-2"]["is_hidden"] is True and rows[f"{p}-1"]["is_hidden"] is False
    # Ручная команда пиннит --source к ключу ADMITAD_FEEDS (иначе sync молча не
    # найдёт её строк), и её нет для источника с import=False.
    assert len(res["import_commands"]) == 1 and f'--source "{admitad.src}"' in res["import_commands"][0]


@pytest.mark.parametrize("broken", [
    b'<?xml version="1.0"?><yml_catalog><shop><name>x</name><offers></offers></shop></yml_catalog>',
    b"<yml_catalog></yml_catalog>",
    502,
])
def test_sync_with_empty_or_broken_feed_hides_nothing(client, world, admitad, broken):
    cron(client, "import-feeds")
    visible_before = sorted(k for k, r in _rows(admitad.src).items() if not r["is_hidden"])
    assert len(visible_before) == 2
    admitad.feeds[admitad.src] = broken
    res = cron(client, "sync-feeds").json()
    assert "error" in res["feeds"][admitad.src], res
    assert sorted(k for k, r in _rows(admitad.src).items() if not r["is_hidden"]) == visible_before


def test_sync_below_threshold_hides_nothing(client, admitad):
    src = admitad.src
    # 20 видимых строк источника, из фида пропала одна (5% < 10%).
    skus = [f"{admitad.prefix}-t{i}" for i in range(20)]
    for s in skus:
        add_catalog_item("Вещь", "t-shirt", notes=f"{src}:{s}", source_sku=s, is_hidden=False)
    extra = {f"t{i}": ("Футболка", "12", [f"flat-t{i}.jpg"], "990") for i in range(1, 20)}
    admitad.feeds[src] = feed_xml("x", admitad.prefix, ids=list(extra), extra=extra)
    rep = cron(client, "sync-feeds").json()["feeds"][src]
    assert (rep["stale"], rep["hidden"]) == (1, 0), rep
    assert not any(r["is_hidden"] for r in _rows(src).values())


@pytest.mark.xfail(strict=True, reason=(
    "БАГ: вещь, спрятанная sync-feeds как пропавшая из фида, не возвращается, когда оффер "
    "снова в фиде: sync-feeds только прячет, а import-feeds считает её уже импортированной "
    "(existing берётся без фильтра is_hidden). Товар, на день ушедший из наличия, "
    "исчезает из каталога навсегда"))
def test_offer_back_in_feed_becomes_visible_again(client, admitad):
    cron(client, "import-feeds")
    p, src = admitad.prefix, admitad.src
    admitad.feeds[src] = feed_xml("x", p, ids=["1", "3"])
    cron(client, "sync-feeds")
    assert _rows(src)[f"{p}-2"]["is_hidden"] is True
    admitad.feeds[src] = feed_xml("x", p)          # оффер 2 вернулся
    cron(client, "sync-feeds")
    cron(client, "import-feeds")
    assert _rows(src)[f"{p}-2"]["is_hidden"] is False


# ─────────────────── ai-service/scripts/import_catalog.py ───────────────────

IMPORT_CATALOG = os.path.join(HERE, "..", "..", "..", "ai-service", "scripts", "import_catalog.py")


def _load_import_catalog(monkeypatch):
    """Скрипт живёт в контейнере modemorph-ai и грузит FashionCLIP в процесс.
    Модель (torch) подменяем заглушкой: encode_image отдаёт «есть человек» для
    серой картинки (заглушка картинок рисует avatar-* серым градиентом). Всё
    остальное — разбор фида, выбор картинки, флаг has_person, INSERT и дедуп —
    настоящее и пишет в ту же базу."""
    enc = types.ModuleType("clip.encoder")
    cls = types.ModuleType("clip.classifier")

    class Encoder:
        def encode_image(self, img):
            r, g, b = img.getpixel((img.width - 1, 0))
            return 1.0 if r == g == b else 0.0

    class Classifier:
        def __init__(self, encoder):
            pass

        def _person_score(self, emb):
            return emb

    enc.CLIPEncoderService = Encoder
    cls.CLIPClassifierService = Classifier
    cls.PERSON_SCORE_THRESHOLD = 0.5
    monkeypatch.setitem(sys.modules, "clip", types.ModuleType("clip"))
    monkeypatch.setitem(sys.modules, "clip.encoder", enc)
    monkeypatch.setitem(sys.modules, "clip.classifier", cls)
    monkeypatch.setattr(sys, "path", list(sys.path))  # скрипт дописывает свои пути
    spec = importlib.util.spec_from_file_location("e2e_import_catalog", IMPORT_CATALOG)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod, "DATABASE_URL", os.environ["DATABASE_URL"])
    return mod


def test_import_catalog_script_checks_every_picture_and_hides_person_photos(world, monkeypatch, tmp_path):
    import asyncio

    ic = _load_import_catalog(monkeypatch)
    src = f"E2Eic{RUN}{uuid.uuid4().hex[:3]}"
    p = src.lower()
    path = tmp_path / "feed.xml"
    path.write_bytes(feed_xml("Магазин", p))

    items = ic.parse_feed(str(path), source_override=src)
    by_sku = {i["source_sku"]: i for i in items}
    assert set(by_sku) >= {f"{p}-{o}" for o in IMPORTABLE}

    asyncio.run(ic.pick_flatlay_photos(items))
    # Картинки скачаны у КАЖДОГО оффера, включая одно-картиночные.
    fetched = {path for s, path, _ in world.calls if s == "img" and path.startswith(f"/feed/{p}/")}
    for o in IMPORTABLE:
        assert {f"/feed/{p}/{x}" for x in OFFERS[o][2]} <= fetched, f"оффер {o} не проверен"
    assert by_sku[f"{p}-1"]["image_url"].endswith("/flat-1.jpg")
    assert by_sku[f"{p}-3"].get("has_person") and by_sku[f"{p}-3"]["is_hidden"]

    asyncio.run(ic.insert_items(items))
    # source_sku этот импортёр не пишет (в отличие от cron import-feeds) — ключ тут notes.
    rows = {r["notes"].split(":", 1)[1]: r
            for r in q("SELECT * FROM wardrobe_items WHERE notes LIKE $1", f"{src}:%")}
    assert rows[f"{p}-3"]["is_hidden"] is True and rows[f"{p}-2"]["is_hidden"] is False
    assert rows[f"{p}-1"]["image_url"].endswith("/flat-1.jpg")
    assert float(rows[f"{p}-1"]["price"]) == 5990.0
    n = len(rows)
    asyncio.run(ic.insert_items(items))            # повторный прогон — только дубли
    assert q1("SELECT count(*) AS n FROM wardrobe_items WHERE notes LIKE $1", f"{src}:%")["n"] == n

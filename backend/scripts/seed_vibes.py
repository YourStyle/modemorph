#!/usr/bin/env python3
"""Наполнение витрины «кружки по странам» (outfits.vibe) из каталога.

Пайплайн на трёх уже существующих кусках:
  фраза -> /clip/search/text (FashionCLIP)  -> вещи каталога в этой эстетике
  вещи  -> раскладка по слотам SLOT_MAP     -> комплекты верх/низ/обувь
  комплект -> outfit_compat.repair_outfit   -> отбрасывает шорты+пальто и т.п.

Почему запросы предметные, а не «japandi»/«old money». Пилот 2026-08-17 (17 фраз,
топ-12 каждая, ai-service/scripts/probe_vibes.py): абстрактные ярлыки эстетик
FashionCLIP не понимает — «old money quiet luxury» дал скор 0.23-0.29 и вернул
розовую футболку с принтом, шапку и камуфляжную сумку. Предметные фразы про тот
же образ жизни работают: «sprezzatura tailoring» 0.34-0.37, 12/12 костюмов.
Граница между шумом и делом прошла по 0.30 — отсюда SCORE_FLOOR.
Название страны существует только как подпись кружка в UI.

Запуск в контейнере backend (нужны clothing_taxonomy и outfit_compat):
    docker exec -i modemorph-backend python3 - < seed_vibes.py            # dry-run
    docker exec -i modemorph-backend python3 - < seed_vibes.py --commit   # запись

Селфчек чистой сборки (без сети и базы):
    PYTHONPATH=backend python3 backend/scripts/seed_vibes.py --self-check
"""

import argparse
import asyncio
import json
import os
import sys

from clothing_taxonomy import slot_of
from app.services.outfit_compat import repair_outfit

AI = os.environ.get("AI_SERVICE_URL", "http://modemorph-ai:8000")

# Ниже этого скора выдача — шум. Замер в докстринге.
SCORE_FLOOR = 0.30

# Курируемые образы «ничейные»: FK на outfits.user_id нет, а GET /api/outfits
# фильтрует по user_id — значит в чужой раздел «мои образы» они не попадут.
CURATOR_UUID = "00000000-0000-0000-0000-000000000000"

# Подпись кружка -> предметные фразы. «Италия» лишилась «old money quiet luxury»
# по результатам пилота (скор 0.23-0.29, чистый шум).
#
# Фразы подобраны под ПОКРЫТИЕ СЛОТОВ, а не только под узнаваемость эстетики.
# Замер первого dry-run 2026-08-17: у «Италии» пул дал bottom 44 / layer 25 /
# top 2 — верх стал бутылочным горлышком и собрался 1 образ вместо 12; у
# «Скандинавии» outerwear 31 / top 3; обуви было 0-4 на кружок, потому что ни
# одна фраза про обувь не спрашивала. Отсюда правило: у каждого кружка должна
# быть фраза на верх, на низ и на обувь. Гистограмма слотов печатается на
# каждом прогоне (--dry-run), чтобы перекос было видно сразу.
# Мужские фразы заданы явным «men's ...»: каталог женоцентричный, и без этого у
# «Франции» и «Кореи» мужского верха было по 2, у «Скандинавии» — 0, то есть
# мужских образов кружок почти не давал (замер по гистограмме 2026-08-17).
VIBES: dict[str, list[str]] = {
    "Япония": ["japandi minimal outfit", "oversized muted layering", "earth tone linen",
               "flat leather shoes neutral",
               "men's oversized linen shirt", "men's wide leg trousers neutral"],
    "Франция": ["parisian chic outfit", "breton stripe top", "tailored blazer casual",
                "straight leg jeans", "ballet flats",
                "men's striped long sleeve shirt", "men's slim dark jeans"],
    "Италия": ["sprezzatura tailoring", "knit polo trousers", "knit polo shirt",
               "leather loafers", "men's knit polo shirt", "men's tailored trousers"],
    "Америка": ["preppy college outfit", "workwear denim", "varsity streetwear",
                "college cardigan", "white sneakers",
                "men's oxford shirt", "men's straight jeans"],
    "Корея": ["korean soft minimal", "cropped proportions pastel", "chunky white sneakers",
              "men's boxy t-shirt neutral", "men's relaxed trousers light"],
    # «white knit sweater» ложится в слой (pullover), а не в верх — Скандинавии
    # нужны именно рубашка/лонгслив, иначе female top = 6, male top = 0.
    "Скандинавия": ["scandi minimal monochrome", "neutral oversized coat",
                    "plain white shirt", "black longsleeve top",
                    "straight trousers neutral", "black ankle boots",
                    "men's plain white shirt", "men's black trousers straight"],
}

K_PER_PHRASE = 40          # запас: после отсечки по скору и раскладки по слотам останется меньше
OUTFITS_PER_VIBE = 12      # на кружок, суммарно по всем полам
# Порог строже, чем _MIN_OUTFIT_SIZE в outfit_compat: тот разрешает согласованную
# пару («платье + туфли»), но для витрины пара выглядит недоделанной.
MIN_ITEMS = 3
# Обувь — самый расходящийся по температуре слот (сандалии vs ботинки), одна
# неудачная пара не должна убивать годное ядро. Столько кандидатов пробуем.
SHOE_TRIES = 3
# Слот, закрывающий тело целиком — платье/юбка/комбинезон или костюм.
_WHOLE = ("dress", "set")


def _slot(it: dict) -> str | None:
    return slot_of(it.get("clothing_type"), it.get("name"))


def is_valid(items: list[dict]) -> bool:
    """Структурная проверка ПОСЛЕ repair_outfit.

    repair_outfit судит образ только по температуре и вправе выбросить верх —
    так в первом dry-run 2026-08-17 получилось 42 образа из 71 вида
    «джинсы + кроссовки + кардиган»: низ, обувь и кардиган поверх ничего.
    Температурно это законно, надеть — нельзя. Поэтому температурную проверку
    дополняем структурной: тело должно быть закрыто целиком.
    """
    slots = [_slot(it) for it in items]
    whole = [s for s in slots if s in _WHOLE]
    if len(whole) > 1:
        return False                                  # платье + костюм в одном образе
    if whole:
        return True                                   # платье/костюм закрывают и верх, и низ
    return "top" in slots and "bottom" in slots


def slot_histogram(items: list[dict]) -> dict[str, dict[str, int]]:
    """Слоты в разбивке ПО ПОЛУ — перекос здесь и есть причина недобора образов.

    Разбивка обязательна: сборка не смешивает мужское с женским, поэтому общий
    итог по слоту обманывает. У «Италии» суммарно было top 29 при 7 собранных
    образах — потому что почти весь верх оказался в одном поле, а второе
    голодало. Unisex-вещи (пустой gender) считаются в оба, как и в сборке.
    """
    hist: dict[str, dict[str, int]] = {"female": {}, "male": {}}
    for it in items:
        if (it.get("score") or 0) < SCORE_FLOOR:
            continue
        s = _slot(it)
        if not s:
            continue
        g = (it.get("gender") or "").strip().lower()
        for t in (["female", "male"] if g not in ("female", "male") else [g]):
            hist[t][s] = hist[t].get(s, 0) + 1
    return {g: dict(sorted(h.items(), key=lambda kv: -kv[1])) for g, h in hist.items()}


def build_outfits(items: list[dict], limit: int) -> list[list[dict]]:
    """Чистая сборка: вещи одной эстетики -> список комплектов. Без I/O.

    Вещь не переиспользуется между образами внутри одного кружка — иначе лента
    выглядит как один и тот же лук в разных ракурсах. Пол не смешивается:
    unisex-вещи (gender пустой) годятся в оба.
    """
    by_gender: dict[str, dict[str, list[dict]]] = {}
    for it in items:
        if (it.get("score") or 0) < SCORE_FLOOR:
            continue
        s = _slot(it)
        if not s:
            continue                                  # аксессуары как основу не берём
        g = (it.get("gender") or "").strip().lower()
        targets = ["female", "male"] if g not in ("female", "male") else [g]
        for t in targets:
            by_gender.setdefault(t, {}).setdefault(s, []).append(it)

    for slots in by_gender.values():
        for lst in slots.values():
            lst.sort(key=lambda i: -(i.get("score") or 0))

    outfits: list[list[dict]] = []
    used: set = set()

    def take(slots: dict, name: str, skip: set | None = None) -> dict | None:
        for it in slots.get(name, []):
            if it["id"] not in used and not (skip and it["id"] in skip):
                return it
        return None

    # Круговой обход полов, чтобы лента не начиналась двенадцатью женскими образами.
    genders = [g for g in ("female", "male") if g in by_gender]
    extras = ["layer", "outerwear", None]
    round_i = 0
    while len(outfits) < limit and genders:
        progressed = False
        for g in list(genders):
            if len(outfits) >= limit:
                break
            slots = by_gender[g]
            core = []
            if round_i % 3 == 2:
                # Ровно одна вещь на всё тело, не платье И костюм разом.
                whole = take(slots, "dress") or take(slots, "set")
                if whole:
                    core = [whole]
            if not core:
                top, bottom = take(slots, "top"), take(slots, "bottom")
                core = [top, bottom] if top and bottom else []
            if not core:
                genders.remove(g)
                continue
            extra_slot = extras[round_i % len(extras)]
            kept: list[dict] = []
            bad_shoes: set = set()
            for _try in range(SHOE_TRIES):
                shoes = take(slots, "shoes", bad_shoes)
                extra = take(slots, extra_slot) if extra_slot else None
                # От самого полного набора к самому скромному. Без этого один
                # неподходящий по температуре слой сжигал годное ядро верх+низ:
                # у «Скандинавии» так терялось 4 верха из 6 (замер 2026-08-17).
                for combo in ([shoes, extra], [shoes], [extra]):
                    picked = list(core) + [x for x in combo if x]
                    if len(picked) < MIN_ITEMS:
                        continue
                    candidate, _dropped = repair_outfit(picked)
                    if len(candidate) >= MIN_ITEMS and is_valid(candidate):
                        kept = candidate
                        break
                if kept or not shoes:
                    break                             # обувь кончилась, пробовать больше нечего
                bad_shoes.add(shoes["id"])

            if kept:
                outfits.append(kept)
                used.update(i["id"] for i in kept)
                progressed = True
            else:
                # Комплект не спасти — сжигаем ядро, иначе цикл упрётся в те же вещи.
                used.update(i["id"] for i in core)
        round_i += 1
        if not progressed and round_i > limit * 3:
            break                                     # ponytail: страховка от вечного цикла
    return outfits


async def _search(client, phrase: str) -> list[dict]:
    r = await client.post(f"{AI}/clip/search/text",
                          json={"query_text": phrase, "k": K_PER_PHRASE}, timeout=60.0)
    r.raise_for_status()
    return r.json().get("results", [])


async def collect(vibe_phrases: list[str]) -> list[dict]:
    """Вещи по всем фразам кружка, дедуп по id (лучший скор побеждает)."""
    import httpx
    best: dict = {}
    async with httpx.AsyncClient() as client:
        for p in vibe_phrases:
            try:
                hits = await _search(client, p)
            except Exception as e:
                print(f"[warn] {p}: {e}", file=sys.stderr)
                continue
            kept = sum(1 for h in hits if (h.get("score") or 0) >= SCORE_FLOOR)
            print(f"[probe] {p}: {kept}/{len(hits)} выше {SCORE_FLOOR}", file=sys.stderr)
            for h in hits:
                cur = best.get(h["id"])
                if cur is None or (h.get("score") or 0) > (cur.get("score") or 0):
                    best[h["id"]] = h
    return list(best.values())


async def write(vibe: str, outfits: list[list[dict]]) -> int:
    from sqlalchemy import text
    from app.core.database import async_session
    written = 0
    async with async_session() as db:
        for idx, items in enumerate(outfits, 1):
            genders = {(i.get("gender") or "").lower() for i in items} - {""}
            row = await db.execute(text("""
                INSERT INTO outfits (user_id, name, description, preview_image_url, gender, vibe, created_at)
                VALUES (:uid, :name, NULL, :preview, :gender, :vibe, NOW()) RETURNING id
            """), {
                "uid": CURATOR_UUID, "name": f"{vibe} · образ {idx}",
                "preview": items[0].get("image_url"),
                "gender": next(iter(genders)) if len(genders) == 1 else "unisex",
                "vibe": vibe,
            })
            oid = row.scalar()
            for pos, it in enumerate(items):
                # БЕЗ ON CONFLICT DO NOTHING намеренно. Он тут был и замаскировал
                # реальную поломку: написанный без указания конфликта, он глотал
                # конфликт по ПЕРВИЧНОМУ ключу (последовательность outfit_items.id
                # отставала от max(id) — миграция 025), и 11 образов из 72 молча
                # остались без вещей. build_outfits не переиспользует вещь внутри
                # образа, так что задуманный конфликт (outfit_id, wardrobe_item_id)
                # невозможен, а любой другой должен падать громко.
                await db.execute(text("""
                    INSERT INTO outfit_items (outfit_id, wardrobe_item_id, position)
                    VALUES (:oid, :iid, :pos)
                """), {"oid": oid, "iid": it["id"], "pos": pos})
            written += 1
        await db.commit()
    return written


async def main(commit: bool, only: str | None) -> None:
    plan = {}
    for vibe, phrases in VIBES.items():
        if only and vibe != only:
            continue
        print(f"\n=== {vibe} ===", file=sys.stderr)
        pool = await collect(phrases)
        print(f"[slots] {vibe}: {slot_histogram(pool)}", file=sys.stderr)
        outfits = build_outfits(pool, OUTFITS_PER_VIBE)
        print(f"[build] {vibe}: пул {len(pool)} -> {len(outfits)} образов", file=sys.stderr)
        plan[vibe] = [[{"id": i["id"], "name": i.get("name"), "type": i.get("clothing_type"),
                        "img": i.get("image_url"), "score": round(i.get("score") or 0, 3)}
                       for i in o] for o in outfits]
        if commit:
            n = await write(vibe, outfits)
            print(f"[write] {vibe}: записано {n}", file=sys.stderr)
    print(json.dumps(plan, ensure_ascii=False, indent=1))


def _self_check() -> None:
    def it(i, ct, g="female", lo=None, hi=None, sc=0.35):
        return {"id": i, "name": f"item{i}", "clothing_type": ct, "gender": g,
                "temp_min": lo, "temp_max": hi, "score": sc, "image_url": f"http://x/{i}.jpg"}

    # Тёплые окна у всех -> собирается верх+низ+обувь.
    pool = [it(1, "t-shirt", lo=15, hi=30), it(2, "jeans", lo=5, hi=28),
            it(3, "sneakers", lo=0, hi=30)]
    out = build_outfits(pool, 5)
    assert len(out) == 1 and len(out[0]) == 3, out

    # Скор ниже порога отсекается до сборки — образа не будет вовсе.
    assert build_outfits([it(1, "t-shirt", sc=0.2), it(2, "jeans", sc=0.2)], 5) == []

    # Шорты + пальто: у пары нет общего окна, repair_outfit обязан вмешаться.
    clash = build_outfits([it(1, "t-shirt", lo=15, hi=30), it(2, "shorts", lo=20, hi=35),
                           it(3, "sneakers", lo=0, hi=30), it(4, "coat", lo=-10, hi=10)], 1)
    for o in clash:
        types = {i["clothing_type"] for i in o}
        assert not ({"shorts"} <= types and {"coat"} <= types), o

    # Пол не смешивается, вещи не переиспользуются, а конфликтующая обувь (id 5,
    # у неё нарочно самый высокий скор — берётся первой) не убивает годное ядро:
    # сборка обязана перебрать следующего кандидата.
    mixed = build_outfits([it(1, "t-shirt", "female", 15, 30), it(2, "jeans", "female", 5, 28),
                           it(3, "shirt", "male", 15, 30), it(4, "pants", "male", 5, 28),
                           it(5, "boots", "", -5, 10, sc=0.40),
                           it(6, "sneakers", "", 0, 30), it(7, "sandals", "", 0, 30)], 4)
    seen = set()
    for o in mixed:
        gs = {i["gender"] for i in o} - {""}
        assert len(gs) <= 1, o
        assert len(o) >= MIN_ITEMS, o
        for i in o:
            assert i["id"] not in seen, f"вещь {i['id']} переиспользована"
            seen.add(i["id"])
    assert len(mixed) == 2, mixed
    assert 5 not in seen, "конфликтующие ботинки не должны попасть в образ"

    # Пустой пул и пул без низа не роняют сборку и не зацикливают её.
    assert build_outfits([], 10) == []
    assert build_outfits([it(1, "t-shirt", lo=15, hi=30)], 10) == []

    # Структурный инвариант: у каждого выпущенного образа тело закрыто целиком.
    assert is_valid([it(1, "jeans"), it(2, "sneakers"), it(3, "cardigan")]) is False
    assert is_valid([it(1, "t-shirt"), it(2, "jeans")]) is True
    assert is_valid([it(1, "dress"), it(2, "shoes")]) is True
    assert is_valid([it(1, "dress"), it(2, "classic"), it(3, "shoes")]) is False

    # Кардиган поверх ничего не должен выйти из сборки, даже когда по температуре
    # он законен: низ + обувь + слой без верха — это не образ.
    notop = build_outfits([it(1, "jeans", lo=5, hi=28), it(2, "sneakers", lo=0, hi=30),
                           it(3, "cardigan", lo=5, hi=20)], 3)
    assert notop == [], notop

    # Неподходящее пальто не должно сжигать ядро: верх+низ+обувь обязаны выйти
    # образом, а пальто (окно -10..8 против футболки 15..30) просто не берётся.
    warm = build_outfits([it(1, "t-shirt", lo=15, hi=30), it(2, "jeans", lo=5, hi=28),
                          it(3, "sneakers", lo=0, hi=30), it(4, "coat", lo=-10, hi=8)], 1)
    assert len(warm) == 1, warm
    assert {i["clothing_type"] for i in warm[0]} == {"t-shirt", "jeans", "sneakers"}, warm[0]
    print("seed_vibes self-check OK")


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        _self_check()
    else:
        ap = argparse.ArgumentParser()
        ap.add_argument("--commit", action="store_true", help="писать в БД (иначе только план в stdout)")
        ap.add_argument("--only", help="один кружок, например Италия")
        a = ap.parse_args()
        asyncio.run(main(a.commit, a.only))

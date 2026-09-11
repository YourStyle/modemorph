#!/usr/bin/env python3
"""Дошить верхнюю одежду к холодным образам витрины, у которых её нет.

Зачем отдельный скрипт, а не пересев кружка: пересев снёс бы и те образы, что
уже получили лукбук-кадр, а кадр стоит $0.0687 штука. Здесь мы трогаем только
состав — добавляем одну вещь, — а кадр потом перегенерируется ровно у тронутых.

ПОЧЕМУ ВООБЩЕ ПОНАДОБИЛОСЬ. Сборщик витрины выбирал дополнительную вещь по
кругу из ["layer", "outerwear", None], одним списком на все кружки. Верхнюю
одежду примерял лишь каждый третий образ, и сезон на это не влиял: зима
собиралась теми же правилами, что и лето. Итог на 2026-09-11 — 18 зимних
показываемых образов из 21 без верхней одежды. Сам сборщик уже починен
(SEASON_EXTRAS в seed_vibes.py), этот скрипт чинит накопленное.

Совместимость проверяем не на глаз, а repair_outfit: если после добавления
пальто он что-то выбрасывает, значит температурные окна не сошлись и кандидат
не годится. Так пуховик не попадёт к образу, собранному вокруг лёгкой рубашки.

Запуск в контейнере backend:
    docker exec -i modemorph-backend python3 /tmp/add_outerwear.py            # сухой прогон
    docker exec -i modemorph-backend python3 /tmp/add_outerwear.py --commit
"""
import argparse
import asyncio
import json
import sys

sys.path.insert(0, "/app")

from sqlalchemy import text  # noqa: E402

from app.core.database import async_session  # noqa: E402
from app.services.outfit_compat import repair_outfit  # noqa: E402

# Слаги слота outerwear из clothing_taxonomy. Держим списком здесь, а не
# импортом SLOT_MAP, чтобы запрос к базе был одним понятным IN (...).
OUTER = ("coat", "fur-coat", "jacket", "parka", "puffer-jacket", "sheepskin-coat")
COLD_VIBES = ("Зима", "Осень", "Межсезонье")
REPORT = "/tmp/add_outerwear.json"

# Отбор по сезону. Одной температуры НЕ хватает: у каталожных вещей окна широкие
# (типичное -15..20), и repair_outfit принимает что угодно. Первый сухой прогон
# выдал зиме плащ Aspesi, джинсовую куртку и ветровку — формально совместимые,
# в мороз неносимые.
#
# Поэтому тип решает раньше температуры: порядок в "types" — это порядок
# предпочтения, а "ban" отсекает то, что тип назвать не умеет. Слаг «coat»
# покрывает и шерстяное пальто, и плащ; различить их можно только по названию.
SEASON_OUTER: dict[str, dict] = {
    "winter": {
        "types": ("puffer-jacket", "parka", "fur-coat", "sheepskin-coat", "coat"),
        "ban": ("джинс", "ветровк", "плащ", "демисезон", "бомбер", "легк",
                "denim", "windbreaker", "trench", "light"),
    },
    "autumn": {
        "types": ("coat", "parka", "jacket", "puffer-jacket"),
        "ban": ("шуб", "дублён", "дублен", "fur", "sheepskin"),
    },
    "spring": {
        "types": ("jacket", "coat", "parka"),
        "ban": ("шуб", "дублён", "дублен", "пухов", "fur", "sheepskin", "down"),
    },
}


# Не греет ни в какой сезон — такие «пальто» в холодный образ не годятся.
_NEVER = ("прозрачн", "сетк", "кружев", "mesh", "sheer")


def _bad_name(name: str) -> bool:
    """Название, которое нельзя показывать человеку.

    В каталоге попадаются технические слаги вида
    ``winter-top_coat_brown-oversize`` — они приезжают из фида как есть и в
    карточке состава выглядят как ошибка. Признак простой: подчёркивания при
    отсутствии пробелов.
    """
    n = (name or "").strip()
    return not n or ("_" in n and " " not in n)


def _season_rank(cand: dict, season: str | None) -> int | None:
    """Место кандидата в предпочтении сезона; None — вещь сезону не подходит."""
    name = (cand.get("name") or "").lower()
    if _bad_name(cand.get("name") or "") or any(w in name for w in _NEVER):
        return None
    rules = SEASON_OUTER.get(season or "")
    if not rules:
        return 0                                   # сезон не задан — не привередничаем
    if any(w in name for w in rules["ban"]):
        return None
    try:
        return rules["types"].index(cand["clothing_type"])
    except ValueError:
        return None                                # тип не из списка сезона

# Образы без настоящего кадра в ленту не попадают (_is_showable в api/outfits.py),
# поэтому чиним только показываемые: платить за кадр невидимого образа незачем.
_TARGETS = """
    SELECT o.id, o.vibe, o.gender, o.season
    FROM outfits o
    WHERE o.vibe = ANY(:vibes)
      AND (o.preview_image_url LIKE '%/lookbook/%' OR o.preview_image_url LIKE '%/upload-%')
      AND NOT EXISTS (
        SELECT 1 FROM outfit_items oi
        JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id
        WHERE oi.outfit_id = o.id AND wi.clothing_type = ANY(:outer))
    ORDER BY o.vibe, o.id
"""

_ITEMS = """
    SELECT wi.id, wi.item_name AS name, wi.clothing_type, wi.gender,
           wi.temp_min, wi.temp_max, oi.position
    FROM outfit_items oi JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id
    WHERE oi.outfit_id = :o ORDER BY oi.position
"""

# Кандидаты: пол совпадает либо честный unisex; вещь видима и не детская.
# Сортировка ставит впереди уже готовые flat-lay — у них на картинке заведомо
# нет человека, а остальным мы всё равно прогоняем apply_flatlay следом.
_CANDIDATES = """
    SELECT id, item_name AS name, clothing_type, gender, temp_min, temp_max, image_url
    FROM wardrobe_items
    WHERE clothing_type = ANY(:outer)
      AND COALESCE(is_hidden, false) = false
      AND COALESCE(is_kids, false) = false
      AND image_url IS NOT NULL AND image_url <> ''
      AND (gender = :g OR gender = 'unisex')
    ORDER BY (image_url LIKE '%/flatlay/%') DESC, id
"""


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--vibes", default=",".join(COLD_VIBES))
    args = ap.parse_args()
    vibes = [v.strip() for v in args.vibes.split(",") if v.strip()]

    async with async_session() as db:
        targets = [dict(r) for r in (await db.execute(
            text(_TARGETS), {"vibes": vibes, "outer": list(OUTER)})).mappings().all()]

    print(f"образов без верхней одежды: {len(targets)} | "
          f"режим: {'ЗАПИСЬ' if args.commit else 'сухой прогон'}", flush=True)

    # Один и тот же пуховик в десяти образах подряд читается как сбой выдачи,
    # поэтому кандидатов не переиспользуем. Держим и названия: в каталоге одна
    # модель лежит несколькими записями с разными id, и без этого «Тренч Анже»
    # выпадал дважды подряд — формально разные вещи, для глаза одна и та же.
    used: set = set()
    used_names: set = set()
    pools: dict[str, list[dict]] = {}
    touched, skipped, report = [], [], []

    for t in targets:
        g = (t["gender"] or "").strip().lower()
        if g not in ("male", "female"):
            skipped.append({"id": t["id"], "why": "у образа не проставлен пол"})
            continue

        async with async_session() as db:
            items = [dict(r) for r in (await db.execute(
                text(_ITEMS), {"o": t["id"]})).mappings().all()]
            if g not in pools:
                pools[g] = [dict(r) for r in (await db.execute(
                    text(_CANDIDATES), {"outer": list(OUTER), "g": g})).mappings().all()]

        # Сначала отбираем по сезону, потом сортируем по предпочтению типа —
        # и только затем проверяем температуру. Обратный порядок и дал зиме
        # ветровку: температура пропускала её первой.
        ranked = []
        for cand in pools[g]:
            if cand["id"] in used:
                continue
            if (cand.get("name") or "").strip().lower() in used_names:
                continue
            r = _season_rank(cand, t["season"])
            if r is None:
                continue
            ranked.append((r, cand["id"], cand))
        ranked.sort(key=lambda x: (x[0], x[1]))

        pick = None
        for _rank, _cid, cand in ranked:
            # repair_outfit судит по температуре. Если он ничего не выбросил —
            # окна сошлись и пальто действительно носится с этим образом.
            kept, dropped = repair_outfit(items + [cand])
            if not dropped and len(kept) == len(items) + 1:
                pick = cand
                break

        if not pick:
            skipped.append({"id": t["id"], "why": "нет совместимой по температуре верхней одежды"})
            continue

        used.add(pick["id"])
        used_names.add((pick.get("name") or "").strip().lower())
        pos = max((i["position"] or 0) for i in items) + 1 if items else 0
        report.append({"outfit": t["id"], "vibe": t["vibe"], "gender": g,
                       "item": pick["id"], "name": pick["name"],
                       "type": pick["clothing_type"],
                       "window": [pick["temp_min"], pick["temp_max"]]})
        touched.append(t["id"])

        if args.commit:
            async with async_session() as db:
                await db.execute(text(
                    "INSERT INTO outfit_items (outfit_id, wardrobe_item_id, position) "
                    "VALUES (:o, :i, :p) ON CONFLICT DO NOTHING"),
                    {"o": t["id"], "i": pick["id"], "p": pos})
                await db.commit()

    json.dump({"touched": touched, "items": [r["item"] for r in report],
               "report": report, "skipped": skipped},
              open(REPORT, "w"), ensure_ascii=False)

    print(f"\nдобавлено: {len(touched)} | пропущено: {len(skipped)}")
    by_vibe: dict[str, int] = {}
    for r in report:
        by_vibe[r["vibe"]] = by_vibe.get(r["vibe"], 0) + 1
    for v, n in sorted(by_vibe.items()):
        print(f"  {v}: {n}")
    if skipped:
        why: dict[str, int] = {}
        for s in skipped:
            why[s["why"]] = why.get(s["why"], 0) + 1
        print("причины пропуска:")
        for w, n in why.items():
            print(f"  {w}: {n}")
    print(f"\nid образов:  {','.join(str(x) for x in touched)}")
    print(f"id вещей:    {','.join(str(r['item']) for r in report)}")
    print(f"отчёт: {REPORT}")


asyncio.run(main())

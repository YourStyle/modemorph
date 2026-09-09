#!/usr/bin/env python3
"""Обогащение каталога через собственный CLIP: цвет, стиль, пол, флаг человека.

Зачем именно CLIP, а не Gemini: классификатор уже стоит в проде, откалиброван на
160 размеченных фидом вещах (ai-service/clip/classifier.py, порог по полу ±0.5)
и не стоит ни копейки — у OpenRouter остаток меньше трёх долларов.

Один проход /clip/classify отдаёт всё сразу: clothing_type, color, style_tags,
gender + gender_score, has_person + person_score. Раньше на те же картинки
уходило два прохода (отдельно pick-flatlay), то есть вдвое больше времени.

ПРАВИЛО ЗАПИСИ: заполняем только ПУСТОЕ. Данные мерчанта не переписываем —
фид знает про вещь больше, чем зеро-шот по картинке. Пол трогаем только там,
где он NULL или 'unisex', и только когда классификатор назвал конкретный:
ниже своего порога он сам возвращает 'unisex', и это честное «не знаю».

Материал CLIP не даёт вовсе — его источник только фид мерчанта.

Запуск в контейнере backend:
    docker exec -i modemorph-backend python3 /tmp/enrich_catalog.py --scope outfits
    docker exec -i modemorph-backend python3 /tmp/enrich_catalog.py --scope outfits --commit
"""
import argparse
import asyncio
import io
import json
import sys
import urllib.request

sys.path.insert(0, "/app")

from sqlalchemy import text  # noqa: E402

from app.core.database import async_session  # noqa: E402

AI = "http://modemorph-ai:8000/clip/classify"
REPORT = "/tmp/enrich_report.json"

SCOPES = {
    # Вещи, которые человек реально видит: состав образов витрины.
    "outfits": """
        SELECT DISTINCT w.id, w.image_url, w.item_name, w.gender, w.color, w.style
        FROM outfits o
        JOIN outfit_items oi ON oi.outfit_id = o.id
        JOIN wardrobe_items w ON w.id = oi.wardrobe_item_id
        WHERE COALESCE(w.is_hidden, false) = false AND COALESCE(w.is_kids, false) = false
        ORDER BY w.id
    """,
    # Весь видимый каталог. Долго: ~4 с на вещь, 98k вещей это больше суток.
    "all": """
        SELECT id, image_url, item_name, gender, color, style
        FROM wardrobe_items
        WHERE COALESCE(is_hidden, false) = false AND COALESCE(is_kids, false) = false
        ORDER BY id
    """,
}


def classify(url: str) -> dict:
    """Скачать картинку и отдать её /clip/classify (он принимает файл, не ссылку)."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        blob = r.read()
    boundary = "----mmboundary"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="image"; filename="i.jpg"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode() + blob + f"\r\n--{boundary}--\r\n".encode()
    post = urllib.request.Request(
        AI, data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(post, timeout=90) as r:
        return json.load(r)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scope", choices=sorted(SCOPES), default="outfits")
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="0 — без ограничения")
    args = ap.parse_args()

    async with async_session() as db:
        rows = [dict(r) for r in (await db.execute(text(SCOPES[args.scope]))).mappings().all()]
    if args.limit:
        rows = rows[: args.limit]
    print(f"вещей: {len(rows)} | режим: {'ЗАПИСЬ' if args.commit else 'сухой прогон'}", flush=True)

    filled = {"gender": 0, "color": 0, "style": 0}
    with_person, failed, report = [], 0, []

    for i, it in enumerate(rows):
        try:
            res = classify(it["image_url"])
        except Exception as e:
            failed += 1
            report.append({"id": it["id"], "error": str(e)[:80]})
            continue

        if res.get("has_person"):
            with_person.append([it["id"], res.get("person_score")])

        updates: dict = {}
        # Пол: только там, где его нет. Классификатор сам возвращает 'unisex',
        # когда не уверен, — такое не пишем, это честное «не знаю».
        if (it["gender"] in (None, "", "unisex")) and res.get("gender") in ("male", "female"):
            updates["gender"] = res["gender"]
        if not (it["color"] or "").strip() and res.get("color"):
            updates["color"] = res["color"]
        if not (it["style"] or "").strip() and res.get("style_tags"):
            updates["style"] = res["style_tags"][0]

        for k in updates:
            filled[k] += 1
        report.append({"id": it["id"], "updates": updates,
                       "has_person": bool(res.get("has_person")),
                       "person_score": res.get("person_score")})

        if updates and args.commit:
            sets = ", ".join(f'"{k}" = :{k}' for k in updates)
            async with async_session() as db:
                await db.execute(
                    text(f"UPDATE wardrobe_items SET {sets}, updated_at = NOW() WHERE id = :id"),
                    {**updates, "id": it["id"]})
                await db.commit()

        if (i + 1) % 25 == 0:
            print(f"  ... {i + 1}/{len(rows)}", flush=True)

    json.dump({"with_person": with_person, "report": report}, open(REPORT, "w"))
    print(f"\nзаполнено: пол {filled['gender']}, цвет {filled['color']}, стиль {filled['style']}")
    print(f"снято на человеке: {len(with_person)} | ошибок: {failed}")
    print(f"id с человеком: {[p[0] for p in with_person][:60]}")
    print(f"отчёт: {REPORT}")


asyncio.run(main())

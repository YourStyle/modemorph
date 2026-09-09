#!/usr/bin/env python3
"""Лукбук-кадры для посеянных образов в пределах бюджета.

Тонкая обёртка над app/services/lookbook.generate. Берёт образы БЕЗ настоящего
кадра (в превью лежит фото первой вещи — так его ставит seed_vibes), чередует
кружки и полы, чтобы деньги не ушли в один кружок, и останавливается по
достижении потолка. Реальная цена берётся из OpenRouter по generation_id, а не
оценивается: замер 2026-09-08 дал $0.0687 за кадр.

Запуск в контейнере backend (там прокси до OpenRouter и ключи S3):
    docker exec -i modemorph-backend python3 /tmp/gen_lookbook_shots.py 4.0
    docker exec -i modemorph-backend python3 /tmp/gen_lookbook_shots.py 0.5 --ids 142,150
"""
import argparse
import asyncio
import sys

sys.path.insert(0, "/app")

from sqlalchemy import text  # noqa: E402

from app.api.misc import _openrouter_chat, _upload_base64_to_s3  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import async_session  # noqa: E402
from app.services import lookbook  # noqa: E402

# Вещи образа для кадра. wi.gender ОБЯЗАТЕЛЕН: без него lookbook.items_gender()
# всегда возвращает None, пол модели падает на чередование по чётности id, и
# кадр перестаёт соответствовать вещам. Ровно так 26 образов получили пол,
# противоречащий собственному составу — мужской образ из женских ботильонов.
_ITEMS_SQL = (
    "SELECT wi.item_name AS name, wi.image_url, wi.clothing_type, wi.gender "
    "FROM outfit_items oi JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id "
    "WHERE oi.outfit_id = :o ORDER BY oi.position"
)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("max_usd", type=float, help="потолок расходов в долларах")
    ap.add_argument("--ids", help="только эти образы, через запятую (перегенерация)")
    args = ap.parse_args()

    ids = [int(x) for x in args.ids.split(",")] if args.ids else None

    async with async_session() as db:
        if ids:
            rows = (await db.execute(text(
                "SELECT id, gender, vibe FROM outfits WHERE id = ANY(:i) ORDER BY id"),
                {"i": ids})).mappings().all()
        else:
            # row_number по (кружок, пол) + ORDER BY rn чередует разделы: иначе
            # весь бюджет уйдёт в первый кружок по алфавиту.
            rows = (await db.execute(text("""
                SELECT id, gender, vibe FROM (
                  SELECT id, gender, vibe,
                         row_number() OVER (PARTITION BY vibe, gender ORDER BY id) AS rn
                  FROM outfits
                  WHERE vibe IS NOT NULL
                    AND preview_image_url NOT LIKE '%/lookbook/%'
                    AND preview_image_url NOT LIKE '%/upload-%'
                ) t ORDER BY rn, vibe, gender
            """))).mappings().all()

    print(f"кандидатов: {len(rows)} | потолок ${args.max_usd}")
    spent, done, failed = 0.0, 0, 0

    for r in rows:
        if spent >= args.max_usd:
            print(f"потолок ${args.max_usd} достигнут")
            break
        async with async_session() as db:
            items = [dict(x) for x in (await db.execute(
                text(_ITEMS_SQL), {"o": r["id"]})).mappings().all()]
        if not items:
            continue

        g = lookbook.items_gender(items) or lookbook.model_gender(r["gender"], int(r["id"]))
        try:
            uri, gid = await lookbook.generate(
                _openrouter_chat, r["vibe"], g, items, seed=int(r["id"]))
        except Exception as e:
            print(f"  образ {r['id']}: генерация упала: {str(e)[:70]}")
            failed += 1
            continue

        cost = await lookbook.fetch_cost(settings.OPENROUTER_API_KEY, gid)
        spent += cost if cost is not None else lookbook.FALLBACK_COST_USD
        if not uri:
            print(f"  образ {r['id']}: модель не вернула кадр")
            failed += 1
            continue

        url = await _upload_base64_to_s3(uri, folder=lookbook.S3_FOLDER)
        if url.startswith("data:"):
            print(f"  образ {r['id']}: S3 не принял")
            failed += 1
            continue

        async with async_session() as db:
            # gender обязан стать равным полу человека НА КАДРЕ — иначе запись
            # описывает вещи, а пользователь смотрит фотографию (см. докстринг
            # lookbook.model_gender).
            await db.execute(text(
                "UPDATE outfits SET preview_image_url = :u, preview_thumb_url = NULL, "
                "gender = :g, updated_at = NOW() WHERE id = :i"),
                {"u": url, "g": g, "i": r["id"]})
            await db.commit()
        done += 1
        if done % 10 == 0:
            print(f"  ... {done} кадров, ${spent:.2f}")

    print(f"\nготово: {done} | не вышло: {failed} | потрачено ${spent:.4f}")


asyncio.run(main())

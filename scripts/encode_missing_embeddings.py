"""Догенерировать FashionCLIP-эмбеддинги для каталожных вещей, у которых их нет.

Зачем отдельный скрипт, а не POST /clip/build-index: тот эндпоинт складывает ВСЕ
изображения в один список декодированных PIL-картинок и только потом кодирует
(routes.py:815-834). На 15k вещей это десятки гигабайт при лимите контейнера 4 ГБ —
гарантированный OOM. Здесь картинка живёт ровно до записи вектора в БД.

Модель не поднимается второй раз: используется уже загруженная в modemorph-ai
через /clip/encode-image.

Запуск (внутри modemorph-backend, там есть httpx и asyncpg):
    python encode_missing_embeddings.py [--limit N] [--concurrency 4]

Резюмируемость отдельным состоянием не нужна: выборка сама себе курсор —
у обработанной строки embedding перестаёт быть NULL.
"""

import argparse
import asyncio
import os
import sys
import time

import asyncpg
import httpx

AI_URL = os.getenv("AI_SERVICE_URL", "http://modemorph-ai:8000").rstrip("/")
DSN = (os.getenv("DATABASE_URL") or "").replace("postgresql+asyncpg://", "postgresql://")

# Скрытые пропускаем намеренно: детские и дубли gate31 в индексе не нужны,
# а это ~1700 вещей, то есть ~10% лишней работы CPU.
SELECT_SQL = """
    SELECT id, image_url FROM wardrobe_items
    WHERE embedding IS NULL
      AND image_url IS NOT NULL AND image_url <> ''
      AND COALESCE(is_hidden, false) = false
    ORDER BY id
    LIMIT $1
"""


async def encode_one(client: httpx.AsyncClient, pool, row, stats, sem):
    async with sem:
        try:
            img = await client.get(row["image_url"])
            img.raise_for_status()
        except Exception as e:
            stats["download_failed"] += 1
            code = getattr(getattr(e, "response", None), "status_code", "")
            stats["last_error"] = f"download {row['id']}: {type(e).__name__} {code}"
            return
        try:
            resp = await client.post(
                f"{AI_URL}/clip/encode-image",
                files={"image": ("i.jpg", img.content, "image/jpeg")},
            )
            resp.raise_for_status()
            emb = resp.json()["embedding"]
        except Exception as e:
            stats["encode_failed"] += 1
            stats["last_error"] = f"encode {row['id']}: {type(e).__name__}"
            return
        try:
            async with pool.acquire() as conn:
                # embedding — TEXT[], поэтому список строк, а не литерал '{...}'.
                await conn.execute(
                    "UPDATE wardrobe_items SET embedding = $1 WHERE id = $2",
                    [repr(float(x)) for x in emb],
                    row["id"],
                )
            stats["encoded"] += 1
        except Exception as e:
            stats["db_failed"] += 1
            stats["last_error"] = f"db {row['id']}: {type(e).__name__}: {e}"[:160]


async def main(limit: int, concurrency: int):
    if not DSN:
        sys.exit("DATABASE_URL не задан")
    pool = await asyncpg.create_pool(DSN, min_size=2, max_size=concurrency + 2)
    async with pool.acquire() as conn:
        rows = await conn.fetch(SELECT_SQL, limit)
    total = len(rows)
    print(f"к кодированию: {total} (ai-service: {AI_URL}, параллельно: {concurrency})", flush=True)
    if not total:
        await pool.close()
        return

    stats = {"encoded": 0, "download_failed": 0, "encode_failed": 0, "db_failed": 0, "last_error": ""}
    sem = asyncio.Semaphore(concurrency)
    started = time.monotonic()

    # Чанки нужны только чтобы печатать прогресс и не держать 15k задач разом.
    CHUNK = 200
    # Без User-Agent часть CDN мерчантов отдаёт 403 на прямой запрос картинки.
    ua = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"}
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True, headers=ua) as client:
        for off in range(0, total, CHUNK):
            await asyncio.gather(*(
                encode_one(client, pool, r, stats, sem) for r in rows[off:off + CHUNK]
            ))
            done = min(off + CHUNK, total)
            rate = done / max(time.monotonic() - started, 1e-9)
            eta = (total - done) / rate / 60 if rate else 0
            print(
                f"  {done}/{total}  готово={stats['encoded']} "
                f"скачивание={stats['download_failed']} кодирование={stats['encode_failed']} "
                f"бд={stats['db_failed']}  {rate:.1f}/с  осталось ~{eta:.0f} мин"
                + (f"  [{stats['last_error']}]" if stats["last_error"] else ""),
                flush=True,
            )

    await pool.close()
    print(f"ИТОГ: {stats}  за {(time.monotonic() - started) / 60:.1f} мин", flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=20000)
    # 4 — компромисс: бокс burstable, кодирование упирается в CPU modemorph-ai.
    p.add_argument("--concurrency", type=int, default=4)
    a = p.parse_args()
    asyncio.run(main(a.limit, a.concurrency))

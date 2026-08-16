# -*- coding: utf-8 -*-
"""Где умирают образы между ответом модели и экраном.

Системный промпт просит 5-7 разделов по 3-4 образа (15-25 всего), а
пользователь видит на главной 1-3. Скрипт считает распределение размеров
образов в сохранённых секциях, чтобы отличить «модель вернула мало» от
«мы их сами отсеяли» — `_enrich_sections` выбрасывает всё, где меньше
трёх вещей.

Только чтение. Запуск внутри modemorph-backend:
    python3 measure_outfit_dropoff.py
"""

import asyncio
import collections
import json
import os

import asyncpg

DSN = (os.getenv("DATABASE_URL") or "").replace("postgresql+asyncpg://", "postgresql://")

# Порог, по которому _enrich_sections отсеивает образы (recommendations.py).
MIN_ITEMS = 3


async def main():
    if not DSN:
        raise SystemExit("DATABASE_URL не задан")
    pool = await asyncpg.create_pool(DSN, min_size=1, max_size=3)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT look_sections FROM main_recommendations "
            "WHERE jsonb_typeof(look_sections) = 'array' "
            "ORDER BY created_at DESC LIMIT 300"
        )

    sizes = collections.Counter()
    sections_per_run = collections.Counter()
    looks_per_run = collections.Counter()
    gap_looks = 0

    for r in rows:
        raw = r["look_sections"]
        secs = json.loads(raw) if isinstance(raw, str) else raw
        sections_per_run[len(secs)] += 1
        total = 0
        for sec in secs:
            is_gap = sec.get("source") == "wardrobe_gap"
            for sug in sec.get("suggestions") or []:
                n = len(sug.get("items") or [])
                if is_gap:
                    gap_looks += 1
                    continue
                sizes[n] += 1
                total += 1
        looks_per_run[total] += 1

    total_looks = sum(sizes.values())
    below = sum(v for k, v in sizes.items() if k < MIN_ITEMS)

    print(f"прогонов: {len(rows)}")
    print(f"\nобразов по числу вещей:")
    for n in sorted(sizes):
        mark = "  <-- отсеивается" if n < MIN_ITEMS else ""
        print(f"  {n:2} вещей: {sizes[n]:6}{mark}")
    print(f"\nвсего образов (без gap): {total_looks}")
    print(f"ниже порога {MIN_ITEMS}: {below}"
          + (f" ({below * 100 // total_looks}%)" if total_looks else ""))
    print(f"карточек в gap-секциях: {gap_looks}")
    print(f"\nразделов за прогон: {dict(sorted(sections_per_run.items()))}")
    print(f"образов за прогон:  {dict(sorted(looks_per_run.items()))}")

    await pool.close()


if __name__ == "__main__":
    asyncio.run(main())

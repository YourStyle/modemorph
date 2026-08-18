#!/usr/bin/env python3
"""Разметка пола вещей каталога по названию и описанию через LLM.

Зачем. Существующий крон /cron/classify-gender берёт только вещи с пустым полом
и никогда не пересматривает 'unisex'. А 'unisex' в базе — величина смешанная:
часть приходит из фида (feed_params.py мапит «унисекс»), часть ставит CLIP,
когда не уверен. Итог на 2026-08-18: 2718 вещей 'unisex' и 1317 без пола, и
среди них лежат балетки и платья, которые сборщик образов честно клал в мужские
комплекты — на кадре это видно сразу.

Правила по названию (_FEMALE_NAME_PATTERNS в cron.py) ловят «женск», «юбка»,
«платье» и ещё десяток слов. «Балетки Мэри Джейн из кожи с ремешком» ни под одно
не подходит, хотя человеку очевидна. Отсюда LLM: она знает, что балетки женские,
а оксфорды скорее мужские, без ведения списка слов.

Модель текстовая и дешёвая (gemini-2.5-flash-lite) — картинки не шлём, только
название, описание и тип.

Запуск в контейнере backend:
    docker exec -i modemorph-backend python3 - < classify_gender_llm.py --limit 120   # проба
    docker exec -i modemorph-backend python3 - < classify_gender_llm.py --commit

Селфчек чистых частей (без сети и базы):
    PYTHONPATH=backend python3 backend/scripts/classify_gender_llm.py --self-check
"""

import argparse
import asyncio
import json
import sys

BATCH = 60          # вещей в одном запросе: больше — модель начинает терять строки
MODEL = "google/gemini-2.5-flash-lite"
MAX_TOKENS = 4096   # обязателен: OpenRouter резервирует запрошенный максимум заранее

VALID = ("female", "male", "unisex")

_PROMPT_HEAD = """Ты размечаешь пол товаров одежды и обуви для российского маркетплейса.

Для каждой вещи верни пол: "female", "male" или "unisex".

Правила:
- Опирайся на знание о мире, а не только на слова в названии. Балетки, лодочки,
  босоножки на каблуке, платья, юбки, блузки — женские, даже если слова «женский»
  в названии нет. Оксфорды, дерби, галстук, боксеры — мужские.
- "unisex" ставь ТОЛЬКО когда вещь действительно носят и мужчины, и женщины в
  одинаковом виде: базовая футболка, худи оверсайз, кроссовки, шапка-бини, шарф.
- Если сомневаешься между "unisex" и конкретным полом — выбирай конкретный пол,
  когда фасон или деталь типичны для него (приталенный силуэт, каблук, декольте).
- Детские вещи размечай по полу ребёнка, а не как "unisex".

Верни СТРОГО JSON-массив без пояснений и без markdown, по объекту на каждую
вещь, в том же порядке: [{"id": 123, "gender": "female"}, ...]

ВЕЩИ:
"""


def build_prompt(items: list[dict]) -> str:
    """Чистая сборка запроса. Покрыта селфчеком."""
    lines = []
    for it in items:
        parts = [str(it.get("item_name") or "")]
        if it.get("clothing_type"):
            parts.append(f"тип: {it['clothing_type']}")
        desc = (it.get("description") or "").strip()
        if desc:
            # Описания у мерчантов бывают на несколько абзацев — режем, иначе
            # пачка из 60 вещей раздувает запрос и модель теряет хвост.
            parts.append("описание: " + " ".join(desc.split())[:160])
        lines.append(f'{it["id"]}. ' + " | ".join(parts))
    return _PROMPT_HEAD + "\n".join(lines)


def parse_answer(content: str, allowed_ids: set) -> dict:
    """Ответ модели -> {id: gender}. Чужие id и мусорные значения отбрасываем.

    Модель иногда оборачивает JSON в ```json — снимаем. Молча пропускаем всё,
    что не разобралось: лучше не разметить, чем разметить наугад.
    """
    text = (content or "").strip()
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        return {}
    try:
        rows = json.loads(text[start:end + 1])
    except Exception:
        return {}
    out = {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        try:
            rid = int(r.get("id"))
        except (TypeError, ValueError):
            continue
        g = str(r.get("gender") or "").strip().lower()
        if rid in allowed_ids and g in VALID:
            out[rid] = g
    return out


async def main(commit: bool, limit: int | None) -> None:
    from sqlalchemy import text as sql
    from app.core.database import async_session
    from app.core.config import settings
    from app.api.misc import _openrouter_chat
    from app.services import lookbook

    async with async_session() as db:
        q = """
            SELECT id, item_name, description, clothing_type, gender
            FROM wardrobe_items
            WHERE (gender IS NULL OR gender = '' OR gender = 'unisex')
              AND item_name IS NOT NULL
              AND COALESCE(is_kids, false) = false
            ORDER BY id
        """
        if limit:
            q += f" LIMIT {int(limit)}"
        rows = [dict(r) for r in (await db.execute(sql(q))).mappings().all()]

    print(f"[gender] к разметке: {len(rows)}", file=sys.stderr)
    changed = {"female": 0, "male": 0, "unisex": 0}
    kept = failed = 0
    spent = 0.0

    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        ids = {r["id"] for r in chunk}
        try:
            res = await _openrouter_chat(
                messages=[{"role": "user", "content": build_prompt(chunk)}],
                model=MODEL, temperature=0.0, max_tokens=MAX_TOKENS,
            )
            answer = parse_answer(
                res.get("choices", [{}])[0].get("message", {}).get("content", ""), ids)
            cost = await lookbook.fetch_cost(settings.OPENROUTER_API_KEY, res.get("id"))
            if cost:
                spent += cost
        except Exception as e:
            failed += len(chunk)
            print(f"[warn] пачка {i // BATCH}: {e}", file=sys.stderr)
            continue

        failed += len(ids) - len(answer)
        for r in chunk:
            new = answer.get(r["id"])
            if not new:
                continue
            old = (r["gender"] or "").strip().lower()
            if new == old:
                kept += 1
                continue
            changed[new] += 1
            if commit:
                async with async_session() as db:
                    await db.execute(
                        sql("UPDATE wardrobe_items SET gender = :g WHERE id = :i"),
                        {"g": new, "i": r["id"]})
                    await db.commit()
        print(f"[gender] {min(i + BATCH, len(rows))}/{len(rows)} "
              f"изменено {sum(changed.values())}, без изменений {kept}, "
              f"не разобрано {failed}, ${round(spent, 4)}", file=sys.stderr)

    print(json.dumps({"проверено": len(rows), "изменено": changed, "без_изменений": kept,
                      "не_разобрано": failed, "стоимость_usd": round(spent, 4),
                      "записано": commit}, ensure_ascii=False))


def _self_check() -> None:
    items = [
        {"id": 1, "item_name": "Балетки Мэри Джейн", "clothing_type": "shoes", "description": " кожа  с ремешком "},
        {"id": 2, "item_name": "Футболка оверсайз", "clothing_type": "t-shirt", "description": ""},
    ]
    p = build_prompt(items)
    assert "1. Балетки Мэри Джейн | тип: shoes | описание: кожа с ремешком" in p, p
    # Пустое описание не добавляет пустую секцию — строка на этом и заканчивается.
    assert p.strip().endswith("2. Футболка оверсайз | тип: t-shirt"), p[-120:]
    assert "описание:" not in p.split("2. Футболка")[1], p[-120:]

    ok = parse_answer('[{"id":1,"gender":"female"},{"id":2,"gender":"unisex"}]', {1, 2})
    assert ok == {1: "female", 2: "unisex"}, ok

    # Обёртка в markdown снимается.
    assert parse_answer('```json\n[{"id":1,"gender":"male"}]\n```', {1}) == {1: "male"}
    # Болтовня вокруг массива не мешает.
    assert parse_answer('Вот ответ: [{"id":1,"gender":"male"}] готово', {1}) == {1: "male"}

    # Чужие id и мусорные значения отбрасываются — разметить наугад хуже, чем не разметить.
    assert parse_answer('[{"id":99,"gender":"female"},{"id":1,"gender":"кто-то"}]', {1}) == {}
    assert parse_answer('[{"id":"нет","gender":"female"}]', {1}) == {}
    assert parse_answer("не json вовсе", {1}) == {}
    assert parse_answer("", {1}) == {}
    assert parse_answer('[{"id":1,"gender":"FEMALE"}]', {1}) == {1: "female"}, "регистр не важен"

    # Длинное описание режется, чтобы пачка из 60 вещей не раздувала запрос.
    long_desc = {"id": 3, "item_name": "Пальто", "clothing_type": "coat", "description": "я " * 400}
    assert len(build_prompt([long_desc]).split("описание: ")[1]) <= 170

    print("classify_gender_llm self-check OK")


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        _self_check()
    else:
        ap = argparse.ArgumentParser()
        ap.add_argument("--commit", action="store_true", help="писать в БД")
        ap.add_argument("--limit", type=int, help="взять только N вещей (проба)")
        a = ap.parse_args()
        asyncio.run(main(a.commit, a.limit))

# Рекомендации на главной: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать с главной несочетаемые образы и ложные «образы» из одних свитеров, вернуть на экран потерянные образы и научить промпт учитывать стиль и размеры пользователя.

**Architecture:** Четыре независимых слоя. (1) Чистая функция сочетаемости на общем температурном окне — без I/O, тестируется standalone. (2) Врезка этой функции в `_enrich_sections` между обогащением и отсевом по длине. (3) Удаление дефолта 20 °C в ночном генераторе. (4) Фронт различает gap-секцию по уже существующему `source === "wardrobe_gap"`.

**Tech Stack:** Python 3.12 / FastAPI / asyncpg (backend), Next.js 15 / React 19 / Tailwind (frontend). Тесты — standalone-скрипты в стиле `backend/test_kids_detect.py`, pytest в проекте не установлен.

**Спека:** `docs/superpowers/specs/2026-08-16-home-recommendations-design.md`

---

## File Structure

| Файл | Ответственность |
|---|---|
| `backend/app/services/outfit_compat.py` | **создать** — правила сочетаемости, чистые функции, без I/O |
| `backend/test_outfit_compat.py` | **создать** — standalone-тесты правил |
| `backend/app/api/recommendations.py` | **изменить** — врезка фильтра в `_enrich_sections`, обогащение промпта |
| `ai-service/scripts/generate_recommendations.py` | **изменить** — убрать три дефолта 20 °C |
| `components/gap-shelf.tsx` | **создать** — витрина «чего не хватает», отдельно от `outfit-card.tsx` |
| `app/app/page.tsx` | **изменить** — ветка рендера по `section.source` |
| `scripts/measure_outfit_dropoff.py` | **создать** — замер потерь образов |

`components/outfit-card.tsx` не трогаем: gap получает свой компонент.

---

### Task 1: Правила сочетаемости

**Files:**
- Create: `backend/app/services/outfit_compat.py`
- Test: `backend/test_outfit_compat.py`

Идея: у каждой вещи есть температурное окно. Вещи в одном образе должны иметь
общее окно шириной не меньше 3 °C. Шорты `(20,35)` и куртка `(0,20)`
пересекаются ровно в точке 20 — ширина 0, значит образ бракованный. Одно
правило вместо списка запрещённых пар.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/test_outfit_compat.py`:

```python
# -*- coding: utf-8 -*-
"""Тесты сочетаемости образа. Кейсы взяты из прода 2026-08-16: 1191 образ
содержал шорты с верхней одеждой, 150 — шорты с шапкой.

Запуск: `python3 backend/test_outfit_compat.py`
"""
import os
import sys

# Только backend/ на пути: app.services.weather_rules тянет clothing_taxonomy
# из корня backend, а вторая вставка backend/app дала бы модуль дважды.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.outfit_compat import is_coherent, repair_outfit, shared_window  # noqa: E402


def _item(name, ct, tmin=None, tmax=None):
    return {"id": name, "name": name, "clothing_type": ct,
            "temp_min": tmin, "temp_max": tmax}


def test_shorts_and_jacket_do_not_share_a_window():
    # Ровно тот брак со скриншота: окна пересекаются в одной точке 20.
    items = [_item("шорты", "shorts", 20, 35), _item("куртка", "jacket", 0, 20)]
    lo, hi = shared_window(items)
    assert (lo, hi) == (20, 20), (lo, hi)
    assert is_coherent(items) is False


def test_summer_outfit_is_coherent():
    items = [_item("футболка", "t-shirt", 18, 35),
             _item("шорты", "shorts", 20, 35),
             _item("кроссовки", "sneakers", None, None)]
    assert is_coherent(items) is True


def test_autumn_outfit_is_coherent():
    items = [_item("пальто", "coat", -10, 15),
             _item("джинсы", "jeans", 0, 28),
             _item("свитер", "pullover", 0, 18)]
    assert is_coherent(items) is True


def test_untagged_item_does_not_break_a_good_outfit():
    # Вещь без диапазона и без узнаваемого имени не должна ничего ломать.
    items = [_item("футболка", "t-shirt", 18, 35),
             _item("шорты", "shorts", 20, 35),
             _item("нечто", None, None, None)]
    assert is_coherent(items) is True


def test_repair_drops_the_offending_item():
    items = [_item("футболка", "t-shirt", 18, 35),
             _item("шорты", "shorts", 20, 35),
             _item("куртка", "jacket", 0, 20),
             _item("кроссовки", "sneakers", None, None)]
    kept, dropped = repair_outfit(items)
    assert len(dropped) == 1, dropped
    assert dropped[0]["name"] == "куртка"
    assert is_coherent(kept) is True


def test_repair_gives_up_when_too_few_items_remain():
    # Чинить нечего: после удаления останется меньше трёх вещей.
    items = [_item("шорты", "shorts", 20, 35), _item("пуховик", "puffer-jacket", -20, 10)]
    kept, dropped = repair_outfit(items)
    assert kept == [], kept


def test_cold_accessory_by_name_conflicts_with_shorts():
    # Шапка не имеет clothing_type в проде — ловим по имени.
    items = [_item("футболка", "t-shirt", 18, 35),
             _item("шорты", "shorts", 20, 35),
             _item("шапка вязаная", None, None, None)]
    assert is_coherent(items) is False


if __name__ == "__main__":
    passed = failed = 0
    for _name, _fn in sorted(list(globals().items())):
        if _name.startswith("test_") and callable(_fn):
            try:
                _fn()
                passed += 1
            except AssertionError as exc:
                failed += 1
                print("FAIL", _name, exc)
    print(f"{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `python3 backend/test_outfit_compat.py`
Expected: `ModuleNotFoundError: No module named 'app.services.outfit_compat'`

- [ ] **Step 3: Написать минимальную реализацию**

Создать `backend/app/services/outfit_compat.py`:

```python
# -*- coding: utf-8 -*-
"""Отсев образов, которые уместны повещно, но абсурдны в сборе.

`weather_rules.temp_ok` фильтрует вещи ПО ОДНОЙ и делает это верно. Поймать
«шорты + пуховик» он не может: при 20 °C окна shorts (20..35) и jacket (0..20)
оба содержат 20, поэтому каждая вещь проходит сама по себе. Замер прода
2026-08-16: 1191 образ из 78124 смешивал шорты с верхней одеждой, 150 — с
зимними аксессуарами.

Правило одно: вещи образа должны иметь общее температурное окно шириной не
меньше _MIN_WINDOW. Оно ловит и шорты с курткой, и шорты с шапкой, и майку со
свитером — без списка запрещённых пар, который пришлось бы вечно дополнять.
"""

from app.services.weather_rules import infer_temp_range

# Ширина общего окна, ниже которой образ считаем несобираемым.
# 3 °C, а не 0: пересечение ровно в одной точке (shorts 20..35 и jacket 0..20
# дают [20,20]) — это математическая случайность, а не носибельный образ.
_MIN_WINDOW = 3

# Границы для вещей без диапазона: заведомо шире любого реального окна,
# чтобы неразмеченная вещь никогда не сужала пересечение.
_OPEN_LO, _OPEN_HI = -50, 50

# Зимние аксессуары в проде лежат без clothing_type и без диапазона —
# у них остаётся только имя.
_COLD_ACCESSORY_WORDS = (
    "шапк", "шарф", "перчатк", "варежк", "снуд", "балаклав",
    "beanie", "scarf", "gloves", "mittens",
)
_COLD_ACCESSORY_RANGE = (-30, 12)

# Минимум вещей в образе; ниже — показывать нечего.
_MIN_ITEMS = 3


def item_window(item: dict) -> tuple[int, int]:
    """Температурное окно вещи. Неизвестное — максимально широкое."""
    tmin = item.get("temp_min")
    tmax = item.get("temp_max")
    name = item.get("name") or item.get("item_name") or ""
    if tmin is None and tmax is None:
        if any(w in name.lower() for w in _COLD_ACCESSORY_WORDS):
            return _COLD_ACCESSORY_RANGE
        tmin, tmax = infer_temp_range(item.get("clothing_type"), name)
    return (
        tmin if tmin is not None else _OPEN_LO,
        tmax if tmax is not None else _OPEN_HI,
    )


def shared_window(items: list[dict]) -> tuple[int, int]:
    """Пересечение окон всех вещей образа."""
    lo, hi = _OPEN_LO, _OPEN_HI
    for it in items:
        a, b = item_window(it)
        lo = max(lo, a)
        hi = min(hi, b)
    return lo, hi


def is_coherent(items: list[dict]) -> bool:
    """True, если вещи образа можно надеть одновременно."""
    if not items:
        return False
    lo, hi = shared_window(items)
    return (hi - lo) >= _MIN_WINDOW


def repair_outfit(items: list[dict]) -> tuple[list[dict], list[dict]]:
    """Убрать конфликтующие вещи. Возвращает (оставшиеся, выброшенные).

    На каждом шаге выбрасывается вещь, удаление которой сильнее всего
    расширяет общее окно. Если после починки осталось меньше _MIN_ITEMS —
    возвращаем ([], все), то есть образ выбрасывается целиком.
    """
    kept = list(items)
    dropped: list[dict] = []
    while kept and not is_coherent(kept):
        best_idx, best_width = None, None
        for idx in range(len(kept)):
            rest = kept[:idx] + kept[idx + 1:]
            if not rest:
                continue
            lo, hi = shared_window(rest)
            width = hi - lo
            if best_width is None or width > best_width:
                best_idx, best_width = idx, width
        if best_idx is None:
            break
        dropped.append(kept.pop(best_idx))
    if len(kept) < _MIN_ITEMS:
        return [], list(items)
    return kept, dropped
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `python3 backend/test_outfit_compat.py`
Expected: `7 passed, 0 failed`

- [ ] **Step 5: Коммит**

```bash
git add backend/app/services/outfit_compat.py backend/test_outfit_compat.py
git commit -m "feat(rec): правило сочетаемости образа по общему температурному окну"
```

---

### Task 2: Врезать фильтр в обогащение секций

**Files:**
- Modify: `backend/app/api/recommendations.py` (импорт рядом со строкой 22; врезка в `_enrich_sections` перед отсевом `len(items) >= 3`)

- [ ] **Step 1: Добавить импорт**

После строки `from app.services.capsule import capsule_style_guide` добавить:

```python
from app.services.outfit_compat import repair_outfit
```

- [ ] **Step 2: Найти точку врезки**

Run: `grep -n "Drop suggestions with too few items" backend/app/api/recommendations.py`
Expected: одна строка с комментарием и следом строка с `section["suggestions"] = [s for s in ...]`

- [ ] **Step 3: Заменить отсев на починку + отсев**

Заменить эти две строки:

```python
        # Drop suggestions with too few items (post-dedup can drop below 3)
        section["suggestions"] = [s for s in section.get("suggestions", []) if len(s.get("items") or []) >= 3]
```

на:

```python
        # Gap-секции — это витрина по одному слоту, а не образ: чинить нечего.
        if not is_gap_section:
            for s in section.get("suggestions", []):
                kept, dropped = repair_outfit(s.get("items") or [])
                if dropped:
                    logger.info(
                        "[rec] outfit %s: выброшено %d несочетаемых (%s)",
                        s.get("id"), len(dropped),
                        ", ".join(str(d.get("name")) for d in dropped),
                    )
                s["items"] = kept
        # Drop suggestions with too few items (post-dedup can drop below 3)
        section["suggestions"] = [s for s in section.get("suggestions", []) if len(s.get("items") or []) >= 3]
```

- [ ] **Step 4: Проверить, что модуль импортируется**

Run: `cd backend && python3 -c "import ast,sys; ast.parse(open('app/api/recommendations.py').read()); print('синтаксис ок')"`
Expected: `синтаксис ок`

- [ ] **Step 5: Коммит**

```bash
git add backend/app/api/recommendations.py
git commit -m "fix(rec): чинить несочетаемые образы до отсева по длине"
```

---

### Task 3: Убрать дефолт 20 °C

**Files:**
- Modify: `ai-service/scripts/generate_recommendations.py:104,195,200`

Замер прода: 30 из 194 пользователей не имеют записи в `weather_cache` и
получили образы под выдуманные 20 °C. Отдельно `or 20` в строке 200
превращает 0 °C в 20 °C — зимой это выстрелит у всех.

- [ ] **Step 1: Заменить дефолт при отсутствии кэша**

Заменить:

```python
                weather = {
                    "temperature": weather_row["temperature"] if weather_row else 20,
                    "description": weather_row["description"] if weather_row else "ясно",
                    "location": weather_row["city_name"] if weather_row else "Москва",
                }
                gender = profile["gender"] if profile else None
                temp = weather["temperature"] or 20
```

на:

```python
                # Без реальной погоды образ собирать нельзя: выдуманные 20 °C —
                # единственная температура, при которой окна shorts (20..35) и
                # jacket (0..20) пересекаются, и она рождала «куртку с шортами».
                # Лучше пустая главная, чем брак.
                if weather_row is None or weather_row["temperature"] is None:
                    logger.warning(
                        "нет погоды для %s — рекомендации пропущены",
                        user_row["user_id"],
                    )
                    continue
                weather = {
                    "temperature": weather_row["temperature"],
                    "description": weather_row["description"] or "ясно",
                    "location": weather_row["city_name"] or "Москва",
                }
                gender = profile["gender"] if profile else None
                # НЕ `or 20`: 0 °C ложно-ложный, и `0 or 20` даёт 20.
                temp = weather["temperature"]
```

- [ ] **Step 2: Убрать дефолт из текста промпта**

Заменить `{weather.get('temperature', 20)}` на `{weather['temperature']}` в строке 104.

- [ ] **Step 3: Убедиться, что дефолтов не осталось**

Run: `grep -n "or 20\|, 20)\|else 20" ai-service/scripts/generate_recommendations.py`
Expected: пусто

- [ ] **Step 4: Проверить синтаксис**

Run: `python3 -c "import ast; ast.parse(open('ai-service/scripts/generate_recommendations.py').read()); print('ок')"`
Expected: `ок`

- [ ] **Step 5: Коммит**

```bash
git add ai-service/scripts/generate_recommendations.py
git commit -m "fix(rec): не выдумывать 20 °C — без погоды рекомендации не генерируются"
```

---

### Task 4: Витрина вместо ложного образа

**Files:**
- Create: `components/gap-shelf.tsx`
- Modify: `app/app/page.tsx` (ветка рендера около строки 552)

Бэкенд уже помечает секцию `source: "wardrobe_gap"`, а `page.tsx:577` уже
передаёт `sectionSource` в карточку. Новое поле не нужно — нужна ветка рендера.

- [ ] **Step 1: Создать компонент витрины**

Создать `components/gap-shelf.tsx`:

```tsx
"use client"

import Image from "next/image"

/**
 * Витрина «чего не хватает в гардеробе».
 *
 * Это НЕ образ: внутри лежат взаимозаменяемые варианты одного слота (четыре
 * свитера). Рендерить их карточкой образа с кнопками «Весь образ» и
 * «Примерить» — обещать то, чего нет. Поэтому отдельный компонент, а не флаг
 * внутри outfit-card.tsx.
 */

interface GapItem {
  id: string | number
  name?: string
  image_url?: string
  url?: string | null
  brand?: string | null
  price?: number | null
}

interface GapGroup {
  id: string
  title: string
  items: GapItem[]
  gap_slot?: string
}

export function GapShelf({ groups }: { groups: GapGroup[] }) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.id} className="space-y-3">
          <h3 className="text-body font-semibold text-ink">{group.title}</h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
            {group.items.map((item) => (
              <a
                key={item.id}
                href={item.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 w-36 snap-start"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-canvas-sunk">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name ?? ""}
                      fill
                      sizes="144px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <p className="mt-2 line-clamp-2 text-caption text-ink">{item.name}</p>
                {item.brand ? (
                  <p className="text-caption text-ink/60">{item.brand}</p>
                ) : null}
                {item.price ? (
                  <p className="text-caption font-semibold text-ink">
                    {Math.round(item.price).toLocaleString("ru-RU")} ₽
                  </p>
                ) : null}
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Импортировать компонент в page.tsx**

Рядом с `import { OutfitCard } from "@/components/outfit-card"` добавить:

```tsx
import { GapShelf } from "@/components/gap-shelf"
```

- [ ] **Step 3: Добавить ветку рендера**

Run: `grep -n "section.looks_count || section.suggestions.length" app/app/page.tsx`
Expected: одна строка со счётчиком «образов»

Заменить счётчик так, чтобы для gap-секции он считал вещи, а не образы:

```tsx
{section.source === "wardrobe_gap"
  ? `${section.suggestions.reduce((n, s) => n + (s.items?.length ?? 0), 0)} вещей`
  : `${section.looks_count || section.suggestions.length} образов`}
```

Затем найти блок `section.suggestions.map((suggestion, suggestionIndex) => {` и
обернуть его условием: если `section.source === "wardrobe_gap"`, рендерить

```tsx
<GapShelf
  groups={section.suggestions.map((s) => ({
    id: String(s.id),
    title: s.title,
    items: s.items ?? [],
    gap_slot: (s as { gap_slot?: string }).gap_slot,
  }))}
/>
```

иначе — существующий маппинг с `<OutfitCard>` без изменений.

- [ ] **Step 4: Проверить сборку**

Run: `pnpm build`
Expected: сборка проходит, без ошибок типов в `page.tsx` и `gap-shelf.tsx`

- [ ] **Step 5: Проверить глазами**

Открыть главную через preview_start, убедиться: у секции «Чего не хватает в
гардеробе» нет кнопок «Весь образ» и «Примерить», счётчик показывает вещи,
карточка ведёт на товар.

- [ ] **Step 6: Коммит**

```bash
git add components/gap-shelf.tsx app/app/page.tsx
git commit -m "feat(ui): витрина вместо ложного образа для дыр гардероба"
```

---

### Task 5: Замерить потери образов

**Files:**
- Create: `scripts/measure_outfit_dropoff.py`

Промпт просит 5–7 разделов по 3–4 образа (15–25 всего), пользователь видит 1–3.
Чинить вслепую нельзя — сначала замер.

- [ ] **Step 1: Написать скрипт замера**

Создать `scripts/measure_outfit_dropoff.py`:

```python
# -*- coding: utf-8 -*-
"""Где умирают образы между ответом модели и экраном.

Промпт просит 15-25 образов, пользователь видит 1-3. Скрипт считает, сколько
образов в сохранённых секциях и какого они размера, чтобы отличить «модель
вернула мало» от «мы их отсеяли».

Запуск внутри modemorph-backend:
    python3 measure_outfit_dropoff.py
"""
import asyncio
import os
import collections

import asyncpg

DSN = (os.getenv("DATABASE_URL") or "").replace("postgresql+asyncpg://", "postgresql://")


async def main():
    pool = await asyncpg.create_pool(DSN, min_size=1, max_size=3)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT look_sections FROM main_recommendations "
            "WHERE jsonb_typeof(look_sections)='array' "
            "ORDER BY created_at DESC LIMIT 300"
        )
    sizes = collections.Counter()
    sections_per_run = collections.Counter()
    looks_per_run = collections.Counter()
    import json
    for r in rows:
        secs = json.loads(r["look_sections"]) if isinstance(r["look_sections"], str) else r["look_sections"]
        sections_per_run[len(secs)] += 1
        total = 0
        for sec in secs:
            for sug in sec.get("suggestions") or []:
                n = len(sug.get("items") or [])
                sizes[n] += 1
                total += 1
        looks_per_run[total] += 1
    print("образов по размеру (вещей в образе -> сколько образов):")
    for n in sorted(sizes):
        print(f"  {n:2} вещей: {sizes[n]}")
    print(f"\nниже порога 3: {sum(v for k, v in sizes.items() if k < 3)}")
    print(f"всего образов: {sum(sizes.values())} в {len(rows)} прогонах")
    print(f"\nразделов за прогон: {dict(sorted(sections_per_run.items()))}")
    print(f"образов за прогон:  {dict(sorted(looks_per_run.items()))}")
    await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Прогнать на проде (только чтение)**

```bash
scp -i ~/.ssh/modemorph scripts/measure_outfit_dropoff.py tashernaut@158.160.167.47:/tmp/
ssh -i ~/.ssh/modemorph tashernaut@158.160.167.47 'docker cp /tmp/measure_outfit_dropoff.py modemorph-backend:/tmp/ && docker exec modemorph-backend python3 /tmp/measure_outfit_dropoff.py'
```

Expected: распределение размеров образов и число разделов за прогон.

- [ ] **Step 3: Записать вывод в план**

Дописать полученные числа в конец этого файла разделом «Замер потерь
2026-08-16», чтобы следующая задача чинила по факту, а не по догадке.

- [ ] **Step 4: Коммит**

```bash
git add scripts/measure_outfit_dropoff.py docs/superpowers/plans/2026-08-16-home-recommendations.md
git commit -m "chore(rec): скрипт замера потерь образов + результаты"
```

---

### Task 6: Обогатить промпт

**Files:**
- Modify: `backend/app/api/recommendations.py` (запрос профиля около строки 496; `style_hint` около 596; `wardrobe_json` около 576; правило 622 в системном промпте)

Замер: `dominant_style` пуст у 161 из 295 профилей (55%) — у них строка про
стиль исчезает целиком. `style_tags` заполнен у 134 и не используется нигде.
Размеры заполнены у 209 и не используются нигде.

- [ ] **Step 1: Расширить запрос профиля**

Заменить запрос около строки 496:

```python
        text("SELECT dominant_style FROM user_profiles WHERE user_id = :uid"),
```

на:

```python
        text("SELECT dominant_style, style_tags, top_size, bottom_size, shoe_size "
             "FROM user_profiles WHERE user_id = :uid"),
```

и разбор ниже:

```python
    dominant_style = (style_row["dominant_style"] if style_row else "") or ""
    style_tags = (style_row["style_tags"] if style_row else None) or []
    sizes = {
        "top": (style_row["top_size"] if style_row else None) or "",
        "bottom": (style_row["bottom_size"] if style_row else None) or "",
        "shoe": (style_row["shoe_size"] if style_row else None) or "",
    }
```

- [ ] **Step 2: Выводить стиль из гардероба, когда профиль молчит**

Перед формированием `style_hint` добавить:

```python
    # У 55% профилей dominant_style пуст, и строка про стиль пропадала целиком.
    # Гардероб сам по себе — сигнал вкуса: берём самые частые стиль и цвет.
    if not dominant_style and not style_tags:
        from collections import Counter
        owned = [i for i in wardrobe_items if i.get("user_id")]
        top_style = Counter(
            (i.get("style") or "").strip() for i in owned if (i.get("style") or "").strip()
        ).most_common(1)
        top_color = Counter(
            (i.get("color") or "").strip() for i in owned if (i.get("color") or "").strip()
        ).most_common(2)
        derived = []
        if top_style:
            derived.append(top_style[0][0])
        if top_color:
            derived.append("часто носит " + ", ".join(c for c, _ in top_color))
        dominant_style = "; ".join(derived)
```

- [ ] **Step 3: Собрать сводку по слотам и расширить style_hint**

Заменить строку `style_hint = ...` на:

```python
    from collections import Counter as _Counter
    _slot_counts = _Counter()
    for _i in wardrobe_items:
        if not _i.get("user_id"):
            continue
        _s = _SLOT_MAP.get(normalize_clothing_type(_i.get("clothing_type")) or "")
        if _s:
            _slot_counts[_s] += 1
    slot_summary = ", ".join(f"{k}: {v}" for k, v in sorted(_slot_counts.items())) or "пусто"

    style_parts = []
    if dominant_style:
        style_parts.append(f"User's preferred style: {dominant_style}. "
                           "Most outfits (70-80%) should match it, 2-3 can experiment.")
    if style_tags:
        style_parts.append("Style tags: " + ", ".join(str(t) for t in style_tags) + ".")
    if any(sizes.values()):
        style_parts.append(
            "User sizes — top: {top}, bottom: {bottom}, shoe: {shoe}. "
            "Never suggest a PARTNER item in a different size.".format(**sizes)
        )
    style_parts.append(f"Wardrobe inventory by slot: {slot_summary}.")
    style_hint = "\n" + "\n".join(style_parts)
```

- [ ] **Step 4: Передавать температурное окно каждой вещи**

В `wardrobe_json` и `partner_json` добавить поле после `"type"`:

```python
        "temp": list(item_window(i)),
```

и импорт рядом с `repair_outfit`:

```python
from app.services.outfit_compat import repair_outfit, item_window
```

- [ ] **Step 5: Смягчить правило про верхнюю одежду**

Заменить в системном промпте:

```
   * Outerwear (jacket/coat/blazer) — REQUIRED if weather < 18°C
```

на:

```
   * Outerwear — REQUIRED if weather < 15°C, OPTIONAL between 15 and 20°C.
     Every item carries a "temp" window [min, max]. All items in one outfit
     MUST share an overlap of at least 3°C. Shorts (20..35) and a jacket
     (0..20) overlap only at the single point 20 — that is NOT an outfit.
```

- [ ] **Step 6: Проверить синтаксис**

Run: `cd backend && python3 -c "import ast; ast.parse(open('app/api/recommendations.py').read()); print('ок')"`
Expected: `ок`

- [ ] **Step 7: Коммит**

```bash
git add backend/app/api/recommendations.py
git commit -m "feat(rec): промпт учитывает стиль, размеры, состав гардероба и окна температур"
```

---

## Что этот план осознанно НЕ покрывает

Часть 4 спеки состоит из двух половин: замер потерь и починка плотности
главной. Здесь есть только замер (Task 5). Задачи на починку намеренно нет —
её шаги зависят от чисел, которых пока не существует, и написать их сейчас
можно было бы только выдумав.

**После Task 5 нужен второй план** — на починку потерь и плотность, с опорой
на замер. Порядок из спеки обязателен: он идёт после Task 2, иначе починка
потерь вынесет на главную больше брака, а не меньше.

## Проверка результата

После Task 3 и Task 6 сгенерировать рекомендации заново и проверить на проде:

```sql
WITH looks AS (
  SELECT sug->>'title' AS t, string_agg(lower(it->>'name'), ' | ') AS names
  FROM main_recommendations m,
       jsonb_array_elements(m.look_sections) sec,
       jsonb_array_elements(sec->'suggestions') sug,
       jsonb_array_elements(sug->'items') it
  WHERE m.created_at > now() - interval '1 day'
  GROUP BY m.id, sug->>'title'
)
SELECT count(*) FILTER (WHERE names ~ 'шорт' AND names ~ 'куртк|пальто|пуховик|парка') AS shorts_outer,
       count(*) FILTER (WHERE names ~ 'шорт' AND names ~ 'шапк|шарф|перчатк') AS shorts_hat,
       count(*) AS total
FROM looks;
```

Целевое: `shorts_outer = 0`, `shorts_hat = 0` (было 1191 и 150 из 78124).

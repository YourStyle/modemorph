# -*- coding: utf-8 -*-
"""
outfit_compat.py — проверка сочетаемости образа ЦЕЛИКОМ по температуре.

Зачем это нужно: `weather_rules.temp_ok()` фильтрует вещи ПО ОДНОЙ и для этого
подходит отлично, но она принципиально не может поймать конфликт между двумя
вещами внутри одного образа. Замер прода 2026-08-16 показал: из 78124
сохранённых образов 1191 содержит шорты вместе с верхней одеждой (курткой,
пальто и т.п.), а 150 — шорты с шапкой или шарфом.

Пример на цифрах, почему temp_ok() не спасает: при 20°C окно шорт (20..35)
включает 20, окно куртки (0..20) тоже включает 20 — обе вещи по отдельности
"подходят" к 20°C, temp_ok() пропускает каждую. Но носить их вместе нельзя:
у пары нет общего комфортного диапазона температур, есть только одна
математическая точка пересечения. Эта проблема ловится только проверкой
ПЕРЕСЕЧЕНИЯ окон всех вещей образа сразу — этим и занимается модуль.

Модуль чистый: без I/O и обращений к базе, только функции над списками
словарей вида {"clothing_type": ..., "name"/"item_name": ..., "temp_min": ...,
"temp_max": ...}.
"""

from clothing_taxonomy import slot_of
from app.services.weather_rules import infer_temp_range

# Минимальная ширина общего окна, чтобы образ считался носибельным. Пересечение
# ровно в одной точке (как у шорт и куртки при 20°C) — это математическая
# случайность на границах диапазонов, а не реальная всесезонность.
_MIN_WINDOW = 3

# Минимальное число вещей, которое должно остаться в образе после починки —
# меньше уже не образ, а бессмысленный огрызок.
_MIN_OUTFIT_SIZE = 3

# Зимние аксессуары почти никогда не размечены clothing_type/temp_min/temp_max
# в проде — они лежат просто с именем. Ловим по ключевым словам в названии.
_COLD_ACCESSORY_KEYWORDS = (
    "шапк", "шарф", "перчатк", "варежк", "снуд", "балаклав",
    "beanie", "scarf", "gloves", "mittens",
)
_COLD_ACCESSORY_WINDOW = (-30, 12)

# Максимально широкое окно для вещей, про которые вообще ничего не известно —
# такая вещь не должна сужать общее пересечение и ломать иначе хороший образ.
_UNKNOWN_WINDOW = (-50, 50)


# Слоты, любой из которых закрывает низ образа. 'set' — это костюм/комбинезон,
# он самодостаточен, отдельные брюки к нему не нужны.
_BOTTOM_SLOTS = frozenset({"bottom", "dress", "set"})


def has_bottom(items: list) -> bool:
    """True, если образ прикрывает ноги.

    Проверка температур и дедупликация по слотам не ловят эту дыру совсем:
    состав образа собирает языковая модель свободно, и она регулярно выдаёт
    «рубашка + куртка + очки» — вещи по отдельности уместные, окна совпадают,
    слоты не дублируются, а надеть это нельзя. На проде 17.08.2026 такой образ
    приехал живому пользователю под заголовком «Прогулка с комфортом».

    Верх намеренно НЕ требуется: свитшот или худи с брюками — нормальный образ
    без рубашки под ними, и требование «обязательно top» выбрасывало бы его.
    """
    return any(slot_of(it.get("clothing_type")) in _BOTTOM_SLOTS for it in items)


def item_window(item: dict) -> tuple[int, int]:
    """Температурное окно (min, max) одной вещи образа."""
    tmin = item.get("temp_min")
    tmax = item.get("temp_max")
    if tmin is not None or tmax is not None:
        lo = tmin if tmin is not None else _UNKNOWN_WINDOW[0]
        hi = tmax if tmax is not None else _UNKNOWN_WINDOW[1]
        return (lo, hi)

    name = (item.get("name") or item.get("item_name") or "").lower()
    if any(kw in name for kw in _COLD_ACCESSORY_KEYWORDS):
        return _COLD_ACCESSORY_WINDOW

    inferred_lo, inferred_hi = infer_temp_range(item.get("clothing_type"), name)
    if inferred_lo is not None or inferred_hi is not None:
        lo = inferred_lo if inferred_lo is not None else _UNKNOWN_WINDOW[0]
        hi = inferred_hi if inferred_hi is not None else _UNKNOWN_WINDOW[1]
        return (lo, hi)

    return _UNKNOWN_WINDOW


def shared_window(items: list) -> tuple[int, int]:
    """Пересечение температурных окон всех вещей образа."""
    lo, hi = _UNKNOWN_WINDOW
    for it in items:
        item_lo, item_hi = item_window(it)
        lo = max(lo, item_lo)
        hi = min(hi, item_hi)
    return (lo, hi)


def is_coherent(items: list) -> bool:
    """True, если у образа есть общее температурное окно шириной от _MIN_WINDOW °C."""
    if not items:
        return False
    lo, hi = shared_window(items)
    return (hi - lo) >= _MIN_WINDOW


def _is_base_item(item: dict) -> bool:
    """True, если вещь занимает структурный слот образа (верх/низ/платье/обувь/...).

    Используется только для порядка починки: аксессуары (шапки, шарфы,
    перчатки, сумки, украшения — всё, для чего slot_of() не находит слота)
    — расходный материал, ими жертвуем первыми. Базовый гардероб (то, для
    чего есть слот в SLOT_MAP из clothing_taxonomy) — нет: чинить образ,
    выбрасывая футболку и шорты, но оставляя шапку с шарфом, бессмысленно.
    """
    name = item.get("name") or item.get("item_name")
    return slot_of(item.get("clothing_type"), name) is not None


def repair_outfit(items: list) -> tuple[list[dict], list[dict]]:
    """
    Пытается починить несогласованный образ, выбрасывая по одной вещи —
    ту, чьё удаление сильнее всего расширяет общее окно.

    Уже согласованный образ чинить не нужно: он возвращается как есть,
    без применения порога _MIN_OUTFIT_SIZE (иначе валидная пара вроде
    "платье + туфли" стиралась бы только потому, что в ней две вещи).

    При выборе, что выбросить, на каждом шаге сперва пробуем аксессуары
    (см. _is_base_item) — и только когда в остатке аксессуаров больше нет,
    переходим к базовым вещам. Иначе жадный алгоритм по ширине окна
    систематически жертвует футболкой и шортами ради шапки с шарфом: их
    окно (-30, 12) шире окна конкретной вещи, поэтому выглядит "выгоднее"
    выбросить.

    Возвращает (оставшиеся, выброшенные). Входной список и вложенные
    словари не мутируются.

    Образ выбрасывается целиком — возвращается ([], list(items)) — если
    после починки осталось меньше _MIN_OUTFIT_SIZE вещей, ЛИБО если среди
    оставшихся не осталось ни одной базовой вещи (одни аксессуары — тоже
    не образ, даже если формально вещей три и больше).
    """
    if is_coherent(items):
        return list(items), []

    remaining = list(items)
    dropped = []

    while remaining and not is_coherent(remaining):
        # Сначала кандидаты на выброс — аксессуары; если их не осталось,
        # приходится жертвовать базовыми вещами.
        candidate_indices = [i for i, it in enumerate(remaining) if not _is_base_item(it)]
        if not candidate_indices:
            candidate_indices = list(range(len(remaining)))

        best_idx = None
        best_width = None
        for idx in candidate_indices:
            candidate = remaining[:idx] + remaining[idx + 1:]
            lo, hi = shared_window(candidate)
            width = hi - lo
            if best_width is None or width > best_width:
                best_width = width
                best_idx = idx
        dropped.append(remaining.pop(best_idx))

    has_base_item = any(_is_base_item(it) for it in remaining)
    if len(remaining) < _MIN_OUTFIT_SIZE or not has_base_item:
        return [], list(items)

    return remaining, dropped

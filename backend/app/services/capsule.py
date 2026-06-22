"""Curated capsule (silhouettes + occasions) → text style guide for LLM prompts.

The capsule (`basic_wardrobe_items` + `combinations`) was hand-curated by the team
but never fed to the recommendation models — Gemini invented combos from scratch.
This renders gender-matched curated combinations as few-shot style exemplars so the
model imitates the curator's silhouette/pairing logic on the actually-available items.

Used by: cron `_gemini_organize`, recommendations POST, ai-assistant chat, widget polish.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

# ponytail: process-lifetime cache keyed by gender. Capsule data is hand-edited
# rarely; call clear_cache() from the combinations admin CRUD if staleness bites.
_CACHE: dict[str, str] = {}

# Colors are NOT stored per item in the DB (only the lib/color-map.ts palette
# exists on the frontend), so the colour guidance is a static harmony rule rather
# than per-combination data.
_COLOR_RULE = (
    "Цвета: база — нейтральные (чёрный, белый, серый, бежевый, тёмно-синий); "
    "1 акцентный цвет на образ; максимум 3 цвета в образе; "
    "не сочетай несколько кричащих цветов одновременно."
)

_MAX_PATTERNS = 12  # keep the prompt block compact


def _opposite(gender: str | None) -> str | None:
    g = (gender or "").strip().lower()
    if g == "male":
        return "female"
    if g == "female":
        return "male"
    return None


def render_capsule_guide(rows: list[dict], gender: str | None) -> str:
    """Pure formatter (no I/O — unit-tested). Group capsule rows by combination,
    drop combos containing an explicit opposite-gender item, render each surviving
    combo as a one-line pattern of silhouettes.

    rows: dicts with keys combo_id, occasion, clothing_type, description, name_ru, item_gender.
    """
    opp = _opposite(gender)
    combos: dict = {}
    for r in rows:
        cid = r["combo_id"]
        c = combos.setdefault(cid, {"occasion": (r.get("occasion") or "Образ").strip(), "parts": [], "drop": False})
        if opp and (r.get("item_gender") or "").strip().lower() == opp:
            c["drop"] = True
        part = (r.get("description") or r.get("name_ru") or r.get("clothing_type") or "").strip()
        part = " ".join(part.split())[:45]  # collapse whitespace, trim long descriptions
        if part:
            c["parts"].append(part)

    lines: list[str] = []
    for c in combos.values():
        if c["drop"] or len(c["parts"]) < 2:
            continue
        lines.append(f"- {c['occasion']}: " + " + ".join(c["parts"]))
        if len(lines) >= _MAX_PATTERNS:
            break

    if not lines:
        return ""
    return (
        "ЭТАЛОННЫЕ СОЧЕТАНИЯ СТИЛИСТА (повторяй эту логику силуэтов и сочетаний "
        "на доступных вещах, НЕ копируй дословно — это абстрактные образцы, а не товары):\n"
        + "\n".join(lines)
        + "\n" + _COLOR_RULE
    )


async def capsule_style_guide(db: "AsyncSession", gender: str | None) -> str:
    """Gender-matched curated capsule rendered as a prompt block, cached by gender.

    Returns "" on an empty capsule or ANY DB error — the capsule is a bonus and must
    never break generation. On error the session is rolled back so the caller can
    keep using it.
    """
    key = (gender or "").strip().lower()
    if key in _CACHE:
        return _CACHE[key]
    from sqlalchemy import text  # local import: keeps the pure renderer dependency-free
    try:
        result = await db.execute(text("""
            SELECT c.id AS combo_id, c.name AS occasion,
                   b.clothing_type, b.description, b.name_ru, b.gender AS item_gender
            FROM combinations c
            JOIN combination_elements ce ON ce.combination_id = c.id
            JOIN basic_wardrobe_items b ON b.id = ce.basic_item_id
            WHERE COALESCE(c.combination_type, 'items') = 'items'
            ORDER BY c.id, ce.position
        """))
        rows = [dict(r) for r in result.mappings().all()]
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        return ""

    guide = render_capsule_guide(rows, gender)
    _CACHE[key] = guide
    return guide


def clear_cache() -> None:
    """Drop the in-process cache — call after editing combinations in admin."""
    _CACHE.clear()


if __name__ == "__main__":
    # ponytail: one runnable self-check for the pure renderer (no DB).
    fixture = [
        {"combo_id": 4, "occasion": "Casual", "clothing_type": "jeans", "description": "Джинсы Baggy", "name_ru": "Джинсы", "item_gender": "female"},
        {"combo_id": 4, "occasion": "Casual", "clothing_type": "shirt", "description": "Поло без рукавов", "name_ru": "Поло", "item_gender": "female"},
        {"combo_id": 4, "occasion": "Casual", "clothing_type": "верхняя", "description": "Сабо", "name_ru": "Сабо", "item_gender": "female"},
        {"combo_id": 9, "occasion": "Classic", "clothing_type": "pants", "description": "Брюки прямые", "name_ru": "Брюки", "item_gender": "male"},
        {"combo_id": 9, "occasion": "Classic", "clothing_type": "shirt", "description": "Рубашка оверсайз", "name_ru": "Рубашка", "item_gender": "male"},
    ]
    # Female user: combo 4 (female) kept, combo 9 (male) dropped.
    out_f = render_capsule_guide(fixture, "female")
    assert "Casual" in out_f, out_f
    assert "Classic" not in out_f, out_f
    assert "Джинсы Baggy + Поло без рукавов + Сабо" in out_f, out_f
    assert _COLOR_RULE in out_f, out_f

    # Male user: combo 9 kept, combo 4 dropped.
    out_m = render_capsule_guide(fixture, "male")
    assert "Classic" in out_m and "Casual" not in out_m, out_m

    # No gender: both kept.
    out_all = render_capsule_guide(fixture, None)
    assert "Casual" in out_all and "Classic" in out_all, out_all

    # Empty capsule → empty string (callers degrade gracefully).
    assert render_capsule_guide([], "female") == ""

    # A combo with a single usable part is skipped (needs >=2).
    assert render_capsule_guide([{"combo_id": 1, "occasion": "X", "description": "Шарф", "item_gender": None}], None) == ""

    print("capsule self-check OK")

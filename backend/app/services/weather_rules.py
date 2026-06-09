"""
weather_rules.py — single source of truth for temperature ↔ clothing logic.

Why this exists: user wardrobe items almost never have temp_min/temp_max set, and
the old filters treated NULL as "fits any weather" — so a down jacket showed up at
+20°C. temp_ok() infers a sensible range from clothing_type AND the item name when
the DB columns are NULL, so untagged items are still filtered correctly with no
data backfill required. Shared by cron.py and recommendations.py (was duplicated).
"""

# clothing_type -> (min_temp, max_temp) in °C
TEMP_RANGES: dict[str, tuple[int, int]] = {
    "t-shirt": (18, 35), "tank-top": (22, 35), "shirt": (10, 30),
    "blouse": (12, 30), "lonsleeve": (5, 22), "turtleneck": (0, 15),
    "pullover": (0, 18), "cardigan": (5, 20), "hoodie": (5, 20),
    "sweatshirt": (5, 22), "vest": (5, 20), "suit-jacket": (8, 25),
    "coat": (-10, 15), "puffer-jacket": (-20, 10), "parka": (-25, 5),
    "dress": (10, 30), "skirt": (12, 30), "pants": (-5, 30),
    "jeans": (0, 28), "sporty-pants": (5, 25), "shorts": (20, 35),
    "classic": (5, 28),
}

# Heavy winter outerwear — exclude in warm weather even when untagged.
# Deliberately narrow: light jackets / ветровки / джинсовки are fine at +20.
_WINTER_NAME_KEYWORDS = (
    "пуховик", "пухов", "пальто", "шуба", "дублён", "дублен", "парка",
    "puffer", "down jacket", "down coat", "parka", "overcoat", "winter coat",
)
_WINTER_MAX_TEMP = 14  # winter outerwear hidden above this

# Clearly-summer pieces — exclude in cold weather even when untagged.
_SUMMER_NAME_KEYWORDS = (
    "шорт", "майк", "сарафан", "shorts", "tank top", "tank-top",
    "swimsuit", "купальник", "плавки",
)
_SUMMER_MIN_TEMP = 10


def infer_temp_range(clothing_type, name):
    """Best-effort (min, max) for an item; (None, None) if we can't tell."""
    ct = (clothing_type or "").strip().lower()
    if ct in TEMP_RANGES:
        return TEMP_RANGES[ct]
    n = (name or "").lower()
    if any(kw in n for kw in _WINTER_NAME_KEYWORDS):
        return (-30, _WINTER_MAX_TEMP)
    if any(kw in n for kw in _SUMMER_NAME_KEYWORDS):
        return (_SUMMER_MIN_TEMP, 40)
    return (None, None)


def temp_ok(item: dict, temp) -> bool:
    """
    True if `item` is weather-appropriate for `temp` (°C).

    Uses explicit temp_min/temp_max when present, otherwise infers from
    clothing_type / item name. Fail-open: items we can't classify are allowed —
    we only drop pieces we are confident are out of season.
    """
    if temp is None:
        return True
    tmin = item.get("temp_min")
    tmax = item.get("temp_max")
    if tmin is None and tmax is None:
        tmin, tmax = infer_temp_range(
            item.get("clothing_type"),
            item.get("item_name") or item.get("name"),
        )
    if tmin is not None and temp < tmin:
        return False
    if tmax is not None and temp > tmax:
        return False
    return True

"""Pure logic for POST /clip/wardrobe-outfits — assembling outfits from ONLY
a user's own wardrobe_user_items (Whering-style "shuffle": cheap structural
recombination on every request, not a Gemini generation call like
backend/app/api/recommendations.py POST).

Deliberately import-light (stdlib only) so this is testable without pulling
in the whole ai-service stack (torch/transformers get imported the moment
anything touches the `clip` package via clip/__init__.py) — see
test_wardrobe_outfits.py, which loads this file directly.

Compatibility vs similarity — the actual point of this file:
FashionCLIP's 512-dim embedding puts two near-identical t-shirts close
together in cosine distance. That is SIMILARITY. It is not outfit
COMPATIBILITY — you cannot wear two t-shirts as one outfit, and a shirt+tie
pair that "belongs together" are nowhere near each other in raw CLIP space.
So this module never ranks candidate outfits by pairwise embedding cosine
similarity. The real compatibility signal is OutfitTransformer
(ai-service/clip/outfit_scorer.py — a model trained specifically on outfit
compatibility, built on the same FashionCLIP backbone); routes.py calls it
when the checkpoint is already warm. fallback_compat_score() below is only
the cold-start stand-in for when it isn't: a deterministic color/style
coherence rule using the DB metadata (color, style), not embeddings at all.
"""

# Curated slot vocabulary — now the single copy in clip/clothing_taxonomy.py
# (byte-identical to backend/clothing_taxonomy.py; the two Docker build contexts
# can't import each other). normalize_clothing_type() also resolves the legacy
# spellings that are still in prod ('lonsleeve' on 18 wardrobe_user_items and
# 346 wardrobe_items rows, 'hoddie', 'fur-coat-dark-brown') and returns None for
# the column DEFAULT 'верхняя', which is not a garment type but "unset" — the
# keyword scan below is what rescues those rows.
# Imported by file path, NOT as `clip.clothing_taxonomy`: clip/__init__.py pulls
# in torch, and test_wardrobe_outfits.py deliberately loads this module without it.
import os as _os  # noqa: E402
import sys as _sys  # noqa: E402

_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from clothing_taxonomy import (  # noqa: E402
    SLOT_MAP as _SLOT_MAP,
    normalize_clothing_type,
)

# wardrobe_user_items.clothing_type is NOT reliable in prod. Checked against
# the actual save paths (2026-08-07): none of the three flows that persist a
# photo-analyzed item — components/photo-analysis-form.tsx,
# components/background-tasks-widget.tsx, components/image-upload-form.tsx —
# send clothing_type at all, so backend/app/api/wardrobe_user_items.py
# create_item() only inserts the keys it's given and the column silently
# falls back to its DB DEFAULT 'верхняя' (backend/migrations/001_schema.sql).
# Manual add/edit DO send real Russian text: either a broad category
# ('верхняя'/'нижняя'/'платье'/'верхняя одежда'/'обувь'/'аксессуар'/...,
# components/add-wardrobe-item-form.tsx) or a specific garment word
# ('Футболка'/'Куртка'/'Джинсы'/'Сумка'/..., components/edit-wardrobe-item-sheet.tsx).
# English free text ("t-shirt", "handbag") is also possible if a future
# caller sends Gemini's `clothing_item` field straight through — nothing
# does that today, but the keyword table below stays bilingual so that path
# isn't silently broken later either.
#
# Because clothing_type alone can't be trusted, wardrobe_slot() also scans
# item_name / item_name_en / description / description_en: item_name is a
# REQUIRED field on every save path (add-wardrobe-item-form.tsx validates it,
# Gemini always fills it — backend/app/api/misc.py prompt: "item_name: item
# name in Russian", e.g. "Синие джинсы") and is far more specific than a
# default-value clothing_type. Specific keyword matches (this table) are
# tried first; only if none hit does wardrobe_slot() fall back to the broad
# category words in _BROAD_CATEGORY_KEYWORDS, checked against clothing_type
# only (those words don't show up in item names).
_SLOT_KEYWORDS = {
    "top": (
        "shirt", "blouse", "t-shirt", "tshirt", "tank", "top", "polo",
        "футболк", "рубашк", "блузк", "боди", "поло",
    ),
    "layer": (
        "sweater", "cardigan", "hoodie", "pullover", "sweatshirt", "turtleneck", "vest", "knit",
        "свитер", "кардиган", "худи", "пиджак", "жилет", "жакет", "свитшот", "кофт",
    ),
    "bottom": (
        "pant", "jean", "trouser", "short", "legging", "culotte", "skirt",
        "брюки", "брюк", "джинс", "шорт", "легинс", "леггинс", "штаны", "юбк",
    ),
    "dress": (
        "dress", "jumpsuit", "romper", "overall",
        "платье", "комбинезон", "сарафан",
    ),
    "outerwear": (
        "coat", "jacket", "blazer", "parka", "puffer", "windbreaker", "trench", "down",
        "куртк", "пальто", "пуховик", "ветровк", "тренч", "дублёнк", "дубленк", "плащ",
    ),
    "shoes": (
        "shoe", "boot", "sneaker", "sandal", "heel", "loafer", "flat", "oxford", "mule", "espadrille", "slipper",
        "кроссовк", "туфл", "ботинк", "сапог", "сандал", "кед", "лоферы",
    ),
    "bag": (
        "bag", "backpack", "tote", "clutch", "purse", "handbag",
        "сумк", "рюкзак", "клатч",
    ),
    "accessory": (
        "sunglass", "glasses", "watch", "belt", "hat", "cap", "scarf",
        "glove", "jewelry", "jewellery", "necklace", "earring", "bracelet",
        "ring", "tie", "headband", "beanie",
        "очки", "часы", "ремень", "шарф", "шапк", "перчатк", "украшен",
        "серьг", "браслет", "колье", "головной убор",
    ),
}

# Last-resort fallback: broad category words a manual form can save as the
# WHOLE clothing_type (add-wardrobe-item-form.tsx CLOTHING_TYPES), checked
# only when nothing in _SLOT_KEYWORDS matched item_name/description either.
# Order matters — "верхняя одежда" (outerwear) must be tried before the bare
# "верхняя" (its own substring, meaning "top" as a last resort / the DB
# default) or every outerwear item saved via the broad picker would be
# mis-slotted as a top.
_BROAD_CATEGORY_KEYWORDS = {
    "outerwear": ("верхняя одежда",),
    "bottom": ("нижняя",),
    "dress": ("платье", "комбинезон"),
    "shoes": ("обувь",),
    "accessory": ("аксессуар", "часы", "головной убор"),
    "top": ("верхняя",),
}

CORE_SLOTS = ("top", "bottom")
# Fill priority when the wardrobe can't cover every slot. Order matters:
# outerwear/shoes read as more essential than a hat.
EXTRA_SLOTS = ("outerwear", "shoes", "bag", "accessory", "layer")

# Mirrors the SECTION THEMES backend/app/api/recommendations.py already asks
# Gemini for, so both the "AI-curated" and "shuffle" outfit paths surface the
# same occasion labels to the user.
_OCCASION_KEYWORDS = {
    "В офис": ("blazer", "suit", "shirt", "trouser", "pant", "loafer", "oxford", "формал", "офис", "деловой"),
    "На вечеринку": ("dress", "heel", "clutch", "sequin", "sparkle", "вечер", "нарядн", "платье"),
    "Спорт": ("sneaker", "hoodie", "legging", "tracksuit", "sport", "спортив"),
    "На свидание": ("dress", "blouse", "heel", "skirt", "романт"),
    "На прогулку": ("sneaker", "jean", "hoodie", "jacket", "casual", "повседнев"),
}
DEFAULT_OCCASION = "На каждый день"

_NEUTRAL_COLOR_KEYWORDS = (
    "black", "white", "grey", "gray", "beige", "cream", "navy",
    "чёрн", "черн", "бел", "сер", "беж", "крем", "молочн", "антрацит",
)


def wardrobe_slot(clothing_type, item_name=None, item_name_en=None, description=None, description_en=None):
    """Slot name for one item, or None if unrecognized.

    clothing_type alone is not enough in prod (see module-level comment
    above _SLOT_KEYWORDS) — item_name/description are scanned too, and a
    specific keyword hit there wins over a generic clothing_type."""
    ct = (clothing_type or "").strip().lower()
    if not ct and not (item_name or item_name_en or description or description_en):
        return None

    slot = _SLOT_MAP.get(normalize_clothing_type(ct) or "")
    if slot:
        return slot

    blob = " ".join(
        t for t in (ct, item_name, item_name_en, description, description_en) if t
    ).lower()
    for slot, keywords in _SLOT_KEYWORDS.items():
        if any(kw in blob for kw in keywords):
            return slot

    for slot, keywords in _BROAD_CATEGORY_KEYWORDS.items():
        if any(kw in ct for kw in keywords):
            return slot
    return None


def bucket_by_slot(items):
    """items: dicts with 'clothing_type' and, ideally, 'item_name' /
    'item_name_en' / 'description' / 'description_en' keys (all optional —
    see wardrobe_slot). Returns {slot: [items]}."""
    slots = {}
    for it in items:
        slot = wardrobe_slot(
            it.get("clothing_type"),
            item_name=it.get("item_name"),
            item_name_en=it.get("item_name_en"),
            description=it.get("description"),
            description_en=it.get("description_en"),
        )
        if slot:
            slots.setdefault(slot, []).append(it)
    return slots


def is_neutral_color(color):
    c = (color or "").strip().lower()
    return any(kw in c for kw in _NEUTRAL_COLOR_KEYWORDS)


def color_compat(c1, c2):
    """Coarse styling rule, NOT an embedding similarity: neutrals pair with
    anything, a repeated accent color pairs well, two different accent
    colors clash a bit. Unknown colors are neutral-scored (no penalty)."""
    if not c1 or not c2:
        return 0.6
    if is_neutral_color(c1) or is_neutral_color(c2):
        return 0.85
    if c1.strip().lower() == c2.strip().lower():
        return 0.75
    return 0.45


def style_compat(s1, s2):
    """Token overlap on the free-text Russian `style` field (e.g. 'спортивный
    кэжуал', 'деловой'). Same idea as color_compat: a coherence rule over
    metadata, not a CLIP embedding comparison."""
    if not s1 or not s2:
        return 0.6
    t1, t2 = set(s1.lower().split()), set(s2.lower().split())
    if not t1 or not t2:
        return 0.6
    overlap = len(t1 & t2) / len(t1 | t2)
    return 0.5 + overlap * 0.5


def fallback_compat_score(items):
    """Mean pairwise (color, style) compatibility across the whole outfit.
    Deterministic, no model call, no CLIP cosine similarity — two items that
    look alike in embedding space get no special bonus here, only same-ish
    color/style metadata does."""
    pairs = 0
    total = 0.0
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            a, b = items[i], items[j]
            total += 0.6 * color_compat(a.get("color"), b.get("color"))
            total += 0.4 * style_compat(a.get("style"), b.get("style"))
            pairs += 1
    return round(total / pairs, 4) if pairs else 0.5


def infer_occasion(items):
    """Cheap keyword vote across clothing_type + style. Only picks a LABEL
    for an already-assembled outfit — a miss mislabels it, never breaks it."""
    text = " ".join(
        f"{it.get('clothing_type') or ''} {it.get('style') or ''}".lower()
        for it in items
    )
    best, best_hits = DEFAULT_OCCASION, 0
    for occasion, keywords in _OCCASION_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in text)
        if hits > best_hits:
            best, best_hits = occasion, hits
    return best


def _extra_slot_lists(available_slots, allow_layer):
    """Extra (non-body) slots to stack on top of a body outfit, respecting
    two wearability rules that plain "add every available slot" breaks:

    1. outerwear XOR layer — never both at once (no hoodie zipped under a
       coat AND a cardigan on top of that in the same look). Returns one
       slot-list per option that's actually available, so the caller
       enumerates each as its own family instead of forcing both in.
    2. layer is dropped entirely when allow_layer is False — used for the
       dress family, where "hoodie over an evening dress" is not an outfit,
       it's two unrelated pieces of clothing (a coat/jacket over a dress is
       fine and stays available via 'outerwear').
    """
    base = [s for s in EXTRA_SLOTS if s in available_slots and s not in ("outerwear", "layer")]
    variants = []
    if "outerwear" in available_slots:
        variants.append(["outerwear"] + base)
    if allow_layer and "layer" in available_slots:
        variants.append(["layer"] + base)
    if not variants:
        variants.append(base)
    return variants


def assemble_candidates(slots, budget):
    """Structural recombination — mixed-radix enumeration over the slot pools
    (no RNG, deterministic, reproducible): candidate i's pick for slot k is
    `pool[k][(i // stride_k) % len(pool[k])]`, the same trick an odometer
    uses so every wheel advances at a different rate instead of a naive
    `i % n` per slot, which collides whenever two pools share a factor (two
    same-sized pools would otherwise always move in lockstep and every
    outfit would repeat the same shoes+bag+accessory combo).

    Body coverage comes from TWO independent families when both are
    available: dress-based outfits AND top+bottom-based outfits, not just
    whichever the wardrobe happens to have more of first. Most wardrobes own
    far more tops/bottoms than dresses, so treating "has a dress" as
    disqualifying top+bottom combos (like the /clip/complement anchor logic
    does, where a dress anchor already fixes the look) would starve
    diversity here — this endpoint has no anchor, it owns the whole outfit.

    Each body family is further split into sub-families by
    _extra_slot_lists() so outerwear and layer are never both stacked onto
    the same candidate, and a dress never gets a layer piece at all — see
    that function's docstring.

    Returns a list of item-lists, deduped by item-id set. Empty list means
    the wardrobe can't cover a body slot at all (no dress, no top+bottom).
    Generation itself is cheap (pure Python, no I/O) — callers should
    pre-filter with fallback_compat_score before running anything expensive
    (OutfitTransformer) on the result.
    """
    body_families = []
    if "dress" in slots:
        body_families.append((["dress"], False))
    if all(s in slots for s in CORE_SLOTS):
        body_families.append((list(CORE_SLOTS), True))
    if not body_families:
        return []

    slot_lists = [
        body_slots + extra
        for body_slots, allow_layer in body_families
        for extra in _extra_slot_lists(slots, allow_layer)
    ]

    assembled, seen = [], set()
    per_family_budget = max(1, budget // len(slot_lists))
    for slot_list in slot_lists:
        for i in range(per_family_budget):
            picks = []
            stride = 1
            for s in slot_list:
                cands = slots[s]
                n = len(cands)
                picks.append(cands[(i // stride) % n])
                stride *= n
            if len(picks) < 3:
                continue
            key = frozenset(it["id"] for it in picks)
            if key in seen:
                continue
            seen.add(key)
            assembled.append(picks)
    return assembled


def _greedy_diverse_pick(scored_outfits, n, max_shared):
    """scored_outfits: best-first list of {'items': [...], ...}."""
    picked, picked_ids = [], []
    for cand in scored_outfits:
        ids = {it["id"] for it in cand["items"]}
        if all(len(ids & s) <= max_shared for s in picked_ids):
            picked.append(cand)
            picked_ids.append(ids)
        if len(picked) >= n:
            break
    return picked


def select_diverse(scored_outfits, n):
    """Whering's point is surfacing DIFFERENT forgotten combos, not N
    rankings of the same one. Greedy-pick under a shared-item cap, relaxing
    the cap if the wardrobe is too small to satisfy it strictly."""
    picked = []
    for cap in (1, 2, 3, 999):
        picked = _greedy_diverse_pick(scored_outfits, n, cap)
        if len(picked) >= n:
            return picked
    return picked

#!/usr/bin/env python3
"""Canonical clothing_type vocabulary: slugs, slots, aliases, name inference.

Pure functions — no DB, no network, no deps.

DUPLICATE FILE — KEEP IN SYNC.
``backend/`` and ``ai-service/`` are separate Docker build contexts
(docker-compose.yml: ``context: ./backend`` vs ``context: ./ai-service``), so
neither can import from the other. This file therefore exists byte-identically at:
    backend/clothing_taxonomy.py
    ai-service/clip/clothing_taxonomy.py
``ai-service/clip/test_clothing_taxonomy.py`` fails if the two copies diverge.
The TypeScript mirror is ``lib/clothing-types.ts`` (same slugs, same aliases).


WHY THIS EXISTS
---------------
``_SLOT_MAP`` was hand-copied into three modules (ai-service/clip/routes.py,
backend/app/api/recommendations.py, ai-service/clip/wardrobe_outfits.py) plus a
fourth, differently-shaped copy on the frontend (lib/clothing-types.ts), each
carrying the same two typos and none of them agreeing on what to do with a value
that is not in the list. Measured on prod 2026-08-13 (SELECTs archived under
test/gauntlet/ours/type-style/raw/):

    wardrobe_items       22418 rows: lonsleeve 346, classic 30, аксессуар 13,
                                     верхняя 13, обувь 1, NULL 42
    wardrobe_user_items   1301 rows: NULL 128, верхняя 43, lonsleeve 18
    basic_wardrobe_items    55 rows: верхняя 9 (top value!), lonsleeve 2

An unknown slug resolves to no slot, and an item with no slot is silently dropped
by every outfit builder — so those rows are invisible to the product.


THE FOUR DEFECTS THIS MODULE FIXES
----------------------------------
1. ``lonsleeve`` is a typo for ``longsleeve``. Both spellings resolve here, so
   the rename can ship BEFORE the DB is rewritten (346 + 18 + 2 live rows).
   ``hoddie``/``hoodie`` and ``fur-coat-dark-brown`` are the same kind of debt.

2. ``верхняя`` is NOT the outerwear slug — it is the column DEFAULT
   (backend/migrations/001_schema.sql:42,457,493), i.e. "nobody set this".
   Proof from prod: the 13 wardrobe_items rows carrying it are sandals, loafers,
   mules, two belts, sneakers, ballet flats, earrings, a bag, a bralette, a
   hoodie and a jacket — every slot at once. Mapping it to ``coat`` would invent
   markup. It resolves to None (unknown), and the name is used instead.

3. ``аксессуар``/``обувь`` came from the manual-add form
   (components/add-wardrobe-item-form.tsx), which offered a coarse Russian
   vocabulary that no consumer understands. ``обувь`` has an honest slug
   (``shoes``); ``аксессуар`` does not — bags, sunglasses, belts and jewellery
   have no slot in this vocabulary, so they resolve to None and are reported by
   ``is_accessory()`` instead of being given a fake garment type.

4. ``classic`` is NOT garbage: it is the "set" slot slug ("классический костюм").
   All 30 prod rows are комплекты (mostly kids sets, already hidden). It stays.


JACKET / JUMPSUIT — the two slugs that were missing (added 2026-08-13)
---------------------------------------------------------------------
The vocabulary had ``coat``/``parka``/``puffer-jacket``/``fur-coat``/
``sheepskin-coat`` but no plain ``jacket``, and no one-piece other than
``dress``. Consequence, measured on prod (SELECTs archived under
test/gauntlet/ours/type-style/r2/raw/):

    wardrobe_items whose item_name says куртка/бомбер/ветровка/анорак/косуха
    /штормовка/jacket/windbreaker/bomber:            1752 rows
        stored as puffer-jacket 1116, coat 613, sweatshirt 10, shirt 5,
        hoodie 5, suit-jacket 1, 'верхняя' 1, NULL 1
    wardrobe_items whose item_name says комбинезон/ромпер/jumpsuit/romper
    /overall(s)/dungarees:                            126 rows
        stored as dress 123, coat 3
    wardrobe_user_items jacket-ish by name:            36 rows
        (NULL 22, 'верхняя' 8, hoodie 3, coat 2, puffer-jacket 1)

A denim jacket filed as ``puffer-jacket`` is not a naming nit: it inherits
``TEMP_RANGES['puffer-jacket'] = (-20, 10)`` in
backend/app/services/weather_rules.py, so weather_rules hides it above +10 °C
and offers it at −20 °C. Filed as ``coat`` it gets (−10, 15). Neither is a
light jacket. ``jacket`` gets its own (0, 20).

Why one ``jacket`` and not ``bomber``/``windbreaker``/``biker`` separately:
the slug's only job is to pick an outfit slot and a temperature band, and all
of these share both. Splitting them would add slugs no consumer distinguishes.
The spellings live in TYPE_ALIASES instead.

Why ``jumpsuit`` sits in the ``dress`` slot rather than a new one: the slot
means "one garment that occupies top+bottom at once", which is exactly a
комбинезон. ai-service/clip/wardrobe_outfits.py's keyword fallback already
routed "комбинезон"/"jumpsuit" to the ``dress`` slot before this slug existed
(_SLOT_KEYWORDS["dress"]), so this only makes the stored value agree with the
fallback.

Known limit, deliberately not guessed at: a winter «комбинезон» (kids' snowsuit)
is outerwear, not a one-piece day garment. The name alone does not say which,
and inventing a rule from «зимний» would be markup we cannot defend, so all
комбинезоны go to ``jumpsuit``.
"""

import re

# ---------------------------------------------------------------------------
# Canonical vocabulary: slug -> outfit slot.
# One item per slot goes into an outfit; anything not here has no slot.
# ---------------------------------------------------------------------------
SLOT_MAP: dict[str, str] = {
    # tops
    "blouse": "top", "longsleeve": "top", "shirt": "top",
    "t-shirt": "top", "tank-top": "top",
    # mid layers
    "cardigan": "layer", "hoodie": "layer", "pullover": "layer",
    "suit-jacket": "layer", "sweatshirt": "layer", "turtleneck": "layer",
    "vest": "layer",
    # one-piece
    "dress": "dress", "skirt": "dress", "jumpsuit": "dress",
    # bottoms
    "jeans": "bottom", "pants": "bottom", "shorts": "bottom",
    "sporty-pants": "bottom",
    # sets
    "classic": "set", "knitted-suit": "set", "tracksuit": "set",
    # outerwear
    "coat": "outerwear", "fur-coat": "outerwear", "jacket": "outerwear",
    "parka": "outerwear", "puffer-jacket": "outerwear",
    "sheepskin-coat": "outerwear",
    # shoes
    "shoes": "shoes", "boots": "shoes", "sneakers": "shoes", "sandals": "shoes",
}

CANONICAL_TYPES: frozenset[str] = frozenset(SLOT_MAP)

SLOT_TO_TYPES: dict[str, list[str]] = {}
for _slug, _slot in SLOT_MAP.items():
    SLOT_TO_TYPES.setdefault(_slot, []).append(_slug)

# ---------------------------------------------------------------------------
# Legacy value -> canonical slug. Every one of these is live in prod today, so
# reads must keep resolving them until (and after) the DB is rewritten.
# ---------------------------------------------------------------------------
# Deliberately only values that a shipped vocabulary or prod actually contains.
TYPE_ALIASES: dict[str, str] = {
    "lonsleeve": "longsleeve",          # 346 + 18 + 2 prod rows (typo)
    "hoddie": "hoodie",                 # typo, shipped in every _SLOT_MAP copy
    "fur-coat-dark-brown": "fur-coat",  # a colour baked into a type
    # 'jacket' used to be a non-slug that ai-service/clip/classifier.py emitted
    # and every _SLOT_MAP dropped; it is now canonical (see JACKET note above),
    # so only its spelling variants live here.
    "windbreaker": "jacket",
    "bomber": "jacket",
    "bomber-jacket": "jacket",
    "denim-jacket": "jacket",
    "romper": "jumpsuit",
    "overall": "jumpsuit",
    "overalls": "jumpsuit",
}

# Slot -> every clothing_type string that may be STORED for it, canonical plus
# legacy. Filters that compare against a raw DB/FAISS-metadata value must use
# this, not SLOT_TO_TYPES, or they silently drop the 346 'lonsleeve' rows.
SLOT_TO_DB_TYPES: dict[str, list[str]] = {
    slot: types + sorted(o for o, n in TYPE_ALIASES.items() if n in types)
    for slot, types in SLOT_TO_TYPES.items()
}

# Values that mean "nobody set this". They are NOT garment types and must never
# be mapped to a slug — see defect 2 in the module docstring.
UNSET_VALUES: frozenset[str] = frozenset({
    "", "верхняя", "нижняя", "аксессуар", "часы", "головной убор", "спорт",
    "null", "none", "nan", "unknown", "-",
})

# Valid but least-specific values: a whole slot rather than a garment. The item
# name is consulted first and wins when it names something in the same slot
# ('обувь' + 'ботильоны' -> boots, not shoes).
COARSE_VALUES: dict[str, str] = {"обувь": "shoes"}

# ---------------------------------------------------------------------------
# Item-name -> slug. Ordered; first match wins.
# Ported from backend/migrations/016_backfill_clothing_type.sql so the SQL and
# the services cannot drift, then extended with the English nouns that the
# no-feed (Lacoste / LOVE REPUBLIC / Unknown) rows use.
# ---------------------------------------------------------------------------
#
# Rules are (pattern, slug, exclusion) — the rule is skipped when `exclusion`
# also matches, which is how «свитер с воротником-поло» stays a pullover.
_NAME_RULES: list[tuple] = [
    # sets first, but ONLY when the name opens with комплект/костюм: those names
    # list their contents ("Комплект из футболки и шорт"), so any garment rule
    # below would otherwise win on the first noun. «Брюки от костюма» is not
    # matched — костюм has to be at the front.
    (r"^\W*(\w+\s+){0,2}(спортивн\w+\s+)(костюм|комплект)\b", "tracksuit", None),
    (r"^\W*(\w+\s+){0,2}(трикотажн\w+\s+)(костюм|комплект)\b", "knitted-suit", None),
    (r"^\W*(\w+\s+){0,2}(костюм|комплект)\b", "classic", None),
    # outerwear — before the generic jacket guard.
    # «Пуховая парка» is a parka, so the compound goes before the пухов rule.
    (r"пухов\w*\s+парк|парк[аиуой]\b|\bparka", "parka", None),
    # «Пуховый жилет» is a gilet, not a puffer coat — ЦУМ files it under
    # «Мужские утеплённые жилеты» / «Деловые жилеты» (held-out batch 1, ids
    # 1000004782 and 1000003706). Hand it to the vest rule further down.
    (r"пухов|puffer|down jacket|down coat", "puffer-jacket",
     r"жилет|безрукавк|\bvest\b|gilet"),
    (r"\bшуб|fur coat", "fur-coat", None),
    (r"дублен|дублён|sheepskin", "sheepskin-coat", None),
    (r"тренч|пальто|\bплащ|дождевик|trench|overcoat|raincoat", "coat", None),
    # Everything above is a specific kind of outerwear; what is left that the
    # merchant still calls outerwear is a plain jacket. «Куртка-безрукавка» /
    # «куртка-жилет» is a gilet — hand it to the vest rule further down.
    # English «suit jacket»/«dinner jacket» is a пиджак, not this.
    (r"ветровк|бомбер|анорак|косух|штормовк|джинсовк|\bкуртк|"
     r"windbreaker|bomber|anorak|biker jacket|denim jacket|\bjackets?\b",
     "jacket", r"безрукавк|без рукавов|жилет|suit jacket|dinner jacket|sleeveless"),
    # shoes
    (r"кроссов|\bкед[аыу]?\b|sneaker|trainers", "sneakers", None),  # кроссовок/кроссовки
    (r"ботин|сапог|ботильон|ботфорт|берцы|\bугг|\bboots?\b", "boots", None),
    (r"босонож|сандал|шлеп|шлёп|sandal|flip.?flop", "sandals", None),
    (r"туфл|лофер|балетк|мокасин|мюли|сабо|лодочк|слипон|каблук|"
     r"loafer|pumps|ballet flat|mule|heels", "shoes", None),
    # dress family — before jeans/shorts so «джинсовая юбка» stays a skirt
    (r"платье|платья|сарафан|\bdress\b|sundress", "dress", None),
    (r"\bюбк|\bskirt\b", "skirt", None),
    # one-piece top+bottom. Before the bottoms block: «Джинсовый комбинезон» и
    # «комбинезон с шортами» иначе уйдут в jeans/shorts.
    (r"комбинезон|полукомбинезон|ромпер|\bjumpsuit\b|\bromper\b|"
     r"dungarees|\boveralls?\b|boilersuit", "jumpsuit", None),
    # bottoms
    (r"спортивн\w*\s*брюк|треник|джоггер|легинс|леггинс|jogger|legging|"
     r"sweatpant|track pant", "sporty-pants", None),
    (r"шорт|\bshorts\b|велосипедк", "shorts", None),
    # «джинсовая» is an adjective: «Блузка джинсовая» is a blouse, not jeans.
    # (Denim skirts/dresses are already taken by the rules above.)
    (r"джинс|\bjeans\b|denim pant", "jeans",
     r"блуз|рубашк|куртк|жилет|пиджак|жакет|комбинезон|сарафан|топ|шорт"),
    (r"\bбрюк|штан|чинос|\bpants\b|trousers|chinos", "pants", None),
    # tops — 'поло' needs word boundaries (полосатый) AND a воротник guard:
    # «свитер с воротником-поло» describes a collar, not a polo shirt.
    (r"футболк|\bt-?shirt\b", "t-shirt", None),
    (r"(^|[^а-яёa-z])поло([^а-яёa-z]|$)|\bpolo\b", "t-shirt", r"воротник"),
    (r"рубашк|\bshirt\b", "shirt", None),
    (r"блузк|блуза|блузу|\bblouse\b", "blouse", None),
    (r"лонгслив|long.?sleeve", "longsleeve", None),
    (r"водолазк|гольф\b|turtleneck|roll.?neck", "turtleneck", None),
    (r"\bтоп\b|топ\s|майк|(^|[^а-яёa-z])боди([^а-яёa-z]|$)|tank top|camisole",
     "tank-top", None),
    # layers
    (r"пиджак|блейзер|жакет|blazer|suit jacket|dinner jacket", "suit-jacket", None),
    (r"кардиган|cardigan", "cardigan", None),
    (r"худи|hoodie|hoody|hoddie", "hoodie", None),  # hoddie: seed-data typo
    (r"свитшот|толстовк|sweatshirt", "sweatshirt", None),
    (r"свитер|джемпер|пуловер|кофт|sweater|jumper|pullover|knit top",
     "pullover", None),
    (r"жилет|безрукавк|\bvest\b|waistcoat", "vest", None),
    # English set nouns (the Russian ones are handled by the prefix rules above)
    (r"tracksuit", "tracksuit", None),
    (r"knitted suit", "knitted-suit", None),
    (r"\bsuit\b", "classic", None),
]
_NAME_RULES_C = [(re.compile(p, re.I), s, re.compile(x, re.I) if x else None)
                 for p, s, x in _NAME_RULES]

# Things this vocabulary has no slot for. Reported, never guessed at.
_ACCESSORY_RE = re.compile(
    r"сумк|клатч|шоппер|рюкзак|ремен|\bпояс\b|очки|оправ|ожерель|серьг|"
    r"брасл|кольцо|цепочк|часы|шапк|кепк|бейсболк|панам|шляп|шарф|платок|"
    r"колье|кулон|подвеск|брошь|чокер|берет|"
    r"перчатк|варежк|носк|колготк|галстук|бабочк|заколк|резинк|"
    r"\bbag\b|clutch|backpack|belt\b|sunglasses|necklace|earring|bracelet|"
    r"\bring\b|watch\b|\bcap\b|\bhat\b|scarf|glove|socks|tights|tie\b",
    re.I,
)
_UNDERWEAR_RE = re.compile(
    r"бралет|бюстгальтер|трус|бель[её]|купальник|плавк|пижам|халат|"
    r"bra\b|panties|lingerie|swimsuit|pyjama|pajama|robe\b",
    re.I,
)


def normalize_clothing_type(value) -> str | None:
    """Canonical slug for a stored clothing_type, or None if it carries no type.

    None means "unknown" — never a slug. Callers that need a value should fall
    back to ``infer_clothing_type(item_name)``.
    """
    if value is None:
        return None
    v = str(value).strip().lower()
    if not v or v in UNSET_VALUES:
        return None
    if v in CANONICAL_TYPES:
        return v
    if v in COARSE_VALUES:
        return COARSE_VALUES[v]
    return TYPE_ALIASES.get(v)


def infer_clothing_type(name) -> str | None:
    """Slug from a product/item name, or None when the name does not say."""
    if not name:
        return None
    n = " ".join(str(name).split())
    for rx, slug, exclude in _NAME_RULES_C:
        if rx.search(n) and not (exclude and exclude.search(n)):
            return slug
    return None


def resolve_clothing_type(value, name=None) -> str | None:
    """Stored value first, item name as the fallback.

    Exception: for a COARSE value ('обувь' = "some footwear") the name wins when
    it names something more specific in the same slot — 'обувь' + 'ботильоны'
    is boots, not the generic shoes.

    When neither the stored value nor the name is a known slug, the stored value
    is run through the name rules too: components/edit-wardrobe-item-sheet.tsx
    lets a user save clothing_type as free Russian ("Куртка", "Ветровка",
    "Комбинезон"), and that string is a garment name, just in the wrong column.
    """
    stored = normalize_clothing_type(value)
    if stored is None:
        return infer_clothing_type(name) or infer_clothing_type(value)
    if str(value).strip().lower() in COARSE_VALUES:
        guess = infer_clothing_type(name)
        if guess and SLOT_MAP.get(guess) == SLOT_MAP.get(stored):
            return guess
    return stored


def is_accessory(name) -> bool:
    """True when the name is something this vocabulary has no slot for.

    Bags, eyewear, belts, jewellery, hats, scarves, socks, underwear. Used to
    quarantine such rows (is_hidden) instead of inventing a garment type.
    """
    if not name:
        return False
    n = " ".join(str(name).split())
    if infer_clothing_type(n):
        return False
    return bool(_ACCESSORY_RE.search(n) or _UNDERWEAR_RE.search(n))


def slot_of(value, name=None) -> str | None:
    """Outfit slot for an item, or None when it has no place in an outfit."""
    slug = resolve_clothing_type(value, name)
    return SLOT_MAP.get(slug) if slug else None


# ---------------------------------------------------------------------------
# Style. Deliberately tiny: see STYLE decision in
# test/gauntlet/ours/type-style/proposal/PROPOSAL.md.
#
# Measured 2026-08-13: effectively no merchant publishes a style we can read —
# 0/45 archived ЦУМ product pages contain a "Стиль" field, and the ЦУМ feed
# (8940 offers) carries exactly three <param> names: Цвет, Пол, Материал.
# One feed does have the param — ElytS, 49 of 81546 offers (0.06%), values
# «Джинсовый»/«Городской»/«Ретро»… of which 5 of 7 are not styles in this
# vocabulary at all; ElytS is 32 of our 22418 catalogue rows. Measurement:
# test/gauntlet/ours/type-style/r2/raw/style_signal_in_feeds_r2.json. The
# literal 'Casual' on 22193/22418 catalogue rows is an importer default, not
# markup. The only real producer of style in this system is the CLIP zero-shot
# classifier (ai-service/clip/classifier.py STYLES), whose 12 labels are the
# canonical vocabulary below and are already mirrored in lib/labels.ts.
# ---------------------------------------------------------------------------
CANONICAL_STYLES: frozenset[str] = frozenset({
    "casual", "formal", "business", "sport", "streetwear", "bohemian",
    "minimalist", "classic", "romantic", "grunge", "preppy", "vintage",
})

_STYLE_ALIASES = {
    "повседневный": "casual", "кэжуал": "casual", "базовый": "casual",
    "классический": "classic", "классика": "classic", "tailored": "classic",
    "elegant": "classic", "деловой": "business", "спортивный": "sport",
    "минималистичный": "minimalist", "минималист": "minimalist",
    "уличный": "streetwear", "романтичный": "romantic", "винтаж": "vintage",
}


# The capital-C literal is the importer default (ai-service/scripts/
# import_catalog.py, backend/app/api/cron.py wrote it on every INSERT); the
# lower-case one is a real CLIP classification (classifier.py STYLES is
# lower-case). SQL '=' is case-sensitive, which is why cron's
# ``style = 'Casual'`` re-classify filter never touches CLIP output — so the
# two spellings really do mean different things here.
STYLE_DEFAULT_SENTINEL = "Casual"


def normalize_style(value) -> str | None:
    """Canonical style, or None when the value carries no real classification.

    The importer default ``'Casual'`` is dropped (case-sensitively): it was
    written on every catalogue INSERT and means "nobody looked". A lower-case
    ``'casual'`` is kept — that one came from the CLIP classifier.
    backend/app/api/cron.py already relies on exactly this distinction.
    """
    if value is None:
        return None
    raw = str(value).strip()
    if raw == STYLE_DEFAULT_SENTINEL:
        return None
    v = raw.lower()
    if not v or v in {"nan", "null", "none", "-"}:
        return None
    if v in CANONICAL_STYLES:
        return v
    if v in _STYLE_ALIASES:
        return _STYLE_ALIASES[v]
    # hand-entered compounds ("Classic/casual", "Classic/evening"): take the
    # leading style, which is the one the curator led with.
    if "/" in v:
        return normalize_style(v.split("/", 1)[0])
    return None

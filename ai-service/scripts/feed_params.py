#!/usr/bin/env python3
"""Extract real markup (gender / is_kids / color / shade / material) from YML feeds.

Pure functions — no DB, no network. Used by every feed ingest path:
  * backend/lib_feed_parser.py                 (production: the nightly
    POST /api/cron/import-feeds at 02:30 UTC and POST /api/cron/process-feeds
    at 03:00 UTC both call parse_yml_feed, which calls markup_from_offer)
  * ai-service/scripts/import_catalog.py       (manual/ops import)
  * ai-service/scripts/backfill_feed_markup.py (items already in wardrobe_items)

DUPLICATE FILE — KEEP IN SYNC.
``backend/`` and ``ai-service/`` are separate Docker build contexts
(docker-compose.yml: ``context: ./backend`` vs ``context: ./ai-service``), so neither
can import from the other. This file therefore exists byte-identically at:
    backend/feed_params.py
    ai-service/scripts/feed_params.py
``ai-service/scripts/test_feed_params.py`` fails if the two copies diverge.

WHY THIS EXISTS
---------------
import_catalog.py used to write ``"material": ""`` as a hardcoded literal, guess
``color`` from a substring of the product name, and read ``<param>`` not at all.
Result on prod (measured 2026-08-13): color filled on 2% of the catalogue,
material on 1%, style literal 'Casual' on 22193/22418 rows.

Meanwhile every ЦУМ offer carries::

    <param name="Пол">Женский|Мужской|Унисекс</param>
    <param name="Цвет">Чёрный|Синий|…</param>       (23 values)
    <param name="Материал">Вискоза: 78%; Эластан (Полиуретан): 22%;</param>

…and 2moodstore carries the same data under different param names.


THREE DESIGN DECISIONS, AND WHY
-------------------------------

1. GENDER COMES FROM THE CATEGORY TREE, NOT FROM ``<param name="Пол">``.

   Measured on the ЦУМ feed (8940 offers): ``param Пол`` returns "Унисекс" for
   978/978 offers whose category root is "Детское" — i.e. it is systematically
   useless for kids. The category tree instead says
   ``Детское > Одежда для девочек > …``, which is both a gender and an is_kids
   signal. The feed literally contradicts itself on those rows.

   The category tree is also the same taxonomy the merchant renders as the page
   breadcrumb, which is what the ground-truth sample reads. ``param Пол`` is kept
   only as a fallback for roots that carry no gender ("Shop-In-Shop", "Дом").

   Bonus: is_kids stops being a keyword guess over item_name
   (backend/migrations/010_remove_kids_items.sql) and becomes merchant data.

2. COLOR IS SPLIT: ``color`` = hue family, ``shade`` = the merchant's exact wording.

   ``param Цвет`` is a 23-value hue family — it flattens "Тёмно-синий" to "Синий"
   and "Фуксия" to "Розовый". The exact wording is not lost, though: the affiliate
   URL's ``ulp=`` parameter contains the merchant product slug, whose tail is a
   transliteration of the full page colour ("…-dzhinsy-richard-j-brown-temno-sinii").
   That tail resolves for 8940/8940 ЦУМ offers (0 unmatched).

   So we write both:
       color = "Синий"        <- closed hue set, what outfit colour-harmony needs
       shade = "Темно-синий"  <- full precision, what the product page shows
   ``shade`` is left empty when it would merely repeat ``color``.

   Rationale for keeping ``color`` a small closed set: colour-combination logic and
   catalogue filtering both need to bucket items by hue; a free-form 48-value field
   fragments every GROUP BY. Nothing is lost because ``shade`` carries the detail,
   and both fields are already passed to the recommendation prompt side by side
   (backend/app/api/recommendations.py builds {"color": …, "shade": …}).

   Spelling: canonicalised to ё→е ("Черный", not "Чёрный"). The 470 colour values
   already in prod use the ё-less form, and lib/color-map.ts accepts both, so this
   keeps one bucket per hue instead of two.

3. MATERIAL KEEPS THE FULL COMPOSITION STRING, NOT JUST THE MAIN FIBRE.

   The composition drives two things outfit generation actually uses: warmth
   (шерсть/кашемир/пух vs лен/хлопок) and drape/season. Both are decided by the
   *mix*, not by the single top fibre — "Шерсть: 90%; Кашемир: 10%" and
   "Шерсть: 30%; Полиэстер: 70%" have the same main fibre and very different warmth.
   Keeping the whole string is also lossless: ``dominant_fiber()`` derives the main
   fibre on read in one line, while the reverse is impossible.

   The only transform applied is cosmetic (whitespace collapse, drop the feed's
   trailing ';'), which is why the value still matches the merchant page verbatim.
"""

from __future__ import annotations

import re
import urllib.parse
from typing import Iterable, Optional

# ---------------------------------------------------------------------------
# Offer identity — the key that joins a feed <offer> to a wardrobe_items row
# ---------------------------------------------------------------------------
# import_catalog.py writes ``notes = f"{source}:{model or offer.id}"``, so that is
# the join key. It is NOT safe on every feed: two of the four live feeds put
# something other than an article number in <model>.
#
# Measured 2026-08-13 on the four downloaded snapshots
# (test/gauntlet/ours/feed-backfill/raw/offer_key_audit.json):
#     ЦУМ         <model> absent            -> key = offer id, 8940 offers / 8940 keys
#     SELA        <model> = '6801184308'    -> article, 4441 offers / 3054 keys
#     2moodstore  <model> = 'S', 'M', '35'  -> SIZE.   6331 offers /   87 keys
#     ElytS       <model> = 'Голубой'       -> COLOUR. 81546 offers /   61 keys
#
# On 2moodstore the key 'S' names 903 different garments; on ElytS 'Черный' names
# 19261. Joining on it would smear one arbitrary offer's colour and composition
# across hundreds of unrelated items.
#
# A collision is not automatically fatal, though: SELA repeats one article across
# its size variants, and those variants carry identical markup. So the rule is not
# "one offer per key" but "one ANSWER per key" — ``build_markup_index`` keeps a
# colliding key when every colliding offer yields the same markup and drops it
# when they disagree.


def offer_sku(offer) -> str:
    """The SKU import_catalog.py stores in notes: ``<model>`` if present, else id."""
    return ((offer.findtext("model") or "") or (offer.get("id") or "")).strip()

# ---------------------------------------------------------------------------
# Param name aliases — feeds spell the same thing differently
# ---------------------------------------------------------------------------
# Canonical key -> the <param name="…"> spellings seen in real feeds.
#   ЦУМ (feed 26118):        Пол / Цвет / Материал
#   2moodstore (feed 25132): Цвет товара / Основной материал / Принт
#   SELA (feed 24700):       no <param> at all — falls back to category tree
PARAM_ALIASES: dict[str, tuple[str, ...]] = {
    "gender": ("пол", "gender"),
    "color": ("цвет", "цвет товара", "основной цвет", "color"),
    "material": ("материал", "основной материал", "состав", "material"),
    "print": ("принт", "print"),
}


def read_params(offer) -> dict[str, str]:
    """Collect an offer's <param> children into {canonical_key: value}.

    Unknown params are ignored. First non-empty value wins.
    """
    out: dict[str, str] = {}
    for p in offer.findall("param"):
        raw_name = (p.get("name") or "").strip().lower()
        value = (p.text or "").strip()
        if not value:
            continue
        for key, aliases in PARAM_ALIASES.items():
            if raw_name in aliases and key not in out:
                out[key] = value
    return out


# ---------------------------------------------------------------------------
# Colour
# ---------------------------------------------------------------------------

# Transliterated colour tokens as they appear at the end of merchant URL slugs.
# Derived by exhaustive scan of the ЦУМ feed (8940/8940 slugs resolved).
COLOR_TRANSLIT: dict[str, str] = {
    "chernyi": "Черный",
    "belyi": "Белый",
    "seryi": "Серый",
    "sinii": "Синий",
    "goluboi": "Голубой",
    "zelenyi": "Зеленый",
    "krasnyi": "Красный",
    "rozovyi": "Розовый",
    "zheltyi": "Желтый",
    "oranzhevyi": "Оранжевый",
    "fioletovyi": "Фиолетовый",
    "sirenevyi": "Сиреневый",
    "bezhevyi": "Бежевый",
    "korichnevyi": "Коричневый",
    "bordovyi": "Бордовый",
    "khaki": "Хаки",
    "kremovyi": "Кремовый",
    "molochnyi": "Молочный",
    "biryuzovyi": "Бирюзовый",
    "fuksiya": "Фуксия",
    "korallovyi": "Коралловый",
    "malinovyi": "Малиновый",
    "salatovyi": "Салатовый",
    "serebryanyi": "Серебряный",
    "zolotoi": "Золотой",
    "bronzovyi": "Бронзовый",
    "leopardovyi": "Леопардовый",
    "raznotcvetnyi": "Разноцветный",
    "prozrachnyi": "Прозрачный",
}

# Compound-colour prefixes ("temno-sinii" -> "Темно-синий").
SHADE_PREFIX_TRANSLIT: dict[str, str] = {
    "temno": "Темно",
    "svetlo": "Светло",
    "cherno": "Черно",
    "belo": "Бело",
    "sero": "Серо",
    "sine": "Сине",
    "krasno": "Красно",
    "zhelto": "Желто",
    "zeleno": "Зелено",
    "korichnevo": "Коричнево",
    "bezhevo": "Бежево",
    "rozovo": "Розово",
}

# Precise colour -> hue family. Used when the feed has no separate hue-family
# param (e.g. 2moodstore's single "Цвет товара"). Anything not listed is already
# a hue family and maps to itself.
HUE_FAMILY: dict[str, str] = {
    "молочный": "Белый",
    "кремовый": "Кремовый",
    "бирюзовый": "Голубой",
    "фуксия": "Розовый",
    "коралловый": "Розовый",
    "малиновый": "Красный",
    "салатовый": "Зеленый",
    "сиреневый": "Фиолетовый",
    "лиловый": "Фиолетовый",
    "мятный": "Зеленый",
    "оливковый": "Зеленый",
    "винный": "Бордовый",
    "кофейный": "Коричневый",
    "мультиколор": "Разноцветный",
    "разноцветный": "Разноцветный",
    "серебряный": "Серый",
    "золотой": "Желтый",
    "бронзовый": "Коричневый",
    "песочный": "Бежевый",
    "горчичный": "Желтый",
    "терракотовый": "Оранжевый",
    "персиковый": "Оранжевый",
}

_TRAILING_ID_RE = re.compile(r"-id\d+$")


def canon_color(value: Optional[str]) -> str:
    """Canonical spelling for a Russian colour name: ё→е, Capitalised, trimmed.

    'Чёрный' -> 'Черный';  'темно-синий' -> 'Темно-синий';  '' -> ''.
    """
    if not value:
        return ""
    v = value.strip().replace("ё", "е").replace("Ё", "Е")
    v = re.sub(r"\s+", " ", v)
    if not v:
        return ""
    return v[0].upper() + v[1:].lower()


def hue_family(color: Optional[str]) -> str:
    """Collapse a precise colour to its hue family ('Темно-синий' -> 'Синий')."""
    c = canon_color(color)
    if not c:
        return ""
    # Strip a compound prefix: "Темно-синий" -> "синий"
    if "-" in c:
        head, _, tail = c.partition("-")
        if head.lower() in {p.lower() for p in SHADE_PREFIX_TRANSLIT.values()}:
            c = canon_color(tail)
    return canon_color(HUE_FAMILY.get(c.lower(), c))


def extract_ulp(affiliate_url: Optional[str]) -> str:
    """Pull the real merchant URL out of an Admitad redirect's ``ulp=`` param."""
    if not affiliate_url:
        return ""
    try:
        query = urllib.parse.urlparse(affiliate_url).query
        return urllib.parse.parse_qs(query).get("ulp", [""])[0]
    except Exception:
        return ""


def color_from_url(url: Optional[str]) -> str:
    """Read the merchant's exact colour off the product-URL slug.

    ``…/product/6749225-dzhinsy-richard-j-brown-temno-sinii/`` -> 'Темно-синий'
    ``…/product/5538864-shapka-bilancioni-seryi-id11590664/``  -> 'Серый'

    Returns '' when the tail is not a known colour token.
    """
    direct = extract_ulp(url) or (url or "")
    if not direct:
        return ""
    slug = direct.split("?")[0].rstrip("/").split("/")[-1].lower()
    slug = _TRAILING_ID_RE.sub("", slug)
    tokens = slug.split("-")
    if not tokens:
        return ""
    base = COLOR_TRANSLIT.get(tokens[-1])
    if not base:
        return ""
    if len(tokens) >= 2:
        prefix = SHADE_PREFIX_TRANSLIT.get(tokens[-2])
        if prefix:
            return f"{prefix}-{base.lower()}"
    return base


def resolve_color(param_color: Optional[str], url: Optional[str]) -> tuple[str, str, str]:
    """-> (color, shade, source).

    color  : hue family, canonical spelling, '' if unknown
    shade  : merchant's exact colour when it adds information, else ''
    source : provenance tag for the audit trail
    """
    precise = color_from_url(url)
    family = canon_color(param_color)

    if family and precise:
        source = "param+slug"
    elif family:
        source = "param"
    elif precise:
        source = "slug"
        family = hue_family(precise)
    else:
        return "", "", "none"

    if not family:
        return "", "", "none"

    shade = precise if precise and precise != family else ""
    return family, shade, source


def full_color(color: str, shade: str) -> str:
    """The single human-readable colour string: shade if present, else color."""
    return shade or color


# ---------------------------------------------------------------------------
# Material
# ---------------------------------------------------------------------------

_MATERIAL_JUNK = {"", "-", "—", "нет", "n/a", "na", "nan", "не указан", "не указано"}


def clean_material(raw: Optional[str]) -> str:
    """Normalise a composition string without dropping any of it.

    'Вискоза: 78%;  Эластан (Полиуретан): 22%;' -> 'Вискоза: 78%; Эластан (Полиуретан): 22%'
    """
    if not raw:
        return ""
    v = re.sub(r"\s+", " ", raw.strip())
    v = v.rstrip(" ;").strip()
    if v.lower() in _MATERIAL_JUNK:
        return ""
    return v


# Composition sections that are NOT the outer fabric. ЦУМ writes them as
# "<Секция>-<волокно>: N%", and every section is normalised to 100% inside
# itself, so a plain max-by-percent picks the lining of a wool coat:
#     'Шерсть: 100%; Подкладка-полиэстер: 100%'  -> Подкладка-полиэстер
# Measured on the 5011 multi-part ЦУМ compositions: 879 (17.5%) resolved to one
# of these sections before the split (test/gauntlet/bar/feed-backfill-verdict.md
# §5). Sections NOT listed here (Материал 2, Рукава, Воротник, Капюшон, Топ, …)
# name a different panel of the same garment shell and stay eligible.
_NON_SHELL_SECTIONS = {
    "подкладка", "наполнитель", "подошва", "стелька", "отделка",
    "покрытие", "утеплитель", "мембрана", "пряжка", "фурнитура",
}

# Section labels also carry an index or a qualifier: "Подкладка 2", "Покрытие 1",
# "Отделка капюшона". Only the first word decides.
_PCT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")
_BARE_NUM_RE = re.compile(r"^\d+(?:[.,]\d+)?$")


# Panels of the garment shell. Listed so that "Рукава-шерсть: 100%" is read as a
# shell fibre rather than as a fibre literally called "Рукава-шерсть".
_SHELL_SECTIONS = {
    "материал", "рукава", "воротник", "капюшон", "передняя", "спина", "спинка",
    "топ", "лиф", "детали", "вставка", "вставки", "юбка", "платье", "куртка",
    "брюки", "ремень",
}


def _section_of(label: str) -> Optional[str]:
    """'Подкладка 2' -> 'подкладка'; 'Материал 3' -> ''; 'Хлопок' -> None.

    '' means "a section label, but part of the shell"; None means "not a section
    label at all, this is a fibre name".
    """
    words = label.strip().lower().split()
    if not words:
        return None
    head = words[0]
    if head in _NON_SHELL_SECTIONS:
        return head
    # "Материал 1" / "Рукава" / "Воротник" — a different panel of the same shell.
    if len(words) <= 2 and head in _SHELL_SECTIONS:
        return ""
    return None


def parse_composition(material: Optional[str]) -> list[tuple[str, str, float]]:
    """Composition string -> [(section, fibre, percent)], in feed order.

    ``section`` is '' for the garment shell and the lowercased section word for a
    lining / sole / filling / trim. Three shapes occur in the ЦУМ feed and all
    three are handled:

        'Шерсть: 90%; Кашемир: 10%'                    plain fibres
        'Шерсть: 100%; Подкладка-полиэстер: 100%'      section glued with a dash
        'Материал 1: Полиамид: 84%; Покрытие 1: ПУ: 100%'
                                                       section as a colon header,
                                                       which applies to the parts
                                                       that follow it
    """
    m = clean_material(material)
    if not m:
        return []
    out: list[tuple[str, str, float]] = []
    current = ""  # section carried forward by a colon header
    for raw_part in m.split(";"):
        part = raw_part.strip()
        if not part:
            continue
        fields = [f.strip() for f in part.split(":")]
        match = _PCT_RE.search(part)
        percent = float(match.group(1).replace(",", ".")) if match else 0.0
        # Drop the trailing percentage field, keep the rest as label fields.
        if fields and _PCT_RE.search(fields[-1]) and not _PCT_RE.sub("", fields[-1]).strip():
            fields = fields[:-1]
        elif len(fields) > 1 and _BARE_NUM_RE.match(fields[-1]):
            # the feed sometimes drops the '%': 'Материал 3-нейлон: 81'
            percent = percent or float(fields[-1].replace(",", "."))
            fields = fields[:-1]
        if not fields:
            continue

        section = current
        # Leading colon headers: 'Подкладка 1: Полиэстер: 64%'. A field carrying a
        # dash ('Материал 3-нейлон') is the dash form, not a header — it is split
        # further down, otherwise the fibre after the dash would be thrown away.
        while len(fields) > 1 and "-" not in fields[0]:
            head_section = _section_of(fields[0])
            if head_section is None:
                break
            section = current = head_section
            fields = fields[1:]

        label = ": ".join(f for f in fields if f).strip()
        if not label:
            continue
        # A bare part with no colon at all: 'Подошва-резина-100%'.
        if not _PCT_RE.sub("", label).strip():
            continue
        label = _PCT_RE.sub("", label).strip(" -–—")

        # Section glued with a dash, possibly nested:
        # 'Подкладка-полиэстер', 'Воротник-Подкладка-полиэстер'.
        while "-" in label:
            head, _, tail = label.partition("-")
            dash_section = _section_of(head)
            if dash_section is None or not tail.strip():
                break
            # A non-shell layer anywhere in the path wins: the collar's LINING is
            # still a lining.
            section = dash_section or section
            label = tail.strip()
        if label:
            out.append((section, label, percent))
    return out


def dominant_fiber(material: Optional[str]) -> str:
    """Main fibre of the garment SHELL — for season/warmth filters.

    'Шерсть: 90%; Кашемир: 10%'                 -> 'Шерсть'
    'Шерсть: 100%; Подкладка-полиэстер: 100%'   -> 'Шерсть'   (lining ignored)
    'Материал 3-нейлон: 81%'                    -> 'Нейлон'   (panel label dropped)

    Lining / sole / insole / filling / trim sections are skipped: each of them is
    normalised to 100% inside itself, so they tie or beat the shell on a plain
    max-by-percent — that is how 879 of 5011 multi-part ЦУМ compositions used to
    resolve to a lining. When a composition lists nothing BUT those sections, the
    largest of them is returned rather than nothing. Falls back to the whole
    string when the feed gives a bare fibre name ('деним' -> 'Деним').
    """
    parts = parse_composition(material)
    if not parts:
        return clean_material(material)[:1].upper() + clean_material(material)[1:]
    shell = [p for p in parts if not p[0]]
    best = max(shell or parts, key=lambda p: p[2])
    name = best[1]
    return name[0].upper() + name[1:] if name else ""


# ---------------------------------------------------------------------------
# Gender / is_kids from the category tree
# ---------------------------------------------------------------------------

KIDS_ROOTS = {"детское", "дети", "детям", "детская одежда", "kids", "children"}
FEMALE_ROOTS = {"женское", "женщины", "женщинам", "девушки", "women", "woman"}
MALE_ROOTS = {"мужское", "мужчины", "мужчинам", "юноши", "men", "man"}

PARAM_GENDER_MAP = {
    "женский": "female",
    "женское": "female",
    "жен": "female",
    "мужской": "male",
    "мужское": "male",
    "муж": "male",
    "унисекс": "unisex",
    "unisex": "unisex",
    "female": "female",
    "male": "male",
}


def build_category_index(shop) -> tuple[dict[str, str], dict[str, str]]:
    """-> (id -> name, id -> parentId) for a YML <shop> element."""
    names: dict[str, str] = {}
    parents: dict[str, str] = {}
    for cat in shop.findall(".//category"):
        cid = cat.get("id")
        if not cid:
            continue
        names[cid] = (cat.text or "").strip()
        parent = cat.get("parentId")
        if parent:
            parents[cid] = parent
    return names, parents


def category_chain(cid: str, names: dict[str, str], parents: dict[str, str]) -> list[str]:
    """Root-first category path for a categoryId. Cycle-safe."""
    chain: list[str] = []
    seen: set[str] = set()
    while cid and cid not in seen and cid in names:
        seen.add(cid)
        chain.append(names[cid])
        cid = parents.get(cid, "")
    return chain[::-1]


def resolve_gender(chain: Iterable[str], param_gender: Optional[str] = None) -> tuple[Optional[str], bool, str]:
    """-> (gender, is_kids, source).

    The category tree wins over ``param Пол``: on the ЦУМ feed the param says
    "Унисекс" for all 978 kids offers while the tree says
    "Детское > Одежда для девочек". The param is used only for roots that carry
    no gender of their own (Shop-In-Shop, Дом, …).
    """
    chain = [c for c in chain if c]
    param = PARAM_GENDER_MAP.get((param_gender or "").strip().lower())

    if chain:
        root = chain[0].strip().lower()
        if root in KIDS_ROOTS:
            level2 = chain[1].strip().lower() if len(chain) > 1 else ""
            if "девоч" in level2:
                return "female", True, "category:kids-girls"
            if "мальчик" in level2 or "мальчиков" in level2:
                return "male", True, "category:kids-boys"
            return "unisex", True, "category:kids"
        if root in FEMALE_ROOTS:
            return "female", False, "category:root"
        if root in MALE_ROOTS:
            return "male", False, "category:root"

    if param:
        return param, False, "param"
    return None, False, "none"


# ---------------------------------------------------------------------------
# One-stop offer -> markup
# ---------------------------------------------------------------------------


def markup_from_offer(offer, names: dict[str, str], parents: dict[str, str]) -> dict:
    """Everything this module can prove about one <offer>.

    Returns keys: color, shade, material, gender, is_kids, plus *_source tags.
    Values are '' / None when the feed does not say — never a guessed default.
    """
    params = read_params(offer)
    chain = category_chain(offer.findtext("categoryId", "") or "", names, parents)

    color, shade, color_source = resolve_color(params.get("color"), offer.findtext("url", ""))
    material = clean_material(params.get("material"))
    gender, is_kids, gender_source = resolve_gender(chain, params.get("gender"))

    return {
        "color": color,
        "shade": shade,
        "material": material,
        "gender": gender,
        "is_kids": is_kids,
        "color_source": color_source,
        "material_source": "param" if material else "none",
        "gender_source": gender_source,
        "category_chain": chain,
    }


MARKUP_FIELDS = ("color", "shade", "material", "gender", "is_kids")


def build_markup_index(shop) -> tuple[dict[str, dict], dict[str, int], dict[str, int]]:
    """-> (markup_by_sku, merged_collisions, conflicting_collisions)

    ``markup_by_sku`` is safe to join onto ``wardrobe_items.notes``: every key in
    it has exactly one answer. ``merged_collisions`` are keys that named several
    offers which all agreed (SELA size variants) — kept. ``conflicting_collisions``
    are keys whose offers disagreed (2moodstore sizes, ElytS colours) — dropped,
    with the number of offers behind each, so a caller can report what it refused.
    """
    names, parents = build_category_index(shop)

    buckets: dict[str, list] = {}
    for offer in shop.findall(".//offer"):
        sku = offer_sku(offer)
        if sku:
            buckets.setdefault(sku, []).append(offer)

    index: dict[str, dict] = {}
    merged: dict[str, int] = {}
    conflicting: dict[str, int] = {}
    for sku, offers in buckets.items():
        markups = [markup_from_offer(o, names, parents) for o in offers]
        answers = {tuple(m[f] for f in MARKUP_FIELDS) for m in markups}
        if len(answers) == 1:
            index[sku] = markups[0]
            if len(offers) > 1:
                merged[sku] = len(offers)
        else:
            conflicting[sku] = len(offers)
    return index, merged, conflicting

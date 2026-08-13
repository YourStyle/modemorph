#!/usr/bin/env python3
"""Normalisation of raw merchant/vision attributes onto ModeMorph's own enums.

This module is shared by the page-scraping path and the vision path so that both
produce values in the *same* vocabulary and can be scored against each other.

Vocabularies were taken from live prod data, not invented:
  * colour  -> Russian base-colour names, the convention already used by
               `lib/color-map.ts` and by the non-hex rows of wardrobe_items.color
  * material-> single dominant fibre, lowercase Russian, the convention that
               dominates wardrobe_user_items.material ("хлопок" 239, "шерсть" 95,
               "кожа" 69, "полиэстер" 35, "вискоза" 14 ...)
  * gender  -> male | female | unisex (GENDER_OPTIONS in add-wardrobe-item-form.tsx)
  * clothing_type -> clothing_taxonomy.CANONICAL_TYPES (the one slug vocabulary)
"""
from __future__ import annotations

import os
import re
import sys
import unicodedata

# --------------------------------------------------------------------------
# colour
# --------------------------------------------------------------------------
# Ordered: the first pattern that matches wins, so compound shades
# ("серо-бежевый", "тёмно-синий") must be resolved by their *head* noun, which is
# why the modifiers are stripped before matching.
_COLOR_PATTERNS: list[tuple[str, str]] = [
    (r"чёрн|черн|black|графит|антрацит", "Черный"),
    (r"бел(ый|ая|ое|ые|о)?\b|бел$|white|молочн|сливочн|кремов|экрю|ecru|ivory|"
     r"слонов", "Белый"),
    (r"сер(ый|ая|ое|ые|о)?\b|сер$|grey|gray|мелан?ж", "Серый"),
    (r"голуб|light\s*blue|небесн", "Голубой"),
    (r"син(ий|яя|ее|ие|е)?\b|син$|blue|навы|navy|индиго|деним|denim|джинсов", "Синий"),
    (r"бирюз|аквамарин|turquoise", "Бирюзовый"),
    (r"зелён|зелен|green|олив|хаки|khaki|мятн|фисташ|изумруд", "Зеленый"),
    (r"жёлт|желт|yellow|горчичн|лимонн|золот|gold", "Желтый"),
    (r"оранж|orange|терракот|кирпичн|коралл|морков", "Оранжевый"),
    (r"красн|red|алый|вишн|бордо|бургунд|марсала|винн", "Красный"),
    (r"розов|pink|пудров|фукси|лилов|пыльн\w*\s*роз", "Розовый"),
    (r"фиолет|сирен|лавенд|лаванд|purple|violet|баклажан", "Фиолетовый"),
    (r"беж|beige|песочн|камел|кэмел|camel|карамел|латте|капучино|тауп|taupe|"
     r"хаки-беж|nude", "Бежевый"),
    (r"коричн|brown|шоколад|кофейн|каштан|мокко|табач|рыж", "Коричневый"),
    (r"серебр|silver|стальн", "Серый"),
    (r"мультиколор|разноцвет|многоцвет|принт|multicolor", "Мультиколор"),
]

# Shade words the merchants above actually use that no base-colour pattern above
# catches. Added only where the mapping is unambiguous; «помадный», «масло» and
# friends are deliberately left unmapped so they stay a gap instead of a guess.
_COLOR_PATTERNS[1:1] = [
    (r"жемчуж|костян|pearl", "Белый"),
    (r"\bмедь\b|медн", "Коричневый"),
    (r"льнян", "Бежевый"),
]

# modifiers that only qualify a base colour and must not decide it
_COLOR_MODIFIERS = re.compile(
    r"\b(тёмно|темно|светло|ярко|бледно|нежно|глубок\w*|пыльн\w*|припылён\w*|"
    r"припылен\w*|приглушён\w*|приглушен\w*|неоново?|dark|light|deep|pale)\b[\s-]*",
    re.I,
)

BASE_COLORS = sorted({c for _, c in _COLOR_PATTERNS})


def normalize_color(raw: str | None) -> str | None:
    """'серо-бежевый' -> 'Бежевый'; '#808080' -> None (hex is not a colour name)."""
    if not raw:
        return None
    s = str(raw).strip().lower().replace("ё", "ё")
    if not s or s.startswith("#"):
        return None
    s = unicodedata.normalize("NFC", s)
    s = _COLOR_MODIFIERS.sub("", s)
    # compound "серо-бежевый": the LAST component is the head noun in Russian
    parts = [p for p in re.split(r"[-/]", s) if p.strip()]
    ordered = ([parts[-1]] + parts[:-1]) if len(parts) > 1 else parts
    for chunk in ordered + [s]:
        for pat, canon in _COLOR_PATTERNS:
            if re.search(pat, chunk, re.I):
                return canon
    return None


# A shade is a colour word, not a sentence. The generic text reader used on the
# small storefronts grabs whatever follows the «Цвет» label, which produced
# values like «белый (1) по цене 599 рублей» in the first proposal draft.
_SHADE_JUNK = re.compile(
    r"\d|руб|цена|размер|экземпляр|выбранн|доставк|корзин|бренд|快|http", re.I)


def _is_colour_word(token: str) -> bool:
    """True if the token is a colour name or a modifier of one."""
    t = token.strip(" ,.;:()«»\"'")
    if not t:
        return False
    if _COLOR_MODIFIERS.match(t + " "):
        return True
    return any(re.search(pat, t, re.I) for pat, _ in _COLOR_PATTERNS)


def color_shade(raw: str | None) -> str | None:
    """The merchant's own wording, kept verbatim for the `shade` column.

    Round-1 review found values like 'а купить', 'молочный таблица',
    'оранжевый единый' and 'цвет черный' surviving the junk regex: the blocklist
    could only reject wording it had seen before.  The rule is now positive —
    EVERY token has to be a colour word or a modifier of one — so an unforeseen
    tail phrase becomes a gap instead of a junk value.
    """
    if not raw:
        return None
    s = re.sub(r"\s+", " ", str(raw)).strip()
    if not s or s.startswith("#") or len(s) > 60:
        return None
    if _SHADE_JUNK.search(s) or len(s.split()) > 3:
        return None
    tokens = [t for t in re.split(r"[\s]+", s) if t.strip()]
    if not tokens or not all(_is_colour_word(t) for t in tokens):
        return None
    return s.lower()


# --------------------------------------------------------------------------
# material
# --------------------------------------------------------------------------
_FIBERS: list[tuple[str, str]] = [
    (r"хлопок|хлопк|хлопчатобума|cotton", "хлопок"),
    (r"полиэстер|полиэфир|polyester|лавсан|терилен|полиэстр|пэ\b", "полиэстер"),
    (r"вискоз|viscose|rayon", "вискоза"),
    (r"шерст|шерсть|wool|мохер|альпак", "шерсть"),
    (r"кашемир|cashmere", "кашемир"),
    (r"шёлк|шелк|silk", "шелк"),
    # `льн` used to be matched anywhere in the string, so "социа-льн-ые сети"
    # and "официа-льн-ый магазин" (site footer text) both normalised to flax.
    # Round-1 review counted 49 of the 97 proposed 'лен' rows with no flax word
    # in the source at all. Anchor it to a word start.
    (r"\bлён|\bлен\b|\bльн|linen", "лен"),
    (r"полиамид|polyamide|нейлон|nylon", "полиамид"),
    (r"эластан|elastane|спандекс|spandex|лайкра", "эластан"),
    (r"акрил|acrylic", "акрил"),
    (r"модал|modal", "модал"),
    (r"лиоцелл|lyocell|тенсел|tencel", "лиоцелл"),
    (r"полиуретан|polyurethane|экокожа|искусственн\w+ кожа", "полиуретан"),
    (r"натуральн\w+ кожа|\bкожа\b|leather", "кожа"),
    (r"замш|suede", "замша"),
    (r"мех\b|fur", "мех"),
    (r"купра|cupro", "купра"),
    # anchored: "этиленвинилацетат" (a shoe sole) is not the acetate fibre
    (r"\bацетат|\bacetate", "ацетат"),
    (r"деним|denim", "деним"),
]

_PCT_RE = re.compile(r"(\d{1,3})\s*%")

# Sections that describe something other than the garment's main fabric.
# "ремень женский: 100% полиуретан; комбинезон женский: 66% полиэстер, ..."
# would otherwise report the *belt* as the item's material.
_SECONDARY_SECTION = re.compile(
    r"\b(подкладк\w*|ремен[ья]\w*|ремень|отделк\w*|вставк\w*|манжет\w*|капюшон\w*|"
    r"утеплител\w*|наполнител\w*|лент\w*|воротник\w*|пояс|фурнитур\w*|"
    r"lining|belt)(\s+[а-яёa-z]+)?\s*[:\-–]", re.I)
_SECTION_SPLIT = re.compile(r"[;\n]|(?=" + _SECONDARY_SECTION.pattern + ")", re.I)

# Parts of a page that are not the garment at all. A lining section can fall
# back to the raw text (the garment fabric is probably in there somewhere); a
# shoe sole or a site footer cannot — round-1 review found id 274 taking
# 'ацетат' from "этиленвинилацетат 100% подошва" and ids 92/168/171/181-187
# taking a fibre out of "…социальные сети Telegram VK Яндекс Дзен 8 (800)…".
_NON_GARMENT_SECTION = re.compile(
    r"подошв\w*|стельк\w*|шнурк\w*|носочн\w+\s+част", re.I)
_SITE_CHROME = re.compile(
    r"социальн\w*\s+сет|telegram|вконтакте|\bvk\b|яндекс\s*дзен|whatsapp|"
    r"8\s*\(8\d\d\)|политик\w*\s+конфиденциальн|пользовательск\w*\s+соглашен|"
    r"официальн\w*\s+(интернет-)?магазин|©|подписаться\s+на|"
    r"условия\s+доставки|возврат\w*\s+товар", re.I)


def _main_fabric_text(raw: str) -> str:
    """Drop lining/belt/trim sections when a main-fabric section survives."""
    parts = [p.strip() for p in _SECTION_SPLIT.split(raw) if p and p.strip()]
    parts = [p for p in parts if not _NON_GARMENT_SECTION.search(p)]
    if not parts:
        return ""
    primary = [p for p in parts if not _SECONDARY_SECTION.match(p)]
    return " ".join(primary) if primary else " ".join(parts)


def parse_composition(raw: str | None) -> list[tuple[str, int]]:
    """'75%хлопок, 22%полиамид, 3%эластан' -> [('хлопок',75),('полиамид',22),...].

    Handles both orders ("75% хлопок" and "хлопок 75%") and keeps the highest
    percentage per fibre when a fibre repeats across sections.
    """
    if not raw:
        return []
    if _SITE_CHROME.search(str(raw)):
        # the reader grabbed page chrome, not a composition line
        return []
    s = re.sub(r"\s+", " ", _main_fabric_text(str(raw))).lower()
    if not s:
        return []
    found: dict[str, int] = {}
    # split into "<pct> <name>" or "<name> <pct>" tokens
    for m in re.finditer(r"(\d{1,3})\s*%\s*([а-яёa-z()\s]{2,40})", s):
        pct, name = int(m.group(1)), m.group(2)
        fib = _fiber_of(name)
        if fib:
            found[fib] = max(found.get(fib, 0), pct)
    for m in re.finditer(r"([а-яёa-z()\s]{3,40}?)\s*(\d{1,3})\s*%", s):
        name, pct = m.group(1), int(m.group(2))
        fib = _fiber_of(name)
        if fib:
            found[fib] = max(found.get(fib, 0), pct)
    if not found:
        fib = _fiber_of(s)
        if fib:
            found[fib] = 100
    return sorted(found.items(), key=lambda kv: -kv[1])


def _fiber_of(name: str) -> str | None:
    for pat, canon in _FIBERS:
        if re.search(pat, name, re.I):
            return canon
    return None


def normalize_material(raw: str | None) -> str | None:
    """Dominant fibre, in the vocabulary already present in wardrobe_user_items."""
    comp = parse_composition(raw)
    if not comp:
        return None
    # elastane is never the "material" of a garment even when it is listed first
    non_stretch = [c for c in comp if c[0] != "эластан"]
    return (non_stretch or comp)[0][0]


# --------------------------------------------------------------------------
# gender
# --------------------------------------------------------------------------
def normalize_gender(raw: str | None) -> str | None:
    if not raw:
        return None
    s = str(raw).strip().lower()
    if s in ("male", "female", "unisex"):
        return s
    if re.search(r"унисекс|unisex", s):
        return "unisex"
    male = bool(re.search(r"мужск|мужчин|мужское|men|male|boy", s))
    female = bool(re.search(r"женск|женщин|женское|women|female|girl", s))
    # gate31 files some items under BOTH departments ("Женское Мужское").
    # Picking whichever pattern is listed first is a coin toss; the merchant is
    # literally saying "for both", which is what unisex means.
    if male and female:
        return "unisex"
    if male:
        return "male"
    if female:
        return "female"
    return None


def looks_kids(text: str | None) -> bool:
    if not text:
        return False
    return bool(re.search(r"детск|для детей|\bдети\b|kids|children|подростк", text, re.I))


# --------------------------------------------------------------------------
# clothing_type  (merchant category wording -> our slug)
# --------------------------------------------------------------------------
# Ordered longest/most-specific first: "брюки и джинсы" must not be eaten by "брюки".
_TYPE_PATTERNS: list[tuple[str, str]] = [
    (r"пухов", "puffer-jacket"),
    (r"дублён|дублен|шуб", "sheepskin-coat"),
    (r"парк", "parka"),
    (r"пальто|плащ|тренч", "coat"),
    (r"куртк|бомбер|ветровк|анорак|косух|штормовк", "jacket"),
    (r"жилет", "vest"),
    (r"жакет|пиджак|блейзер", "suit-jacket"),
    (r"кардиган", "cardigan"),
    (r"водолазк|гольф\b", "turtleneck"),
    (r"свитшот", "sweatshirt"),
    (r"джемпер|свитер|пуловер|трикотаж", "pullover"),
    (r"худи|толстовк", "hoodie"),
    (r"поло\b", "t-shirt"),
    (r"лонгслив", "longsleeve"),
    (r"футболк|майк\w*\s*с\s*рукав", "t-shirt"),
    (r"топ\b|боди\b|бралет", "tank-top"),
    (r"блуз|сорочк\w*\s*женск", "blouse"),
    (r"рубашк", "shirt"),
    (r"комбинезон", "jumpsuit"),
    (r"плать|сарафан", "dress"),
    (r"юбк", "skirt"),
    (r"спортивн\w*\s*(одежд|брюк|штан|костюм)|джоггер|карго", "sporty-pants"),
    # "Брюки и джинсы" is a *trousers* category with jeans bolted on: head noun wins.
    (r"брюк|штан", "pants"),
    (r"джинс", "jeans"),
    (r"шорт", "shorts"),
    (r"легинс|леггинс", "sporty-pants"),
    (r"кроссовк|кед\w|снике", "sneakers"),
    (r"сапог|ботинк|ботильон|угг", "boots"),
    (r"сандал|босонож|шлёпан|шлепан", "sandals"),
    (r"туфл|лофер|мокасин|балетк|обувь", "shoes"),
    (r"спортивн", "sporty-pants"),
    # generic umbrella categories, same targets import_catalog.py already uses
    # umbrella section names name no garment — refuse rather than pick one.
    (r"верхняя одежда|outerwear", None),
]


# The slugs allowed in the column. This used to be a hand-copied census of prod
# ("the slugs that exist today"), which is how it ended up REFUSING `shorts` and
# `jumpsuit` and folding them into `pants`/`dress` — a fourth private vocabulary.
# It is now exactly the canonical one; anything outside it becomes a gap (safe)
# rather than a new junk value in the column.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "clip"))
from clothing_taxonomy import CANONICAL_TYPES  # noqa: E402

PROD_SLUGS = set(CANONICAL_TYPES)

# English words a model may answer with that prod spells differently.
_SLUG_ALIASES = {
    "overall": "jumpsuit",
    "romper": "jumpsuit",
    "dungarees": "jumpsuit",
    "polo": "t-shirt",          # import_catalog.py folds Поло into t-shirt
    # `lonsleeve` (346 prod rows) is the typo, `longsleeve` the canonical slug in
    # clothing_taxonomy.CANONICAL_TYPES. Normalisation stays canonical; the
    # DB spelling is chosen at write time — see DB_SPELLING in
    # propose_no_feed_updates.py, which keeps the column single-spelled until a
    # migration renames the 346 rows.
    "lonsleeve": "longsleeve",
    "long-sleeve": "longsleeve",
    "leggings": "sporty-pants",
    "trousers": "pants",
    "sweater": "pullover",
    "jumper": "pullover",
    "knitwear": "pullover",
    "blazer": "suit-jacket",
    "windbreaker": "jacket",
    "bomber": "jacket",
    "trench": "coat",
    "raincoat": "coat",
    "outerwear": None,
    "top": "tank-top",
    "bodysuit": "tank-top",
    "loafers": "shoes",
    "heels": "shoes",
    "flats": "shoes",
    "sportswear": "sporty-pants",
    "joggers": "sporty-pants",
    "swimsuit": None,           # nothing sane to map onto -> refuse to write
    "underwear": None,
    "bag": None,
    "accessory": None,
}


def normalize_clothing_type(raw: str | None) -> str | None:
    """'Брюки и джинсы' -> 'pants'; 'Поло' -> 't-shirt'; 'Комбинезон' -> 'jumpsuit'.

    Returns None for anything that cannot be placed in PROD_SLUGS, so an unknown
    answer becomes a gap (safe) instead of a new junk value in the column.
    """
    if not raw:
        return None
    s = str(raw).strip().lower()
    if not s:
        return None
    if s in PROD_SLUGS:
        return s
    if s in _SLUG_ALIASES:
        return _SLUG_ALIASES[s]
    for pat, slug in _TYPE_PATTERNS:
        if re.search(pat, s):
            return slug
    return None

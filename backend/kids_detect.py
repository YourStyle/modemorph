# -*- coding: utf-8 -*-
"""Kids detection that looks at more than the item name.

WHY
---
`migrations/010_remove_kids_items.sql` flags children's items by scanning
`item_name` for 15 keywords. That rule is precise but half-blind: a ЦУМ card is
called "Хлопковое платье Paade Mode" or "Пуховик Yves Salomon Enfant" — nothing
in the name says "child", the merchant says it in the category tree instead.

Measured on the live catalog (22418 rows, snapshot
`test/gauntlet/ours/kids-purge/r2/raw/db_all.jsonl`, taken 2026-08-13):

* the `is_kids` column reproduces the keyword rule exactly — 1567 rows, 0
  disagreements (`raw/keyword_vs_column_mismatch.json`);
* 9650 ЦУМ rows join to today's feed by merchant URL; on 516 of them the
  merchant's own category root is `Детское` while the keyword rule says nothing
  (`raw/join_url_summary.json`, `raw/feed_kids_missed_by_current.json`);
* 30 of those 516 were re-checked against the ЦУМ product page: 30/30 carry the
  breadcrumb `Детские товары / Одежда для девочек|мальчиков`
  (`raw/gold_labelled.json`, stratum `A_cum_feedkids_missed`).

WHICH SIGNALS ARE SAFE
----------------------
Every rule below was scored over 101258 offers of the four Admitad feeds, where
the merchant's own category root gives an independent label
(`r2/scripts/07_trap_scan_feeds.py`, `08_token_evidence.py`, `12_signal_evidence.py`):

    signal                         hits   in kids branch   note
    category root/node             2748   2748            definition of the label
    merchant-URL segment           2173   2109            64 "misses" are ЦУМ
                                                          Shop-In-Shop, a flat
                                                          bucket with no kids root
                                                          whose items ARE kids
                                                          ("MSGM kids")
    name "для девоч"/"для мальчик"  975/516  all           purity 1.000
    name "малыш"                     80     80            purity 1.000
    name "школьн"                    39     39            purity 1.000
    name "enfant"                    35     35            purity 1.000
    name "kids" / "junior"          280/51  260/44        the rest = Shop-In-Shop
    name "детск" / "для детей"      261/75  159/24        rest = SELA "Дом"
                                                          (kids bedding, kids
                                                          plates) — still items
                                                          for children

REJECTED, with the measurement that rejected them:

    "боди"        232 hits, 2 in a kids branch  -> women's bodysuits
    "комбинезон"  320 hits, 27                  -> women's jumpsuits
    "слип"        167 hits, 26                  -> "трусы-слипы", "слипоны"
    latin "boy"    13 hits, 0                   -> brand "Seboy`s"
    latin "girl"    3 hits, 0                   -> "Sabina Girlfriend", "BLUGIRL"
    "преппи"       20 hits, 11 adult            -> a print style, not an age

THE TWO TRAPS THE BRIEF ASKS ABOUT (`raw/ambiguous_words.json`)

* "школьный" as an adult dress code — real, but only ever in the *description*:
  ЦУМ "Хлопковое платье CALVIN KLEIN 205W39NYC … напоминающее блузу с надетым
  поверх нее школьным фартуком" sits in `Женское > Одежда > Платья`. In an
  `item_name` "школьн" was kids 39/39 times. Hence: name-only.
* "baby" as babydoll — real: 12 description hits, all adult ("платье в стиле
  baby doll", Kika Vargas), plus "шерсть baby-альпака". Hence: name-only *and*
  the guards in `_BABY_GUARD`.

So: keyword rules read `item_name` only. `description` is used for exactly one
structural marker — SELA prints "на ребенке представлен размер 140" on children's
cards and "на модели размер S" on adult ones (213 rows, 210 already flagged).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Optional, Sequence
from urllib.parse import parse_qs, unquote, urlparse

__all__ = [
    "KidsVerdict",
    "detect_kids",
    "is_kids_name",
    "is_kids_item",
    "merchant_url",
    "KIDS_KEYWORDS",
]

# ---------------------------------------------------------------------------
# 1. Category tree
# ---------------------------------------------------------------------------

# Whole-root names (ЦУМ "Детское", SELA "Дети", …).
KIDS_CATEGORY_ROOTS = {
    "детское", "детские", "дети", "детям", "детская одежда", "детские товары",
    "kids", "children", "child", "для детей",
}

# Any node of the chain, not just the root: SELA has "Дом > Детская",
# ЦУМ has "Детское > Одежда для девочек", Lacoste has "Каталог > Детское".
_KIDS_NODE = re.compile(
    r"(детск|детям|для детей|для мальчик|для девоч|одежда для мальчиков"
    r"|одежда для девочек|обувь для мальчиков|обувь для девочек|для малышей"
    r"|малыши|ясельн|новорожд|подростк|\bkids?\b|\bchildren\b|\bbaby\b)",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# 2. Merchant URL
# ---------------------------------------------------------------------------

_KIDS_URL_SEGMENT = re.compile(
    r"(?:^|[/_-])(kids?|baby|babies|children|child|deti|detskoe|detskaya|detyam"
    r"|malysh|malyshi|junior|kinder|enfant"
    # lacoste.ru writes its kids sections in transliterated Russian:
    # /catalog/polo_dlya_malchikov/, /catalog/jubki_dlya_devochek/,
    # /catalog/polo_dlya_yunoshei/. "devushek" is deliberately NOT here — at
    # other shops that word names the adult women's section.
    r"|malchikov|malchikam|devochek|devochkam|yunoshei|podrostkov)(?:$|[/_-])",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# 3. item_name
# ---------------------------------------------------------------------------

# Cyrillic stems: substring match is fine, Russian glues suffixes on.
_NAME_STEMS_RU = (
    "детск", "для детей", "для мальчик", "для девоч", "мальчиков", "девочек",
    "ясельн", "малыш", "школьн", "подростк", "детям", "новорожд", "ползунк",
    "распашонк", "чепчик", "пинетк", "песочник", "боди-слип для",
)

# Latin tokens: word boundaries, otherwise "kid" eats "kidney" and "baby" eats
# "babydoll".
_NAME_TOKENS_LAT = (
    "kids", "kid", "baby", "babies", "infant", "infants", "toddler", "toddlers",
    "junior", "juniors", "enfant", "enfants", "bambini", "bambino", "petit-bateau",
)
_LAT_RE = re.compile(r"(?<![a-z])(" + "|".join(_NAME_TOKENS_LAT) + r")(?![a-z])", re.IGNORECASE)

# "baby" is the one latin token with adult meanings: babydoll (a dress silhouette)
# and baby alpaca (a wool). Both appear in this catalog — see module docstring.
_BABY_GUARD = re.compile(
    r"baby\s*-?\s*doll|бэби\s*-?\s*долл|беби\s*-?\s*долл"
    r"|baby\s*-?\s*(?:альпак|alpac)|бэби\s*-?\s*альпак"
    r"|baby\s*(?:blue|pink|rose)",
    re.IGNORECASE,
)

# Age / height grids a merchant puts in the name: "3-4 года", "на 5 лет",
# "рост 116". Height is capped at 164 (the tallest kids size) and must not be the
# model's height — "рост 181" in a SELA description is the fit model.
_AGE_RANGE = re.compile(r"\b\d{1,2}\s*[-–—]\s*\d{1,2}\s*(?:лет|года|год)\b", re.IGNORECASE)
_AGE_SINGLE = re.compile(r"\bна\s+\d{1,2}\s*(?:лет|года|год)\b", re.IGNORECASE)
_HEIGHT = re.compile(r"\bрост\s*(?:ребенка|ребёнка)?\s*(\d{2,3})\b", re.IGNORECASE)
_MODEL_HEIGHT = re.compile(r"модел", re.IGNORECASE)

# ---------------------------------------------------------------------------
# 4. description — one structural marker only
# ---------------------------------------------------------------------------

_ON_CHILD = re.compile(r"на\s+реб[её]нке(?:\s+представлен)?\s+размер\s*\d{2,3}", re.IGNORECASE)

# ---------------------------------------------------------------------------
# 5. feed <param>
# ---------------------------------------------------------------------------

_PARAM_KEYS = {"пол", "пол товара", "gender", "возраст", "возрастная группа", "age"}
_PARAM_KIDS_VALUES = {
    "детский", "детская", "детское", "дети", "ребенок", "ребёнок",
    "мальчик", "девочка", "для мальчиков", "для девочек",
    "kids", "kid", "child", "children", "boy", "girl", "baby",
}

# Kept so callers that used the old constant keep working.
KIDS_KEYWORDS = tuple(_NAME_STEMS_RU) + _NAME_TOKENS_LAT


@dataclass(frozen=True)
class KidsVerdict:
    """`is_kids` plus the evidence that produced it (goes into the audit log)."""

    is_kids: bool
    signal: str = ""
    evidence: str = ""

    def __bool__(self) -> bool:  # `if detect_kids(...):`
        return self.is_kids


def merchant_url(url: Optional[str]) -> str:
    """Affiliate link -> the merchant URL hidden in its ``ulp=`` parameter.

    Every catalog row stores the Admitad wrapper, never the shop link, so the
    kids section of the URL only becomes visible after this step.
    """
    if not url:
        return ""
    if "ulp=" in url:
        inner = parse_qs(urlparse(url).query).get("ulp")
        if inner:
            url = inner[0]
    return unquote(url)


def _name_hit(name: str) -> Optional[str]:
    low = name.lower()
    for stem in _NAME_STEMS_RU:
        if stem in low:
            return stem
    m = _LAT_RE.search(low)
    if m:
        token = m.group(1).lower()
        if token in ("baby", "babies") and _BABY_GUARD.search(low):
            return None
        return token
    if _AGE_RANGE.search(low) or _AGE_SINGLE.search(low):
        return "age-grid"
    h = _HEIGHT.search(low)
    if h and not _MODEL_HEIGHT.search(low) and 74 <= int(h.group(1)) <= 164:
        return "height-grid"
    return None


def detect_kids(
    name: Optional[str] = None,
    description: Optional[str] = None,
    url: Optional[str] = None,
    category_chain: Optional[Sequence[str]] = None,
    params: Optional[Mapping[str, Any]] = None,
) -> KidsVerdict:
    """Everything we can prove about one item's age group.

    Signals are ordered by how much the merchant commits to them: their own
    category tree first, then the section of their own site the item lives in,
    then the name they printed, then a structural sentence, then a feed param.
    The first hit wins and is reported in ``signal``/``evidence``.
    """
    # 1. category tree — the merchant's own taxonomy
    if category_chain:
        nodes = [str(c).strip() for c in category_chain if c]
        if nodes and nodes[0].lower() in KIDS_CATEGORY_ROOTS:
            return KidsVerdict(True, "category:root", " > ".join(nodes))
        for node in nodes:
            if _KIDS_NODE.search(node):
                return KidsVerdict(True, "category:node", node)

    # 2. section of the merchant site the product page lives in
    path = urlparse(merchant_url(url)).path
    if path and _KIDS_URL_SEGMENT.search(path):
        return KidsVerdict(True, "url:segment", path)

    # 3. the printed name (never the description — see module docstring)
    if name:
        hit = _name_hit(str(name))
        if hit:
            return KidsVerdict(True, "name:" + hit, str(name))

    # 4. the one description sentence that is structural, not marketing
    if description and _ON_CHILD.search(str(description)):
        return KidsVerdict(True, "description:on-child-size",
                           _ON_CHILD.search(str(description)).group(0))

    # 5. feed <param name="Пол">Детский</param>
    if params:
        for key, value in params.items():
            if str(key).strip().lower() in _PARAM_KEYS and \
                    str(value).strip().lower() in _PARAM_KIDS_VALUES:
                return KidsVerdict(True, "param:" + str(key).strip().lower(), str(value))

    return KidsVerdict(False)


def is_kids_name(name: Optional[str]) -> bool:
    """Name-only check. Same signature as the old `catalog_filters.is_kids_name`."""
    return bool(name) and _name_hit(str(name)) is not None


def is_kids_item(item: Optional[Mapping[str, Any]]) -> bool:
    """Check a catalog row / feed dict with every field it happens to carry."""
    if not item:
        return False
    if item.get("is_kids"):
        return True
    chain = item.get("category_chain") or item.get("chain") or item.get("categories")
    if isinstance(chain, str):
        chain = [c.strip() for c in re.split(r">|/", chain) if c.strip()]
    return detect_kids(
        name=item.get("item_name") or item.get("name"),
        description=item.get("description"),
        url=item.get("url") or item.get("product_url"),
        category_chain=chain if isinstance(chain, Iterable) and not isinstance(chain, str) else None,
        params=item.get("params") if isinstance(item.get("params"), Mapping) else None,
    ).is_kids

"""Brand resolution for catalog items — the vocabulary and the two matchers.

Background (audited 2026-08-20): wardrobe_items had no brand column. Six call
sites built one out of ``notes.split(":")[0]``, but notes is
``"<FEED_SOURCE>:<SKU>"`` and FEED_SOURCE is the RETAILER. 15204 of the 24355
rows with notes are ЦУМ, so 62.4% of the catalog told the user — and told the
Gemini outfit prompt — that a Saint Laurent coat is "ЦУМ". Those sites now emit
``retailer``; the real brand comes from the feed's ``<vendor>`` tag, or from a
monobrand constant, or (last resort) from the suffix matcher below.

Three provenances, written into wardrobe_items.brand_source by migration 030:

``feed_vendor``
    Copied verbatim from ``<offer><vendor>``. Present on 375/375 sampled ЦУМ
    offers (387 distinct brands in a 8964-offer snapshot) and 662/662 ElytS
    offers. This is merchant data; trust it.

``monobrand``
    The feed has no ``<vendor>`` at all and the retailer sells exactly one
    house. Verified on the live feeds: SELA ships no vendor tag, 2moodstore
    ships none across all 6389 offers. Trustworthy, but it is a constant we
    chose, not something the merchant said.

``dictionary``
    Longest-suffix match of ``item_name`` against vendor strings seen in the
    feeds. ЦУМ names are "<garment> <brand>" ("Хлопковая футболка Ten C"), so
    this recovers rows whose SKU no longer resolves against the live feed — 3356
    of the 15204 prod ЦУМ rows on 2026-08-20. INFERRED: exclude it from
    partner-facing reports, ship it to the model as ``brand_guess`` and to the
    user with a visible mark. Its measured error rate, and the population that
    error rate is about, are in ``match_brand_suffix`` below — with an artifact,
    because a number whose population is not named is not a number.

Anything else stays NULL. A NULL brand is a question; a wrong brand on a partner
report is a liability, and that is exactly what shipping "ЦУМ" was.

Self-check (no network, no DB):  PYTHONPATH=backend python3 backend/scripts/test_brand_match.py
Accuracy of the inferred case (needs the live ЦУМ feed, no DB):
    python3 test/gauntlet/ours/brand/scripts/measure_dictionary.py
"""

import re
import unicodedata
from typing import Iterable, Optional

BRAND_SOURCE_FEED_VENDOR = "feed_vendor"
BRAND_SOURCE_MONOBRAND = "monobrand"
BRAND_SOURCE_DICTIONARY = "dictionary"


# ---------------------------------------------------------------------------
# Monobrand retailers: feeds with no <vendor>, one house on the shelf.
#
# Keyed by the source name written into notes. Several spellings of the same
# retailer are listed because the notes prefix in prod predates ADMITAD_FEEDS:
# "Интернет-магазин Lacoste" (1642 rows) and "LOVE REPUBLIC" (479 rows) were
# imported by hand and are not registered feed keys today.
#
# ЦУМ and ElytS are absent ON PURPOSE — they are multi-brand department stores.
# Writing a constant for them is the exact bug this module exists to undo.
#
# ai-service/scripts/import_catalog.py carries its own copy of this table: it
# runs in the modemorph-ai container and cannot import from backend/. Keep the
# two in sync by hand; they are eight lines and they change roughly never.
# ---------------------------------------------------------------------------
MONOBRAND_SOURCES = {
    "sela": "SELA",
    "интернет-магазин lacoste": "Lacoste",
    "lacoste": "Lacoste",
    "love republic": "LOVE REPUBLIC",
    "loverepublic": "LOVE REPUBLIC",
    # The feed reports "2moodstore" as both <shop><name> and <company>; the house
    # itself is styled 2MOOD. This is the one constant here not taken verbatim
    # from a feed — if the merchant disagrees, this line is the only place to fix.
    "2moodstore": "2MOOD",
}

# Vendor strings shorter than this are not matched against item_name. The
# shortest real vendors in the ЦУМ + ElytS snapshot are 3 characters ("ADD",
# "N21", "3x1", "IRO"), so 3 keeps every real brand and blocks 1–2 character
# noise from matching the tail of an unrelated word.
MIN_DICTIONARY_BRAND_LEN = 3

# Feeds print the apostrophe four different ways for the same house ("Y`s",
# "Y's"), so fold them before comparing.
_APOSTROPHES = str.maketrans({"`": "'", "’": "'", "ʼ": "'", "´": "'"})
_WHITESPACE = re.compile(r"\s+")

# A dictionary brand only counts when it starts at a word boundary, so "Rohe"
# (a real ЦУМ vendor) cannot claim a name ending in "…Wardrohe". No row in the
# current catalog trips this — measured 2026-08-20, dropping the rule changes the
# answer for 0 of 24355 rows — it is here so the first feed that ships such a
# name fails closed instead of inventing a house.
_BOUNDARY_CHARS = " -/–—"

# Trailing punctuation merchants leave on a name; never part of the brand.
_TRAILING = " .,;:-–—"


def retailer_from_notes(notes: Optional[str]) -> Optional[str]:
    """The SHOP that listed the item, read off ``notes`` = "<FEED_SOURCE>:<SKU>".

    This is the value six call sites used to hand out under the name ``brand``.
    It is perfectly good data — "ЦУМ" is where you buy the coat — it just is not
    the brand, and the fix is the key it ships under, not the value.
    """
    source = (notes or "").split(":")[0].strip()
    return source or None


def normalize_brand(value: str) -> str:
    """Case/spacing/apostrophe-folded key for comparing two brand strings."""
    folded = unicodedata.normalize("NFKC", value or "").translate(_APOSTROPHES)
    return _WHITESPACE.sub(" ", folded).strip().lower()


def monobrand_for_source(source_name: str) -> Optional[str]:
    """Constant brand for a retailer that sells one house, else None."""
    return MONOBRAND_SOURCES.get(normalize_brand(source_name))


def build_brand_dictionary(vendors: Iterable[str]) -> dict:
    """{normalized vendor -> canonical spelling} from OBSERVED vendor values.

    The argument is always the set of ``<vendor>`` strings just read out of the
    feeds. There is no hardcoded brand list anywhere in this module and there
    must never be one: a name that no merchant shipped is a name we invented.

    When two feeds spell a house differently ("LACOSTE" vs "Lacoste") the first
    spelling seen wins; both normalize to the same key, so the choice only
    affects display, never whether a row matches.
    """
    table = {}
    for vendor in vendors:
        canonical = (vendor or "").strip()
        key = normalize_brand(canonical)
        if len(key) < MIN_DICTIONARY_BRAND_LEN:
            continue
        table.setdefault(key, canonical)
    return table


def match_brand_suffix(item_name: str, dictionary: dict) -> Optional[str]:
    """Longest dictionary brand that ends `item_name`, or None.

    LONGEST wins, and that is the whole point: with both "Laurent" and "Saint
    Laurent" in the dictionary, "Шорты из вискозы Saint Laurent" must resolve to
    "Saint Laurent". A first-match or shortest-match loop files the shorts under
    a different fashion house.

    Suffix-only on purpose. ЦУМ and ElytS write "<garment description> <brand>",
    so the brand is at the end; searching anywhere in the string would let
    "Мужская рубашка Lacoste из льна" style names match substrings of ordinary
    Russian words. On the 5155 SELA, 479 LOVE REPUBLIC, 585 2moodstore and 1250
    Unknown rows it fires 0 times — it does not invent brands for feeds it knows
    nothing about.

    ACCURACY — and read which population each number is about.

    An earlier version of this docstring quoted "11569 of 11611 agree with
    <vendor>, 0 disagree". Those are the prod ЦУМ rows whose SKU still joins, and
    on exactly those rows ``backfill_brand.plan_updates`` takes ``<vendor>`` and
    never calls this function (``if vendor:`` -> feed_vendor). It was an accuracy
    measured where the code path is not taken; the rows this function actually
    serves — 3356 of the 15204 prod ЦУМ rows on 2026-08-20 — had no accuracy
    number at all, only an answer rate. Replaced by the measurement below, which
    is on the population that matters and is reproducible from the feed alone:

        python3 test/gauntlet/ours/brand/scripts/measure_dictionary.py
        artifact: test/gauntlet/ours/brand/MEASUREMENT.json

    Ground truth is the merchant's own ``<vendor>`` on the 8910 live ЦУМ offers,
    each of which also carries the ``<name>`` this function reads. Two regimes,
    because an unjoined row is in one or the other and the answer differs by
    three orders of magnitude:

    house still sold (so it IS in the dictionary; the row is unjoined only
        because the merchant reissued the offer id) — 8893 agree, 17 silent,
        **0 wrong** out of 8910. Zero errors in 8893 answers puts the 95% upper
        bound at 3/8893 = 0.03%.

    house delisted (so it is NOT in the dictionary — the case where a
        longest-suffix match can quietly return a shorter surviving vendor):
        measured leave-one-house-out over the same 8910 offers — 8898 stay
        silent, **12 return a wrong house** = 0.13%. All 12 are a sub-brand
        resolving to its parent: 10× "Polo Ralph Lauren" -> "Ralph Lauren",
        2× "Bound by bond-eye Australia" -> "Bond-eye Australia". The mechanism
        is countable and it is small: of the 388 live vendor strings, exactly 2
        pairs have one as a word-boundary suffix of the other, and both pairs are
        the same house twice. "Saint Laurent"/"Laurent", "Max Mara"/"Mara",
        "Stone Island"/"Island", "Isabel Marant"/"Marant" — the shorter half of
        each is not a vendor ЦУМ ships, so none of them can fire.

    Mix of the two regimes in prod, from the answer rates alone: the real
    unjoined rows answer at 90.5% (3356 of 3710), in-vocab answers at 99.8% and
    out-of-vocab at 0.13%, which puts ~9.4% of unjoined rows in the delisted
    regime and the expected number of wrong houses across all 3356 at **0.5**.

    What is still NOT measured: a house delisted so long ago that it left the
    feed entirely cannot appear in the leave-one-house-out set, so its share is
    an inference from answer rates rather than a count. That is the reason the
    value ships to the user with a visible "≈" (components/outfit-card.tsx) and
    to the model under ``brand_guess``, never as merchant fact.
    """
    name = normalize_brand(item_name).rstrip(_TRAILING)
    if not name:
        return None
    best_key = None
    for key in dictionary:
        if len(key) < MIN_DICTIONARY_BRAND_LEN or not name.endswith(key):
            continue
        start = len(name) - len(key)
        if start and name[start - 1] not in _BOUNDARY_CHARS:
            continue
        if best_key is None or len(key) > len(best_key):
            best_key = key
    return dictionary[best_key] if best_key is not None else None


# ---------------------------------------------------------------------------
# Handing a brand to a language model.
#
# The three provenances above are not interchangeable at a prompt boundary, and
# a prompt boundary is where the distinction was being thrown away. Every prompt
# builder emitted `brand=<value>` identically for all three, so Gemini was told
# a suffix match off a product name was merchant fact. It then writes the section
# titles, the outfit names and (in the assistant) free Russian prose the user
# reads — so the card's careful "stated vs inferred" styling is bypassed by any
# brand name the model repeats. On prod that is 3356 inferred ЦУМ rows, and ЦУМ is
# the retailer behind about half of everything actually shown: 235 of the 498
# recommendation_logs rows with a non-NULL action, measured 2026-08-20. (The
# 421930 action IS NULL rows are server-side CLIP retrievals, not impressions,
# and are not counted here.)
#
# So: a merchant-stated house ships under `brand` and may be named out loud; an
# inferred one ships under `brand_guess`, which is still useful to the model (do
# not put two garments from the same house in one outfit) but must never appear
# in output text. Emitting nothing instead would lose that signal for 3356 rows;
# emitting it as fact is the bug. (3356 is a recount against the evening feed of
# 2026-08-20; the plan table in backfill_brand.py says 3239 because it was built
# against that morning's snapshot of the same feed. The split moves with the
# feed — see the note there. Neither number is an error rate: that lives in
# match_brand_suffix, measured on the rows the matcher actually runs on.)
#
# ai-service/scripts/generate_recommendations.py runs in the modemorph-ai
# container and cannot import from backend/ — it carries a copy of this rule,
# same as import_catalog.py carries a copy of MONOBRAND_SOURCES.
# ---------------------------------------------------------------------------
BRAND_STATED_SOURCES = (BRAND_SOURCE_FEED_VENDOR, BRAND_SOURCE_MONOBRAND)

PROMPT_BRAND_KEY = "brand"
PROMPT_BRAND_GUESS_KEY = "brand_guess"

BRAND_GUESS_PROMPT_RULE = (
    "- brand_guess — НАША догадка о марке по названию товара, а не слова магазина. "
    "Она нужна только чтобы не собирать образ из двух вещей одного дома. "
    "НИКОГДА не пиши значение brand_guess в тексте — ни в названии образа, ни в "
    "описании, ни в ответе пользователю. Называть марку вслух можно только из brand."
)


def prompt_brand_field(brand: Optional[str], brand_source: Optional[str]) -> tuple:
    """(key, value) under which this brand may enter a prompt; (None, None) if none.

    ``brand`` when a merchant named the house, ``brand_guess`` when we inferred it
    off the product name, nothing at all when the column is empty. A row with a
    brand but no provenance (written before migration 030) counts as inferred:
    unknown provenance is not merchant data.
    """
    value = (brand or "").strip()
    if not value:
        return None, None
    if (brand_source or "").strip() in BRAND_STATED_SOURCES:
        return PROMPT_BRAND_KEY, value
    return PROMPT_BRAND_GUESS_KEY, value


def brand_from_offer(vendor: str, source_name: str) -> tuple:
    """(brand, brand_source) for one feed offer. (None, None) when unknown.

    ``<vendor>`` beats the monobrand constant: if a monobrand retailer ever
    starts shipping a second house, the feed is right and our constant is stale.
    """
    vendor = (vendor or "").strip()
    if vendor:
        return vendor, BRAND_SOURCE_FEED_VENDOR
    constant = monobrand_for_source(source_name)
    if constant:
        return constant, BRAND_SOURCE_MONOBRAND
    return None, None

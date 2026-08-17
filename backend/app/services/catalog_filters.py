"""
catalog_filters.py — shared gender + kids filtering for the product catalog.

Centralizes two recurring bugs:
  * Men's items leaking into women's feeds (and vice versa). Catalog queries used
    `gender = :g OR gender IS NULL`, letting every untagged item through to BOTH
    genders. gender_ok() keeps unisex/untagged items (so the feed isn't starved)
    but rescues mis-tagged ones by name.
  * Children's items appearing at all — kids are not our audience. The legacy
    schema has no age column, so we detect kids by name and (migration 008)
    persist an is_kids flag + hide them.

Kids detection itself now lives in ``kids_detect`` (backend/kids_detect.py): the
name is only one of five signals, and it was the weakest one — on a 156-row gold
set labelled from merchant pages the name rule alone found 15 of 53 children's
items, the full detector found 53 with no false positives
(test/gauntlet/ours/kids-purge/r2/raw/gold_score_report.txt).
"""

from kids_detect import KIDS_KEYWORDS as _DETECT_KEYWORDS  # noqa: F401
from kids_detect import is_kids_item as _is_kids_item
from kids_detect import is_kids_name as _is_kids_name

# Item-name signals (lowercased substring match)
_FEMALE_KEYWORDS = (
    "женск", "для девочек", "для девушек", "для женщин",
    "юбка", "платье", "сарафан", "блузка", "бюстгальтер", "лифчик",
    "колготки", "леггинс",
    # Обуви тут не было ни одного слова, а именно она и течёт: у всех
    # каталожных shoes/boots/sandals в проде gender = NULL, и «спасение по
    # имени» для них не срабатывало. Так мужчине приезжали «Ботильоны с
    # круглым мысом» и «Мюли на танкетке» — оба NULL, оба без единого
    # женского слова из старого списка.
    "ботильон", "мюли", "босонож", "лодочк", "балетк", "шпильк",
    "на каблук", "танкетк", "ботфорт", "сабо",
)
_MALE_KEYWORDS = ("мужск", "для мальчиков", "для мужчин", "men's", "man's")

# Re-exported for the call sites that imported the tuple directly.
KIDS_KEYWORDS = _DETECT_KEYWORDS


def is_kids_name(name) -> bool:
    """True if the item NAME signals a children's product.

    Thin wrapper over kids_detect so the old call sites keep working. Note it
    only sees the name: prefer :func:`is_kids_item` when the row also has a url,
    a description or a feed category chain — that is where most children's items
    actually announce themselves (516 ЦУМ rows in prod carry no kids word in the
    name at all, r2/raw/feed_kids_missed_by_current.json).
    """
    return _is_kids_name(name)


def gender_ok(item: dict, user_gender) -> bool:
    """
    True if a catalog item is appropriate for a user of `user_gender`.

    - Kids items are never appropriate. The check reads every field the row
      happens to carry (is_kids flag, name, url, description, category chain),
      not just the name — 525 ЦУМ rows currently visible in prod are children's
      items whose name says nothing (r2/raw/apply_full_db.txt).
    - Explicit opposite gender is excluded.
    - 'unisex' and untagged (NULL) items are allowed UNLESS their name carries
      opposite-gender keywords (rescues mis-tagged NULL items).
    """
    name = item.get("item_name") or item.get("name")
    if _is_kids_item(item):
        return False

    if not user_gender:
        return True

    item_gender = (item.get("gender") or "").strip().lower()
    if item_gender and item_gender not in (user_gender, "unisex"):
        return False

    n = (name or "").lower()
    if user_gender == "male" and any(kw in n for kw in _FEMALE_KEYWORDS):
        return False
    if user_gender == "female" and any(kw in n for kw in _MALE_KEYWORDS):
        return False
    return True

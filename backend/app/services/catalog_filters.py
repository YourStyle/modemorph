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
"""

# Item-name signals (lowercased substring match)
_FEMALE_KEYWORDS = (
    "женск", "для девочек", "для девушек", "для женщин",
    "юбка", "платье", "сарафан", "блузка", "бюстгальтер", "лифчик",
    "колготки", "леггинс",
)
_MALE_KEYWORDS = ("мужск", "для мальчиков", "для мужчин", "men's", "man's")

KIDS_KEYWORDS = (
    "детск", "для детей", "для мальчиков", "для девочек", "ясельн",
    "малыш", "школьн", "подростк", "детям", "для новорожд",
    "kids", "baby", "infant", "toddler", "junior",
)


def is_kids_name(name) -> bool:
    """True if the item name signals a children's product."""
    n = (name or "").lower()
    return any(kw in n for kw in KIDS_KEYWORDS)


def gender_ok(item: dict, user_gender) -> bool:
    """
    True if a catalog item is appropriate for a user of `user_gender`.

    - Kids items are never appropriate (flag from DB or name heuristic).
    - Explicit opposite gender is excluded.
    - 'unisex' and untagged (NULL) items are allowed UNLESS their name carries
      opposite-gender keywords (rescues mis-tagged NULL items).
    """
    name = item.get("item_name") or item.get("name")
    if item.get("is_kids") or is_kids_name(name):
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

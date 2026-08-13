"""Runnable check for wardrobe_outfits.py — pure stdlib, no torch/fastapi.

Loads the module directly by file path (importlib), not via `from . import
wardrobe_outfits`, so it does NOT execute clip/__init__.py (which imports
encoder.py -> torch/transformers). That's what makes this runnable without
the full ai-service environment installed.

Run: python3 ai-service/clip/test_wardrobe_outfits.py
"""
import importlib.util
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "wardrobe_outfits", os.path.join(_HERE, "wardrobe_outfits.py")
)
wo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wo)


# ---------------------------------------------------------------------------
# A test wardrobe: 17 items spanning every slot including bag + accessory,
# so we can prove the 6+ item / bag+accessory Lamoda bar is reachable, plus
# a few items that stress the free-text keyword fallback (values Gemini
# would plausibly return that AREN'T in the curated _SLOT_MAP).
# ---------------------------------------------------------------------------
WARDROBE = [
    {"id": 1, "clothing_type": "t-shirt", "color": "белый", "style": "кэжуал", "item_name": "Белая футболка"},
    {"id": 2, "clothing_type": "shirt", "color": "голубой", "style": "деловой", "item_name": "Голубая рубашка"},
    {"id": 3, "clothing_type": "blouse", "color": "чёрный", "style": "деловой", "item_name": "Чёрная блузка"},
    {"id": 4, "clothing_type": "jeans", "color": "синий", "style": "кэжуал", "item_name": "Синие джинсы"},
    {"id": 5, "clothing_type": "pants", "color": "чёрный", "style": "деловой", "item_name": "Чёрные брюки"},
    {"id": 6, "clothing_type": "dress", "color": "красный", "style": "нарядный вечерний", "item_name": "Красное платье"},
    {"id": 7, "clothing_type": "jacket", "color": "бежевый", "style": "кэжуал", "item_name": "Бежевая куртка"},   # keyword fallback (not in _SLOT_MAP)
    {"id": 8, "clothing_type": "sneakers", "color": "белый", "style": "спортивный", "item_name": "Белые кроссовки"},
    {"id": 9, "clothing_type": "heels", "color": "чёрный", "style": "нарядный", "item_name": "Чёрные туфли"},      # keyword fallback
    {"id": 10, "clothing_type": "handbag", "color": "коричневый", "style": "кэжуал", "item_name": "Коричневая сумка"},  # keyword fallback -> bag
    {"id": 11, "clothing_type": "clutch", "color": "чёрный", "style": "нарядный", "item_name": "Чёрный клатч"},    # keyword fallback -> bag
    {"id": 12, "clothing_type": "sunglasses", "color": "чёрный", "style": "кэжуал", "item_name": "Солнцезащитные очки"},  # keyword fallback -> accessory
    {"id": 13, "clothing_type": "belt", "color": "чёрный", "style": "деловой", "item_name": "Чёрный ремень"},      # keyword fallback -> accessory
    {"id": 14, "clothing_type": "cardigan", "color": "серый", "style": "кэжуал", "item_name": "Серый кардиган"},
    {"id": 15, "clothing_type": "shorts", "color": "хаки", "style": "спортивный", "item_name": "Шорты хаки"},
    {"id": 16, "clothing_type": "coat", "color": "тёмно-синий", "style": "деловой", "item_name": "Тёмно-синее пальто"},
    {"id": 17, "clothing_type": "hoodie", "color": "чёрный", "style": "спортивный", "item_name": "Чёрное худи"},
]


# ---------------------------------------------------------------------------
# The actual r1-review bug: a wardrobe shaped like what's really in prod, not
# a wardrobe with hand-picked English clothing_type values. Verified against
# the real save paths (2026-08-07):
#   - components/photo-analysis-form.tsx, background-tasks-widget.tsx and
#     image-upload-form.tsx never send clothing_type on save, so
#     backend/app/api/wardrobe_user_items.py create_item() lets the column
#     fall back to its DB DEFAULT 'верхняя' (backend/migrations/001_schema.sql)
#     regardless of what the item actually is. item_name IS accurate Russian
#     text from Gemini either way (backend/app/api/misc.py prompt).
#   - components/add-wardrobe-item-form.tsx saves a broad Russian category
#     ('платье', 'верхняя одежда', 'аксессуар', ...).
#   - components/edit-wardrobe-item-sheet.tsx saves a specific Russian word
#     ('Куртка', 'Джинсы', 'Сумка', ...).
# Before this fix, wardrobe_slot() only understood curated/keyword ENGLISH
# clothing_type — every item below would resolve to None (or the wrong slot
# for the bogus-default ones), bucket_by_slot() would end up without a
# usable top+bottom/dress pair, and the real endpoint would return
# {"outfits": [], "reason": "insufficient_wardrobe"} for a wardrobe that
# obviously has outfits in it.
# ---------------------------------------------------------------------------
WARDROBE_PROD = [
    # Auto-saved via photo analysis: clothing_type is the bogus DB DEFAULT
    # 'верхняя' on every single one of these regardless of actual type.
    {"id": 101, "clothing_type": "верхняя", "item_name": "Белая футболка", "color": "белый", "style": "кэжуал"},
    {"id": 102, "clothing_type": "верхняя", "item_name": "Синие джинсы", "color": "синий", "style": "кэжуал"},
    {"id": 103, "clothing_type": "верхняя", "item_name": "Чёрные туфли", "color": "чёрный", "style": "нарядный"},
    {"id": 104, "clothing_type": "верхняя", "item_name": "Коричневая сумка", "color": "коричневый", "style": "кэжуал"},
    {"id": 105, "clothing_type": "верхняя", "item_name": "Чёрный ремень", "color": "чёрный", "style": "деловой"},
    {"id": 106, "clothing_type": "верхняя", "item_name": "Бежевое пальто", "color": "бежевый", "style": "деловой"},
    # Manually added via add-wardrobe-item-form.tsx (broad category picker).
    {"id": 107, "clothing_type": "платье", "item_name": "Красное платье", "color": "красный", "style": "нарядный вечерний"},
    {"id": 108, "clothing_type": "аксессуар", "item_name": "Солнцезащитные очки", "color": "чёрный", "style": "кэжуал"},
    # Manually edited via edit-wardrobe-item-sheet.tsx (specific picker).
    {"id": 109, "clothing_type": "Куртка", "item_name": "Куртка бомбер", "color": "хаки", "style": "спортивный"},
    {"id": 110, "clothing_type": "Джинсы", "item_name": "Чёрные джинсы", "color": "чёрный", "style": "кэжуал"},
    {"id": 111, "clothing_type": "Сумка", "item_name": "Рюкзак", "color": "чёрный", "style": "спортивный"},
]


def _check(label, cond):
    status = "OK" if cond else "FAIL"
    print(f"[{status}] {label}")
    assert cond, label


def main():
    # 1. Slot resolution: curated map + keyword fallback both work.
    _check("shirt -> top (curated)", wo.wardrobe_slot("shirt") == "top")
    _check("jacket -> outerwear (keyword fallback)", wo.wardrobe_slot("jacket") == "outerwear")
    _check("handbag -> bag (keyword fallback)", wo.wardrobe_slot("handbag") == "bag")
    _check("sunglasses -> accessory (keyword fallback)", wo.wardrobe_slot("sunglasses") == "accessory")
    _check("heels -> shoes (keyword fallback)", wo.wardrobe_slot("heels") == "shoes")
    _check("gibberish -> None", wo.wardrobe_slot("xyzzy123") is None)

    slots = wo.bucket_by_slot(WARDROBE)
    _check("bag slot populated", len(slots.get("bag", [])) == 2)
    _check("accessory slot populated", len(slots.get("accessory", [])) == 2)
    _check("every item bucketed (no drops)", sum(len(v) for v in slots.values()) == len(WARDROBE))

    # 2. Color/style compat is metadata-driven, not embedding similarity —
    # two DIFFERENT items with the same declared color score high; identical
    # embeddings play no role here at all (this function never sees one).
    _check("same neutral color -> high compat", wo.color_compat("чёрный", "чёрный") == 0.85)
    _check("neutral + accent -> high compat", wo.color_compat("белый", "красный") == 0.85)
    _check("two different accents -> lower compat", wo.color_compat("красный", "зелёный") == 0.45)

    # 3. Candidate assembly covers 6+ items with bag+accessory when the
    # wardrobe has the breadth for it (the actual Lamoda bar check).
    candidates = wo.assemble_candidates(slots, budget=200)
    _check("assembly produced candidates", len(candidates) > 0)
    best_coverage = max(len(c) for c in candidates)
    _check(f"some candidate reaches 6+ items (got {best_coverage})", best_coverage >= 6)
    has_bag_and_accessory = any(
        any(wo.wardrobe_slot(it["clothing_type"]) == "bag" for it in c)
        and any(wo.wardrobe_slot(it["clothing_type"]) == "accessory" for it in c)
        for c in candidates
    )
    _check("some candidate has BOTH bag and accessory", has_bag_and_accessory)

    # 4. Diversity: N outfits share at most 1 item pairwise when the pool allows it.
    scored = [
        {"score": wo.fallback_compat_score(c), "occasion": wo.infer_occasion(c), "items": c}
        for c in candidates
    ]
    scored.sort(key=lambda o: o["score"], reverse=True)
    picked = wo.select_diverse(scored, n=3)
    _check("selected 3 outfits", len(picked) == 3)
    # select_diverse relaxes its overlap cap (1 -> 2 -> 3 -> unlimited) only as
    # far as needed to fill n outfits, so we check "clearly not the same
    # outfit twice" rather than assert the tightest cap always succeeds —
    # that depends on how much variety this particular wardrobe has.
    for i in range(len(picked)):
        for j in range(i + 1, len(picked)):
            items_i = {it["id"] for it in picked[i]["items"]}
            items_j = {it["id"] for it in picked[j]["items"]}
            shared = items_i & items_j
            _check(
                f"outfit {i} vs {j} are different outfits (shared {len(shared)}/{len(items_i)})",
                shared != items_i and shared != items_j,
            )

    # 5. Occasion inference picks something sensible for an obvious case.
    party_outfit = [it for it in WARDROBE if it["id"] in (6, 9, 11)]  # dress + heels + clutch
    _check("dress+heels+clutch -> На вечеринку", wo.infer_occasion(party_outfit) == "На вечеринку")

    # 6. Wearability rules from r1's review: outerwear and layer never stack
    # on the same candidate, and a dress never gets a layer piece at all
    # (the r1 bug: "Красное платье + Бежевая куртка + ... + Чёрное худи").
    def _slot_ids(c, slot_name):
        return [it["id"] for it in c if wo.wardrobe_slot(it["clothing_type"]) == slot_name]

    no_double_stack = all(
        not (_slot_ids(c, "outerwear") and _slot_ids(c, "layer"))
        for c in candidates
    )
    _check("no candidate has BOTH outerwear and layer", no_double_stack)
    dress_candidates = [c for c in candidates if _slot_ids(c, "dress")]
    _check("some dress candidate exists", len(dress_candidates) > 0)
    no_layer_on_dress = all(not _slot_ids(c, "layer") for c in dress_candidates)
    _check("no dress candidate has a layer piece", no_layer_on_dress)

    # 7. The actual r1 bug, reproduced and closed: a wardrobe shaped like
    # real prod data (bogus 'верхняя' DB-default clothing_type + Gemini's
    # real Russian item_name, plus manual-form Russian clothing_type) must
    # NOT resolve to an empty wardrobe.
    prod_slots = wo.bucket_by_slot(WARDROBE_PROD)
    _check(
        "prod wardrobe: every item resolves to a slot (none dropped)",
        sum(len(v) for v in prod_slots.values()) == len(WARDROBE_PROD),
    )
    _check(
        "prod wardrobe: 'Синие джинсы' (bogus clothing_type='верхняя') -> bottom, not top",
        any(it["id"] == 102 for it in prod_slots.get("bottom", [])),
    )
    _check(
        "prod wardrobe: 'Чёрные туфли' (bogus clothing_type='верхняя') -> shoes, not top",
        any(it["id"] == 103 for it in prod_slots.get("shoes", [])),
    )
    _check(
        "prod wardrobe: 'Коричневая сумка' (bogus clothing_type='верхняя') -> bag, not top",
        any(it["id"] == 104 for it in prod_slots.get("bag", [])),
    )
    prod_body_covered = "dress" in prod_slots or all(s in prod_slots for s in ("top", "bottom"))
    _check("prod wardrobe: has enough for a body slot (dress or top+bottom)", prod_body_covered)
    prod_candidates = wo.assemble_candidates(prod_slots, budget=200)
    _check("prod wardrobe: assembler produces at least one candidate outfit", len(prod_candidates) > 0)
    prod_best_coverage = max((len(c) for c in prod_candidates), default=0)
    _check(
        f"prod wardrobe: some candidate reaches 6+ items (got {prod_best_coverage})",
        prod_best_coverage >= 6,
    )
    prod_has_bag_and_accessory = any(
        any(it["id"] in (104, 111) for it in c) and any(it["id"] in (105, 108) for it in c)
        for c in prod_candidates
    )
    _check("prod wardrobe: some candidate has both bag and accessory", prod_has_bag_and_accessory)

    print("\n--- 3 example outfits (this IS the real assembler/scorer output) ---")
    for o in picked:
        names = [it["item_name"] for it in o["items"]]
        print(f"\n[{o['occasion']}] score={o['score']}")
        for it in o["items"]:
            print(f"  - {it['item_name']} ({wo.wardrobe_slot(it['clothing_type'])}, {it['color']})")

    print("\nAll checks passed.")


if __name__ == "__main__":
    main()

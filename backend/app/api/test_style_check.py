"""«Стоит ли покупать?»: ответу модели не верим на слово."""
from app.api.misc import _check_style_answer

W = {
    1: {"id": 1, "item_name": "белая футболка", "clothing_type": "t-shirt", "image_url": "u1"},
    2: {"id": 2, "item_name": "синие джинсы", "clothing_type": "jeans", "image_url": "u2"},
    3: {"id": 3, "item_name": "кеды", "clothing_type": "sneakers", "image_url": "u3"},
    4: {"id": 4, "item_name": "чёрный пиджак", "clothing_type": "suit-jacket", "image_url": "u4"},
    5: {"id": 5, "item_name": "чёрные брюки", "clothing_type": "pants", "image_url": "u5"},
}


def test_invented_ids_and_incomplete_outfits_are_dropped():
    parsed = {"name": "серый пиджак", "type": "suit-jacket", "outfits": [
        {"title": "ок", "item_ids": [1, 2, 3]},          # футболка + джинсы + кеды → одевает целиком
        {"title": "выдумка", "item_ids": [999, 1000]},   # таких id в гардеробе нет
        {"title": "голый торс", "item_ids": [5, 3]},     # пиджак + брюки + кеды без верха
    ]}
    _, _, outfits = _check_style_answer(parsed, W)
    assert [o["title"] for o in outfits] == ["ок"]


def test_duplicate_must_share_the_slot():
    parsed = {"name": "чёрные брюки", "type": "pants", "duplicates": [1]}  # мнение модели не учитывается
    near = [{"id": 5, "similarity": 0.95}, {"id": 999, "similarity": 0.99}]
    _, dups, _ = _check_style_answer(parsed, W, near)
    assert [d["id"] for d in dups] == [5], "999 нет в гардеробе, дубль от модели не принимаем"


def test_same_slot_item_is_not_a_companion():
    parsed = {"name": "серые брюки", "type": "pants", "outfits": [{"title": "t", "item_ids": [5, 1, 3]}]}
    _, _, outfits = _check_style_answer(parsed, W)
    assert [i["id"] for i in outfits[0]["items"]] == [1, 3], "вторые брюки к брюкам не подставляем"


def test_clip_duplicate_is_trusted_and_needs_same_slot():
    parsed = {"name": "синие джинсы", "type": "jeans", "duplicates": []}
    near = [{"id": 2, "similarity": 0.97}, {"id": 1, "similarity": 0.95}, {"id": 5, "similarity": 0.80}]
    _, dups, _ = _check_style_answer(parsed, W, near)
    assert [d["id"] for d in dups] == [2], "футболка — другой слот, брюки ниже порога"


def test_dress_is_not_paired_with_trousers():
    w = {**W, 6: {"id": 6, "item_name": "платье макси", "clothing_type": "dress", "image_url": "u6"}}
    parsed = {"name": "чёрные брюки", "type": "pants", "outfits": [
        {"title": "платье", "item_ids": [6, 3]}, {"title": "ок", "item_ids": [1, 3]}]}
    _, _, outfits = _check_style_answer(parsed, w)
    assert [o["title"] for o in outfits] == ["ок"]

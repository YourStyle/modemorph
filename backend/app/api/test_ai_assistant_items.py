"""Guards the two /api/ai-assistant fixes of 2026-09-07.

1. `_hydrate_items`: cards in the chat get image_url / shop url / ownership from
   the DB rows, not from whatever the model echoes. Prod ai_chat_messages had
   image_url "" on every item — every card was the grey placeholder.
2. Prose fallback: a markdown answer without the JSON envelope is still an
   answer (three "Произошла ошибка" in a row on prod for "what is missing").

Run it:  python3 -m app.api.test_ai_assistant_items     (from backend/)

ponytail: plain asserts, no pytest — pytest is not installed and CI runs no tests.
"""

from app.api.misc import _hydrate_items, _ids_out_of_prose, _items_by_name, _parse_ai_json

WARDROBE = [
    {"id": 458, "item_name": "джинсы прямого кроя", "color": "индиго",
     "image_url": "https://s3/upload-5NfB9E91.jpg", "user_id": "4f43a748-uuid"},
]
CATALOG = [
    {"id": 1000018560, "item_name": "Кожаные ботинки Dondup", "color": "Черный",
     "image_url": "https://cdn/dondup.jpg", "url": "https://ad.admitad.com/g/x"},
]

# Model output as prod saw it: ids right, everything else lost or a string id.
parsed = [{
    "content": "Джинсы + ботинки.",
    "items": [
        {"id": "458", "name": "джинсы", "image_url": "", "user_id": "uid"},
        {"id": 1000018560, "name": "Ботинки Dondup", "url": None},
        {"id": 999999, "name": "выдуманный тренч"},   # never sent to the model
        {"id": "abc"}, "garbage", None,
    ],
}]
out = _hydrate_items(parsed, WARDROBE, CATALOG)
items = out[0]["items"]

assert [i["id"] for i in items] == [458, 1000018560], items
own, shop = items
assert own["image_url"] == "https://s3/upload-5NfB9E91.jpg"
assert own["user_id"] == "4f43a748-uuid" and own["url"] is None
assert own["name"] == "джинсы" and own["color"] == "индиго"   # model's name, DB colour
assert shop["image_url"] == "https://cdn/dondup.jpg"
assert shop["url"] == "https://ad.admitad.com/g/x" and shop["user_id"] is None

# Outfit envelope and entries without items pass through untouched.
outfit = [{"id": "o1", "title": "t", "items": [{"id": 458}]}, {"type": "trash"}]
assert _hydrate_items(outfit, WARDROBE, CATALOG)[0]["items"][0]["image_url"].startswith("https://s3/")
assert _hydrate_items(outfit, WARDROBE, CATALOG)[1] == {"type": "trash"}

# Prose without the JSON envelope: the parser gives [], the endpoint wraps it.
prose = "Чтобы расширить гардероб, вам стоит:\n\n1. **Обувь**: кеды"
assert _parse_ai_json(prose) == []
assert _parse_ai_json('```json\n[{"content": "ok"}]\n```') == [{"content": "ok"}]

# Ids written into the prose become items (and vanish from the text); two
# content entries collapse into one so the frontend does not drop the second.
prose_answer = [
    {"content": "- **Серые леггинсы** (ID: 1590): спорт.\n- **Джинсы** (id: 458, цвет: индиго) ок."},
    {"content": "Пример: **ботинки** [ID 1000018560] к джинсам (ID: 458)."},
    {"type": "trash"},
]
out = _ids_out_of_prose(prose_answer)
assert len(out) == 2 and out[1] == {"type": "trash"}, out
assert "ID" not in out[0]["content"] and "(id" not in out[0]["content"], out[0]["content"]
assert out[0]["content"].startswith("- **Серые леггинсы**: спорт.")
assert [i["id"] for i in out[0]["items"]] == [1590, 458, 1000018560], out[0]["items"]
hydrated = _hydrate_items(out, WARDROBE, CATALOG)[0]["items"]
assert [i["id"] for i in hydrated] == [458, 1000018560]        # 1590 unknown -> dropped
assert _ids_out_of_prose([{"content": "чистый текст", "items": [{"id": 1}]}])[0]["items"] == [{"id": 1}]

# Names in prose (no ids at all): long distinctive names match, generic
# one-word names do not, catalogue goes first, already-present ids stay unique.
wardrobe2 = WARDROBE + [{"id": 459, "item_name": "свитер", "color": "ivory", "image_url": "x", "user_id": "u"}]
named = [{"content": "К **джинсы прямого кроя** возьмите **Кожаные ботинки Dondup**; шерстяной свитер тоже.",
          "items": [{"id": 458}]}]
got = _items_by_name(named, wardrobe2, CATALOG)[0]["items"]
assert [i["id"] for i in got] == [458, 1000018560], got     # 459 "свитер" must not match
assert _items_by_name([{"type": "trash"}], wardrobe2, CATALOG) == [{"type": "trash"}]

print("test_ai_assistant_items: OK")

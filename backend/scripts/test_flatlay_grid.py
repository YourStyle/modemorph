"""Тест: пересъёмка каталожных вещей в flat-lay СЕТКОЙ, а не по одной.

Зачем. В ленте идей часть вещей снята на человеке. Их надо заменить на flat-lay.
Генерация картинки стоит фиксированно ~1120 токенов независимо от содержимого,
поэтому 4 отдельных вызова стоят вчетверо дороже одного, который рисует сетку
2x2. Оцифровка фото так уже работает (misc.py, замер 2026-08-22: 3.4x дешевле).

Отличие от оцифровки: там ОДНА исходная фотография с несколькими вещами, здесь
у каждой вещи СВОЯ карточка. Поэтому исходники сначала склеиваются в коллаж 2x2,
и модель просят вернуть сетку, где квадрант N — flat-lay вещи из квадранта N
исходника. Позиционное соответствие вместо перечисления словами.

Ничего не пишет в базу: только складывает картинки «до/после» в /tmp/flatlay_test.

Запуск (внутри контейнера backend — там прокси и ключ OpenRouter):
    docker exec -i modemorph-backend python3 /tmp/test_flatlay_grid.py
"""

import asyncio
import base64
import io
import json
import os
import sys
import urllib.request

sys.path.insert(0, "/app")

from PIL import Image  # noqa: E402

from app.api.misc import FLATLAY_MODEL, _openrouter_chat, _split_grid  # noqa: E402

OUT_DIR = "/tmp/flatlay_test"
CELLS = ("верхний-левый", "верхний-правый", "нижний-левый", "нижний-правый")


def fetch(url: str) -> Image.Image:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


def collage(images: list, cell: int = 512) -> str:
    """Склеить до 4 исходников в квадратный коллаж 2x2. Пустые клетки — серые."""
    canvas = Image.new("RGB", (cell * 2, cell * 2), (235, 235, 235))
    for i, im in enumerate(images[:4]):
        im = im.copy()
        im.thumbnail((cell, cell), Image.LANCZOS)
        box = Image.new("RGB", (cell, cell), (235, 235, 235))
        box.paste(im, ((cell - im.width) // 2, (cell - im.height) // 2))
        canvas.paste(box, ((i % 2) * cell, (i // 2) * cell))
    buf = io.BytesIO()
    canvas.save(buf, format="JPEG", quality=92)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# Канонический слаг -> как назвать вещь модели по-русски. Без этого приходится
# полагаться на название товара, а оно бывает бесполезным («WIDE LEG», «COS
# 1024»): на кадре человек одет целиком, и модель вольна взять не ту вещь.
TYPE_RU = {
    "t-shirt": "футболку", "shirt": "рубашку", "blouse": "блузку",
    "longsleeve": "лонгслив", "tank-top": "майку/топ", "turtleneck": "водолазку",
    "pullover": "свитер", "cardigan": "кардиган", "hoodie": "худи",
    "sweatshirt": "свитшот", "vest": "жилет", "suit-jacket": "пиджак",
    "dress": "платье", "skirt": "юбку", "jumpsuit": "комбинезон",
    "pants": "брюки", "jeans": "джинсы", "shorts": "шорты",
    "sporty-pants": "спортивные брюки",
    "classic": "костюм", "knitted-suit": "вязаный костюм", "tracksuit": "спортивный костюм",
    "coat": "пальто", "jacket": "куртку", "parka": "парку",
    "puffer-jacket": "пуховик", "fur-coat": "шубу", "sheepskin-coat": "дублёнку",
    "shoes": "туфли", "boots": "ботинки", "sneakers": "кроссовки/кеды",
    "sandals": "босоножки",
    "bag": "сумку", "hat": "головной убор", "scarf": "шарф", "belt": "ремень",
    "sunglasses": "очки", "watch": "часы", "jewellery": "украшение",
}


def build_prompt(chunk: list) -> str:
    lines = []
    for i, it in enumerate(chunk[:4]):
        what = TYPE_RU.get(it.get("ct") or "", "вещь")
        lines.append(
            f"- {CELLS[i]} квадрант входа: возьми ТОЛЬКО {what} — «{it['name']}». "
            f"Остальную одежду с этого кадра игнорируй полностью. "
            f"Нарисуй эту вещь в {CELLS[i]} квадранте выхода."
        )
    for i in range(len(chunk), 4):
        lines.append(f"- {CELLS[i]} квадрант: пустой, только ровный фон.")
    return (
        "На входном изображении — сетка 2x2 из четырёх фотографий товара, "
        "на каждой человек в одежде.\n\n"
        "Верни ОДНО квадратное изображение, разделённое на строгую сетку 2x2 из "
        "четырёх равных квадрантов на нейтральном светло-сером фоне.\n"
        "В каждом квадранте выхода — предметная съёмка сверху (flat-lay) ровно "
        "ОДНОЙ названной ниже вещи из СООТВЕТСТВУЮЩЕГО квадранта входа. "
        "На каждом кадре входа человек одет целиком — рисовать нужно только "
        "названную вещь, а не весь образ. Позиция квадранта сохраняется строго."
        "\n\n" + "\n".join(lines) +
        "\n\nКаждая вещь: разложена плоско и симметрично, рукава расправлены, "
        "видна целиком, без человека, манекена, реквизита, бирок и текста. "
        "Точно сохрани цвет, принт и фактуру исходной вещи. Мягкий ровный свет, "
        "чёткие края, без резких теней."
    )


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    items = json.load(open("/tmp/flatlay_items.json"))
    print(f"вещей на пересъёмку: {len(items)}")

    chunks = [items[i:i + 4] for i in range(0, len(items), 4)]
    calls = 0
    for ci, chunk in enumerate(chunks):
        srcs = []
        for it in chunk:
            try:
                srcs.append(fetch(it["image_url"]))
            except Exception as e:
                print(f"  !! не скачалась {it['id']}: {e}")
                srcs.append(Image.new("RGB", (512, 512), (235, 235, 235)))
        src_uri = collage(srcs)

        # Коллаж-исходник — чтобы было с чем сравнивать глазами
        base64_body = src_uri.split(",", 1)[1]
        open(f"{OUT_DIR}/chunk{ci}_input.jpg", "wb").write(base64.b64decode(base64_body))

        try:
            res = await _openrouter_chat(
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": build_prompt(chunk)},
                    {"type": "image_url", "image_url": {"url": src_uri}},
                ]}],
                model=FLATLAY_MODEL,
                temperature=0.8,
                modalities=["image", "text"],
                image_config={"aspect_ratio": "1:1"},
            )
            calls += 1
        except Exception as e:
            print(f"  !! генерация упала: {e}")
            continue

        imgs = res.get("choices", [{}])[0].get("message", {}).get("images", [])
        if not imgs:
            print(f"  !! чанк {ci}: модель не вернула картинку")
            continue
        grid_uri = imgs[0].get("image_url", {}).get("url", "")
        open(f"{OUT_DIR}/chunk{ci}_grid.png", "wb").write(
            base64.b64decode(grid_uri.split(",", 1)[1]))

        for i, piece in enumerate(_split_grid(grid_uri, len(chunk))):
            if not piece:
                print(f"  !! чанк {ci} квадрант {i}: не нарезался")
                continue
            iid = chunk[i]["id"]
            open(f"{OUT_DIR}/item_{iid}_after.png", "wb").write(
                base64.b64decode(piece.split(",", 1)[1]))
        print(f"  чанк {ci}: ок, {len(chunk)} вещей одним вызовом")

    print(f"\nвызовов генерации: {calls} вместо {len(items)} поштучно")
    print(f"экономия: {len(items) / max(calls, 1):.1f}x")
    print(f"результаты: {OUT_DIR}")


asyncio.run(main())

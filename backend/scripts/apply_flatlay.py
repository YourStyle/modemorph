#!/usr/bin/env python3
"""Пересъёмка каталожных вещей в flat-lay сеткой 2x2 и запись в каталог.

Продолжение test_flatlay_grid.py, который доказал, что подход работает: 9 вещей
за 3 вызова вместо 9, и во всех девяти модель взяла правильную вещь. Здесь то же
самое, но с загрузкой в S3 и обновлением wardrobe_items.image_url.

Почему сеткой. Генерация картинки стоит фиксированно ~1120 токенов выхода
независимо от содержимого, поэтому четыре отдельных вызова стоят вчетверо
дороже одного, рисующего четыре вещи. Оцифровка фото так работает с 2026-08-22.

Почему нужно называть вещь. На карточке товара человек одет целиком — без явного
указания «возьми ТОЛЬКО брюки» модель вольна нарисовать любую вещь с кадра.
Указываем и канонический тип, и название товара.

Запуск в контейнере backend (там прокси до OpenRouter и ключи S3):
    docker exec -i modemorph-backend python3 /tmp/apply_flatlay.py --ids 1,2,3
    docker exec -i modemorph-backend python3 /tmp/apply_flatlay.py --ids ... --commit

Без --commit ничего не пишет: генерирует, считает деньги и печатает, что было бы
сделано. С --commit печатает SQL для отката.
"""

import argparse
import asyncio
import base64
import io
import json
import os
import sys
import urllib.request

sys.path.insert(0, "/app")

from PIL import Image  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.api.misc import (  # noqa: E402
    FLATLAY_MODEL,
    _openrouter_chat,
    _split_grid,
    _upload_base64_to_s3,
)
from app.core.database import async_session as async_session_maker  # noqa: E402

CELLS = ("верхний-левый", "верхний-правый", "нижний-левый", "нижний-правый")
S3_FOLDER = "flatlay"

# Канонический слаг -> как назвать вещь модели. Без этого приходится полагаться
# на название товара, а оно бывает бесполезным («WIDE LEG», «COS 1024»).
TYPE_RU = {
    "t-shirt": "футболку", "shirt": "рубашку", "blouse": "блузку",
    "longsleeve": "лонгслив", "tank-top": "майку/топ", "turtleneck": "водолазку",
    "pullover": "свитер", "cardigan": "кардиган", "hoodie": "худи",
    "sweatshirt": "свитшот", "vest": "жилет", "suit-jacket": "пиджак",
    "dress": "платье", "skirt": "юбку", "jumpsuit": "комбинезон",
    "pants": "брюки", "jeans": "джинсы", "shorts": "шорты",
    "sporty-pants": "спортивные брюки",
    "classic": "костюм", "knitted-suit": "вязаный костюм",
    "tracksuit": "спортивный костюм",
    "coat": "пальто", "jacket": "куртку", "parka": "парку",
    "puffer-jacket": "пуховик", "fur-coat": "шубу", "sheepskin-coat": "дублёнку",
    "shoes": "туфли", "boots": "ботинки", "sneakers": "кроссовки/кеды",
    "sandals": "босоножки",
    "bag": "сумку", "hat": "головной убор", "scarf": "шарф", "belt": "ремень",
    "sunglasses": "очки", "watch": "часы", "jewellery": "украшение",
}


# Картинки магазинов тянем МИМО прокси. У контейнера HTTPS_PROXY указывает на
# VPN-хоп, который нужен только OpenRouter; sela.ru и ЦУМ доступны напрямую.
# Пока скачивание шло через туннель, каждый его флап ронял целую сетку из
# четырёх вещей ещё до генерации — так в первом прогоне потерялось 40 вещей.
_direct = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def fetch_image(url: str) -> Image.Image:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with _direct.open(req, timeout=40) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


def collage(images: list, cell: int = 512) -> str:
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


def build_prompt(chunk: list) -> str:
    lines = []
    for i, it in enumerate(chunk[:4]):
        what = TYPE_RU.get(it.get("clothing_type") or "", "вещь")
        lines.append(
            f"- {CELLS[i]} квадрант входа: возьми ТОЛЬКО {what} — «{it['item_name']}». "
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


async def real_cost(gen_id: str) -> float | None:
    """Реальная стоимость вызова из OpenRouter. None, если не отдали."""
    if not gen_id:
        return None
    key = os.environ.get("OPENROUTER_API_KEY")
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"https": proxy, "http": proxy}) if proxy
        else urllib.request.BaseHandler()
    )
    for _ in range(4):
        await asyncio.sleep(2)
        try:
            req = urllib.request.Request(
                f"https://openrouter.ai/api/v1/generation?id={gen_id}",
                headers={"Authorization": f"Bearer {key}"})
            data = json.load(opener.open(req, timeout=30))["data"]
            if data.get("total_cost") is not None:
                return float(data["total_cost"])
        except Exception:
            pass
    return None


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", help="id вещей через запятую")
    ap.add_argument("--ids-file", help="файл с id по одному в строке")
    ap.add_argument("--visible-outfits", action="store_true",
                    help="все вещи из ВИДИМЫХ образов витрины, у которых ещё нет flat-lay")
    ap.add_argument("--commit", action="store_true", help="записать в S3 и базу")
    ap.add_argument("--max-cost-usd", type=float, default=1.0)
    args = ap.parse_args()

    async with async_session_maker() as db:
        if args.visible_outfits:
            # Вещи из образов, которые реально показываются в ленте, и у которых
            # картинка ещё не пересобрана. Порядок по типу — чтобы в одну сетку
            # попадали однородные вещи: модели проще держать общий план.
            rows = (await db.execute(text("""
                SELECT DISTINCT w.id, w.item_name, w.image_url, w.clothing_type
                FROM outfits o
                JOIN outfit_items oi ON oi.outfit_id = o.id
                JOIN wardrobe_items w ON w.id = oi.wardrobe_item_id
                WHERE (o.preview_image_url LIKE '%/lookbook/%'
                       OR o.preview_image_url LIKE '%/upload-%')
                  AND COALESCE(w.is_hidden, false) = false
                  AND COALESCE(w.is_kids, false) = false
                  AND w.image_url NOT LIKE '%/flatlay/%'
                ORDER BY w.clothing_type, w.id
            """))).mappings().all()
        else:
            if args.ids_file:
                ids = [int(x) for x in open(args.ids_file).read().split() if x.strip()]
            else:
                ids = [int(x) for x in (args.ids or "").split(",") if x.strip()]
            if not ids:
                raise SystemExit("нужен --ids, --ids-file или --visible-outfits")
            rows = (await db.execute(
                text("SELECT id, item_name, image_url, clothing_type FROM wardrobe_items "
                     "WHERE id = ANY(:ids) ORDER BY clothing_type, id"),
                {"ids": ids},
            )).mappings().all()
        items = [dict(r) for r in rows]

    print(f"вещей: {len(items)}  |  режим: {'ЗАПИСЬ' if args.commit else 'сухой прогон'}")
    chunks = [items[i:i + 4] for i in range(0, len(items), 4)]
    spent, updates, failures = 0.0, [], []

    for ci, chunk in enumerate(chunks):
        if spent >= args.max_cost_usd:
            print(f"  бюджет ${args.max_cost_usd} исчерпан — останавливаюсь")
            break
        # Качаем ПОШТУЧНО и битую вещь выбрасываем из сетки. Раньше здесь стоял
        # один list comprehension, и первый же 404 (у мерчанта пропал товар)
        # ронял весь чанк: четыре вещи помечались провалившимися из-за одной.
        srcs, kept = [], []
        for it in chunk:
            try:
                srcs.append(fetch_image(it["image_url"]))
                kept.append(it)
            except Exception as e:
                print(f"  !! вещь {it['id']}: исходник не скачался: {str(e)[:60]}")
                failures.append(it["id"])
        if not kept:
            continue
        chunk = kept

        try:
            res = await _openrouter_chat(
                messages=[{"role": "user", "content": [
                    {"type": "text", "text": build_prompt(chunk)},
                    {"type": "image_url", "image_url": {"url": collage(srcs)}},
                ]}],
                model=FLATLAY_MODEL, temperature=0.8,
                modalities=["image", "text"], image_config={"aspect_ratio": "1:1"},
            )
        except Exception as e:
            print(f"  !! чанк {ci}: генерация упала: {e}")
            failures += [it["id"] for it in chunk]
            continue

        cost = await real_cost(res.get("id", ""))
        spent += cost if cost is not None else 0.0
        imgs = res.get("choices", [{}])[0].get("message", {}).get("images", [])
        if not imgs:
            print(f"  !! чанк {ci}: модель не вернула картинку")
            failures += [it["id"] for it in chunk]
            continue

        pieces = _split_grid(imgs[0].get("image_url", {}).get("url", ""), len(chunk))
        for it, piece in zip(chunk, pieces):
            if not piece:
                failures.append(it["id"])
                continue
            if args.commit:
                url = await _upload_base64_to_s3(piece, folder=S3_FOLDER)
                if url.startswith("data:"):
                    print(f"  !! {it['id']}: S3 не принял, пропускаю")
                    failures.append(it["id"])
                    continue
            else:
                url = "(сухой прогон)"
            updates.append((it["id"], it["image_url"], url))
        print(f"  чанк {ci}: {len(chunk)} вещей, "
              f"${cost if cost is not None else '?'} за вызов")

    if args.commit and updates:
        async with async_session_maker() as db:
            for iid, _old, new in updates:
                await db.execute(
                    text("UPDATE wardrobe_items SET image_url = :u, updated_at = NOW() "
                         "WHERE id = :i"),
                    {"u": new, "i": iid},
                )
            await db.commit()

    print(f"\nобновлено: {len(updates)}  |  не вышло: {len(failures)} {failures or ''}")
    print(f"вызовов: {len(chunks)} вместо {len(items)} поштучно  |  потрачено: ${spent:.4f}")
    if args.commit and updates:
        print("\n-- ОТКАТ (сохрани это):")
        for iid, old, _new in updates:
            print(f"UPDATE wardrobe_items SET image_url = '{old}' WHERE id = {iid};")


asyncio.run(main())

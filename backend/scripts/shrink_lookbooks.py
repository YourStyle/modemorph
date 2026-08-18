#!/usr/bin/env python3
"""Пережать кадры лукбука: полноразмерный кадр и миниатюра для кружков.

Зачем. Замер 2026-08-18: кадры лежали в S3 как их отдала модель — ~700 КБ на
штуку. В next.config.mjs стоит images.unoptimized, то есть Next их не ужимает,
и в кружок 56x56 грузилось 700 КБ; шесть кружков — 4,2 МБ, отсюда «у кружочков
нет фото» и медленная лента.

Что делает: скачивает кадр, кладёт обратно уменьшенную версию (высота до 1200,
JPEG q82) и отдельную миниатюру (высота 240, q78), проставляет outfits
.preview_image_url и .preview_thumb_url. ИИ не задействован — денег не стоит.

Запуск в контейнере backend:
    docker exec -i modemorph-backend python3 - < shrink_lookbooks.py            # dry-run
    docker exec -i modemorph-backend python3 - < shrink_lookbooks.py --commit

Селфчек чистой части (без сети и базы):
    PYTHONPATH=backend python3 backend/scripts/shrink_lookbooks.py --self-check
"""

import argparse
import asyncio
import io
import sys

FULL_MAX_H = 1200
# Кружок ретинового телефона — 56pt, то есть до 168 физических пикселей.
# 240 берём с запасом на планшет: дешевле один раз пережать с запасом.
THUMB_SIZE = 240
FULL_QUALITY = 82
THUMB_QUALITY = 78


def thumb_crop_box(w: int, h: int) -> tuple[int, int, int, int]:
    """Квадрат «голова + торс» для кружка. Чистая функция.

    Кружок — 56 точек. Полноростовой кадр 3:4, ужатый в такой круг, читается как
    мелкая фигурка: одежду, ради которой кружок и существует, не разглядеть.
    Берём квадрат со стороной 55% высоты, отступив 5% сверху — это голова, плечи
    и корпус примерно до пояса. По горизонтали центрируем: модель в кадре стоит
    по центру.

    Сторона ограничена шириной кадра — иначе на узком исходнике квадрат вылезет
    за края и Pillow вернёт чёрные поля.
    """
    side = min(int(h * 0.55), w)
    left = max(0, (w - side) // 2)
    top = min(int(h * 0.05), max(0, h - side))
    return (left, top, left + side, top + side)


def crop_thumb(data: bytes, size: int, quality: int) -> bytes:
    """Квадратная миниатюра «голова + торс» для кружка витрины."""
    from PIL import Image

    img = Image.open(io.BytesIO(data))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img = img.crop(thumb_crop_box(*img.size)).resize((size, size), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=quality, optimize=True, progressive=True)
    return out.getvalue()


def resize_jpeg(data: bytes, max_h: int, quality: int) -> bytes:
    """Чистая функция: ужать по высоте с сохранением пропорций, вернуть JPEG.

    Картинка меньше лимита не увеличивается — апскейл только раздул бы файл.
    """
    from PIL import Image

    img = Image.open(io.BytesIO(data))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    w, h = img.size
    if h > max_h:
        img = img.resize((max(1, round(w * max_h / h)), max_h), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=quality, optimize=True, progressive=True)
    return out.getvalue()


async def main(commit: bool, force: bool) -> None:
    import httpx
    from sqlalchemy import text
    from app.core.database import async_session
    from app.api.misc import _upload_base64_to_s3
    import base64

    async with async_session() as db:
        rows = (await db.execute(text("""
            SELECT id, preview_image_url FROM outfits
            WHERE preview_image_url LIKE '%/lookbook/%'
              AND (preview_thumb_url IS NULL OR :force)
            ORDER BY id
        """), {"force": force})).mappings().all()

        print(f"[shrink] кадров к обработке: {len(rows)}", file=sys.stderr)
        saved_before = saved_after = 0

        # trust_env=False: у backend в окружении HTTPS_PROXY для OpenRouter,
        # S3 через него гонять незачем.
        async with httpx.AsyncClient(timeout=60.0, trust_env=False) as client:
            for r in rows:
                try:
                    resp = await client.get(r["preview_image_url"])
                    if resp.status_code != 200:
                        print(f"[warn] {r['id']}: HTTP {resp.status_code}", file=sys.stderr)
                        continue
                    src = resp.content
                    full = resize_jpeg(src, FULL_MAX_H, FULL_QUALITY)
                    thumb = crop_thumb(src, THUMB_SIZE, THUMB_QUALITY)
                except Exception as e:
                    print(f"[warn] {r['id']}: {e}", file=sys.stderr)
                    continue

                saved_before += len(src)
                saved_after += len(full) + len(thumb)
                print(f"  {r['id']}: {len(src)//1024} КБ -> {len(full)//1024} КБ "
                      f"+ миниатюра {len(thumb)//1024} КБ", file=sys.stderr)

                if not commit:
                    continue

                full_uri = "data:image/jpeg;base64," + base64.b64encode(full).decode()
                thumb_uri = "data:image/jpeg;base64," + base64.b64encode(thumb).decode()
                full_url = await _upload_base64_to_s3(full_uri, folder="lookbook")
                thumb_url = await _upload_base64_to_s3(thumb_uri, folder="lookbook/thumb")
                if full_url.startswith("data:") or thumb_url.startswith("data:"):
                    print(f"[warn] {r['id']}: S3 недоступен, пропуск", file=sys.stderr)
                    continue
                await db.execute(text(
                    "UPDATE outfits SET preview_image_url = :f, preview_thumb_url = :t WHERE id = :i"
                ), {"f": full_url, "t": thumb_url, "i": r["id"]})
                await db.commit()

        if saved_before:
            print(f"[shrink] было {saved_before//1024} КБ, стало {saved_after//1024} КБ "
                  f"({100 - saved_after * 100 // saved_before}% экономии)", file=sys.stderr)


def _self_check() -> None:
    from PIL import Image

    def make(w: int, h: int) -> bytes:
        buf = io.BytesIO()
        # Шумная картинка: одноцветная сожмётся в пару байт и ничего не покажет.
        img = Image.new("RGB", (w, h))
        img.putdata([((x * 7) % 256, (y * 13) % 256, (x * y) % 256)
                     for y in range(h) for x in range(w)])
        img.save(buf, format="JPEG", quality=95)
        return buf.getvalue()

    src = make(900, 1200)
    thumb = crop_thumb(src, THUMB_SIZE, THUMB_QUALITY)
    assert Image.open(io.BytesIO(thumb)).size == (240, 240), Image.open(io.BytesIO(thumb)).size
    assert len(thumb) < len(src), (len(thumb), len(src))

    # Кроп кружка: квадрат «голова + торс», а не вся фигура.
    assert thumb_crop_box(900, 1200) == (120, 60, 780, 720), thumb_crop_box(900, 1200)
    l, t, r, b = thumb_crop_box(900, 1200)
    assert r - l == b - t, "кроп обязан быть квадратным, иначе кружок исказит пропорции"
    assert t < 1200 * 0.5, "торс, а не ноги"

    # Узкий кадр: сторона упирается в ширину, квадрат не вылезает за края —
    # иначе Pillow дорисует чёрные поля.
    l, t, r, b = thumb_crop_box(300, 1200)
    assert (l, r) == (0, 300) and r - l == b - t and b <= 1200, (l, t, r, b)
    # И на таком кадре миниатюра всё ещё квадратная, без чёрных полос.
    narrow = crop_thumb(make(300, 1200), THUMB_SIZE, THUMB_QUALITY)
    assert Image.open(io.BytesIO(narrow)).size == (240, 240)

    # Горизонтальный кадр: сторона ограничена высотой, отступ сверху не уводит
    # квадрат за нижний край.
    l, t, r, b = thumb_crop_box(1600, 800)
    assert r - l == b - t and b <= 800, (l, t, r, b)

    # Пропорции сохраняются на неквадратном исходнике.
    wide = resize_jpeg(make(1600, 800), 240, THUMB_QUALITY)
    assert Image.open(io.BytesIO(wide)).size == (480, 240), Image.open(io.BytesIO(wide)).size

    # Меньше лимита — не растягиваем: апскейл только раздул бы файл.
    small = make(100, 150)
    assert Image.open(io.BytesIO(resize_jpeg(small, 1200, FULL_QUALITY))).size == (100, 150)

    # PNG с прозрачностью не роняет конвертацию в JPEG — ни в одном из путей.
    buf = io.BytesIO()
    Image.new("RGBA", (300, 400), (10, 20, 30, 128)).save(buf, format="PNG")
    assert Image.open(io.BytesIO(resize_jpeg(buf.getvalue(), 240, 78))).size == (180, 240)
    assert Image.open(io.BytesIO(crop_thumb(buf.getvalue(), 64, 78))).size == (64, 64)

    print("shrink_lookbooks self-check OK")


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        _self_check()
    else:
        ap = argparse.ArgumentParser()
        ap.add_argument("--commit", action="store_true", help="писать в S3 и БД")
        # Осторожно: --force пережимает уже пережатый JPEG заново, то есть каждый
        # прогон добавляет поколение потерь. Обычный режим пропускает готовые.
        ap.add_argument("--force", action="store_true",
                        help="переделать и те, у кого миниатюра уже есть (повторное сжатие JPEG)")
        a = ap.parse_args()
        asyncio.run(main(a.commit, a.force))

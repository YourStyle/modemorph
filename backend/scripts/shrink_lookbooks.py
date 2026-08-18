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
THUMB_MAX_H = 240
FULL_QUALITY = 82
THUMB_QUALITY = 78
# Кружок ретинового телефона — 56pt, то есть до 168 физических пикселей.
# 240 берём с запасом на планшет, дешевле пережимать один раз с запасом.


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


async def main(commit: bool) -> None:
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
        """), {"force": False})).mappings().all()

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
                    thumb = resize_jpeg(src, THUMB_MAX_H, THUMB_QUALITY)
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
    thumb = resize_jpeg(src, THUMB_MAX_H, THUMB_QUALITY)
    assert Image.open(io.BytesIO(thumb)).size == (180, 240), Image.open(io.BytesIO(thumb)).size
    assert len(thumb) < len(src), (len(thumb), len(src))

    # Пропорции сохраняются на неквадратном исходнике.
    wide = resize_jpeg(make(1600, 800), 240, THUMB_QUALITY)
    assert Image.open(io.BytesIO(wide)).size == (480, 240), Image.open(io.BytesIO(wide)).size

    # Меньше лимита — не растягиваем: апскейл только раздул бы файл.
    small = make(100, 150)
    assert Image.open(io.BytesIO(resize_jpeg(small, 1200, FULL_QUALITY))).size == (100, 150)

    # PNG с прозрачностью не роняет конвертацию в JPEG.
    buf = io.BytesIO()
    Image.new("RGBA", (300, 400), (10, 20, 30, 128)).save(buf, format="PNG")
    assert Image.open(io.BytesIO(resize_jpeg(buf.getvalue(), 240, 78))).size == (180, 240)

    print("shrink_lookbooks self-check OK")


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        _self_check()
    else:
        ap = argparse.ArgumentParser()
        ap.add_argument("--commit", action="store_true", help="писать в S3 и БД")
        asyncio.run(main(ap.parse_args().commit))

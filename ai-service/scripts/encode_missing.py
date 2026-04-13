#!/usr/bin/env python3
"""Encode embeddings for items missing them, skipping broken URLs."""

import asyncio
import io
import logging
import os
import sys

import asyncpg
import httpx
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from clip.encoder import CLIPEncoderService

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://modemorph:modemorph@postgres:5432/modemorph")


async def main():
    logger.info("Loading CLIP model...")
    encoder = CLIPEncoderService()

    dsn = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    pool = await asyncpg.create_pool(dsn, min_size=2, max_size=5)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, image_url FROM wardrobe_items "
            "WHERE embedding IS NULL AND image_url IS NOT NULL "
            "AND image_url NOT LIKE '%yandexcloud%/original/%' "
            "ORDER BY id LIMIT 5000"
        )

    logger.info(f"Found {len(rows)} items to encode")
    encoded = 0
    failed = 0

    async with httpx.AsyncClient(timeout=20.0) as client:
        for i, row in enumerate(rows):
            try:
                r = await client.get(row["image_url"])
                r.raise_for_status()
                img = Image.open(io.BytesIO(r.content)).convert("RGB")
                emb = encoder.encode_image(img)

                emb_str = "{" + ",".join(str(x) for x in emb.tolist()) + "}"
                async with pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE wardrobe_items SET embedding = $1 WHERE id = $2",
                        emb_str, row["id"],
                    )
                encoded += 1

                if (i + 1) % 50 == 0:
                    logger.info(f"  Progress: {i + 1}/{len(rows)}, encoded={encoded}, failed={failed}")
            except Exception as e:
                failed += 1
                if failed <= 10:
                    logger.warning(f"  Failed item {row['id']}: {e}")

    await pool.close()
    logger.info(f"DONE: encoded={encoded}, failed={failed}")


if __name__ == "__main__":
    asyncio.run(main())

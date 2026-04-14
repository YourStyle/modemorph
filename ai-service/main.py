import os
import logging
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI

from clip.encoder import CLIPEncoderService
from clip.index import FAISSIndexService
from clip.profile import UserClusterService
from clip.routes import router as clip_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://modemorph:modemorph@localhost:5432/modemorph",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    logger.info("Loading FashionCLIP model...")
    app.state.encoder = CLIPEncoderService()
    logger.info(f"FashionCLIP loaded — dim={app.state.encoder.dim}, device={app.state.encoder.device}")

    app.state.faiss_index = FAISSIndexService()
    logger.info(f"FAISS index loaded — {app.state.faiss_index.size} vectors")

    app.state.cluster_service = UserClusterService()
    logger.info("User cluster service loaded")

    # Connect to PostgreSQL
    dsn = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    app.state.db_pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)
    logger.info("PostgreSQL pool created")

    # Auto-build index if empty
    if app.state.faiss_index.size == 0:
        logger.info("FAISS index empty — triggering auto-build...")
        try:
            await _auto_build_index(app)
        except Exception as e:
            logger.error(f"Auto-build failed (will retry via /clip/build-index): {e}")

    yield

    # --- Shutdown ---
    await app.state.db_pool.close()
    logger.info("Shutdown complete")


async def _auto_build_index(app: FastAPI):
    """Build FAISS index from wardrobe_items that already have embeddings."""
    pool = app.state.db_pool
    faiss_index = app.state.faiss_index

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, item_name, image_url, clothing_type, color, embedding "
            "FROM wardrobe_items WHERE embedding IS NOT NULL"
        )

    if not rows:
        logger.info("No pre-encoded items in DB, index stays empty")
        return

    items = []
    for r in rows:
        emb = [float(x) for x in r["embedding"]]
        items.append({
            "id": r["id"],
            "item_name": r["item_name"],
            "image_url": r["image_url"],
            "clothing_type": r["clothing_type"],
            "color": r["color"],
            "embedding": emb,
        })

    count = faiss_index.build(items)
    logger.info(f"Auto-built FAISS index: {count} vectors from {len(rows)} DB rows")


app = FastAPI(title="ModeMorph AI", version="1.0.0", lifespan=lifespan)
app.include_router(clip_router, prefix="/clip")


@app.get("/health")
def health():
    index_size = app.state.faiss_index.size if hasattr(app.state, "faiss_index") else 0
    return {"status": "ok", "index_size": index_size}

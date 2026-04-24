"""OutfitTransformer compatibility scoring service.

Wraps the vendored owj0421/outfit-transformer (MIT license) OutfitCLIPTransformer
to provide a production-friendly API for our FastAPI ai-service:

  - download + cache the pre-trained checkpoint (1.1 GB) on first start
  - load OutfitCLIPTransformer with FashionCLIP backbone (same model as our
    existing CLIP encoder — so we can share the HF cache)
  - score(item_rows) -> float in [0, 1] — compatibility of the given outfit
  - score_batch(outfits) -> list[float]

Inference path used (by design):
  Given item rows from our DB (id, image_url, item_name, ...),
  download images, build FashionItem objects, feed to OutfitTransformer.
  This is slower than a precomputed-embedding path but requires no schema
  changes and no per-item backfill. The precomputed path can be added
  later by storing a 1024-dim OT embedding on each wardrobe item.
"""
from __future__ import annotations

import io
import logging
import os
import time
import zipfile
from pathlib import Path
from typing import List, Optional

import httpx
import torch
from PIL import Image

logger = logging.getLogger(__name__)

# Where the checkpoint lives inside the container (mounted as a docker volume
# so it survives container rebuilds).
CHECKPOINT_DIR = Path(os.environ.get("OUTFIT_TRANSFORMER_DIR", "/data/outfit_transformer"))
CHECKPOINT_FILE = CHECKPOINT_DIR / "checkpoint.pt"
# Set to the actual checkpoint path inside the unzipped bundle. The upstream
# zip contains several checkpoints; the one we want is the CLIP CP model.
# If the unzipped layout changes upstream we'll need to adjust this glob.
# Upstream ships checkpoints directly in the root of the zip with .pth
# extensions and a typo — "compatibillity" with two l's. We match both the
# typo and the correct spelling in case they fix it later, and we
# explicitly prefer the CP (Compatibility Prediction) checkpoint since the
# complementary-retrieval variant is fine-tuned further and scores
# differently on compatibility tasks.
CHECKPOINT_CANDIDATE_GLOBS = [
    "**/compatibillity*clip*best*.pth",  # current upstream filename (typo kept as-is)
    "**/compatibility*clip*best*.pth",
    "**/compatibillity*.pth",
    "**/compatibility*.pth",
    "**/*clip*compatibility*.pt*",
    "**/outfit_clip_transformer*best*.pt*",
    "**/best*.pt*",                       # last-resort fallback
]
GDRIVE_CHECKPOINT_ID = "1mzNqGBmd8UjVJjKwVa5GdGYHKutZKSSi"

# FashionCLIP backbone — same model used by the existing CLIPEncoderService.
# Reusing the same name means HuggingFace cache is shared, no extra download.
FASHION_CLIP_MODEL = "patrickjohncyh/fashion-clip"


def _ensure_checkpoint() -> Optional[Path]:
    """Download + unzip the OutfitTransformer checkpoint if missing. Returns
    the path to the .pt file we'll load, or None if download failed."""
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    if CHECKPOINT_FILE.exists() and CHECKPOINT_FILE.stat().st_size > 10_000_000:
        logger.info(f"[OutfitTransformer] Using cached checkpoint at {CHECKPOINT_FILE}")
        return CHECKPOINT_FILE

    zip_path = CHECKPOINT_DIR / "checkpoints.zip"
    try:
        # Lazy import so the service starts even if gdown isn't installed yet
        # in the running image (e.g. during a deploy race).
        import gdown
    except ImportError:
        logger.error("[OutfitTransformer] gdown not installed — cannot download checkpoint")
        return None

    try:
        logger.info(f"[OutfitTransformer] Downloading checkpoint ({GDRIVE_CHECKPOINT_ID})...")
        url = f"https://drive.google.com/uc?id={GDRIVE_CHECKPOINT_ID}"
        gdown.download(url, str(zip_path), quiet=False)
    except Exception as e:
        logger.error(f"[OutfitTransformer] gdown failed: {e}")
        return None

    if not zip_path.exists() or zip_path.stat().st_size < 10_000_000:
        logger.error(f"[OutfitTransformer] Download produced no file or too small")
        return None

    try:
        logger.info(f"[OutfitTransformer] Unzipping {zip_path}...")
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(CHECKPOINT_DIR)
        zip_path.unlink(missing_ok=True)
    except Exception as e:
        logger.error(f"[OutfitTransformer] Unzip failed: {e}")
        return None

    # Find the best candidate .pt file across all the globs we know about
    found = None
    for pattern in CHECKPOINT_CANDIDATE_GLOBS:
        hits = list(CHECKPOINT_DIR.glob(pattern))
        if hits:
            # Prefer the largest file (usually the full model with optimizer state)
            hits.sort(key=lambda p: p.stat().st_size, reverse=True)
            found = hits[0]
            break

    if not found:
        all_weights = (
            list(CHECKPOINT_DIR.rglob("*.pth")) + list(CHECKPOINT_DIR.rglob("*.pt"))
        )
        logger.error(
            f"[OutfitTransformer] Could not locate .pt/.pth file matching known "
            f"patterns in unzipped bundle. Weight files found: "
            f"{[str(p.relative_to(CHECKPOINT_DIR)) for p in all_weights[:10]]}"
        )
        return None

    # Symlink / copy to a stable path so reloads don't depend on zip layout
    try:
        if CHECKPOINT_FILE.exists():
            CHECKPOINT_FILE.unlink()
        CHECKPOINT_FILE.symlink_to(found.resolve())
        logger.info(f"[OutfitTransformer] Linked checkpoint: {found} -> {CHECKPOINT_FILE}")
    except OSError:
        # Symlink may fail on some filesystems — fall back to copy
        import shutil
        shutil.copy(found, CHECKPOINT_FILE)
        logger.info(f"[OutfitTransformer] Copied checkpoint: {found} -> {CHECKPOINT_FILE}")

    return CHECKPOINT_FILE


class OutfitTransformerService:
    """Loads OutfitCLIPTransformer lazily; exposes a small scoring API."""

    def __init__(self):
        self.model = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.loaded_at: Optional[str] = None
        self._load_error: Optional[str] = None

    def is_ready(self) -> bool:
        return self.model is not None

    def load(self, force: bool = False) -> bool:
        """Idempotent model load. Safe to call multiple times."""
        if self.model is not None and not force:
            return True

        ckpt_path = _ensure_checkpoint()
        if ckpt_path is None:
            self._load_error = "checkpoint_unavailable"
            return False

        try:
            from outfit_transformer.outfit_clip_transformer import (
                OutfitCLIPTransformer, OutfitCLIPTransformerConfig,
            )
        except Exception as e:
            self._load_error = f"import_failed: {e}"
            logger.error(f"[OutfitTransformer] import failed: {e}")
            return False

        try:
            logger.info(f"[OutfitTransformer] Building CLIP-based OutfitTransformer on {self.device}...")
            cfg = OutfitCLIPTransformerConfig(
                item_enc_clip_model_name=FASHION_CLIP_MODEL,
            )
            model = OutfitCLIPTransformer(cfg)
            model.to(self.device)

            logger.info(f"[OutfitTransformer] Loading state dict from {ckpt_path}...")
            state_dict = torch.load(str(ckpt_path), map_location=self.device)
            model_state_dict = state_dict.get("model", state_dict)

            # DDP checkpoints prefix keys with "module." — strip for plain loading.
            cleaned = {k.replace("module.", ""): v for k, v in model_state_dict.items()}
            missing, unexpected = model.load_state_dict(cleaned, strict=False)
            if missing:
                logger.warning(f"[OutfitTransformer] Missing keys (truncated): {list(missing)[:5]}")
            if unexpected:
                logger.warning(f"[OutfitTransformer] Unexpected keys (truncated): {list(unexpected)[:5]}")

            model.train(False)
            self.model = model
            self.loaded_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            self._load_error = None
            logger.info(f"[OutfitTransformer] Model ready on {self.device}")
            return True
        except Exception as e:
            self._load_error = f"load_failed: {e}"
            logger.exception(f"[OutfitTransformer] load failed: {e}")
            return False

    # Inference ----------------------------------------------------------

    async def _download_image(self, url: str, client: httpx.AsyncClient) -> Optional[Image.Image]:
        try:
            r = await client.get(url, timeout=15.0)
            r.raise_for_status()
            img = Image.open(io.BytesIO(r.content)).convert("RGB")
            return img
        except Exception as e:
            logger.warning(f"[OutfitTransformer] download failed {url}: {e}")
            return None

    async def score_outfit(self, items: List[dict]) -> Optional[dict]:
        """Score a single outfit's compatibility.

        items: list of {id, image_url, item_name, clothing_type, color, ...}
        Returns {score: float ∈ [0,1], n_items_used: int, details: {...}}
        or None if model not ready / all images failed.
        """
        if not self.is_ready() or not items:
            return None

        from outfit_transformer.datatypes import FashionItem, FashionCompatibilityQuery

        async with httpx.AsyncClient() as client:
            import asyncio
            imgs = await asyncio.gather(
                *[self._download_image(it.get("image_url"), client) for it in items]
            )

        fashion_items: List[FashionItem] = []
        skipped: List[int] = []
        for it, img in zip(items, imgs):
            if img is None:
                skipped.append(it.get("id"))
                continue
            desc_parts = [
                it.get("item_name") or "",
                it.get("clothing_type") or "",
                it.get("color") or "",
            ]
            description = " ".join(p for p in desc_parts if p).strip() or "clothing item"
            fashion_items.append(FashionItem(
                item_id=it.get("id"),
                category=it.get("clothing_type") or "",
                image=img,
                description=description,
            ))

        if len(fashion_items) < 2:
            return {
                "score": None, "n_items_used": len(fashion_items),
                "skipped": skipped, "reason": "need_at_least_2_items",
            }

        query = FashionCompatibilityQuery(outfit=fashion_items)
        try:
            with torch.no_grad():
                scores = self.model.predict_score([query])
            score_value = float(scores[0, 0].item())
        except Exception as e:
            logger.exception(f"[OutfitTransformer] predict_score failed: {e}")
            return None

        return {
            "score": score_value,
            "n_items_used": len(fashion_items),
            "skipped": skipped,
        }

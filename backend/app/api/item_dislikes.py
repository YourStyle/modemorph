"""
Item dislikes — users can dislike specific items to exclude them from future recommendations.
"""

import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


class DislikeRequest(BaseModel):
    item_id: int
    item_source: str = "wardrobe_items"  # 'wardrobe_items' or 'wardrobe_user_items'


@router.post("/dislike")
async def dislike_item(
    body: DislikeRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Dislike an item — it won't appear in future recommendations."""
    await db.execute(
        text("""
            INSERT INTO user_item_dislikes (user_id, item_id, item_source)
            VALUES (:uid, :iid, :src)
            ON CONFLICT (user_id, item_id, item_source) DO NOTHING
        """),
        {"uid": user["id"], "iid": body.item_id, "src": body.item_source},
    )
    await db.commit()
    logger.info(f"[Dislike] User {user['id'][:8]} disliked item {body.item_id} ({body.item_source})")
    return {"success": True}


@router.delete("/dislike")
async def undo_dislike(
    body: DislikeRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a dislike."""
    await db.execute(
        text("DELETE FROM user_item_dislikes WHERE user_id = :uid AND item_id = :iid AND item_source = :src"),
        {"uid": user["id"], "iid": body.item_id, "src": body.item_source},
    )
    await db.commit()
    return {"success": True}


@router.get("/dislikes")
async def get_dislikes(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disliked items with name and image, so they can be shown and undone.

    Resolved here rather than on the client: the join must be on the PAIR
    (item_id, item_source), because the id spaces of wardrobe_items and
    wardrobe_user_items overlap for older rows. A client-side lookup by bare id
    would show the wrong picture.
    """
    result = await db.execute(
        text("""
            SELECT d.item_id, d.item_source, w.item_name, w.image_url, d.created_at
            FROM user_item_dislikes d
            JOIN wardrobe_items w ON w.id = d.item_id
            WHERE d.user_id = :uid AND d.item_source = 'wardrobe_items'
            UNION ALL
            SELECT d.item_id, d.item_source, u.item_name, u.image_url, d.created_at
            FROM user_item_dislikes d
            JOIN wardrobe_user_items u ON u.id = d.item_id AND u.user_id = d.user_id
            WHERE d.user_id = :uid AND d.item_source = 'wardrobe_user_items'
            ORDER BY created_at DESC
        """),
        {"uid": user["id"]},
    )
    return [
        {
            "item_id": r["item_id"],
            "item_source": r["item_source"],
            "item_name": r["item_name"],
            "image_url": r["image_url"],
        }
        for r in result.mappings().all()
    ]

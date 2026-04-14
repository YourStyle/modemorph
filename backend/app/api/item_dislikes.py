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
    """Get all disliked item IDs."""
    result = await db.execute(
        text("SELECT item_id, item_source FROM user_item_dislikes WHERE user_id = :uid ORDER BY created_at DESC"),
        {"uid": user["id"]},
    )
    return [{"item_id": r[0], "item_source": r[1]} for r in result.all()]

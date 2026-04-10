"""
Outfits & looks endpoints.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


@router.get("")
async def get_outfits(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT o.*, array_agg(json_build_object(
                'id', oi.id, 'wardrobe_item_id', oi.wardrobe_item_id,
                'position', oi.position
            )) as items
            FROM outfits o
            LEFT JOIN outfit_items oi ON oi.outfit_id = o.id
            WHERE o.user_id = :uid
            GROUP BY o.id
            ORDER BY o.created_at DESC
        """),
        {"uid": user["id"]},
    )
    rows = result.mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.get("/inspiration")
async def get_inspiration(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get public outfits for inspiration feed."""
    offset = (page - 1) * limit
    result = await db.execute(
        text("""
            SELECT o.*,
                EXISTS(SELECT 1 FROM user_likes ul WHERE ul.outfit_id = o.id AND ul.user_id = :uid) as is_liked
            FROM outfits o
            WHERE o.is_public = true
            ORDER BY o.views_count DESC, o.created_at DESC
            LIMIT :lim OFFSET :off
        """),
        {"uid": user["id"], "lim": limit, "off": offset},
    )
    rows = result.mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.post("/{outfit_id}/like")
async def toggle_like(
    outfit_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check existing like
    existing = await db.execute(
        text("SELECT id FROM user_likes WHERE outfit_id = :oid AND user_id = :uid"),
        {"oid": outfit_id, "uid": user["id"]},
    )
    if existing.first():
        await db.execute(
            text("DELETE FROM user_likes WHERE outfit_id = :oid AND user_id = :uid"),
            {"oid": outfit_id, "uid": user["id"]},
        )
        liked = False
    else:
        await db.execute(
            text("INSERT INTO user_likes (outfit_id, user_id, created_at) VALUES (:oid, :uid, NOW())"),
            {"oid": outfit_id, "uid": user["id"]},
        )
        liked = True

    await db.commit()
    return {"liked": liked}


@router.post("/{outfit_id}/track-view")
async def track_view(
    outfit_id: int,
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("UPDATE outfits SET views_count = COALESCE(views_count, 0) + 1 WHERE id = :id"),
        {"id": outfit_id},
    )
    await db.commit()
    return {"success": True}


# User looks
@router.get("/looks")
async def get_user_looks(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT * FROM user_looks WHERE user_id = :uid ORDER BY created_at DESC"),
        {"uid": user["id"]},
    )
    rows = result.mappings().all()
    return {"data": [dict(r) for r in rows]}


class SaveLookRequest(BaseModel):
    title: str
    description: Optional[str] = None
    items: list = []
    image_url: Optional[str] = None


@router.post("/looks")
async def save_look(
    body: SaveLookRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import json
    result = await db.execute(
        text("""
            INSERT INTO user_looks (user_id, title, description, items, image_url, created_at)
            VALUES (:uid, :title, :desc, :items::jsonb, :img, NOW())
            RETURNING *
        """),
        {
            "uid": user["id"], "title": body.title, "desc": body.description,
            "items": json.dumps(body.items, ensure_ascii=False), "img": body.image_url,
        },
    )
    await db.commit()
    row = result.mappings().first()
    return {"data": dict(row)}


@router.delete("/looks/{look_id}")
async def delete_look(
    look_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("DELETE FROM user_looks WHERE id = :id AND user_id = :uid RETURNING id"),
        {"id": look_id, "uid": user["id"]},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Look not found")
    await db.commit()
    return {"success": True}

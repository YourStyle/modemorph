"""
Wardrobe endpoints — replaces all /api/wardrobe* Next.js routes.
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
async def get_wardrobe(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all wardrobe items for the current user."""
    result = await db.execute(
        text("""
            SELECT wui.*, wi.image_url as item_image_url, wi.item_name_en
            FROM wardrobe_user_items wui
            LEFT JOIN wardrobe_items wi ON wi.id = wui.wardrobe_item_id
            WHERE wui.user_id = :uid
            ORDER BY wui.created_at DESC
        """),
        {"uid": user["id"]},
    )
    rows = result.mappings().all()
    return {"data": [dict(r) for r in rows]}


@router.get("/count")
async def get_wardrobe_count(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT COUNT(*) as cnt FROM wardrobe_user_items WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    return {"count": result.scalar()}


@router.get("/types")
async def get_wardrobe_types(db: AsyncSession = Depends(get_db)):
    """Get distinct clothing types."""
    result = await db.execute(
        text("SELECT DISTINCT clothing_type FROM wardrobe_items WHERE clothing_type IS NOT NULL ORDER BY clothing_type")
    )
    return {"types": [r[0] for r in result.all()]}


class AddItemRequest(BaseModel):
    item_name: str
    description: Optional[str] = None
    color: Optional[str] = None
    shade: Optional[str] = None
    material: Optional[str] = None
    style: Optional[str] = None
    has_print: Optional[str] = None
    has_details: Optional[str] = None
    image_url: Optional[str] = None
    part: Optional[str] = None
    clothing_type: Optional[str] = None
    notes: Optional[str] = None


@router.post("/add")
async def add_wardrobe_item(
    body: AddItemRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a new item to wardrobe (creates wardrobe_items + wardrobe_user_items)."""
    # Create wardrobe_items entry
    wi_result = await db.execute(
        text("""
            INSERT INTO wardrobe_items (item_name, description, color, shade, material, style,
                has_print, has_details, image_url, part, clothing_type)
            VALUES (:name, :desc, :color, :shade, :material, :style,
                :print, :details, :image, :part, :ctype)
            RETURNING id
        """),
        {
            "name": body.item_name, "desc": body.description, "color": body.color,
            "shade": body.shade, "material": body.material, "style": body.style,
            "print": body.has_print, "details": body.has_details, "image": body.image_url,
            "part": body.part, "ctype": body.clothing_type,
        },
    )
    wardrobe_item_id = wi_result.scalar()

    # Create wardrobe_user_items link
    wui_result = await db.execute(
        text("""
            INSERT INTO wardrobe_user_items (user_id, wardrobe_item_id, item_name, description,
                color, shade, material, style, has_print, notes, image_url)
            VALUES (:uid, :wid, :name, :desc, :color, :shade, :material, :style, :print, :notes, :image)
            RETURNING *
        """),
        {
            "uid": user["id"], "wid": wardrobe_item_id, "name": body.item_name,
            "desc": body.description, "color": body.color, "shade": body.shade,
            "material": body.material, "style": body.style, "print": body.has_print,
            "notes": body.notes, "image": body.image_url,
        },
    )
    await db.commit()
    row = wui_result.mappings().first()
    return {"data": dict(row)}


@router.delete("/{item_id}")
async def delete_wardrobe_item(
    item_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("DELETE FROM wardrobe_user_items WHERE id = :id AND user_id = :uid RETURNING id"),
        {"id": item_id, "uid": user["id"]},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Item not found")
    await db.commit()
    return {"success": True}

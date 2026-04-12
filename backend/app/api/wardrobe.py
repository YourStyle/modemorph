"""
Wardrobe endpoints — /api/wardrobe/*
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()

# Columns without embedding
WUI_COLS = """id, user_id, item_name, size_type, material, style, has_print,
    color, shade, has_details, url, created_at, updated_at, is_basic,
    basic_item_id, notes, basic_material_id, is_hidden, image_url,
    shop_url, clothing_type, item_name_en, description, description_en,
    temp_min, temp_max"""


@router.get("")
async def get_wardrobe(
    search: str = Query(""),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Admins see the catalog (wardrobe_items), regular users see their items
    if user.get("is_admin"):
        sql = "SELECT * FROM wardrobe_items WHERE 1=1"
        binds: dict = {}
        if search:
            sql += " AND (item_name ILIKE :s OR clothing_type ILIKE :s OR color ILIKE :s)"
            binds["s"] = f"%{search}%"
        sql += " ORDER BY id DESC LIMIT 500"
        result = await db.execute(text(sql), binds)
        items = [dict(r) for r in result.mappings().all()]
        return {"items": items}

    result = await db.execute(
        text(f"SELECT {WUI_COLS} FROM wardrobe_user_items WHERE user_id = :uid ORDER BY created_at DESC"),
        {"uid": user["id"]},
    )
    items = [dict(r) for r in result.mappings().all()]
    return {"items": items, "data": items}


@router.get("/count")
async def get_wardrobe_count(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("SELECT COUNT(*) FROM wardrobe_user_items WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    return {"count": result.scalar()}


@router.get("/types")
async def get_wardrobe_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT DISTINCT clothing_type FROM wardrobe_items WHERE clothing_type IS NOT NULL ORDER BY clothing_type")
    )
    return {"types": [r[0] for r in result.all()]}


@router.get("/visibility")
async def get_visibility(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: get item visibility."""
    params = dict(request.query_params)
    item_id = params.get("id")
    if item_id:
        result = await db.execute(
            text("SELECT id, is_hidden FROM wardrobe_items WHERE id = :id"),
            {"id": int(item_id)},
        )
        row = result.mappings().first()
        return {"data": dict(row) if row else None}
    return {"data": None}


@router.post("/visibility")
async def set_visibility(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: bulk hide/show items."""
    body = await request.json()
    hide_all = body.get("hideAll")
    item_ids = body.get("ids", [])

    if hide_all is True:
        await db.execute(text("UPDATE wardrobe_items SET is_hidden = true"))
    elif hide_all is False:
        await db.execute(text("UPDATE wardrobe_items SET is_hidden = false"))
    elif item_ids:
        hidden = body.get("is_hidden", True)
        await db.execute(
            text("UPDATE wardrobe_items SET is_hidden = :h WHERE id = ANY(:ids)"),
            {"h": hidden, "ids": item_ids},
        )
    await db.commit()
    return {"success": True}


@router.post("/add")
async def add_wardrobe_item(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()

    result = await db.execute(
        text(f"""
            INSERT INTO wardrobe_user_items (user_id, item_name, description, color, shade,
                material, style, has_print, has_details, notes, image_url, clothing_type,
                basic_item_id, is_hidden)
            VALUES (:uid, :name, :desc, :color, :shade, :material, :style, :print,
                :details, :notes, :image, :ctype, :basic_id, false)
            RETURNING {WUI_COLS}
        """),
        {
            "uid": user["id"],
            "name": body.get("item_name") or body.get("name", ""),
            "desc": body.get("description"),
            "color": body.get("color"),
            "shade": body.get("shade"),
            "material": body.get("material"),
            "style": body.get("style"),
            "print": body.get("has_print"),
            "details": body.get("has_details"),
            "notes": body.get("notes"),
            "image": body.get("image_url"),
            "ctype": body.get("clothing_type"),
            "basic_id": body.get("basic_item_id"),
        },
    )
    await db.commit()
    row = result.mappings().first()
    return {"data": dict(row) if row else None}


@router.get("/{item_id}")
async def get_wardrobe_item(
    item_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text(f"SELECT {WUI_COLS} FROM wardrobe_user_items WHERE id = :id AND user_id = :uid"),
        {"id": item_id, "uid": user["id"]},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return dict(row)


@router.put("/{item_id}")
@router.patch("/{item_id}")
async def update_wardrobe_item(
    item_id: int,
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    allowed = ["item_name", "description", "color", "shade", "material", "style",
               "has_print", "has_details", "notes", "image_url", "is_hidden",
               "clothing_type", "basic_item_id"]
    updates = {k: body[k] for k in allowed if k in body}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f'"{k}" = :{k}' for k in updates)
    updates["id"] = item_id
    updates["uid"] = user["id"]

    result = await db.execute(
        text(f'UPDATE wardrobe_user_items SET {set_clause}, updated_at = NOW() WHERE id = :id AND user_id = :uid RETURNING {WUI_COLS}'),
        updates,
    )
    await db.commit()
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return dict(row)


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

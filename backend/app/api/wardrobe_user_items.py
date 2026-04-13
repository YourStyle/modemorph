"""Wardrobe user items — /api/wardrobe-user-items"""

import json as json_lib
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


@router.get("")
async def get_items(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user wardrobe items with optional filters."""
    params = dict(request.query_params)
    uid = user["id"]

    sql = """SELECT id, user_id, item_name, size_type, material, style, has_print,
            color, shade, has_details, url, created_at, updated_at, is_basic,
            basic_item_id, notes, basic_material_id, is_hidden, image_url,
            shop_url, clothing_type, item_name_en, description, description_en,
            temp_min, temp_max
            FROM wardrobe_user_items WHERE user_id = :uid"""
    binds = {"uid": uid}

    if "clothing_type" in params:
        sql += " AND clothing_type = :ctype"
        binds["ctype"] = params["clothing_type"]

    if "search" in params and params["search"]:
        sql += " AND (item_name ILIKE :search OR description ILIKE :search)"
        binds["search"] = f"%{params['search']}%"

    sort = params.get("sort", "newest")
    if sort == "oldest":
        sql += " ORDER BY created_at ASC"
    else:
        sql += " ORDER BY created_at DESC"

    result = await db.execute(text(sql), binds)
    rows = result.mappings().all()
    return [dict(r) for r in rows]


@router.post("")
async def create_item(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()

    # Build dynamic insert from body keys
    allowed = ["item_name", "description", "color", "shade", "material", "style",
               "has_print", "has_details", "notes", "image_url", "url",
               "wardrobe_item_id", "is_hidden", "basic_item_id", "clothing_type",
               "size_type", "basic_material_id", "is_basic", "shop_url",
               "item_name_en", "description_en", "temp_min", "temp_max"]
    fields = {k: body[k] for k in allowed if k in body and body[k] is not None}
    fields["user_id"] = user["id"]

    cols = ", ".join(f'"{k}"' for k in fields)
    vals = ", ".join(f":{k}" for k in fields)

    result = await db.execute(
        text(f'INSERT INTO wardrobe_user_items ({cols}) VALUES ({vals}) RETURNING *'),
        fields,
    )
    await db.commit()
    row = result.mappings().first()
    return {"data": dict(row) if row else None}


@router.get("/{item_id}")
async def get_item(item_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT id, user_id, item_name, size_type, material, style, has_print, color, shade, has_details, url, created_at, updated_at, is_basic, basic_item_id, notes, basic_material_id, is_hidden, image_url, shop_url, clothing_type, item_name_en, description, description_en, temp_min, temp_max FROM wardrobe_user_items WHERE id = :id AND user_id = :uid"),
        {"id": item_id, "uid": user["id"]},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"data": dict(row)}


@router.put("/{item_id}")
@router.patch("/{item_id}")
async def update_item(item_id: int, request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    allowed = ["item_name", "description", "color", "shade", "material", "style",
               "has_print", "has_details", "notes", "image_url", "url", "is_hidden",
               "basic_item_id", "clothing_type", "size_type", "basic_material_id",
               "is_basic", "shop_url", "item_name_en", "description_en",
               "temp_min", "temp_max"]
    updates = {k: body[k] for k in allowed if k in body}

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f'"{k}" = :{k}' for k in updates)
    updates["id"] = item_id
    updates["uid"] = user["id"]

    result = await db.execute(
        text(f'UPDATE wardrobe_user_items SET {set_clause} WHERE id = :id AND user_id = :uid RETURNING *'),
        updates,
    )
    await db.commit()
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"data": dict(row)}


@router.delete("/{item_id}")
async def delete_item(item_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("DELETE FROM wardrobe_user_items WHERE id = :id AND user_id = :uid RETURNING id"),
        {"id": item_id, "uid": user["id"]},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Item not found")
    await db.commit()
    return {"success": True}

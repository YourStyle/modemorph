"""Wardrobe user items — /api/wardrobe-user-items"""

import json as json_lib
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.services.usage import age_seconds as _age_seconds, record_usage_event

router = APIRouter()

# Boolean columns on wardrobe_user_items — clients (and the detect-clothing AI
# response) historically send these as free-form strings like "нет" / "есть" /
# "yes" / "no" or even a print description. Coerce to bool at the boundary so
# INSERT/UPDATE doesn't crash with asyncpg DataError.
_BOOL_FIELDS = {"has_print", "has_details", "is_basic", "is_hidden"}
_FALSY_STRINGS = {"", "no", "нет", "false", "0", "none", "null"}


def _coerce_bool(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() not in _FALSY_STRINGS
    return bool(value)


def _normalize_fields(fields: dict) -> dict:
    for k in list(fields.keys()):
        if k in _BOOL_FIELDS:
            fields[k] = _coerce_bool(fields[k])
    return fields


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
    fields = _normalize_fields(fields)
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
    updates = _normalize_fields(updates)

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
    # Read before deleting: age_seconds is the whole point of this event — it
    # separates "removed a bad detection 40 seconds later" from "gave the thing
    # away three weeks later". Nothing else in the product records a deletion,
    # so ~18% of everything ever created has vanished without a trace.
    before = (
        await db.execute(
            text(
                "SELECT clothing_type, created_at, image_url IS NOT NULL AS had_image "
                "FROM wardrobe_user_items WHERE id = :id AND user_id = :uid"
            ),
            {"id": item_id, "uid": user["id"]},
        )
    ).mappings().first()

    result = await db.execute(
        text("DELETE FROM wardrobe_user_items WHERE id = :id AND user_id = :uid RETURNING id"),
        {"id": item_id, "uid": user["id"]},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Item not found")

    await record_usage_event(
        db,
        user["id"],
        feature="wardrobe_item",
        action="delete",
        meta={
            "item_id": item_id,
            # id spaces of wardrobe_items and wardrobe_user_items overlap for
            # older rows (006_wardrobe_items_sequence_offset.sql moved the
            # catalogue sequence but left existing rows), so a bare item_id is
            # unreadable a quarter from now.
            "item_source": "wardrobe_user_items",
            "clothing_type": before["clothing_type"] if before else None,
            "age_seconds": _age_seconds(before["created_at"]) if before else None,
            "had_image": bool(before["had_image"]) if before else None,
        },
    )
    await db.commit()
    return {"success": True}

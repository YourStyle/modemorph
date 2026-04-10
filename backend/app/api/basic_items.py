"""Basic wardrobe items, materials, clothing types."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


# ── /api/basic-wardrobe-items ──

@router.get("/basic-wardrobe-items")
async def get_basic_wardrobe_items(
    gender: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    sql = "SELECT * FROM basic_wardrobe_items WHERE 1=1"
    binds = {}
    if gender:
        sql += " AND (gender = :g OR gender IS NULL)"
        binds["g"] = gender
    sql += " ORDER BY name_ru"

    result = await db.execute(text(sql), binds)
    return {"data": [dict(r) for r in result.mappings().all()]}


# ── /api/basic-items ──

@router.get("/basic-items")
async def get_basic_items(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM basic_wardrobe_items ORDER BY id"))
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.get("/basic-items/{item_id}")
async def get_basic_item(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM basic_wardrobe_items WHERE id = :id"),
        {"id": item_id},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"data": dict(row)}


@router.post("/basic-items/copy")
async def copy_basic_item(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    basic_item_id = body.get("basic_item_id")
    if not basic_item_id:
        raise HTTPException(status_code=400, detail="basic_item_id required")

    # Get basic item
    result = await db.execute(
        text("SELECT * FROM basic_wardrobe_items WHERE id = :id"),
        {"id": basic_item_id},
    )
    item = result.mappings().first()
    if not item:
        raise HTTPException(status_code=404, detail="Basic item not found")

    # Get materials
    mats = await db.execute(
        text("""
            SELECT bm.name_ru FROM basic_item_materials bim
            JOIN basic_materials bm ON bm.id = bim.basic_material_id
            WHERE bim.basic_item_id = :id
        """),
        {"id": basic_item_id},
    )
    material_names = [r[0] for r in mats.all()]

    return {
        "data": {
            **dict(item),
            "materials": material_names,
        }
    }


# ── /api/basic-materials ──

@router.get("/basic-materials")
async def get_basic_materials(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM basic_materials ORDER BY name_ru"))
    return {"data": [dict(r) for r in result.mappings().all()]}


# ── /api/clothing-types ──

@router.get("/clothing-types")
async def get_clothing_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT DISTINCT clothing_type FROM wardrobe_items WHERE clothing_type IS NOT NULL ORDER BY clothing_type")
    )
    return {"types": [r[0] for r in result.all()]}

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
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get basic wardrobe items not yet added by user. Returns plain array (not wrapped)."""
    # Get basic items filtered by gender
    sql = "SELECT * FROM basic_wardrobe_items WHERE 1=1"
    binds = {}
    if gender:
        sql += " AND (gender = :g OR gender = 'unisex' OR gender IS NULL)"
        binds["g"] = gender
    sql += " ORDER BY name_ru"

    result = await db.execute(text(sql), binds)
    all_items = result.mappings().all()

    # Get user's already-added basic item IDs
    user_items = await db.execute(
        text("SELECT basic_item_id FROM wardrobe_user_items WHERE user_id = :uid AND basic_item_id IS NOT NULL"),
        {"uid": user["id"]},
    )
    added_ids = {r[0] for r in user_items.all()}

    # Filter out already added and map fields to match frontend interface
    available = []
    for item in all_items:
        if item["id"] not in added_ids:
            available.append({
                "id": item["id"],
                "item_name": item.get("name_ru") or item.get("name_en") or "Без названия",
                "description": item.get("description"),
                "clothing_type": item.get("clothing_type") or "Одежда",
                "image_url": item.get("image_url"),
                "gender": item.get("gender"),
                "material": "",
                "style": "",
                "color": "",
                "shade": "",
                "has_print": "нет",
                "has_details": "нет",
            })

    # Return plain array (not wrapped in {data:}) — frontend expects Array.isArray(data)
    return available


# ── /api/basic-items ──

@router.get("/basic-items")
async def get_basic_items(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT bwi.*, COALESCE(
            (SELECT json_agg(json_build_object('id', bm.id, 'name_ru', bm.name_ru, 'name_en', bm.name_en))
             FROM basic_item_materials bim JOIN basic_materials bm ON bm.id = bim.basic_material_id
             WHERE bim.basic_item_id = bwi.id), '[]'
        ) as materials
        FROM basic_wardrobe_items bwi ORDER BY bwi.id
    """))
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


@router.post("/basic-items")
async def create_basic_item(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    result = await db.execute(
        text("""INSERT INTO basic_wardrobe_items (name_ru, name_en, description, clothing_type, image_url, gender)
            VALUES (:name_ru, :name_en, :desc, :ct, :img, :gender) RETURNING *"""),
        {"name_ru": body.get("name_ru", ""), "name_en": body.get("name_en", ""),
         "desc": body.get("description"), "ct": body.get("clothing_type"),
         "img": body.get("image_url"), "gender": body.get("gender")},
    )
    await db.commit()
    return {"data": dict(result.mappings().first())}


@router.put("/basic-items/{item_id}")
async def update_basic_item(item_id: int, request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    allowed = ["name_ru", "name_en", "description", "clothing_type", "image_url", "gender"]
    updates = {k: body[k] for k in allowed if k in body}
    if not updates:
        return {"data": None}
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = item_id
    result = await db.execute(text(f"UPDATE basic_wardrobe_items SET {set_clause} WHERE id = :id RETURNING *"), updates)
    await db.commit()
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"data": dict(row)}


@router.delete("/basic-items/{item_id}")
async def delete_basic_item(item_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM basic_item_materials WHERE basic_item_id = :id"), {"id": item_id})
    result = await db.execute(text("DELETE FROM basic_wardrobe_items WHERE id = :id RETURNING id"), {"id": item_id})
    if not result.first():
        raise HTTPException(status_code=404, detail="Item not found")
    await db.commit()
    return {"success": True}


@router.post("/basic-items/{item_id}/materials")
async def set_basic_item_materials(item_id: int, request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    material_ids = body.get("material_ids", [])
    await db.execute(text("DELETE FROM basic_item_materials WHERE basic_item_id = :id"), {"id": item_id})
    for mid in material_ids:
        await db.execute(
            text("INSERT INTO basic_item_materials (basic_item_id, basic_material_id) VALUES (:bid, :mid)"),
            {"bid": item_id, "mid": mid},
        )
    await db.commit()
    return {"success": True}


# ── Combinations CRUD ──

@router.get("/combinations")
async def get_combinations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT c.*, COALESCE(
            (SELECT json_agg(json_build_object(
                'id', ce.id, 'position', ce.position,
                'basic_item_id', ce.basic_item_id, 'basic_material_id', ce.basic_material_id,
                'bwi_name', bwi.name_ru, 'bwi_image', bwi.image_url,
                'bm_name', bm.name_ru, 'bm_image', bm.image_url
            ) ORDER BY ce.position)
             FROM combination_elements ce
             LEFT JOIN basic_wardrobe_items bwi ON bwi.id = ce.basic_item_id
             LEFT JOIN basic_materials bm ON bm.id = ce.basic_material_id
             WHERE ce.combination_id = c.id), '[]'
        ) as elements
        FROM combinations c ORDER BY c.id
    """))
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.post("/combinations")
async def create_combination(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    result = await db.execute(
        text("INSERT INTO combinations (name, description, style, gender) VALUES (:name, :desc, :style, :gender) RETURNING *"),
        {"name": body.get("name", ""), "desc": body.get("description"), "style": body.get("style"), "gender": body.get("gender")},
    )
    combo = dict(result.mappings().first())
    # Add elements
    for idx, el in enumerate(body.get("elements", []), 1):
        await db.execute(
            text("INSERT INTO combination_elements (combination_id, basic_item_id, basic_material_id, position) VALUES (:cid, :bid, :mid, :pos)"),
            {"cid": combo["id"], "bid": el.get("basic_item_id"), "mid": el.get("basic_material_id"), "pos": idx},
        )
    await db.commit()
    return {"data": combo}


@router.put("/combinations/{combo_id}")
async def update_combination(combo_id: int, request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    allowed = ["name", "description", "style", "gender"]
    updates = {k: body[k] for k in allowed if k in body}
    if updates:
        set_clause = ", ".join(f"{k} = :{k}" for k in updates)
        updates["id"] = combo_id
        await db.execute(text(f"UPDATE combinations SET {set_clause} WHERE id = :id"), updates)
    # Replace elements if provided
    if "elements" in body:
        await db.execute(text("DELETE FROM combination_elements WHERE combination_id = :cid"), {"cid": combo_id})
        for idx, el in enumerate(body["elements"], 1):
            await db.execute(
                text("INSERT INTO combination_elements (combination_id, basic_item_id, basic_material_id, position) VALUES (:cid, :bid, :mid, :pos)"),
                {"cid": combo_id, "bid": el.get("basic_item_id"), "mid": el.get("basic_material_id"), "pos": idx},
            )
    await db.commit()
    return {"success": True}


@router.delete("/combinations/{combo_id}")
async def delete_combination(combo_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM combination_elements WHERE combination_id = :id"), {"id": combo_id})
    await db.execute(text("DELETE FROM combinations WHERE id = :id"), {"id": combo_id})
    await db.commit()
    return {"success": True}


@router.post("/basic-items/copy")
async def copy_basic_item(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    basic_item_id = body.get("basic_item_id") or body.get("id")
    if not basic_item_id:
        raise HTTPException(status_code=400, detail="basic_item_id required")

    result = await db.execute(
        text("SELECT * FROM basic_wardrobe_items WHERE id = :id"),
        {"id": basic_item_id},
    )
    item = result.mappings().first()
    if not item:
        raise HTTPException(status_code=404, detail="Basic item not found")

    mats = await db.execute(
        text("""
            SELECT bm.name_ru FROM basic_item_materials bim
            JOIN basic_materials bm ON bm.id = bim.basic_material_id
            WHERE bim.basic_item_id = :id
        """),
        {"id": basic_item_id},
    )
    material_names = [r[0] for r in mats.all()]

    return {"data": {**dict(item), "materials": material_names}}


# ── /api/basic-materials ──

@router.get("/basic-materials")
async def get_basic_materials(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM basic_materials ORDER BY name_ru"))
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.post("/basic-materials")
async def create_basic_material(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    result = await db.execute(
        text("INSERT INTO basic_materials (name_ru, name_en, description, properties) VALUES (:name_ru, :name_en, :desc, :props) RETURNING *"),
        {"name_ru": body.get("name_ru", ""), "name_en": body.get("name_en", ""), "desc": body.get("description"), "props": body.get("properties")},
    )
    await db.commit()
    return {"data": dict(result.mappings().first())}


@router.put("/basic-materials/{material_id}")
async def update_basic_material(material_id: int, request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    allowed = ["name_ru", "name_en", "description", "properties"]
    updates = {k: body[k] for k in allowed if k in body}
    if not updates:
        return {"data": None}
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = material_id
    result = await db.execute(text(f"UPDATE basic_materials SET {set_clause} WHERE id = :id RETURNING *"), updates)
    await db.commit()
    row = result.mappings().first()
    return {"data": dict(row) if row else None}


@router.delete("/basic-materials/{material_id}")
async def delete_basic_material(material_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM basic_item_materials WHERE basic_material_id = :id"), {"id": material_id})
    await db.execute(text("DELETE FROM basic_materials WHERE id = :id"), {"id": material_id})
    await db.commit()
    return {"success": True}


# ── /api/clothing-types ──

@router.get("/clothing-types")
async def get_clothing_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT DISTINCT clothing_type FROM wardrobe_items WHERE clothing_type IS NOT NULL ORDER BY clothing_type")
    )
    return {"types": [r[0] for r in result.all()]}

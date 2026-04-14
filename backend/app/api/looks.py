"""User looks and look sections."""

import json as json_lib

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


# ── /api/user-looks ──

@router.get("/user-looks")
async def get_user_looks(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM user_looks WHERE user_id = :uid ORDER BY created_at DESC"),
        {"uid": user["id"]},
    )
    looks = [dict(r) for r in result.mappings().all()]

    # Expand item references into full objects with images/names
    all_user_ids = set()
    all_basic_ids = set()
    for look in looks:
        items = look.get("items") or []
        if isinstance(items, str):
            items = json_lib.loads(items)
        for ref in items:
            item_id = ref.get("id")
            if not item_id:
                continue
            if ref.get("type") == "basic":
                all_basic_ids.add(item_id)
            else:
                all_user_ids.add(item_id)

    user_items_map = {}
    basic_items_map = {}

    if all_user_ids:
        ui_result = await db.execute(
            text("SELECT id, item_name, image_url, color, material FROM wardrobe_user_items WHERE id = ANY(:ids)"),
            {"ids": list(all_user_ids)},
        )
        for r in ui_result.mappings().all():
            user_items_map[r["id"]] = dict(r)

    if all_basic_ids:
        bi_result = await db.execute(
            text("SELECT id, item_name, image_url, color, material FROM wardrobe_items WHERE id = ANY(:ids)"),
            {"ids": list(all_basic_ids)},
        )
        for r in bi_result.mappings().all():
            basic_items_map[r["id"]] = dict(r)

    for look in looks:
        items = look.get("items") or []
        if isinstance(items, str):
            items = json_lib.loads(items)
        expanded = []
        for ref in items:
            item_id = ref.get("id")
            if not item_id:
                continue
            source = ref.get("type", "user")
            if source == "basic":
                data = basic_items_map.get(item_id)
            else:
                data = user_items_map.get(item_id)
            if data:
                expanded.append({**data, "source": source})
        look["expandedItems"] = expanded
        # DB column is "name" — ensure it's present in response

    return looks


@router.post("/user-looks")
async def create_user_look(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    items = body.get("items", [])
    name = body.get("name") or body.get("title") or ""

    result = await db.execute(
        text("""
            INSERT INTO user_looks (user_id, name, description, items, image_url, created_at)
            VALUES (:uid, :name, :desc, CAST(:items AS jsonb), :img, NOW())
            RETURNING *
        """),
        {
            "uid": user["id"],
            "name": name,
            "desc": body.get("description"),
            "items": json_lib.dumps(items, ensure_ascii=False),
            "img": body.get("image_url"),
        },
    )
    await db.commit()
    row = result.mappings().first()
    return dict(row)


@router.get("/user-looks/{look_id}")
async def get_user_look(look_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM user_looks WHERE id = :id AND user_id = :uid"),
        {"id": look_id, "uid": user["id"]},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Look not found")
    return dict(row)


@router.put("/user-looks/{look_id}")
async def update_user_look(look_id: int, request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    items = body.get("items")

    result = await db.execute(
        text("""
            UPDATE user_looks SET name = COALESCE(:name, name),
                description = COALESCE(:desc, description),
                items = COALESCE(CAST(:items AS jsonb), items),
                image_url = COALESCE(:img, image_url)
            WHERE id = :id AND user_id = :uid RETURNING *
        """),
        {
            "id": look_id, "uid": user["id"],
            "name": body.get("name") or body.get("title"),
            "desc": body.get("description"),
            "items": json_lib.dumps(items, ensure_ascii=False) if items is not None else None,
            "img": body.get("image_url"),
        },
    )
    await db.commit()
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Look not found")
    return dict(row)


@router.delete("/user-looks/{look_id}")
async def delete_user_look(look_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("DELETE FROM user_looks WHERE id = :id AND user_id = :uid RETURNING id"),
        {"id": look_id, "uid": user["id"]},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Look not found")
    await db.commit()
    return {"success": True}


# ── /api/looks-sections ──

@router.get("/looks-sections")
async def get_looks_sections(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get sections with nested section_looks → user_looks."""
    sections_result = await db.execute(
        text("SELECT * FROM looks_sections WHERE user_id = :uid ORDER BY created_at"),
        {"uid": user["id"]},
    )
    sections = [dict(r) for r in sections_result.mappings().all()]

    if not sections:
        return []

    section_ids = [s["id"] for s in sections]
    id_csv = ",".join(str(i) for i in section_ids)

    # Get section_looks with nested user_looks
    sl_result = await db.execute(
        text(f"""
            SELECT sl.section_id, sl.look_id, ul.*
            FROM section_looks sl
            JOIN user_looks ul ON ul.id = sl.look_id
            WHERE sl.section_id IN ({id_csv})
            ORDER BY ul.created_at DESC
        """),
    )
    sl_rows = sl_result.mappings().all()

    # Group by section
    section_looks_map = {}
    for row in sl_rows:
        sid = row["section_id"]
        if sid not in section_looks_map:
            section_looks_map[sid] = []
        look_data = {k: v for k, v in dict(row).items() if k not in ("section_id", "look_id")}
        section_looks_map[sid].append({
            "look_id": row["look_id"],
            "user_looks": look_data,
        })

    for section in sections:
        section["section_looks"] = section_looks_map.get(section["id"], [])

    return sections


@router.post("/looks-sections")
async def create_section(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    result = await db.execute(
        text("""
            INSERT INTO looks_sections (user_id, name, created_at)
            VALUES (:uid, :name, NOW()) RETURNING *
        """),
        {"uid": user["id"], "name": body.get("name") or body.get("title", "")},
    )
    await db.commit()
    # Return section object directly — frontend does setSections(prev => [newSection, ...prev])
    return dict(result.mappings().first())


@router.get("/looks-sections/{section_id}/looks")
async def get_section_looks(section_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT ul.* FROM user_looks ul
            JOIN section_looks sl ON sl.look_id = ul.id
            WHERE sl.section_id = :sid AND ul.user_id = :uid
            ORDER BY ul.created_at DESC
        """),
        {"sid": section_id, "uid": user["id"]},
    )
    return [dict(r) for r in result.mappings().all()]


@router.delete("/looks-sections/{section_id}")
async def delete_section(section_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Verify ownership BEFORE cascade delete
    owner_check = await db.execute(
        text("SELECT id FROM looks_sections WHERE id = :id AND user_id = :uid"),
        {"id": section_id, "uid": user["id"]},
    )
    if not owner_check.first():
        raise HTTPException(status_code=404, detail="Section not found")

    await db.execute(text("DELETE FROM section_looks WHERE section_id = :sid"), {"sid": section_id})
    await db.execute(text("DELETE FROM looks_sections WHERE id = :id"), {"id": section_id})
    await db.commit()
    return {"success": True}

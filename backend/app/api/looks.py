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
    # Return plain array — frontend does setUserLooks(response) directly
    return [dict(r) for r in result.mappings().all()]


@router.post("/user-looks")
async def create_user_look(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    items = body.get("items", [])

    result = await db.execute(
        text("""
            INSERT INTO user_looks (user_id, title, description, items, image_url, created_at)
            VALUES (:uid, :title, :desc, CAST(:items AS jsonb), :img, NOW())
            RETURNING *
        """),
        {
            "uid": user["id"],
            "title": body.get("title", ""),
            "desc": body.get("description"),
            "items": json_lib.dumps(items, ensure_ascii=False),
            "img": body.get("image_url"),
        },
    )
    await db.commit()
    row = result.mappings().first()
    return {"data": dict(row)}


@router.get("/user-looks/{look_id}")
async def get_user_look(look_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM user_looks WHERE id = :id AND user_id = :uid"),
        {"id": look_id, "uid": user["id"]},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Look not found")
    return {"data": dict(row)}


@router.put("/user-looks/{look_id}")
async def update_user_look(look_id: int, request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    items = body.get("items")

    result = await db.execute(
        text("""
            UPDATE user_looks SET title = COALESCE(:title, title),
                description = COALESCE(:desc, description),
                items = COALESCE(CAST(:items AS jsonb), items),
                image_url = COALESCE(:img, image_url)
            WHERE id = :id AND user_id = :uid RETURNING *
        """),
        {
            "id": look_id, "uid": user["id"],
            "title": body.get("title"),
            "desc": body.get("description"),
            "items": json_lib.dumps(items, ensure_ascii=False) if items is not None else None,
            "img": body.get("image_url"),
        },
    )
    await db.commit()
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Look not found")
    return {"data": dict(row)}


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
    result = await db.execute(
        text("SELECT * FROM looks_sections WHERE user_id = :uid ORDER BY created_at"),
        {"uid": user["id"]},
    )
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.post("/looks-sections")
async def create_section(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    result = await db.execute(
        text("""
            INSERT INTO looks_sections (user_id, title, created_at)
            VALUES (:uid, :title, NOW()) RETURNING *
        """),
        {"uid": user["id"], "title": body.get("title", "")},
    )
    await db.commit()
    return {"data": dict(result.mappings().first())}


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
    return {"data": [dict(r) for r in result.mappings().all()]}


@router.delete("/looks-sections/{section_id}")
async def delete_section(section_id: int, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(text("DELETE FROM section_looks WHERE section_id = :sid"), {"sid": section_id})
    result = await db.execute(
        text("DELETE FROM looks_sections WHERE id = :id AND user_id = :uid RETURNING id"),
        {"id": section_id, "uid": user["id"]},
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Section not found")
    await db.commit()
    return {"success": True}

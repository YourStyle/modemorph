"""
Outfits & inspiration endpoints.
Uses actual column names: outfits.name (not title), no is_public column.
outfit_items references wardrobe_items (not wardrobe_user_items).
"""

import json as json_lib
import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
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
    # Admins see all outfits, regular users see their own
    if user.get("is_admin"):
        result = await db.execute(text("SELECT * FROM outfits ORDER BY created_at DESC LIMIT 200"))
    else:
        result = await db.execute(
            text("SELECT * FROM outfits WHERE user_id = :uid ORDER BY created_at DESC"),
            {"uid": user["id"]},
        )
    items = [dict(r) for r in result.mappings().all()]
    return {"outfits": items, "data": items}


@router.get("/inspiration")
async def get_inspiration(
    gender: str = Query(None),
    limit: int = Query(20, ge=1, le=50),
    cursor: str = Query(None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get outfits for inspiration feed.
    Returns { outfits: FeedOutfit[], nextCursor: null }
    """
    # Fetch outfits
    sql = "SELECT id, name, description, preview_image_url, created_at, gender FROM outfits WHERE 1=1"
    binds = {}
    if gender:
        sql += " AND (gender = :g OR gender = 'unisex' OR gender IS NULL)"
        binds["g"] = gender
    sql += " ORDER BY created_at DESC LIMIT :lim"
    binds["lim"] = limit

    result = await db.execute(text(sql), binds)
    outfits = result.mappings().all()

    if not outfits:
        return {"outfits": [], "nextCursor": None}

    outfit_ids = [o["id"] for o in outfits]

    # Fetch items for each outfit
    items_result = await db.execute(
        text("""
            SELECT oi.outfit_id, wi.id, wi.item_name, wi.image_url, wi.url,
                   wi.color, wi.shade, wi.style, wi.material, wi.size_type,
                   wi.has_print, wi.has_details, wi.notes, wi.is_basic
            FROM outfit_items oi
            JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id
            WHERE oi.outfit_id = ANY(:ids)
        """),
        {"ids": outfit_ids},
    )
    items_by_outfit = {}
    for row in items_result.mappings().all():
        oid = row["outfit_id"]
        if oid not in items_by_outfit:
            items_by_outfit[oid] = []
        items_by_outfit[oid].append({
            "id": str(row["id"]),
            "name": row["item_name"] or "",
            "image_url": row["image_url"] or "",
            "url": row["url"],
            "color": row["color"],
            "shade": row["shade"],
            "style": row["style"],
            "material": row["material"],
            "size_type": row["size_type"],
            "has_print": row["has_print"],
            "has_details": row["has_details"],
            "notes": row["notes"],
            "is_basic": bool(row["is_basic"]),
        })

    # Fetch like counts
    likes_result = await db.execute(
        text("SELECT outfit_id, count(*) as cnt FROM user_likes WHERE outfit_id = ANY(:ids) GROUP BY outfit_id"),
        {"ids": outfit_ids},
    )
    likes_by_outfit = {r["outfit_id"]: r["cnt"] for r in likes_result.mappings().all()}

    # Fetch user's likes
    user_likes_result = await db.execute(
        text("SELECT outfit_id FROM user_likes WHERE user_id = :uid AND outfit_id = ANY(:ids)"),
        {"uid": user["id"], "ids": outfit_ids},
    )
    liked_by_me = {r[0] for r in user_likes_result.all()}

    # Build feed
    feed = []
    for o in outfits:
        oid = o["id"]
        feed.append({
            "id": str(oid),
            "title": o["name"] or "",
            "description": o["description"] or "",
            "items": items_by_outfit.get(oid, []),
            "tags": [],
            "likes": likes_by_outfit.get(oid, 0),
            "isLiked": oid in liked_by_me,
            "preview_image_url": o["preview_image_url"],
        })

    random.shuffle(feed)
    return {"outfits": feed, "nextCursor": None}


@router.get("/{outfit_id}")
async def get_outfit(
    outfit_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(text("SELECT * FROM outfits WHERE id = :id"), {"id": outfit_id})
    outfit = result.mappings().first()
    if not outfit:
        raise HTTPException(status_code=404, detail="Outfit not found")
    # Get items
    items_result = await db.execute(
        text("SELECT oi.position, wi.* FROM outfit_items oi JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id WHERE oi.outfit_id = :oid ORDER BY oi.position"),
        {"oid": outfit_id},
    )
    items = [dict(r) for r in items_result.mappings().all()]
    return {"outfit": {**dict(outfit), "items": items}}


@router.post("")
async def create_outfit(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    name = body.get("name", "Образ")
    description = body.get("description")
    preview_url = body.get("preview_url") or body.get("preview_image_url")
    gender = body.get("gender")
    item_ids = body.get("items", [])

    result = await db.execute(
        text("INSERT INTO outfits (user_id, name, description, preview_image_url, gender, created_at) VALUES (:uid, :name, :desc, :preview, :gender, NOW()) RETURNING *"),
        {"uid": user["id"], "name": name, "desc": description, "preview": preview_url, "gender": gender},
    )
    outfit = dict(result.mappings().first())

    for idx, item_id in enumerate(item_ids):
        await db.execute(
            text("INSERT INTO outfit_items (outfit_id, wardrobe_item_id, position) VALUES (:oid, :wid, :pos)"),
            {"oid": outfit["id"], "wid": item_id, "pos": idx + 1},
        )

    await db.commit()
    return {"outfit": outfit, "success": True}


@router.put("/{outfit_id}")
async def update_outfit(
    outfit_id: int,
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    allowed = ["name", "description", "preview_image_url", "gender"]
    updates = {}
    for k in allowed:
        if k in body:
            updates[k] = body[k]
    # Also accept preview_url as alias
    if "preview_url" in body and "preview_image_url" not in updates:
        updates["preview_image_url"] = body["preview_url"]

    if updates:
        set_clause = ", ".join(f"{k} = :{k}" for k in updates)
        updates["id"] = outfit_id
        await db.execute(text(f"UPDATE outfits SET {set_clause} WHERE id = :id"), updates)

    # Replace items if provided
    if "items" in body:
        await db.execute(text("DELETE FROM outfit_items WHERE outfit_id = :oid"), {"oid": outfit_id})
        for idx, item_id in enumerate(body["items"]):
            await db.execute(
                text("INSERT INTO outfit_items (outfit_id, wardrobe_item_id, position) VALUES (:oid, :wid, :pos)"),
                {"oid": outfit_id, "wid": item_id, "pos": idx + 1},
            )

    await db.commit()
    return {"success": True}


@router.delete("/{outfit_id}")
async def delete_outfit(
    outfit_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(text("DELETE FROM outfit_items WHERE outfit_id = :oid"), {"oid": outfit_id})
    await db.execute(text("DELETE FROM outfits WHERE id = :oid"), {"oid": outfit_id})
    await db.commit()
    return {"success": True}


@router.post("/like")
async def toggle_like(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    outfit_id = body.get("outfitId")
    action = body.get("action", "like")

    if action == "unlike":
        await db.execute(
            text("DELETE FROM user_likes WHERE outfit_id = :oid AND user_id = :uid"),
            {"oid": outfit_id, "uid": user["id"]},
        )
    else:
        await db.execute(
            text("INSERT INTO user_likes (outfit_id, user_id, created_at) VALUES (:oid, :uid, NOW()) ON CONFLICT DO NOTHING"),
            {"oid": outfit_id, "uid": user["id"]},
        )

    # Get like count and user state
    count_result = await db.execute(
        text("SELECT count(*) FROM user_likes WHERE outfit_id = :oid"),
        {"oid": outfit_id},
    )
    is_liked_result = await db.execute(
        text("SELECT 1 FROM user_likes WHERE outfit_id = :oid AND user_id = :uid"),
        {"oid": outfit_id, "uid": user["id"]},
    )

    await db.commit()
    return {
        "likes": count_result.scalar(),
        "isLiked": is_liked_result.first() is not None,
    }


@router.post("/track-view")
async def track_view(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    outfit_id = body.get("outfitId")
    if not outfit_id:
        return {"tracked": False}
    await db.execute(
        text("UPDATE outfits SET views_count = COALESCE(views_count, 0) + 1 WHERE id = :id"),
        {"id": outfit_id},
    )
    await db.commit()
    return {"tracked": True}


@router.post("/track-save")
async def track_save(request: Request, user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    body = await request.json()
    outfit_id = body.get("outfitId")
    if not outfit_id:
        return {"tracked": False}
    await db.execute(
        text("UPDATE outfits SET favorites_count = COALESCE(favorites_count, 0) + 1 WHERE id = :id"),
        {"id": outfit_id},
    )
    await db.commit()
    return {"tracked": True}


@router.post("/save-to-looks")
async def save_to_looks(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    outfit_id = body.get("outfitId")

    # Get outfit + items
    outfit = await db.execute(text("SELECT name FROM outfits WHERE id = :id"), {"id": outfit_id})
    outfit_row = outfit.first()
    if not outfit_row:
        raise HTTPException(status_code=404, detail="Outfit not found")

    items_result = await db.execute(
        text("""
            SELECT wi.id, wi.is_basic FROM outfit_items oi
            JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id
            WHERE oi.outfit_id = :oid
        """),
        {"oid": outfit_id},
    )
    items = [{"id": r["id"], "type": "basic"} for r in items_result.mappings().all()]

    result = await db.execute(
        text("""
            INSERT INTO user_looks (user_id, title, items, created_at)
            VALUES (:uid, :title, CAST(:items AS jsonb), NOW()) RETURNING *
        """),
        {"uid": user["id"], "title": outfit_row[0], "items": json_lib.dumps(items)},
    )
    await db.commit()
    return {"success": True, "look": dict(result.mappings().first())}


@router.post("/save-as-look")
async def save_as_look(
    request: Request,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    outfit_id = body.get("outfitId")
    look_name = body.get("lookName")

    outfit = await db.execute(text("SELECT name FROM outfits WHERE id = :id"), {"id": outfit_id})
    outfit_row = outfit.first()

    items_result = await db.execute(
        text("""
            SELECT wi.* FROM outfit_items oi
            JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id
            WHERE oi.outfit_id = :oid
        """),
        {"oid": outfit_id},
    )
    items = [dict(r) for r in items_result.mappings().all()]

    result = await db.execute(
        text("""
            INSERT INTO user_looks (user_id, title, items, created_at)
            VALUES (:uid, :title, CAST(:items AS jsonb), NOW()) RETURNING *
        """),
        {
            "uid": user["id"],
            "title": look_name or (outfit_row[0] if outfit_row else "Образ"),
            "items": json_lib.dumps(items, ensure_ascii=False, default=str),
        },
    )
    await db.commit()
    return {"success": True, "look": dict(result.mappings().first())}

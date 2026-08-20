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


def _gender_filter(gender: Optional[str]) -> tuple[str, dict]:
    """Условие по полу — одно на ленту и на кружки, чтобы они не разошлись.

    'unisex' у образа витрины означает «пол не определён», а не «подходит всем»:
    после генерации кадра outfits.gender становится равен полу человека на фото
    (см. lookbook.model_gender). Оставлен в условии ради старых образов, где
    кадра нет вовсе.
    """
    if not gender:
        return "TRUE", {}
    return "(gender = :g OR gender = 'unisex' OR gender IS NULL)", {"g": gender}


def _inspiration_filter(gender: Optional[str], vibe: Optional[str]) -> tuple[str, dict]:
    """WHERE для ленты идей. Чистая функция — покрыта test_inspiration_vibe.py.

    Курируемая витрина («кружки по странам», outfits.vibe — миграция 024) НЕ
    должна течь в общую ленту: у витрины created_at = момент наполнения, то есть
    она самая свежая и при ORDER BY created_at DESC вытесняет обычные образы за
    границу LIMIT. Поэтому без параметра vibe отдаём только vibe IS NULL, а
    курируемое — исключительно по явно выбранному кружку.
    """
    if vibe:
        clauses, binds = ["vibe = :vibe"], {"vibe": vibe}
    else:
        clauses, binds = ["vibe IS NULL"], {}
    gender_clause, gender_binds = _gender_filter(gender)
    if gender_binds:
        clauses.append(gender_clause)
        binds.update(gender_binds)
    return " AND ".join(clauses), binds


@router.get("/inspiration/vibes")
async def get_inspiration_vibes(
    gender: str = Query(None, description="пол профиля; кружок и обложка считаются по нему"),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Кружки витрины для ленты идей: подпись, обложка, количество образов.

    Список приходит с бэкенда, а не захардкожен на фронте: иначе кружок
    продолжал бы висеть после удаления его образов и вёл бы в пустую ленту.

    Пустые образы отсеиваются тем же EXISTS, что и в самой ленте (она пропускает
    образы без видимых вещей) — кружок не должен обещать больше, чем откроется.

    Обложка — миниатюра (preview_thumb_url, миграция 026), и только при её
    отсутствии полный кадр. Замер 2026-08-18: полные кадры весят ~700 КБ, шесть
    кружков тянули 4,2 МБ на кружки 56x56 — на телефоне они и выглядели пустыми.
    Среди полных кадр ИИ-модели предпочтительнее товарного фото.

    Пол обязателен к учёту: и счётчик, и обложка считаются по тем же образам,
    которые человек увидит, открыв кружок. Без этого мужчина видел ряд кружков
    с женщинами на обложках — жалоба с прода 2026-08-18. Условие берётся из
    _gender_filter, общего с лентой, чтобы они не разошлись определениями.
    """
    gender_clause, gender_binds = _gender_filter(gender)
    rows = (await db.execute(text(f"""
        SELECT o.vibe,
               count(*) AS cnt,
               (array_agg(COALESCE(o.preview_thumb_url, o.preview_image_url) ORDER BY
                    (o.preview_thumb_url IS NOT NULL) DESC,
                    (o.preview_image_url LIKE '%/lookbook/%') DESC, o.id))[1] AS cover
        FROM outfits o
        WHERE o.vibe IS NOT NULL
          AND {gender_clause}
          AND EXISTS (
              SELECT 1 FROM outfit_items oi
              JOIN wardrobe_items wi ON wi.id = oi.wardrobe_item_id
              WHERE oi.outfit_id = o.id
                AND COALESCE(wi.is_hidden, false) = false
                AND COALESCE(wi.is_kids, false) = false
          )
        GROUP BY o.vibe
        ORDER BY count(*) DESC, o.vibe
    """), gender_binds)).mappings().all()
    return {"vibes": [{"vibe": r["vibe"], "count": r["cnt"], "cover": r["cover"]} for r in rows]}


@router.get("/inspiration")
async def get_inspiration(
    gender: str = Query(None),
    vibe: str = Query(None, description="кружок витрины, например «Япония»; пусто — обычная лента"),
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
    where, binds = _inspiration_filter(gender, vibe)
    sql = (
        "SELECT id, name, description, preview_image_url, created_at, gender, occasion, season, vibe "
        f"FROM outfits WHERE {where} ORDER BY created_at DESC LIMIT :lim"
    )
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
              AND COALESCE(wi.is_hidden, false) = false
              AND COALESCE(wi.is_kids, false) = false
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

    # Build feed — skip outfits with no items
    feed = []
    for o in outfits:
        oid = o["id"]
        outfit_items = items_by_outfit.get(oid, [])
        if not outfit_items:
            continue
        feed.append({
            "id": str(oid),
            "title": o["name"] or "",
            "description": o["description"] or "",
            "items": outfit_items,
            # Повод/сезон — колонки в outfits есть, но у всех образов пустые.
            # Отдаём как есть: заполнится источником образов, а не здесь.
            "tags": [t for t in (o["occasion"], o["season"]) if t],
            "likes": likes_by_outfit.get(oid, 0),
            "isLiked": oid in liked_by_me,
            "preview_image_url": o["preview_image_url"],
            "vibe": o["vibe"],
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
    raw_items = body.get("items", [])

    result = await db.execute(
        text("INSERT INTO outfits (user_id, name, description, preview_image_url, gender, created_at) VALUES (:uid, :name, :desc, :preview, :gender, NOW()) RETURNING *"),
        {"uid": user["id"], "name": name, "desc": description, "preview": preview_url, "gender": gender},
    )
    outfit = dict(result.mappings().first())

    # Accept both flat IDs [1,2,3] and objects [{wardrobe_item_id: 1, position: 1}, ...]
    for idx, item in enumerate(raw_items):
        if isinstance(item, dict):
            wid = item.get("wardrobe_item_id") or item.get("id")
            pos = item.get("position", idx + 1)
        else:
            wid = item
            pos = idx + 1
        if wid:
            await db.execute(
                text("INSERT INTO outfit_items (outfit_id, wardrobe_item_id, position) VALUES (:oid, :wid, :pos)"),
                {"oid": outfit["id"], "wid": wid, "pos": pos},
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
    owned = await db.execute(
        text("SELECT 1 FROM outfits WHERE id = :oid AND user_id = :uid"),
        {"oid": outfit_id, "uid": user["id"]},
    )
    if not owned.first():
        raise HTTPException(status_code=404, detail="Outfit not found")

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
        for idx, item in enumerate(body["items"]):
            if isinstance(item, dict):
                wid = item.get("wardrobe_item_id") or item.get("id")
                pos = item.get("position", idx + 1)
            else:
                wid = item
                pos = idx + 1
            if wid:
                await db.execute(
                    text("INSERT INTO outfit_items (outfit_id, wardrobe_item_id, position) VALUES (:oid, :wid, :pos)"),
                    {"oid": outfit_id, "wid": wid, "pos": pos},
                )

    await db.commit()
    return {"success": True}


@router.delete("/{outfit_id}")
async def delete_outfit(
    outfit_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    owned = await db.execute(
        text("SELECT 1 FROM outfits WHERE id = :oid AND user_id = :uid"),
        {"oid": outfit_id, "uid": user["id"]},
    )
    if not owned.first():
        raise HTTPException(status_code=404, detail="Outfit not found")

    await db.execute(text("DELETE FROM outfit_items WHERE outfit_id = :oid"), {"oid": outfit_id})
    await db.execute(text("DELETE FROM outfits WHERE id = :oid AND user_id = :uid"), {"oid": outfit_id, "uid": user["id"]})
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
    raw_id = body.get("outfitId")
    if not raw_id:
        return {"tracked": False}
    try:
        outfit_id = int(raw_id)
    except (TypeError, ValueError):
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
    raw_id = body.get("outfitId")
    if not raw_id:
        return {"tracked": False}
    try:
        outfit_id = int(raw_id)
    except (TypeError, ValueError):
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
            INSERT INTO user_looks (user_id, name, items, created_at)
            VALUES (:uid, :name, CAST(:items AS jsonb), NOW()) RETURNING *
        """),
        {"uid": user["id"], "name": outfit_row[0], "items": json_lib.dumps(items)},
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
            INSERT INTO user_looks (user_id, name, items, created_at)
            VALUES (:uid, :name, CAST(:items AS jsonb), NOW()) RETURNING *
        """),
        {
            "uid": user["id"],
            "name": look_name or (outfit_row[0] if outfit_row else "Образ"),
            "items": json_lib.dumps(items, ensure_ascii=False, default=str),
        },
    )
    await db.commit()
    return {"success": True, "look": dict(result.mappings().first())}

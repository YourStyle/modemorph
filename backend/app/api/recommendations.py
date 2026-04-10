"""
Recommendations endpoints.
Replaces n8n 'recommendations' workflow for data prep + Supabase save.
AI generation still proxied through n8n for foreign API access.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


@router.get("")
async def get_recommendations(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get today's recommendations for user."""
    profile_id_result = await db.execute(
        text("SELECT id FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    profile = profile_id_result.first()
    if not profile:
        return {"data": None}

    result = await db.execute(
        text("""
            SELECT * FROM main_recommendations
            WHERE user_id = :uid
              AND run_date = CURRENT_DATE
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {"uid": user["id"]},
    )
    row = result.mappings().first()
    if row:
        return {"data": dict(row)}
    return {"data": None}


class SaveRecommendationRequest(BaseModel):
    look_sections: list
    source: str = "algo:http"


@router.post("")
async def save_recommendations(
    body: SaveRecommendationRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save/update today's recommendations."""
    import json

    today_str = "CURRENT_DATE"

    # Check existing
    existing = await db.execute(
        text("""
            SELECT id FROM main_recommendations
            WHERE user_id = :uid AND run_date = CURRENT_DATE
        """),
        {"uid": user["id"]},
    )
    row = existing.first()

    sections_json = json.dumps(body.look_sections, ensure_ascii=False)

    if row:
        await db.execute(
            text("""
                UPDATE main_recommendations
                SET look_sections = :sections::jsonb
                WHERE id = :id
            """),
            {"sections": sections_json, "id": row[0]},
        )
    else:
        await db.execute(
            text("""
                INSERT INTO main_recommendations (user_id, run_date, look_sections, source)
                VALUES (:uid, CURRENT_DATE, :sections::jsonb, :source)
            """),
            {"uid": user["id"], "sections": sections_json, "source": body.source},
        )

    await db.commit()
    return {"success": True}


@router.delete("")
async def delete_recommendations(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("DELETE FROM main_recommendations WHERE user_id = :uid AND run_date = CURRENT_DATE"),
        {"uid": user["id"]},
    )
    await db.commit()
    return {"success": True}

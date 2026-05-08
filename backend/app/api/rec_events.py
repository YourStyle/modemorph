"""
TR-1..TR-4: Client-side recommendation event sink.

The CLIP service writes a baseline row (action IS NULL) per partner item it
serves; this endpoint receives the *user-side* events that the frontend emits
when the card actually shows up on screen, gets clicked, or generates an
affiliate-link conversion. Every event row carries the same rec_session_id
the retrieval service used at generation time, so CTR / like-rate / A/B
deltas can be computed by joining on that single identifier.

Item-level events flow into recommendation_logs only when the item is a
catalog (partner) item — that table's BIGINT item_id assumes a single ID
namespace. User-wardrobe-item events stop at user_item_dislikes / user_likes
because their IDs live in a separate sequence.

Outfit-level (suggestion) likes/dislikes go into user_likes / user_item_dislikes
with a string suggestion_id and the rec_session_id that surfaced them — this
is what closes the gap noted in section 3.12.5: today user_likes only stores
saved-outfit IDs, so attribution to a retrieval session is impossible.
"""

import hashlib
import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


def _suggestion_to_item_id(suggestion_id: str) -> int:
    """Map a string suggestion_id to a stable positive BIGINT so it can sit in
    user_item_dislikes.item_id without colliding with real wardrobe ids.
    The existing (user_id, item_id, item_source) unique index then dedupes
    repeat dislikes of the same suggestion while still allowing distinct
    suggestions to coexist. 60 bits keeps us safely under PG BIGINT max."""
    digest = hashlib.md5(suggestion_id.encode("utf-8")).hexdigest()
    return int(digest[:15], 16)


# Mapped 1:1 onto recommendation_logs.action where applicable. Outfit events
# don't touch recommendation_logs (no FK, suggestion_id is a hash string),
# they go to user_likes / user_item_dislikes.
ItemEvent = Literal[
    "impression",
    "click",
    "affiliate_click",
    "save",
    "try_on",
    "like_item",
    "dislike_item",
]
OutfitEvent = Literal["like_outfit", "dislike_outfit"]
AnyEvent = Literal[
    "impression",
    "click",
    "affiliate_click",
    "save",
    "try_on",
    "like_item",
    "dislike_item",
    "like_outfit",
    "dislike_outfit",
]

_ITEM_EVENTS: set[str] = {
    "impression", "click", "affiliate_click", "save", "try_on",
    "like_item", "dislike_item",
}
_OUTFIT_EVENTS: set[str] = {"like_outfit", "dislike_outfit"}

# How an event name lands in recommendation_logs.action. Suffixes (_item) are
# stripped because the column already discriminates by row, not by name.
_ACTION_FOR_EVENT: dict[str, str] = {
    "impression": "impression",
    "click": "click",
    "affiliate_click": "affiliate_click",
    "save": "save",
    "try_on": "try_on",
    "like_item": "like",
    "dislike_item": "dislike",
}


class RecEventRequest(BaseModel):
    rec_session_id: str = Field(min_length=1, max_length=64)
    event: AnyEvent
    item_id: Optional[int] = None
    item_source: Optional[Literal["catalog", "user"]] = None
    suggestion_id: Optional[str] = Field(default=None, max_length=128)
    position: Optional[int] = None
    score: Optional[float] = None


@router.post("/rec-event")
async def log_rec_event(
    body: RecEventRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Single-call sink for impression / click / affiliate_click / save / try_on
    / like / dislike events. Idempotent for impressions (partial unique index)."""
    user_id = user["id"]
    event = body.event

    if event in _ITEM_EVENTS:
        if body.item_id is None:
            raise HTTPException(status_code=400, detail="item_id required for item events")

        # User-wardrobe items don't go into recommendation_logs (incompatible
        # ID namespace). The only meaningful persistent action for them is
        # dislike, which already has its own table.
        if body.item_source == "user":
            if event == "dislike_item":
                await db.execute(
                    text("""
                        INSERT INTO user_item_dislikes
                            (user_id, item_id, item_source, rec_session_id)
                        VALUES (:uid, :iid, 'wardrobe_user_items', :rsid)
                        ON CONFLICT (user_id, item_id, item_source) DO NOTHING
                    """),
                    {"uid": user_id, "iid": body.item_id, "rsid": body.rec_session_id},
                )
                await db.commit()
            return {"ok": True, "stored": event == "dislike_item"}

        action = _ACTION_FOR_EVENT[event]

        if action == "impression":
            # ON CONFLICT against the partial unique index uq_rec_logs_impression
            # makes repeat impressions during the same scroll session no-ops.
            await db.execute(
                text("""
                    INSERT INTO recommendation_logs
                        (user_id, rec_session_id, item_id, item_score, position, source, action, action_at)
                    VALUES (:uid, :rsid, :iid, :score, :pos, 'client', 'impression', NOW())
                    ON CONFLICT (user_id, rec_session_id, item_id)
                        WHERE action = 'impression' DO NOTHING
                """),
                {
                    "uid": user_id, "rsid": body.rec_session_id, "iid": body.item_id,
                    "score": body.score, "pos": body.position,
                },
            )
        else:
            # Click / affiliate_click / save / try_on / like / dislike — every
            # event is a separate row, no dedup. This matches industry CTR
            # conventions where multiple clicks in a session are valid signal.
            await db.execute(
                text("""
                    INSERT INTO recommendation_logs
                        (user_id, rec_session_id, item_id, item_score, position, source, action, action_at)
                    VALUES (:uid, :rsid, :iid, :score, :pos, 'client', :action, NOW())
                """),
                {
                    "uid": user_id, "rsid": body.rec_session_id, "iid": body.item_id,
                    "score": body.score, "pos": body.position, "action": action,
                },
            )

            # Dislikes also propagate to user_item_dislikes so the next
            # generation skips the item — matches existing /api/items/dislike
            # behaviour but adds the rec_session_id provenance trail.
            if event == "dislike_item":
                await db.execute(
                    text("""
                        INSERT INTO user_item_dislikes
                            (user_id, item_id, item_source, rec_session_id)
                        VALUES (:uid, :iid, 'wardrobe_items', :rsid)
                        ON CONFLICT (user_id, item_id, item_source) DO NOTHING
                    """),
                    {"uid": user_id, "iid": body.item_id, "rsid": body.rec_session_id},
                )

        await db.commit()
        return {"ok": True, "stored": True}

    if event in _OUTFIT_EVENTS:
        if not body.suggestion_id:
            raise HTTPException(status_code=400, detail="suggestion_id required for outfit events")

        if event == "like_outfit":
            # Inference predicate matches the partial index user_likes_user_suggestion_unique
            # (created in migration 009 with WHERE suggestion_id IS NOT NULL).
            await db.execute(
                text("""
                    INSERT INTO user_likes
                        (user_id, outfit_id, rec_session_id, suggestion_id)
                    VALUES (:uid, NULL, :rsid, :sid)
                    ON CONFLICT (user_id, suggestion_id) WHERE suggestion_id IS NOT NULL
                        DO NOTHING
                """),
                {"uid": user_id, "rsid": body.rec_session_id, "sid": body.suggestion_id},
            )
        else:  # dislike_outfit
            # Hash the suggestion_id into item_id so the existing
            # (user_id, item_id, item_source) unique index dedupes per-suggestion
            # but still allows distinct suggestions to coexist as separate rows.
            hashed_id = _suggestion_to_item_id(body.suggestion_id)
            await db.execute(
                text("""
                    INSERT INTO user_item_dislikes
                        (user_id, item_id, item_source, rec_session_id, suggestion_id)
                    VALUES (:uid, :iid, 'recommendation', :rsid, :sid)
                    ON CONFLICT (user_id, item_id, item_source) DO NOTHING
                """),
                {"uid": user_id, "iid": hashed_id, "rsid": body.rec_session_id, "sid": body.suggestion_id},
            )
        await db.commit()
        logger.info(
            "[RecEvent] user=%s event=%s suggestion=%s",
            user_id[:8], event, body.suggestion_id,
        )
        return {"ok": True, "stored": True}

    raise HTTPException(status_code=400, detail=f"Unknown event: {event}")

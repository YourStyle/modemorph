"""
Payments — Robokassa webhooks + subscription/credits management.
"""

import hashlib
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


class CreatePaymentRequest(BaseModel):
    amount: float
    description: str
    meta: dict  # {action: "subscribe"|"buy_credits", type?, credits?, packName?}


@router.post("/robokassa/create")
async def create_payment(
    body: CreatePaymentRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create payment record and return Robokassa URL."""
    # Insert payment
    result = await db.execute(
        text("""
            INSERT INTO payments (user_id, amount, status, meta, created_at)
            VALUES (:uid, :amount, 'pending', CAST(:meta AS jsonb), NOW())
            RETURNING id, invoice_id
        """),
        {"uid": user["id"], "amount": body.amount, "meta": json.dumps(body.meta)},
    )
    row = result.first()
    await db.commit()

    invoice_id = row.invoice_id or row.id

    # Build Robokassa URL
    from urllib.parse import quote

    signature = hashlib.md5(
        f"{settings.ROBOKASSA_LOGIN}:{body.amount}:{invoice_id}:{settings.ROBOKASSA_PASS1}".encode()
    ).hexdigest()

    url = (
        f"https://auth.robokassa.ru/Merchant/Index.aspx"
        f"?MerchantLogin={settings.ROBOKASSA_LOGIN}"
        f"&OutSum={body.amount}"
        f"&InvId={invoice_id}"
        f"&Description={quote(body.description)}"
        f"&SignatureValue={signature}"
        f"&IsTest=0"
    )

    return {"url": url, "invoice_id": invoice_id}


@router.post("/robokassa/result")
async def robokassa_result(request: Request, db: AsyncSession = Depends(get_db)):
    """Robokassa callback — verify signature, process payment."""
    form = await request.form()
    out_sum = form.get("OutSum")
    inv_id = form.get("InvId")
    sig = form.get("SignatureValue", "")

    # Verify signature
    expected = hashlib.md5(
        f"{out_sum}:{inv_id}:{settings.ROBOKASSA_PASS2}".encode()
    ).hexdigest()

    if sig.lower() != expected.lower():
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Atomic: find and claim payment in one step (prevents double-processing)
    result = await db.execute(
        text("""
            UPDATE payments SET status = 'paid'
            WHERE invoice_id = :inv AND status != 'paid'
            RETURNING *
        """),
        {"inv": int(inv_id)},
    )
    payment = result.mappings().first()
    if not payment:
        # Already paid or not found — idempotent OK
        return f"OK{inv_id}"

    meta = payment["meta"] or {}

    # Already applied (extra safety)
    if meta.get("post_applied"):
        return f"OK{inv_id}"

    # Get user profile
    profile_result = await db.execute(
        text("SELECT id FROM user_profiles WHERE user_id = :uid"),
        {"uid": payment["user_id"]},
    )
    profile = profile_result.first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile_id = profile[0]

    action = meta.get("action")

    if action == "subscribe":
        sub_type = meta.get("type", "monthly")
        months = 1 if sub_type == "monthly" else 12

        # UNIQUE(user_profile_id): a plain INSERT would 500 on any renewal,
        # stranding the payment in post_applied=false forever. Stack expiry
        # on top of remaining time so paid users never lose what they bought.
        await db.execute(
            text("""
                INSERT INTO user_subscriptions (user_profile_id, subscription_type, status, start_date, expires_at)
                VALUES (:pid, :stype, 'active', NOW(), NOW() + make_interval(months => :months))
                ON CONFLICT (user_profile_id) DO UPDATE
                SET subscription_type = EXCLUDED.subscription_type,
                    status = 'active',
                    expires_at = GREATEST(user_subscriptions.expires_at, NOW()) + make_interval(months => :months)
            """),
            {"pid": profile_id, "stype": sub_type, "months": months},
        )

        # Reset limits to unlimited
        await db.execute(
            text("""
                UPDATE limits
                SET wardrobe_items_anlyzed = 999, ai_requests = 999,
                    ideas_viewed = 999, outfits_saved = 999, vton_used = 999
                WHERE user_profile_id = :pid
            """),
            {"pid": profile_id},
        )

    elif action == "buy_credits":
        credits = meta.get("credits", 0)
        pack_name = meta.get("packName", "")
        await db.execute(
            text("UPDATE user_credits SET credits_balance = credits_balance + :amt WHERE user_profile_id = :pid"),
            {"amt": credits, "pid": profile_id},
        )
        await db.execute(
            text("""
                INSERT INTO credit_transactions (user_profile_id, transaction_type, amount, reason, description, created_at)
                VALUES (:pid, 'credit', :amt, 'purchase', :desc, NOW())
            """),
            {"pid": profile_id, "amt": credits, "desc": f'Purchase: {pack_name}'},
        )

    # Mark as applied (idempotency)
    updated_meta = {**meta, "post_applied": True, "post_applied_at": "now()"}
    await db.execute(
        text("UPDATE payments SET meta = CAST(:meta AS jsonb) WHERE invoice_id = :inv"),
        {"meta": json.dumps(updated_meta), "inv": int(inv_id)},
    )

    await db.commit()
    return f"OK{inv_id}"


@router.get("/subscription")
async def get_subscription(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user subscription status."""
    profile_result = await db.execute(
        text("SELECT id FROM user_profiles WHERE user_id = :uid"),
        {"uid": user["id"]},
    )
    profile = profile_result.first()
    if not profile:
        return {"subscription": None, "credits": 0}

    pid = profile[0]

    sub = await db.execute(
        text("""
            SELECT * FROM user_subscriptions
            WHERE user_profile_id = :pid
            ORDER BY created_at DESC LIMIT 1
        """),
        {"pid": pid},
    )
    sub_row = sub.mappings().first()

    credits = await db.execute(
        text("SELECT credits_balance FROM user_credits WHERE user_profile_id = :pid"),
        {"pid": pid},
    )
    credit_row = credits.first()

    return {
        "subscription": dict(sub_row) if sub_row else None,
        "credits": credit_row[0] if credit_row else 0,
    }

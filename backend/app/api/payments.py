"""
Payments — Robokassa webhooks + subscription/credits management.

Security model: the server is authoritative on BOTH the charged amount and the
granted credits. create_payment resolves price/credits from the DB
(subscription_pricing / credit_packs) by plan/pack id and stores them in
payments.meta; the result webhook verifies the signature, checks the paid amount
matches the recorded amount, and credits from that server-resolved meta. The
client only chooses WHICH plan/pack — never how much it costs or grants.
"""

import hashlib
import json
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user

router = APIRouter()


class CreatePaymentRequest(BaseModel):
    # amount/description accepted for backwards-compat but IGNORED — the server
    # derives the authoritative price from the DB.
    amount: Optional[float] = None
    description: Optional[str] = None
    meta: dict  # {action:"subscribe", type} | {action:"buy_credits", packId}


@router.post("/robokassa/create")
async def create_payment(
    body: CreatePaymentRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resolve the authoritative price/credits from the DB, create a pending
    payment, and return the Robokassa URL."""
    meta_in = body.meta or {}
    action = meta_in.get("action")

    if action == "subscribe":
        plan_type = meta_in.get("type", "monthly")
        prow = (
            await db.execute(
                text("""
                    SELECT price_rub, credits, display_name
                    FROM subscription_pricing WHERE plan_type = :p AND is_active = true
                """),
                {"p": plan_type},
            )
        ).mappings().first()
        if not prow:
            raise HTTPException(status_code=400, detail=f"Unknown plan: {plan_type}")
        amount = int(prow["price_rub"])
        meta = {
            "action": "subscribe", "type": plan_type, "credits": int(prow["credits"]),
            "price_rub": amount, "display_name": prow["display_name"],
        }
        description = f"Подписка {prow['display_name']}"

    elif action == "buy_credits":
        pack_id = meta_in.get("packId")
        prow = (
            await db.execute(
                text("""
                    SELECT id, name, credits, price_rub
                    FROM credit_packs WHERE id = :id AND is_active = true
                """),
                {"id": pack_id},
            )
        ).mappings().first()
        if not prow:
            raise HTTPException(status_code=400, detail=f"Unknown credit pack: {pack_id}")
        amount = int(prow["price_rub"])
        meta = {
            "action": "buy_credits", "packId": prow["id"], "credits": int(prow["credits"]),
            "price_rub": amount, "packName": prow["name"],
        }
        description = f"Покупка {prow['credits']} кредитов"

    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    # invoice_id is filled by the sequence default (migration 007_payments_invoice_id_sequence).
    result = await db.execute(
        text("""
            INSERT INTO payments (user_id, amount, status, description, meta, created_at)
            VALUES (:uid, :amount, 'pending', :descr, CAST(:meta AS jsonb), NOW())
            RETURNING invoice_id
        """),
        {"uid": user["id"], "amount": amount, "descr": description, "meta": json.dumps(meta)},
    )
    invoice_id = result.scalar()
    await db.commit()

    signature = hashlib.md5(
        f"{settings.ROBOKASSA_LOGIN}:{amount}:{invoice_id}:{settings.ROBOKASSA_PASS1}".encode()
    ).hexdigest()

    url = (
        f"https://auth.robokassa.ru/Merchant/Index.aspx"
        f"?MerchantLogin={settings.ROBOKASSA_LOGIN}"
        f"&OutSum={amount}"
        f"&InvId={invoice_id}"
        f"&Description={quote(description)}"
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

    try:
        inv = int(inv_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid InvId")

    # Atomic claim: only if not yet paid AND the paid amount matches our record
    # (defends against a tampered OutSum). Also the idempotency guard.
    result = await db.execute(
        text("""
            UPDATE payments SET status = 'paid'
            WHERE invoice_id = :inv AND status != 'paid' AND amount = CAST(:amt AS NUMERIC)
            RETURNING *
        """),
        {"inv": inv, "amt": out_sum},
    )
    payment = result.mappings().first()
    if not payment:
        # Already paid, not found, or amount mismatch — idempotent OK
        return f"OK{inv}"

    meta = payment["meta"] or {}

    # Already applied (extra safety)
    if meta.get("post_applied"):
        return f"OK{inv}"

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
        # credits/packName come from the server-resolved meta (set in create_payment
        # from credit_packs), NOT from the client — so the amount can't be forged.
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
        {"meta": json.dumps(updated_meta), "inv": inv},
    )

    await db.commit()
    return f"OK{inv}"


@router.get("/by-inv")
async def payment_by_inv(
    invId: Optional[int] = None,
    id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Public payment-status lookup used by /payment/waiting. Returns only the
    status (no amounts / user data), keyed by Robokassa InvId or payment UUID.
    Public on purpose: after the Robokassa redirect the TMA session may not have
    re-established, and the status alone is not sensitive."""
    if invId is not None:
        row = (await db.execute(text("SELECT status FROM payments WHERE invoice_id = :inv"), {"inv": invId})).first()
    elif id:
        row = (await db.execute(text("SELECT status FROM payments WHERE id = :id"), {"id": id})).first()
    else:
        raise HTTPException(status_code=400, detail="invId or id required")
    return {"status": row[0] if row else "unknown"}


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

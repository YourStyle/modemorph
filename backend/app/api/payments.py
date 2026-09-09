"""
Payments — Robokassa webhooks + subscription management.

Security model: the server is authoritative on the charged amount.
create_payment resolves the price from subscription_pricing by plan id and
stores it in payments.meta; the result webhook verifies the signature and checks
the paid amount matches the recorded one. The client only chooses WHICH plan —
never how much it costs or what it grants.
"""

import hashlib
import json
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.limits import PLAN_DAYS
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.services.discounts import redeem as redeem_discount, resolve as resolve_discount

router = APIRouter()


async def _profile_id(db: AsyncSession, user_id: str) -> int:
    row = (await db.execute(
        text("SELECT id FROM user_profiles WHERE user_id = :uid"), {"uid": user_id}
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")
    return row[0]


class CreatePaymentRequest(BaseModel):
    # amount/description accepted for backwards-compat but IGNORED — the server
    # derives the authoritative price from the DB.
    amount: Optional[float] = None
    description: Optional[str] = None
    meta: dict  # {action:"subscribe", type}


@router.post("/robokassa/create")
async def create_payment(
    body: CreatePaymentRequest,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resolve the authoritative price from the DB, create a pending payment,
    and return the Robokassa URL."""
    meta_in = body.meta or {}
    action = meta_in.get("action")

    # buy_credits убран вместе с кредитами. Старый клиент, который его пришлёт,
    # получит 400, а не молча оплаченный пак, который некуда зачислить.
    if action != "subscribe":
        raise HTTPException(status_code=400, detail="Invalid action")

    plan_type = meta_in.get("type", "monthly")
    prow = (
        await db.execute(
            text("""
                SELECT price_rub, display_name
                FROM subscription_pricing WHERE plan_type = :p AND is_active = true
            """),
            {"p": plan_type},
        )
    ).mappings().first()
    if not prow:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {plan_type}")
    amount = int(prow["price_rub"])
    meta = {
        "action": "subscribe", "type": plan_type,
        "price_rub": amount, "display_name": prow["display_name"],
    }
    description = f"Подписка {prow['display_name']}"

    # Скидка считается ЗДЕСЬ, на сервере, и попадает в ту же сумму, которую
    # потом сверяет вебхук. Клиент присылает только код — иначе цену можно было
    # бы назначить себе самому, подставив её в запрос.
    code = (meta_in.get("code") or "").strip()
    if code:
        offer = await resolve_discount(db, code, await _profile_id(db, user["id"]), plan_type)
        amount = offer["discounted_rub"]
        meta.update({
            "code": offer["code"], "percent_off": offer["percent_off"],
            "discounted_rub": amount,
        })
        description = f"Подписка {prow['display_name']} (−{offer['percent_off']}%)"

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
        # Недельный тариф — не месяц и не год, поэтому длительность задаётся
        # днями, а не months => 1|12. Неизвестный тип трактуем как месяц: деньги
        # уже приняты, отдать за них меньше всех — худший из возможных ответов.
        days = PLAN_DAYS.get(sub_type, 30)

        # UNIQUE(user_profile_id): a plain INSERT would 500 on any renewal,
        # stranding the payment in post_applied=false forever. Stack expiry
        # on top of remaining time so paid users never lose what they bought.
        await db.execute(
            text("""
                INSERT INTO user_subscriptions (user_profile_id, subscription_type, status, start_date, expires_at)
                VALUES (:pid, :stype, 'active', NOW(), NOW() + make_interval(days => :days))
                ON CONFLICT (user_profile_id) DO UPDATE
                SET subscription_type = EXCLUDED.subscription_type,
                    status = 'active',
                    expires_at = GREATEST(user_subscriptions.expires_at, NOW()) + make_interval(days => :days)
            """),
            {"pid": profile_id, "stype": sub_type, "days": days},
        )

        # Потолки плана не материализуются здесь: _plan_of() читает подписку
        # вживую при каждом списании. Счётчик потребления сбрасывать тоже не
        # надо — он помнит, под каким планом накоплен (subscription_usage.
        # plan_type), и сам обнулится при первом списании на новом плане.

        # Код закрепляется только теперь, после денег: проверка кода на экране
        # ничего не расходует, иначе перебор чужих промокодов сжигал бы их.
        if meta.get("code"):
            await redeem_discount(
                db, meta["code"], profile_id, inv, sub_type,
                int(meta.get("price_rub") or 0), int(meta.get("discounted_rub") or 0),
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
        return {"subscription": None, "plan": "free", "limits": {}}

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

    # План и остатки по нему вместо баланса кредитов: человеку важно «сколько
    # оцифровок осталось до конца месяца», а не абстрактная вторая валюта.
    plan = sub_row["subscription_type"] if sub_row and sub_row["status"] == "active" else "free"
    usage = await db.execute(
        text("""
            SELECT pl.feature, pl.cap, pl.period,
                   GREATEST(0, pl.cap - COALESCE(su.used, 0)) AS remaining,
                   -- Когда потолок нальётся заново. У бесплатного тарифа — никогда,
                   -- и NULL здесь честнее, чем дата, которой не будет.
                   CASE WHEN pl.period = 'once' THEN NULL
                        ELSE su.period_started_at
                             + CASE pl.period WHEN 'week' THEN INTERVAL '7 days'
                                              ELSE INTERVAL '1 month' END
                   END AS renews_at
            FROM plan_limits pl
            LEFT JOIN subscription_usage su
                   ON su.user_profile_id = :pid
                  AND su.feature = pl.feature
                  AND su.plan_type = pl.plan_type
                  AND (pl.period = 'once'
                       OR NOW() < su.period_started_at
                                  + CASE pl.period WHEN 'week' THEN INTERVAL '7 days'
                                                   ELSE INTERVAL '1 month' END)
            WHERE pl.plan_type = :plan
        """),
        {"pid": pid, "plan": plan},
    )

    return {
        "subscription": dict(sub_row) if sub_row else None,
        "plan": plan,
        "limits": {
            r["feature"]: {
                "cap": r["cap"], "remaining": r["remaining"], "period": r["period"],
                "renews_at": str(r["renews_at"]) if r["renews_at"] else None,
            }
            for r in usage.mappings().all()
        },
    }

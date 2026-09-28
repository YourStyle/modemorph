# -*- coding: utf-8 -*-
"""E2E денежного пути целиком: прайс → счёт → вебхук Робокассы → подписка,
скидки по коду, реферальная награда пригласившему. Дополняет test_e2e_money.py
(там — целостность прайса и расчёт цены), здесь — путь через HTTP и вебхук."""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path = [p for p in sys.path if os.path.abspath(p or ".") != HERE]
sys.path.insert(0, os.path.join(HERE, "..", ".."))

import pytest  # noqa: E402

if "DATABASE_URL" not in os.environ:
    pytest.skip("нужен живой Postgres — см. scripts/e2e-local.sh", allow_module_level=True)

from app.api.e2e_harness import *  # noqa: E402,F401,F403
from app.api.e2e_harness import (  # noqa: E402
    RUN, jmeta, make_user, q, q1, robokassa_result, tg_init_data, tg_user,
)


def _weekly():
    return q1("SELECT price_rub FROM subscription_pricing WHERE plan_type='weekly' AND is_active")["price_rub"]


def _create(client, u, plan="weekly", code=None):
    meta = {"action": "subscribe", "type": plan}
    if code:
        meta["code"] = code
    return client.post("/api/payments/robokassa/create", headers=u.h, json={"amount": 1, "meta": meta})


def test_pricing_ships_limits_with_prices(client):
    body = client.get("/api/pricing").json()
    plans = {s["plan_type"]: s for s in body["subscriptions"]}
    assert "weekly" in plans and plans["weekly"]["price_rub"] == _weekly()
    assert plans["weekly"]["limits"]["vton_used"]["cap"] > 0
    assert body["free_limits"]["wardrobe_items_anlyzed"]["period"] == "once"


def test_fresh_database_has_all_landing_plans():
    have = {r["plan_type"] for r in q("SELECT plan_type FROM subscription_pricing WHERE is_active")}
    assert {"weekly", "monthly", "yearly"} <= have


def test_payment_happy_path_tamper_and_idempotency(client):
    u = make_user()
    price = _weekly()
    r = _create(client, u)
    assert r.status_code == 200, r.text
    inv = r.json()["invoice_id"]
    assert f"OutSum={price}" in r.json()["url"], "клиент смог повлиять на сумму"
    pay = q1("SELECT amount, status, meta FROM payments WHERE invoice_id=$1", inv)
    assert pay["status"] == "pending" and int(pay["amount"]) == price

    # чужая подпись
    bad = client.post("/api/payments/robokassa/result",
                      data={"OutSum": str(price), "InvId": str(inv), "SignatureValue": "00"})
    assert bad.status_code == 400
    # правильная подпись, но заниженная сумма — оплата не применяется
    assert robokassa_result(client, inv, 1).text.strip('"') == f"OK{inv}"
    assert q1("SELECT status FROM payments WHERE invoice_id=$1", inv)["status"] == "pending"
    assert q1("SELECT 1 FROM user_subscriptions WHERE user_profile_id=$1", u.pid) is None

    # настоящая оплата; Робокасса присылает сумму с шестью нулями
    ok = robokassa_result(client, inv, f"{price}.000000")
    assert ok.status_code == 200
    pay = q1("SELECT status, meta FROM payments WHERE invoice_id=$1", inv)
    assert pay["status"] == "paid" and jmeta(pay["meta"])["post_applied"] is True
    sub = q1("SELECT subscription_type, status, expires_at - NOW() AS left FROM user_subscriptions "
             "WHERE user_profile_id=$1", u.pid)
    assert sub["subscription_type"] == "weekly" and sub["status"] == "active"
    assert 6 <= sub["left"].days <= 7

    # повтор вебхука не продлевает второй раз
    robokassa_result(client, inv, f"{price}.000000")
    again = q1("SELECT expires_at - NOW() AS left FROM user_subscriptions WHERE user_profile_id=$1", u.pid)
    assert again["left"].days <= 7

    assert client.get(f"/api/payments/by-inv?invId={inv}").json() == {"status": "paid"}
    s = client.get("/api/user-subscription", headers=u.h).json()
    assert s["plan"] == "weekly" and s["limits"]["vton_used"]["cap"] > 0


def test_payment_rejects_unknown_plan_and_legacy_credits(client):
    u = make_user()
    assert _create(client, u, plan="lifetime").status_code == 400
    r = client.post("/api/payments/robokassa/create", headers=u.h,
                    json={"meta": {"action": "buy_credits", "type": "pack"}})
    assert r.status_code == 400


def test_referral_link_to_paid_rewards_inviter(client):
    """Путь приглашения целиком: код друга → переход ref_<код> → регистрация →
    скидка → оплата → неделя подписки пригласившему → строчка в /admin/sources."""
    owner = make_user()
    mine = client.get("/api/discounts/mine", headers=owner.h).json()
    code = mine["referral"]["code"]
    assert code.startswith("REF") and mine["referral"]["invited"] == 0
    assert client.get("/api/discounts/mine", headers=owner.h).json()["referral"]["code"] == code

    # свой код себе не применить
    own = client.post("/api/discounts/check", headers=owner.h, json={"code": code, "planType": "weekly"})
    assert own.status_code == 400

    # друг открывает мини-приложение по ссылке
    tg = tg_user()
    login = client.post("/api/auth/telegram/miniapp-session",
                        json={"initData": tg_init_data(tg, f"ref_{code}")}).json()
    h = {"Authorization": f"Bearer {login['session']['access_token']}"}
    assert client.post("/api/me/profile-session", headers=h,
                       json={"full_name": "Друг", "gender": "male", "onboarding_complete": True}).status_code == 200
    friend_id = login["user"]["id"]
    friend_pid = q1("SELECT id FROM user_profiles WHERE user_id=$1::uuid", friend_id)["id"]

    price = _weekly()
    chk = client.post("/api/discounts/check", headers=h, json={"code": code.lower(), "planType": "weekly"})
    assert chk.status_code == 200, chk.text
    discounted = chk.json()["discounted_rub"]
    assert discounted < price and chk.json()["percent_off"] == 15

    inv = client.post("/api/payments/robokassa/create", headers=h, json={
        "meta": {"action": "subscribe", "type": "weekly", "code": code}}).json()["invoice_id"]
    assert int(q1("SELECT amount FROM payments WHERE invoice_id=$1", inv)["amount"]) == discounted
    assert robokassa_result(client, inv, discounted).status_code == 200

    assert q1("SELECT status FROM payments WHERE invoice_id=$1", inv)["status"] == "paid"
    assert q1("SELECT subscription_type FROM user_subscriptions WHERE user_profile_id=$1 AND status='active'",
              friend_pid)["subscription_type"] == "weekly"
    red = q1("SELECT discounted_rub, invoice_id FROM discount_redemptions WHERE code=$1 AND user_profile_id=$2",
             code, friend_pid)
    assert red and red["invoice_id"] == inv
    reward = q1("SELECT status, expires_at - NOW() AS left FROM user_subscriptions WHERE user_profile_id=$1",
                owner.pid)
    assert reward and reward["status"] == "active" and 6 <= reward["left"].days <= 7, "пригласивший не получил неделю"
    assert client.get("/api/discounts/mine", headers=owner.h).json()["referral"]["invited"] == 1

    # второй раз тот же код тому же человеку не применяется
    again = client.post("/api/discounts/check", headers=h, json={"code": code, "planType": "weekly"})
    assert again.status_code == 400

    admin = make_user(role="admin")
    src = {s["source"]: s for s in client.get("/api/admin/sources", headers=admin.h).json()["sources"]}
    row = src.get(f"ref_{code}")
    assert row and row["new_users"] == 1 and row["paid_after"] == 1, f"источник ref_ не довёл до оплаты: {row}"

    paying = client.get("/api/admin/paying-users", headers=admin.h).json()
    paying_ids = {p["user_id"] for p in paying["paying_users"]}
    assert friend_id in paying_ids, "оплативший не попал в /admin/paying-users"
    assert paying["total"] == len(paying["paying_users"])
    _ = RUN

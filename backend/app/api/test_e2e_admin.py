# -*- coding: utf-8 -*-
"""E2E админки: доступ по ролям и то, что дашборд вообще считается на схеме
из репозитория. /api/admin/analytics складывает упавшие запросы в `_errors`
вместо того чтобы падать целиком — поэтому 200 здесь ничего не доказывает,
проверяем пустой `_errors`."""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path = [p for p in sys.path if os.path.abspath(p or ".") != HERE]
sys.path.insert(0, os.path.join(HERE, "..", ".."))

import pytest  # noqa: E402

if "DATABASE_URL" not in os.environ:
    pytest.skip("нужен живой Postgres — см. scripts/e2e-local.sh", allow_module_level=True)

from app.api.e2e_harness import *  # noqa: E402,F401,F403
from app.api.e2e_harness import add_item, make_user, q  # noqa: E402

READ_ONLY_STAFF = ["/api/admin/analytics"]
ADMIN_ONLY = ["/api/admin/sources", "/api/admin/paying-users", "/api/admin/users",
              "/api/admin/discounts", "/api/admin/audit-log"]


@pytest.mark.parametrize("path", READ_ONLY_STAFF + ADMIN_ONLY)
def test_admin_endpoints_refuse_regular_users(client, path):
    u = make_user()
    assert client.get(path, headers=u.h).status_code == 403
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", ["/api/admin/sources", "/api/admin/paying-users"])
def test_analyst_cannot_see_money_and_sources(client, path):
    analyst = make_user(role="analyst")
    status = client.get(path, headers=analyst.h).status_code
    assert status == 403, f"{path}: аналитик получил {status}"


def test_analytics_computes_without_sql_errors(client):
    # Немного данных, чтобы запросам было что считать.
    u = make_user()
    add_item(client, u, "Белая футболка", "t-shirt")
    client.post("/api/user-looks", headers=u.h, json={"name": "Образ", "items": []})
    client.post("/api/usage/log", headers=u.h, json={"feature": "paywall_shown", "action": "view"})

    analyst = make_user(role="analyst")
    r = client.get("/api/admin/analytics", headers=analyst.h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["_errors"] == [], f"запросы дашборда падают на схеме из миграций: {body['_errors']}"
    for key in ("onboarding", "engagement", "retention", "funnel", "timeline", "monetization"):
        assert key in body, f"в ответе нет раздела {key}"


def test_admin_users_and_timeline(client):
    u = make_user()
    add_item(client, u, "Синие джинсы", "jeans")
    admin = make_user(role="admin")
    r = client.get("/api/admin/users", headers=admin.h)
    assert r.status_code == 200, r.text
    t = client.get(f"/api/admin/users/{u.id}/timeline", headers=admin.h)
    assert t.status_code == 200, t.text


def test_admin_write_calls_are_audited(client):
    """Любой не-GET в /api/admin/* пишется в журнал, включая отказы по роли."""
    u = make_user()
    before = q("SELECT count(*) AS n FROM admin_audit_log")[0]["n"]
    assert client.post("/api/admin/reset-onboarding", headers=u.h, json={}).status_code == 403
    after = q("SELECT count(*) AS n FROM admin_audit_log")[0]["n"]
    assert after == before + 1, "отказанный вызов админки не попал в журнал"

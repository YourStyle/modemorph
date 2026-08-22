"""Role matrix and audit coverage for /api/admin/*.

The analyst role exists so one person can see product statistics without seeing
user records, payments, credits or broadcasts. That boundary is one word per
endpoint — `get_staff_user` instead of `get_admin_user` — and getting that word
wrong on the wrong route hands out data silently: nothing throws, the page just
loads for someone who should not see it.

Run it:  python3 -m app.api.test_roles_audit     (from backend/)

ponytail: dependency-graph introspection, no DB and no server, same shape as
test_admin_gating.
"""

import re
from pathlib import Path

from fastapi.routing import APIRoute

from app.core.deps import get_admin_user, get_current_user, get_staff_user
from app.main import app

_ADMIN_PY = (Path(__file__).resolve().parent / "admin.py").read_text()

# Everything the analyst is allowed to reach. Read-only, and about the catalogue
# and the funnel — never about an individual user.
_ANALYST_MAY = {
    ("GET", "/api/admin/analytics"),
    ("GET", "/api/admin/catalog/brands"),
    ("GET", "/api/admin/brand-leads"),
    ("POST", "/api/admin/brand-leads"),
    ("PATCH", "/api/admin/brand-leads/{lead_id}"),
    ("DELETE", "/api/admin/brand-leads/{lead_id}"),
}

# Named explicitly rather than derived: these are the ones where a mistake costs
# money, reaches every user, or exposes the log that watches the analyst.
_ANALYST_MUST_NOT = [
    "/api/admin/audit-log",      # журнал, который её же и пишет
    "/api/admin/grant-credits",  # выдача кредитов
    "/api/admin/gift",           # подарочные подписки
    "/api/admin/broadcast",      # сообщение всем пользователям
    "/api/admin/feature-costs",  # цены
    "/api/admin/credit-packs",   # цены
    "/api/admin/reminders",      # сообщения пользователям
    "/api/admin/users",          # персональные данные (и /users/{id}/timeline)
    "/api/admin/paying-users",   # платежи
]


def _routes():
    found = []
    for entry in app.routes:
        if isinstance(entry, APIRoute):
            found.append((entry.path, entry))
            continue
        original = getattr(entry, "original_router", None)
        if original is None:
            continue
        prefix = getattr(getattr(entry, "include_context", None), "prefix", "") or ""
        for route in original.routes:
            if isinstance(route, APIRoute):
                found.append((prefix + route.path, route))
    return found


def _guards(route):
    seen, stack = set(), list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        if dep.call is not None:
            seen.add(dep.call)
        stack.extend(dep.dependencies)
    return seen


def _admin_routes():
    for path, route in _routes():
        if path.startswith("/api/admin"):
            for method in route.methods - {"HEAD", "OPTIONS"}:
                yield method, path, route


def test_analyst_reaches_only_the_allowed_endpoints():
    """Anything staff-gated must be on the allow-list, and vice versa."""
    staff_gated = {(m, p) for m, p, r in _admin_routes() if get_staff_user in _guards(r)}
    unexpected = staff_gated - _ANALYST_MAY
    assert not unexpected, f"analyst can reach endpoints nobody approved: {sorted(unexpected)}"
    missing = _ANALYST_MAY - staff_gated
    assert not missing, f"analyst is locked out of her own screens: {sorted(missing)}"


def test_money_and_people_stay_admin_only():
    for prefix in _ANALYST_MUST_NOT:
        matched = [(m, p, r) for m, p, r in _admin_routes() if p.startswith(prefix)]
        assert matched, f"{prefix} is not registered — did it move?"
        for method, path, route in matched:
            assert get_staff_user not in _guards(route), (
                f"{method} {path} is reachable by an analyst — it must not be"
            )


def test_no_admin_endpoint_is_left_ungated():
    for method, path, route in _admin_routes():
        guards = _guards(route)
        assert guards & {get_admin_user, get_staff_user} or any(
            g is not get_current_user and getattr(g, "__name__", "") == "_guard" for g in guards
        ), f"{method} {path} has no role gate at all"


def test_audit_middleware_is_installed():
    """A decorator can be forgotten on a new route; middleware cannot."""
    names = [m.cls.__name__ for m in app.user_middleware]
    assert "AdminAuditMiddleware" in names, f"audit middleware missing, stack is {names}"


def test_audit_log_is_admin_only():
    """The analyst must not read — or filter — the log that records her."""
    for method, path, route in _admin_routes():
        if path == "/api/admin/audit-log":
            assert get_staff_user not in _guards(route)
            return
    raise AssertionError("/api/admin/audit-log is not registered")


def test_brand_leads_write_is_open_to_the_analyst():
    """The pipeline is hers to keep — read-only would just push her back to xlsx."""
    writes = {(m, p) for m, p, r in _admin_routes()
              if p.startswith("/api/admin/brand-leads") and m in {"POST", "PATCH", "DELETE"}}
    assert writes, "brand-leads has no write endpoints"
    for method, path, route in _admin_routes():
        if (method, path) in writes:
            assert get_staff_user in _guards(route), f"{method} {path} shuts the analyst out"


def test_is_admin_stays_a_mirror_of_role():
    """Four handlers widen visible data on is_admin. If the migration ever stops
    keeping it in sync with role, an analyst silently gains admin-level reads."""
    sql = (Path(__file__).resolve().parents[2] / "migrations" / "032_roles_audit.sql").read_text()
    assert "sync_is_admin_with_role" in sql
    assert re.search(r"NEW\.is_admin\s*:=\s*\(NEW\.role\s*=\s*'admin'\)", sql), (
        "the trigger no longer derives is_admin from role"
    )
    assert "BEFORE INSERT OR UPDATE ON user_profiles" in sql


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); n += 1; print(f"ok  {name}")
    print(f"\n{n} checks passed — {len(list(_admin_routes()))} admin routes")

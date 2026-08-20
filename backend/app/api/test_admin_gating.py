"""Guards the admin gate on catalog-wide mutations.

Audited 2026-08-19: POST /api/wardrobe/visibility ran `UPDATE wardrobe_items SET
is_hidden = true` over all 24584 rows behind get_current_user, so any of the 455
registered users could blank the catalog. The 11 basic_items mutations (including
`combinations`, which feed four Gemini prompts) had the same hole.

Run it:  python3 -m app.api.test_admin_gating     (from backend/)

ponytail: plain asserts, no pytest — pytest is not installed and CI runs no tests,
so a framework-dependent check would never execute. Introspects the dependency
graph rather than starting a server; a reverted gate is the only regression here
worth catching. Collected as test_* too, if pytest ever lands.
"""

from fastapi.routing import APIRoute

from app.core.deps import get_admin_user
from app.main import app

# path -> methods that must never be reachable without an admin principal
ADMIN_ONLY = {
    "/api/wardrobe/visibility": {"GET", "POST"},
    "/api/basic-items": {"POST"},
    "/api/basic-items/{item_id}": {"PUT", "DELETE"},
    "/api/basic-items/{item_id}/materials": {"POST"},
    "/api/basic-items/copy": {"POST"},
    "/api/combinations": {"POST"},
    "/api/combinations/{combo_id}": {"PUT", "DELETE"},
    "/api/basic-materials": {"POST"},
    "/api/basic-materials/{material_id}": {"PUT", "DELETE"},
}


def _guards(route: APIRoute) -> set:
    """Every dependency callable reachable from this route."""
    seen, stack = set(), list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        if dep.call is not None:
            seen.add(dep.call)
        stack.extend(dep.dependencies)
    return seen


def _routes():
    """(full_path, route) for every APIRoute, including lazily-included routers.

    FastAPI 0.141 keeps included routers behind a `_IncludedRouter` wrapper instead
    of flattening them into app.routes, so walking app.routes alone finds nothing.
    """
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


def test_mutations_require_admin():
    routes = _routes()
    for path, methods in sorted(ADMIN_ONLY.items()):
        matched = [(p, r) for p, r in routes if p == path and methods & r.methods]
        assert matched, f"{path} {sorted(methods)} not registered — did the route move?"
        for _, route in matched:
            assert get_admin_user in _guards(route), (
                f"{sorted(methods & route.methods)} {path} is not admin-gated: "
                f"a non-admin token can reach it"
            )


def test_read_endpoints_stay_open_to_the_app():
    """The app itself reads basic items; gating those would break the client."""
    for path, route in _routes():
        if path == "/api/basic-wardrobe-items" and "GET" in route.methods:
            assert get_admin_user not in _guards(route), (
                "GET /api/basic-wardrobe-items got admin-gated — this breaks the client"
            )
            return
    raise AssertionError("GET /api/basic-wardrobe-items not registered")


if __name__ == "__main__":
    checked = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            checked += 1
            print(f"ok  {name}")
    print(f"\n{checked} checks passed, {len(ADMIN_ONLY)} paths gated")
